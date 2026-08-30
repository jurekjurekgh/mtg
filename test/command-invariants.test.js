import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute } from '../src/engine/game-state.js';

test('zaakceptowana komenda waliduje stan przed zapisaniem do replayu', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  state.zones.hand.push('orphan');
  assert.throws(() => execute(state, { type: 'pass_priority', playerId: 'p1' }), /nieistniejący obiekt/);
  assert.equal(state.commands.length, 0);
});
