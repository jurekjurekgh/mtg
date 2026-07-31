import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/engine/game-state.js';
import { dealDamageToPlayer } from '../src/engine/damage.js';

test('obrażenia gracza przechodzą przez life total i log zdarzeń', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const events = dealDamageToPlayer(state, 'test-source', 'p1', 3);
  assert.equal(events[0].type, 'damage_dealt');
  assert.equal(events[1].type, 'life_changed');
  assert.equal(state.players.find((player) => player.id === 'p1').life, 17);
  assert.equal(state.status, 'active');
});

test('śmiertelne obrażenia wywołują przegraną', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const events = dealDamageToPlayer(state, 'test-source', 'p1', 20);
  assert.equal(events.at(-1).type, 'player_lost');
  assert.equal(state.winnerId, 'p2');
});

test('ujemne obrażenia są odrzucane', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  assert.throws(() => dealDamageToPlayer(state, 'source', 'p1', -1), RangeError);
});
