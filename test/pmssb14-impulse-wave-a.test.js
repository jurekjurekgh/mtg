import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
function setup(setupFn) {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 14);
  for (let i = 0; i < 30; i++) addObject(s, { id: 'lb' + i, instanceId: 'i-lb' + i, cardId: 'x', controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  if (setupFn) setupFn(s);
  return s;
}
function board(s) {
  addObject(s, { id: 'v1', instanceId: 'i-v1', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'v' });
  addObject(s, { id: 'f1', instanceId: 'i-f1', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'f' });
  for (let i = 1; i <= 3; i++) addObject(s, { id: 'a' + i, instanceId: 'i-a' + i, cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact', power: 0, toughness: 0, manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: 'art' });
}
function castScore(cardId, setupFn) {
  const s = setup(setupFn);
  const d = REG.get(cardId);
  addObject(s, { id: 'c1', instanceId: 'i-c1', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  return b.trace().at(-1).options.filter((o) => o.cmd.startsWith('cast_permanent(c1')).map((o) => o.score.toFixed(2));
}

// PMSSB-14 Wave-A (F-I): impulse-helper + saga-chapters!
test('PMSSB14-A: refactor-bit-identical (drowner/dockhand/ability SAME)', () => {
  assert.deepEqual(castScore('gurmag-drowner', board), ['71.10']);
  assert.deepEqual(castScore('merchants-dockhand', board), ['65.70']);
  const s = setup(board);
  const d = REG.get('merchants-dockhand');
  addObject(s, { id: 'md', instanceId: 'i-md', cardId: 'merchants-dockhand', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  assert.deepEqual(b.trace().at(-1).options.filter((o) => o.cmd.includes('activate_ability(md')).map((o) => o.score.toFixed(2)), ['6.50', '6.00', '6.00', '-38.00']);
});
test('PMSSB14-A: saga FIRES +16.20 (73.79) / no-creature +12.96 (70.55)', () => {
  assert.deepEqual(castScore('rediscover-the-way', board), ['73.79']);
  assert.deepEqual(castScore('rediscover-the-way'), ['70.55']);
});
