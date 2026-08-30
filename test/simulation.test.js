import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/engine/game-state.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createRandomBot } from '../src/controllers/random-bot.js';

function run() {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
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
  assert.ok(a.results.length <= 30);
  assert.deepEqual(a.results, b.results);
  // Przestrzeń legalnych komend rośnie wraz z silnikiem, więc konkretny
  // zakończenie jest konsekwencją seeda — inwariantem jest determinizm,
  // a nie konkretny zwycięzca.
  assert.equal(a.state.status, b.state.status);
  assert.equal(a.state.winnerId, b.state.winnerId);
  assert.equal(a.state.status, 'finished');
});

test('kontroler nie może wykonać komendy za innego gracza', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  assert.throws(() => runSimulation({
    state,
    controllers: new Map([['p1', { chooseCommand: () => ({ type: 'pass_priority', playerId: 'p2' }) }], ['p2', createRandomBot({ seed: 2 })]]),
    maxCommands: 1,
  }), /innego gracza/);
});
