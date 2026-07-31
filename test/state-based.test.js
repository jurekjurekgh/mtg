import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

test('centralne state-based actions usuwają śmiertelnie uszkodzone stwory', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'C', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  const object = state.objects.get('c');
  state.objects.set('c', Object.freeze({ ...object, damage: 1 }));
  const events = runStateBasedActions(state);
  assert.equal(events[0].type, 'creature_destroyed');
  assert.deepEqual(state.zones.battlefield, []);
  assert.deepEqual(state.zones.graveyard, ['grave-0']);
});

test('centralne state-based actions kończą grę przy życiu zero', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 0;
  const events = runStateBasedActions(state);
  assert.equal(events[0].type, 'player_lost');
  assert.equal(state.winnerId, 'p2');
});
