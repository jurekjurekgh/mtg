import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeLife, createGameState, playerView } from '../src/engine/game-state.js';

test('zmiana życia emituje zdarzenie', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const events = changeLife(state, 'p1', -3);
  assert.deepEqual(events[0], { type: 'life_changed', playerId: 'p1', before: 20, after: 17, amount: -3 });
  assert.equal(state.players[0].life, 17);
});

test('życie równe zero kończy partię', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const events = changeLife(state, 'p1', -20);
  assert.equal(events.at(-1).type, 'player_lost');
  assert.equal(events.at(-1).reason, 'life_zero');
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p2');
  assert.equal(playerView(state, 'p1').status, 'finished');
});
