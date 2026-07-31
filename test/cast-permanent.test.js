import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { initializeResources, addMana } from '../src/engine/resources.js';

test('gracz może zagrać creature permanent za koszt many', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state); addMana(state, 'p1', 3);
  state.turn.phase = 'precombat_main';
  addObject(state, { id: 'c-hand', instanceId: 'i', cardId: 'Creature', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2 });
  assert.equal(playerView(state, 'p1').legalCommands.some((cmd) => cmd.type === 'cast_permanent'), true);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c-hand' });
  assert.equal(result.ok, true);
  assert.equal(state.players[0].mana, 1);
  assert.equal(state.zones.battlefield[0], 'permanent-0');
});

test('engine odrzuca zagranie permanenta bez many', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state); state.turn.phase = 'precombat_main';
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'C', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 1, toughness: 1, manaCost: 1 });
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c' });
  assert.equal(result.ok, false);
  assert.match(result.events[0].reason, /^illegal_cast:/);
});
