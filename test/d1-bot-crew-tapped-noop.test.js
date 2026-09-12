// D1 — znalezisko właściciela 2026-09-12 (Balamb Garden): bot crewował
// ZATAPOWANY pojazd (Balamb ziemia → tap po manę → transformacja, tył wchodzi
// tapnięty). Animacja do EOT nic nie daje (nie zaatakuje, nie zablokuje),
// a koszt crew (tap stwora) przepada — bot widział tylko „3/1 → 5/4".
//
// Bliźniak M230 (re-crew): animacja zatapowanego źródła dostaje karę −10
// (poniżej passu). Generycznie po stanie (source.tapped z PlayerView,
// ADR 0017), bez nazw kart (ADR 0002). Bez over-fixa: crew odtapowanego
// pojazdu wciąż legalny; Saddle na tapniętym wierzchowcu niekarane
// (osobny typ efektu set_saddled — wyzwalacz „becomes saddled").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function setup(tapped) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  const barge = gameObjectDataOf(REGISTRY.get('bomat-bazaar-barge'));
  const baseTypes = barge.types ?? ['Artifact', 'Vehicle'];
  addObject(state, {
    id: 'barge', instanceId: 'i-barge', cardId: 'bomat-bazaar-barge', controllerId: 'p1',
    zone: 'battlefield', kind: 'artifact',
    power: barge.power, toughness: barge.toughness,
    abilities: barge.abilities ?? [], keywords: [], subtypes: barge.subtypes ?? [],
    types: baseTypes,
  });
  if (tapped) {
    state.objects.set('barge', Object.freeze({ ...state.objects.get('barge'), tapped: true }));
  }
  // Trzy stwory 2/2 (łączna moc ≥ 3) jako koszt crew (crewPower 3).
  for (const id of ['c1', 'c2', 'c3']) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
      kind: 'creature', power: 2, toughness: 2, abilities: [], subtypes: [], types: ['Creature'],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  return state;
}

function crewScores(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const crew = trace.options.filter((o) => o.cmd.startsWith('activate_ability(barge')).map((o) => o.score);
  return { pass, crew };
}

test('D1: bot NIE załoguje zatapowanego pojazdu (poniżej passu)', () => {
  const { pass, crew } = crewScores(setup(true));
  assert.ok(crew.length > 0, 'oferta crew musi istnieć (są nietapnięte stwory na koszt)');
  for (const s of crew) {
    assert.ok(s < pass, `crew tapniętego (${s}) musi być poniżej passu (${pass})`);
  }
});

test('D1: crew ODTAPOWANEGO pojazdu pozostaje legalny (anty-over-fix)', () => {
  const { pass, crew } = crewScores(setup(false));
  assert.ok(crew.length > 0, 'oferta crew musi istnieć');
  assert.ok(crew.some((s) => s >= pass), `pierwszy crew nie może być karany poniżej passu: ${JSON.stringify(crew)} vs ${pass}`);
});
