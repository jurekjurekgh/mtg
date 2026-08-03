import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import {
  addCardToDeck,
  deckBuilderCards,
  deckBuilderErrorText,
  deckBuilderSnapshot,
  deckDownloadFilename,
  removeCardFromDeck,
} from '../src/cards/deck-builder.js';

const registry = createRegistry([
  defineCard({ id: 'bolt', name: 'Lightning Bolt', set: 'M10', plan: 'Burn', colors: ['R'], types: ['Instant'], support: { status: 'supported' } }),
  defineCard({ id: 'mountain', name: 'Mountain', set: 'M10', plan: 'Burn', colors: ['R'], types: ['Basic', 'Land'], support: { status: 'supported' } }),
  defineCard({ id: 'future', name: 'Future Bolt', set: 'M11', plan: 'Burn', colors: ['R'], types: ['Instant'], support: { status: 'in-development' } }),
]);

test('kreator filtruje Plan, Set i nazwę wyłącznie po kartach supported', () => {
  assert.deepEqual(deckBuilderCards(registry, { plan: 'burn', set: 'm10', name: 'light' }).map((card) => card.id), ['bolt']);
  assert.deepEqual(deckBuilderCards(registry, { name: 'future' }), []);
});

test('dodawanie respektuje limit czterech kopii, a land podstawowy jest bez limitu', () => {
  let ids = [];
  for (let i = 0; i < 4; i += 1) {
    const result = addCardToDeck(ids, 'bolt', registry);
    assert.equal(result.ok, true);
    ids = result.cardIds;
  }
  const tooMany = addCardToDeck(ids, 'bolt', registry);
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.error, 'max_copies:bolt:4');
  assert.equal(tooMany.cardIds.length, 4);

  ids = Array.from({ length: 20 }, () => 'mountain');
  const extraLand = addCardToDeck(ids, 'mountain', registry);
  assert.equal(extraLand.ok, true);
  assert.equal(extraLand.cardIds.length, 21);
});

test('snapshot zawiera podsumowanie i dokładnie ten sam tekst co plik decks', () => {
  const snapshot = deckBuilderSnapshot({ name: 'Burn Test', cardIds: ['mountain', 'bolt', 'bolt'] }, registry);
  assert.equal(snapshot.validation.valid, true);
  assert.equal(snapshot.summary.total, 3);
  assert.equal(snapshot.summary.lands, 1);
  assert.equal(snapshot.summary.spells, 2);
  assert.equal(snapshot.summary.colors.get('R'), 3);
  assert.equal(snapshot.text, '# Burn Test\n\n1x Mountain\n2x Lightning Bolt\n');
});

test('pusta nazwa blokuje eksport, ale rozmiar talii pozostaje opcjonalny', () => {
  const snapshot = deckBuilderSnapshot({ name: ' ', cardIds: ['bolt'] }, registry);
  assert.equal(snapshot.validation.valid, false);
  assert.deepEqual(snapshot.validation.errors, ['deck_name:empty']);
  assert.equal(snapshot.text, '');
  assert.equal(deckBuilderErrorText('deck_name:empty', registry), 'Podaj nazwę talii.');
});

test('usuwanie jednej kopii zachowuje kolejność, a nazwa pliku jest bezpieczna', () => {
  const result = removeCardFromDeck(['bolt', 'mountain', 'bolt'], 'bolt', registry);
  assert.deepEqual(result.cardIds, ['mountain', 'bolt']);
  assert.equal(deckDownloadFilename('Żółta talia #1'), 'zolta-talia-1.txt');
  assert.equal(deckDownloadFilename(''), 'moja-talia.txt');
});
