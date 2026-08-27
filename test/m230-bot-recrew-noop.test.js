// M230 — audyt Żywym Testerem talii spoza podziału (2026-08-27), partia
// worek-mroczny (gracz) vs worek-dziki (bot), seed 17: bot załogował
// (crew) Bomat Bazaar Barge do 11× w JEDNEJ turze — pojazd był już animowany
// do końca tury (Artifact Creature 5/5), a każde kolejne załogowanie TAPOWAŁO
// kolejne stwory za nic.
//
// Oś 1 audytu (bezsensowne działania bota — brak progu nasycenia). Ta sama
// klasa co M219 (re-saddle): efekt IDEMPOTENTNY do końca tury
// (animate_permanent_until_end_of_turn), którego druga aktywacja nic nie dodaje.
//
// Naprawa: gdy źródło jest już animowane (flaga `animatedUntilEOT` z PlayerView,
// ADR 0017), kolejny crew dostaje karę −10 (poniżej passu). Generycznie po
// stanie, bez nazw kart (ADR 0002). Bez over-fixa: pierwszy crew wciąż legalny.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function setup(animated) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  const barge = gameObjectDataOf(REGISTRY.get('bomat-bazaar-barge'));
  // Pojazd: animowany albo nie. Animowany nosi originalBeforeAnimation (jak
  // po rozstrzygnięciu crew) i types z Creature.
  const baseTypes = barge.types ?? ['Artifact', 'Vehicle'];
  addObject(state, {
    id: 'barge', instanceId: 'i-barge', cardId: 'bomat-bazaar-barge', controllerId: 'p1',
    zone: 'battlefield', kind: animated ? 'creature' : 'artifact',
    power: animated ? 5 : barge.power, toughness: animated ? 5 : barge.toughness,
    abilities: barge.abilities ?? [], keywords: [], subtypes: barge.subtypes ?? [],
    types: animated ? [...new Set([...baseTypes, 'Creature'])] : baseTypes,
  });
  if (animated) {
    state.objects.set('barge', Object.freeze({
      ...state.objects.get('barge'),
      originalBeforeAnimation: { kind: 'artifact', types: baseTypes, subtypes: [], power: barge.power, toughness: barge.toughness },
    }));
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

test('M230: bot NIE załoguje ponownie pojazdu już animowanego (poniżej passu)', () => {
  const { pass, crew } = crewScores(setup(true));
  assert.ok(crew.length > 0, 'oferta crew musi istnieć (są nietapnięte stwory na koszt)');
  for (const s of crew) {
    assert.ok(s < pass, `ponowny crew (${s}) musi być poniżej passu (${pass})`);
  }
});

test('M230: PIERWSZY crew (pojazd jeszcze nie animowany) pozostaje legalną opcją (anty-over-fix)', () => {
  const { pass, crew } = crewScores(setup(false));
  assert.ok(crew.length > 0, 'oferta crew musi istnieć');
  assert.ok(crew.some((s) => s >= pass), `pierwszy crew nie może być karany poniżej passu: ${JSON.stringify(crew)} vs ${pass}`);
});

test('M230: PlayerView eksponuje animatedUntilEOT dla animowanego pojazdu', () => {
  const view = playerView(setup(true), 'p1');
  const barge = view.zones.battlefield.find((o) => o.id === 'barge');
  assert.equal(barge.animatedUntilEOT, true);
  const viewNo = playerView(setup(false), 'p1');
  const bargeNo = viewNo.zones.battlefield.find((o) => o.id === 'barge');
  assert.notEqual(bargeNo.animatedUntilEOT, true);
});
