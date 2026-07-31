import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/engine/game-state.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createRandomBot } from '../src/controllers/random-bot.js';

function run() {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  return runSimulation({
    state,
    controllers: new Map([
      ['p1', createRandomBot({ seed: 1 })],
      ['p2', createRandomBot({ seed: 2 })],
    ]),
    maxCommands: 30,
  });
}

test('dwa RandomBot-y przechodzą przez deterministyczną symulację', () => {
  const a = run();
  const b = run();
  assert.equal(a.results.length, 30);
  assert.deepEqual(a.results, b.results);
  assert.equal(a.state.turn.number, 2);
  assert.equal(a.state.turn.step, 'main');
  assert.equal(a.state.turn.phase, 'precombat_main');
});

test('kontroler nie może wykonać komendy za innego gracza', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  assert.throws(() => runSimulation({
    state,
    controllers: new Map([['p1', { chooseCommand: () => ({ type: 'pass_priority', playerId: 'p2' }) }], ['p2', createRandomBot({ seed: 2 })]]),
    maxCommands: 1,
  }), /innego gracza/);
});
