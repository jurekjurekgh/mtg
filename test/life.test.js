import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeLife, createGameState, playerView } from '../src/engine/game-state.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { dealDamageToPlayer } from '../src/engine/damage.js';

test('zmiana życia emituje zdarzenie i nie rozstrzyga przegranej', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const events = changeLife(state, 'p1', -3);
  assert.deepEqual(events[0], { type: 'life_changed', playerId: 'p1', before: 20, after: 17, amount: -3 });
  assert.equal(state.players[0].life, 17);
});

test('sama zmiana życia do zera czeka na centralne state-based actions', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const events = changeLife(state, 'p1', -20);
  assert.equal(events[0].type, 'life_changed');
  assert.equal(events.length, 1);
  assert.equal(state.status, 'active');
  const sba = runStateBasedActions(state);
  assert.equal(sba[0].type, 'player_lost');
  assert.equal(sba[0].reason, 'life_zero');
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p2');
  assert.equal(playerView(state, 'p1').status, 'finished');
});

test('śmiertelne obrażenia przechodzą przez centralne state-based actions', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const events = dealDamageToPlayer(state, 'source', 'p1', 20);
  assert.equal(events.at(-1).type, 'player_lost');
  assert.equal(state.winnerId, 'p2');
});
