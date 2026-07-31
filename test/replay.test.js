import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReplay, parseReplay, playReplay, serializeReplay } from '../src/engine/replay.js';
import { createGameState, execute } from '../src/engine/game-state.js';

test('replay jest mały, tekstowy i odtwarzalny', () => {
  const replay = createReplay(99, [
    { type: 'pass_priority', playerId: 'p1' },
    { type: 'pass_priority', playerId: 'p2' },
  ]);
  const parsed = parseReplay(serializeReplay(replay));
  const first = playReplay(parsed, (seed) => createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] }), execute);
  const second = playReplay(parsed, (seed) => createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] }), execute);
  assert.deepEqual(first.state.turn, second.state.turn);
  assert.deepEqual(first.results, second.results);
  assert.equal(first.state.turn.step, 'upkeep');
});

test('uszkodzony zapis jest odrzucany', () => {
  assert.throws(() => parseReplay('{"version":2}'), TypeError);
});
