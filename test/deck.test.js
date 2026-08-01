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
    a.zones.library.map((id) => a.objects.get(id).cardId).sort(),
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

test('instalacja talii zachowuje WSZYSTKIE deskryptory obiektu (types/entersTapped/bestow)', () => {
  // Regresja (znaleziona przy wdrażaniu bestow): installDeck wyliczał pola
  // jawnie i po cichu gubił types/entersTapped — mechaniki działały w testach
  // budujących obiekty ręcznie, ale nie w prawdziwych partiach z talii.
  const deck = [{
    objectId: 'lib-0', instanceId: 'i-0', cardId: 'leafcrown-dryad', ownerId: 'p1',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    keywords: ['reach'], subtypes: ['Nymph', 'Dryad'], types: ['Enchantment', 'Creature'],
    entersTapped: false,
    bestow: { cost: 4, pump: { power: 2, toughness: 2 }, keywords: ['reach'] },
  }];
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  installDeck(state, deck, { seed: 7 });
  const object = state.objects.get(state.zones.library[0]);
  assert.deepEqual([...object.types], ['Enchantment', 'Creature']);
  assert.equal(object.entersTapped, false);
  assert.deepEqual(object.bestow, { cost: 4, pump: { power: 2, toughness: 2 }, keywords: ['reach'] });
  // Land z talii wchodzący tapped też zachowuje cechę.
  const landState = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  installDeck(landState, [{ objectId: 'lib-9', instanceId: 'i-9', cardId: 'prismari-campus', ownerId: 'p1', kind: 'land', types: ['Land'], entersTapped: true }], { seed: 3 });
  assert.equal(landState.objects.get(landState.zones.library[0]).entersTapped, true);
});
