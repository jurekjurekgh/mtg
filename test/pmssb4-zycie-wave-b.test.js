// PMSSB-4 fala B: F-B1 hold-tap-gain pre-combat (H11).
// Tap-{T}-stwora za +1 przy nie zadeklarowanym zagrozeniu oddawal blok
// wart 2+ (L22: +3 strzelal w main1 przy wrogu 2/2). Hold (kara lifeV+8
// jak declared) z wyjatkami: ratunek (life<=5 lub presja>=zycie) i okno
// bez walki wroga przed untapem (jego postcombat/ending strzela dalej).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
function newState(step = 'main') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}
function setLife(s, me, foe = 20) {
  s.players.find((p) => p.id === 'p1').life = me;
  s.players.find((p) => p.id === 'p2').life = foe;
}
function fillLibrary(s) {
  for (const [who, n] of [['p1', 10], ['p2', 10]]) for (let i = 0; i < n; i += 1) {
    addObject(s, {
      id: `lb${who}${i}`, instanceId: `i-lb${who}${i}`, cardId: `x-lb${who}${i}`,
      controllerId: who, zone: 'library', kind: 'creature', power: 0, toughness: 0,
      manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'lb',
    });
  }
}
function fieldCreature(s, id, controllerId, power, toughness, extra = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id, ...extra,
  });
}
function fieldCard(s, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield', ...gameObjectDataOf(def) });
}
function choice(s) {
  const view = playerView(s, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  return { chosen, trace: bot.trace().at(-1) };
}
function scoreOf(s, match) {
  const { trace } = choice(s);
  const o = trace.options.find((e) => e.cmd.includes(match));
  assert.ok(o, `brak oferty '${match}'`);
  return o.score;
}

test('F-B1: main1 + wrog 2/2 untapped: hold -6 (bylo +3 strzelal)', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20);
  fieldCard(s, 'sm', 'soulmender');
  fieldCreature(s, 'atk', 'p2', 2, 2);
  const { chosen } = choice(s);
  assert.equal(scoreOf(s, 'activate_ability(sm'), -6, 'soulmender trzyma bloker');
  assert.equal(chosen.type, 'pass_priority', 'bot passuuje (nie tapiuje)');
});

test('F-B1: ratunek strzela mimo zagrozenia (zycie 5 -> +5)', () => {
  const s = newState(); fillLibrary(s); setLife(s, 5);
  fieldCard(s, 'sm', 'soulmender');
  fieldCreature(s, 'atk', 'p2', 2, 2);
  const { chosen } = choice(s);
  assert.equal(scoreOf(s, 'activate_ability(sm'), 5, 'ratunek najpierw');
  assert.equal(chosen.type, 'activate_ability', 'bot strzela');
});

test('F-B1: EOT wroga strzela dalej (+3, walka minela)', () => {
  const s = newState('end'); fillLibrary(s); setLife(s, 20);
  fieldCard(s, 'sm', 'soulmender');
  fieldCreature(s, 'atk', 'p2', 2, 2);
  s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p1';
  assert.equal(scoreOf(s, 'activate_ability(sm'), 3, 'foe-EOT: brak walki przed untapem');
});

test('F-B1: brak zagrozenia strzela (presja 0 -> +3)', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20);
  fieldCard(s, 'sm', 'soulmender');
  assert.equal(scoreOf(s, 'activate_ability(sm'), 3, 'bez wrogich stworow hold nie ma sensu');
});

test('F-B1: declared-attack bez zmian (-6, neededToBlock)', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20);
  fieldCard(s, 'sm', 'soulmender');
  fieldCreature(s, 'atk', 'p2', 2, 2);
  s.combat = { attackingPlayerId: 'p2', attackers: [{ id: 'atk' }], blockers: [] };
  assert.equal(scoreOf(s, 'activate_ability(sm'), -6, 'zadeklarowany atak: stara galaz');
});
