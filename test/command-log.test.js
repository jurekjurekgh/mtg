import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute } from '../src/engine/game-state.js';
import { replayFromState, serializeReplay, parseReplay } from '../src/engine/replay.js';

test('GameState zapisuje zaakceptowane komendy do replayu', () => {
  const state = createGameState({ seed: 123, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.commands.length, 4);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.commands.length, 4);
  const replay = parseReplay(serializeReplay(replayFromState(state)));
  assert.deepEqual(replay.commands, state.commands);
});
