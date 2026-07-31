import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { initializeResources } from '../src/engine/resources.js';

test('tapnięty land produkuje manę tylko raz przed untapem', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  addObject(state, { id: 'land', instanceId: 'i', cardId: 'Mountain', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  const first = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'land' });
  assert.equal(first.ok, true);
  assert.equal(state.players[0].mana, 1);
  const second = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'land' });
  assert.equal(second.ok, false);
  assert.match(second.events[0].reason, /^illegal_mana_source:/);
  assert.equal(playerView(state, 'p1').legalCommands.some((cmd) => cmd.type === 'tap_for_mana'), false);
});
