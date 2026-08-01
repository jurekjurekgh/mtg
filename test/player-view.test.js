import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeLife, createGameState, playerView } from '../src/engine/game-state.js';

test('PlayerView zawiera publiczne życie i nazwy graczy', () => {
  const state = createGameState({ seed: 1, players: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ] });
  changeLife(state, 'p2', -4);
  const view = playerView(state, 'p1');
  assert.deepEqual(view.players, [
    { id: 'p1', name: 'Alice', life: 20, mana: 0, landPlays: 1 },
    { id: 'p2', name: 'Bob', life: 16, mana: 0, landPlays: 1 },
  ]);
  assert.equal(JSON.stringify(view).includes('objects'), false);
  assert.equal(JSON.stringify(view).includes('commands'), false);
});
