import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';

test('gracz może zakończyć partię przez koncesję niezależnie od priorytetu', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const result = execute(state, { type: 'concede', playerId: 'p2' });
  assert.equal(result.ok, true);
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p1');
  assert.equal(playerView(state, 'p1').legalCommands.length, 0);
});

test('po zakończeniu partii engine odrzuca kolejne komendy', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  execute(state, { type: 'concede', playerId: 'p2' });
  const result = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(result.ok, false);
  assert.equal(result.events[0].reason, 'game_over');
});
