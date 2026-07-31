import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute } from '../src/engine/game-state.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { runSimulation } from '../src/engine/simulation.js';
import { replayFromState, serializeReplay, parseReplay, verifyReplay } from '../src/engine/replay.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

test('M1: symulacja, zapis i podwójne odtworzenie są deterministyczne', () => {
  const create = (seed) => createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  const state = create(808);
  runSimulation({
    state,
    controllers: new Map([
      ['p1', createRandomBot({ seed: 1 })],
      ['p2', createRandomBot({ seed: 2 })],
    ]),
    maxCommands: 12,
  });
  const replay = parseReplay(serializeReplay(replayFromState(state)));
  const verification = verifyReplay(replay, create, execute);
  assert.equal(verification.deterministic, true);
  assert.equal(verification.fingerprint, stateFingerprint(state));
  assert.equal(verification.results.length, state.commands.length);
});
