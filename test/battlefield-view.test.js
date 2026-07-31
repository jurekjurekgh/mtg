import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { tapObject } from '../src/engine/permanents.js';

test('PlayerView pokazuje publiczny stan permanentu na battlefield', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'C', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 3, toughness: 2 });
  tapObject(state, 'c', 'p1');
  assert.deepEqual(playerView(state, 'p2').zones.battlefield[0], {
    id: 'c', cardId: 'C', controllerId: 'p1', zone: 'battlefield', kind: 'creature',
    power: 3, toughness: 2, tapped: true, summoningSickness: false, damage: 0,
  });
});
