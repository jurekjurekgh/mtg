import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView } from '../src/engine/game-state.js';
import { setupGame } from '../src/engine/setup.js';

test('setup rozdaje siedem kart każdemu graczowi', () => {
  const state = createGameState({ seed: 12, players: [{ id: 'p1' }, { id: 'p2' }] });
  setupGame({
    state,
    seed: 99,
    decks: new Map([
      ['p1', Array.from({ length: 10 }, (_, i) => `p1-card-${i}`)],
      ['p2', Array.from({ length: 10 }, (_, i) => `p2-card-${i}`)],
    ]),
  });
  assert.equal(state.zones.hand.length, 14);
  assert.equal(state.zones.library.length, 6);
  assert.equal(playerView(state, 'p1').zones.hand.filter((card) => !card.hidden).length, 7);
  assert.equal(playerView(state, 'p1').zones.hand.filter((card) => card.hidden).length, 7);
  assert.equal(playerView(state, 'p2').zones.hand.filter((card) => card.hidden).length, 7);
});

test('setup z krótszą talią rozdaje tyle kart, ile istnieje', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  setupGame({ state, seed: 1, openingHandSize: 7, decks: new Map([
    ['p1', ['a']], ['p2', ['b', 'c']],
  ]) });
  assert.equal(state.zones.hand.length, 3);
  assert.equal(state.zones.library.length, 0);
});
