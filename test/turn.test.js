import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute } from '../src/engine/game-state.js';
import { TURN_STEPS, nextTurnStep } from '../src/engine/turn.js';

test('automat tury ma jawny porządek kroków', () => {
  assert.equal(TURN_STEPS[0].step, 'untap');
  assert.equal(TURN_STEPS.at(-1).step, 'cleanup');
  const turn = { number: 1, activePlayerId: 'p1', priorityPlayerId: 'p1', stepIndex: TURN_STEPS.length - 1, passes: 2, ...TURN_STEPS.at(-1) };
  const next = nextTurnStep(turn, [{ id: 'p1' }, { id: 'p2' }]);
  assert.equal(next.number, 2);
  assert.equal(next.activePlayerId, 'p2');
  assert.equal(next.step, 'untap');
});

test('dwukrotne pass przechodzi do następnego kroku i resetuje priorytet', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  assert.equal(state.turn.step, 'untap');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const result = execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(result.ok, true);
  assert.equal(state.turn.step, 'upkeep');
  assert.equal(state.turn.priorityPlayerId, 'p1');
  assert.equal(result.events.at(-1).type, 'step_advanced');
});
