import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView } from '../src/engine/game-state.js';
import { createDeck, installDeck, installDecks } from '../src/engine/deck.js';

test('instalacja talii tworzy osobne instancje i tasuje ją deterministycznie', () => {
  const cards = createDeck({ cardIds: ['a', 'b', 'c', 'd'], ownerId: 'p1' });
  const a = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const b = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const orderA = installDeck(a, cards, { seed: 42 });
  const orderB = installDeck(b, cards, { seed: 42 });
  assert.deepEqual(orderA, orderB);
  assert.equal(a.zones.library.length, 4);
  assert.equal(new Set(a.zones.library).size, 4);
  assert.deepEqual(
    playerView(a, 'p2').zones.library.map((card) => card.cardId).sort(),
    ['a', 'b', 'c', 'd'],
  );
});

test('instalacja dwóch talii zachowuje właścicieli i nie miesza danych', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  const installed = installDecks(state, new Map([
    ['p1', createDeck({ cardIds: ['a', 'a'], ownerId: 'p1' })],
    ['p2', createDeck({ cardIds: ['b', 'b'], ownerId: 'p2' })],
  ]), 10);
  assert.equal(installed.size, 2);
  assert.equal(state.zones.library.length, 4);
  assert.equal([...state.objects.values()].filter((o) => o.controllerId === 'p1').length, 2);
  assert.equal([...state.objects.values()].filter((o) => o.controllerId === 'p2').length, 2);
});

test('duplikat obiektu jest odrzucany przy instalacji', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const deck = createDeck({ cardIds: ['a'], ownerId: 'p1' });
  installDeck(state, deck, { seed: 1 });
  assert.throws(() => installDeck(state, deck, { seed: 1 }), /zajęte id/);
});
