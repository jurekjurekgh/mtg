// M219 — pętla jakości Żywym Testerem (2026-08-26), partia h9 (zendikar-gracz
// vs worek-legend-bot, seed 44): bot aktywował Saddle na Trained Arynx 3× z
// rzędu w JEDNEJ turze — każde kolejne „osiodłanie" tapowało inny stwór za
// nic, bo Mount był już `saddled` do końca tury.
//
// Oś 1 audytu (bezsensowne działania bota — „powtarzanie tej samej akcji
// w kółko … wycena nie ma progu nasycenia"). Klasa L51/M179/B: efekt
// IDEMPOTENTNY do końca tury, którego druga aktywacja nic nie dodaje.
// Dotychczasowy strażnik (`pendingTwin`) łapał tylko drugą kopię NA STOSIE;
// gdy pierwsza już się rozstrzygnęła i nadała trwały-do-EOT stan `saddled`,
// bot i tak aktywował kolejny raz.
//
// Naprawa: dla `set_saddled` — gdy źródło jest już `saddled`, kara −10
// (poniżej passu). Generycznie po fladze STANU z PlayerView (ADR 0017),
// bez nazw kart (ADR 0002). Bez over-fixa: pierwsze osiodłanie wciąż legalne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function setup(saddled) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  const ta = gameObjectDataOf(REGISTRY.get('trained-arynx'));
  addObject(state, {
    id: 'ta', instanceId: 'i-ta', cardId: 'trained-arynx', controllerId: 'p1', zone: 'battlefield',
    kind: ta.kind, power: ta.power, toughness: ta.toughness, abilities: ta.abilities ?? [],
    keywords: ta.keywords ?? [], subtypes: ta.subtypes ?? [], types: ta.types ?? ['Creature'],
  });
  for (const id of ['c1', 'c2']) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
      kind: 'creature', power: 2, toughness: 2, abilities: [], subtypes: [], types: ['Creature'],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  state.objects.set('ta', Object.freeze({ ...state.objects.get('ta'), summoningSickness: false, saddled }));
  return state;
}

function saddleScores(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const saddle = trace.options.filter((o) => o.cmd.startsWith('activate_ability(ta')).map((o) => o.score);
  return { pass, saddle };
}

test('M219: bot NIE osiodła ponownie Mounta, który jest już saddled (poniżej passu)', () => {
  const { pass, saddle } = saddleScores(setup(true));
  assert.ok(saddle.length > 0, 'oferta osiodłania musi istnieć (są nietapnięte stwory do kosztu)');
  for (const s of saddle) {
    assert.ok(s < pass, `ponowne osiodłanie (${s}) musi być poniżej passu (${pass})`);
  }
});

test('M219: PIERWSZE osiodłanie (jeszcze nie saddled) pozostaje legalną opcją (anty-over-fix)', () => {
  const { pass, saddle } = saddleScores(setup(false));
  assert.ok(saddle.length > 0, 'oferta osiodłania musi istnieć');
  assert.ok(saddle.some((s) => s >= pass), `pierwsze osiodłanie nie może być karane poniżej passu: ${JSON.stringify(saddle)} vs ${pass}`);
});
