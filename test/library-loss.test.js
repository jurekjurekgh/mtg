import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';

test('dobieranie z pustej biblioteki kończy partię przegraną aktywnego gracza', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  // CR 103.7a: tura 1 nie dobiera — przechodzimy do draw stepa tury 2.
  for (let i = 0; i < 60 && !(state.turn.step === 'draw' && state.turn.activePlayerId === 'p1' && state.turn.number > 1); i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const draw = playerView(state, 'p1').legalCommands.find((cmd) => cmd.type === 'draw_card');
  const result = execute(state, draw);
  assert.equal(result.ok, true);
  assert.equal(result.events[0].type, 'player_lost');
  assert.equal(result.events[0].reason, 'empty_library');
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p2');
});
