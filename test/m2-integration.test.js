import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { initializeResources } from '../src/engine/resources.js';

test('M2: land produkuje manę, a mana pozwala zagrać creatura', () => {
  const state = createGameState({ seed: 2, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.turn.phase = 'precombat_main';
  addObject(state, { id: 'land', instanceId: 'il', cardId: 'Mountain', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  addObject(state, { id: 'creature', instanceId: 'ic', cardId: 'Bear', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 1 });
  assert.equal(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'land' }).ok, true);
  assert.equal(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'creature' }).ok, true);
  assert.equal(state.players[0].mana, 0);
  assert.equal(state.objects.get('permanent-0').summoningSickness, true);
});
