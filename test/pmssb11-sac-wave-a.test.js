import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
function setup(lib, setupFn) {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 14);
  for (let i = 0; i < (lib ?? 30); i++) addObject(s, { id: 'lb' + i, instanceId: 'i-lb' + i, cardId: 'x', controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  if (setupFn) setupFn(s);
  return s;
}
function vic(s, p, t, mv, id) {
  addObject(s, { id: id ?? 'v1', instanceId: 'i-v1', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: p, toughness: t, manaCost: mv, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'v' });
}
function foe(s, p, t, mv) {
  addObject(s, { id: 'f1', instanceId: 'i-f1', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: p, toughness: t, manaCost: mv, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'f' });
}
function castScore(cardId, lib, setupFn) {
  const s = setup(lib, setupFn);
  const d = REG.get(cardId);
  addObject(s, { id: 'c1', instanceId: 'i-c1', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  return b.trace().at(-1).options.filter((o) => o.cmd.startsWith('cast_permanent(c1') || o.cmd.startsWith('cast_spell(c1')).map((o) => o.score.toFixed(2));
}

// PMSSB-11 Wave-A (F-S): exploit/devour-net = max(0, benefit-cheapest-sac)!
test('PMSSB11-A: silumgar FIRES +2.7 (68.40) victim+foe2/2', () => {
  assert.deepEqual(castScore('silumgar-butcher', 30, (s) => { vic(s, 1, 1, 0); foe(s, 2, 2, 2); }), ['68.40']);
});
test('PMSSB11-A: drowner FIRES +5.4 (71.10) victim+lib', () => {
  assert.deepEqual(castScore('gurmag-drowner', 30, (s) => { vic(s, 1, 1, 0); foe(s, 2, 2, 2); }), ['71.10']);
});
test('PMSSB11-A: gorger FIRES +2.7 (72.91) trash-victim', () => {
  assert.deepEqual(castScore('gorger-wurm', 30, (s) => { vic(s, 1, 1, 0); foe(s, 2, 2, 2); }), ['72.91']);
});
test('PMSSB11-A: gates-CLOSED (bare/victim-only/big-T/no-kill/unworthy/lib0/big-sac/no-trash)', () => {
  assert.deepEqual(castScore('silumgar-butcher', 30), ['65.70']);
  assert.deepEqual(castScore('silumgar-butcher', 30, (s) => { vic(s, 1, 1, 0); }), ['65.70']);
  assert.deepEqual(castScore('silumgar-butcher', 30, (s) => { vic(s, 1, 1, 0); foe(s, 5, 5, 5); }), ['65.70']);
  assert.deepEqual(castScore('silumgar-butcher', 30, (s) => { vic(s, 5, 5, 6); foe(s, 2, 2, 2); }), ['65.70']);
  assert.deepEqual(castScore('gurmag-drowner', 30), ['65.70']);
  assert.deepEqual(castScore('gurmag-drowner', 0, (s) => { vic(s, 1, 1, 0); }), ['65.70']);
  assert.deepEqual(castScore('gurmag-drowner', 30, (s) => { vic(s, 5, 5, 6); }), ['65.70']);
  assert.deepEqual(castScore('gorger-wurm', 30), ['70.21']);
  assert.deepEqual(castScore('gorger-wurm', 30, (s) => { vic(s, 5, 5, 6); }), ['70.21']);
});
test('PMSSB11-A: guards-COVERED (rampager/rites/splinters/strands/dreadmaw)', () => {
  assert.deepEqual(castScore('rust-shield-rampager', 30, (s) => { vic(s, 1, 1, 0); foe(s, 2, 2, 2); }), ['78.30', '69.31']);
  assert.deepEqual(castScore('village-rites', 30, (s) => { vic(s, 1, 1, 0); foe(s, 2, 2, 2); }), ['8.00']);
  assert.deepEqual(castScore('bone-splinters', 30, (s) => { vic(s, 1, 1, 0); foe(s, 2, 2, 2); }), ['84.00', '-252.00']);
  assert.deepEqual(castScore('severed-strands', 30, (s) => { vic(s, 1, 1, 0); foe(s, 2, 2, 2); }), ['85.00']);
  assert.deepEqual(castScore('kheru-dreadmaw', 30, (s) => { vic(s, 1, 1, 0); foe(s, 2, 2, 2); }), ['68.41']);
});
