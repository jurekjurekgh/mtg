import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
function setup(mana, setupFn) {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', mana ?? 14);
  for (let i = 0; i < 30; i++) addObject(s, { id: 'lb' + i, instanceId: 'i-lb' + i, cardId: 'x', controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  if (setupFn) setupFn(s);
  return s;
}
function land(s, id, colors) {
  addObject(s, { id, instanceId: 'i-' + id, cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land', power: 0, toughness: 0, manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'], colors, cardName: id });
}
function foe(s) {
  addObject(s, { id: 'f1', instanceId: 'i-f1', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'f' });
}
function score(cardId, cmd, mana, setupFn) {
  const s = setup(mana, setupFn);
  const d = REG.get(cardId);
  addObject(s, { id: 'c1', instanceId: 'i-c1', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  return b.trace().at(-1).options.filter((o) => o.cmd.startsWith(cmd + '(c1')).map((o) => o.score.toFixed(2));
}

// PMSSB-12 Wave-A (F-P): pay-net = max(0, like x (benefit-payMana))!
test('PMSSB12-A: spellbombs FIRE +2.25 color-gated (67.95/64.35)', () => {
  assert.deepEqual(score('panic-spellbomb', 'cast_permanent', 14, (s) => { land(s, 'm1', ['R']); foe(s); }), ['67.95']);
  assert.deepEqual(score('horizon-spellbomb', 'cast_permanent', 14, (s) => { land(s, 'g1', ['G']); foe(s); }), ['67.95']);
  assert.deepEqual(score('panic-spellbomb', 'cast_permanent', 14, (s) => { land(s, 'm1', ['R']); }), ['64.35']);
  assert.deepEqual(score('horizon-spellbomb', 'cast_permanent', 14, (s) => { land(s, 'g1', ['G']); }), ['64.35']);
});
test('PMSSB12-A: spellbomb color-gate CLOSED (wrong-color/no-land SAME)', () => {
  assert.deepEqual(score('panic-spellbomb', 'cast_permanent', 14, (s) => { land(s, 'g1', ['G']); foe(s); }), ['65.70']);
  assert.deepEqual(score('horizon-spellbomb', 'cast_permanent', 14, (s) => { land(s, 'm1', ['R']); foe(s); }), ['65.70']);
});
test('PMSSB12-A: descendant FIRES +0.45-blocked / +0.9-open', () => {
  assert.deepEqual(score('descendant-of-storms', 'cast_permanent', 14, (s) => { land(s, 'w1', ['W']); foe(s); }), ['69.75']);
  assert.deepEqual(score('descendant-of-storms', 'cast_permanent', 14, (s) => { land(s, 'w1', ['W']); }), ['66.60']);
});
test('PMSSB12-A: spire pay-or-sac (84-pay / 76-sac-clamp / 81-sonda)', () => {
  assert.deepEqual(score('rupture-spire', 'play_land', 14), ['84.00']);
  assert.deepEqual(score('rupture-spire', 'play_land', 0), ['76.00']);
  assert.deepEqual(score('rupture-spire', 'play_land', 14, (s) => { land(s, 'm1', ['R']); land(s, 'w1', ['W']); foe(s); }), ['81.00']);
});
test('PMSSB12-A: forebear grave-SKIP SAME (70.20)', () => {
  assert.deepEqual(score('furious-forebear', 'cast_permanent', 14, (s) => { land(s, 'w1', ['W']); foe(s); }), ['70.20']);
});
