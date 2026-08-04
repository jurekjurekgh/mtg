import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import {
  addCardToDeck,
  addFilteredToDeck,
  clearDeck,
  deckBuilderCards,
  deckBuilderErrorText,
  deckBuilderSnapshot,
  deckDownloadFilename,
  deckStatistics,
  removeCardFromDeck,
  sortBuilderCards,
} from '../src/cards/deck-builder.js';

const registry = createRegistry([
  defineCard({ id: 'bolt', name: 'Lightning Bolt', set: 'M10', plan: 'Burn', colors: ['R'], types: ['Instant'], support: { status: 'supported' } }),
  defineCard({ id: 'mountain', name: 'Mountain', set: 'M10', plan: 'Burn', colors: ['R'], types: ['Basic', 'Land'], support: { status: 'supported' } }),
  defineCard({ id: 'future', name: 'Future Bolt', set: 'M11', plan: 'Burn', colors: ['R'], types: ['Instant'], support: { status: 'in-development' } }),
  defineCard({ id: 'lyre', name: 'Entrancing Lyre', set: 'THB', plan: 'Theros', colors: [], types: ['Artifact'], support: { status: 'supported' } }),
  defineCard({ id: 'embrace', name: "Serra's Embrace", set: 'DVD', plan: 'Dominaria', colors: ['W'], types: ['Enchantment'], support: { status: 'supported' } }),
]);

test('kreator filtruje Plan, Set, nazwę i kolor wyłącznie po kartach supported', () => {
  assert.deepEqual(deckBuilderCards(registry, { plan: 'burn', set: 'm10', name: 'light' }).map((card) => card.id), ['bolt']);
  assert.deepEqual(deckBuilderCards(registry, { name: 'future' }), []);
});

test('filtr koloru: R, W, colorless', () => {
  // Czerwone karty (R)
  const red = deckBuilderCards(registry, { color: 'R' });
  assert.deepEqual(red.map((c) => c.id).sort(), ['bolt', 'mountain']);
  // Białe karty (W)
  const white = deckBuilderCards(registry, { color: 'W' });
  assert.deepEqual(white.map((c) => c.id), ['embrace']);
  // Bezkolorowe
  const colorless = deckBuilderCards(registry, { color: 'colorless' });
  assert.deepEqual(colorless.map((c) => c.id), ['lyre']);
  // Wszystkie (brak filtra)
  const all = deckBuilderCards(registry, {});
  assert.equal(all.length, 4);
  // Kolor + plan
  const redBurn = deckBuilderCards(registry, { color: 'R', plan: 'burn' });
  assert.deepEqual(redBurn.map((c) => c.id).sort(), ['bolt', 'mountain']);
});

test('dodawanie respektuje singleton (max 1 kopia), land podstawowy bez limitu', () => {
  // 1. kopia bolt — OK; 2. kopia — zablokowana (singleton).
  const first = addCardToDeck([], 'bolt', registry);
  assert.equal(first.ok, true);
  const tooMany = addCardToDeck(first.cardIds, 'bolt', registry);
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.error, 'max_copies:bolt:1');
  assert.equal(tooMany.cardIds.length, 1);

  // Land podstawowy — bez limitu kopii.
  const ids = Array.from({ length: 20 }, () => 'mountain');
  const extraLand = addCardToDeck(ids, 'mountain', registry);
  assert.equal(extraLand.ok, true);
  assert.equal(extraLand.cardIds.length, 21);
});

test('snapshot zawiera podsumowanie i dokładnie ten sam tekst co plik decks', () => {
  // minNonland 0 — testowa talia jest za mała na domyślne 15 nielandowych.
  const snapshot = deckBuilderSnapshot({ name: 'Burn Test', cardIds: ['mountain', 'bolt'] }, registry, { minNonland: 0 });
  assert.equal(snapshot.validation.valid, true);
  assert.equal(snapshot.summary.total, 2);
  assert.equal(snapshot.summary.lands, 1);
  assert.equal(snapshot.summary.spells, 1);
  assert.equal(snapshot.text, '# Burn Test\n\n1x Mountain\n1x Lightning Bolt\n');
});

test('pusta nazwa blokuje eksport, ale rozmiar talii pozostaje opcjonalny', () => {
  const snapshot = deckBuilderSnapshot({ name: ' ', cardIds: ['bolt'] }, registry, { minNonland: 0 });
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

test('clearDeck zeruje talię', () => {
  assert.deepEqual(clearDeck(['bolt', 'mountain', 'bolt']), []);
});

test('addFilteredToDeck dodaje po jednej kopii z listy, z limitem singleton', () => {
  const cards = deckBuilderCards(registry);
  // bolt już ma 1 kopię — przy singleton (max 1) zostanie pominięty.
  const base = ['bolt'];
  const result = addFilteredToDeck(base, cards, registry);
  assert.ok(result.ok);
  // Dodane: mountain, lyre, embrace (bolt pominięty — singleton).
  assert.equal(result.added, 3);
  assert.equal(result.cardIds.filter((id) => id === 'bolt').length, 1);
  assert.ok(result.cardIds.includes('mountain'));
  assert.ok(result.cardIds.includes('lyre'));
});

test('deckStatistics liczy typy, kolory i krzywą many', () => {
  const stats = deckStatistics(['bolt', 'mountain', 'lyre', 'embrace'], registry);
  assert.equal(stats.total, 4);
  assert.equal(stats.lands, 1);
  assert.equal(stats.nonlands, 3);
  assert.equal(stats.typeCounts.creatures, 0);
  assert.equal(stats.typeCounts.instants, 1);
  assert.equal(stats.typeCounts.artifacts, 1);
  assert.equal(stats.typeCounts.enchantments, 1);
  assert.equal(stats.colors.get('R'), 1);
  assert.equal(stats.colors.get('W'), 1);
  // bolt, lyre, embrace — wszystkie manaCost 0 (domyślne w definicjach testowych).
  assert.equal(stats.curve.get('0'), 3);
  assert.equal(stats.avgCmc, 0);
});

test('sortBuilderCards: podstawowe landy na górze, reszta alfabetycznie po nazwie', () => {
  const cards = deckBuilderCards(registry);
  const sorted = sortBuilderCards(cards);
  assert.equal(sorted[0].id, 'mountain', 'Basic Land pierwszy');
  const restNames = sorted.slice(1).map((c) => c.name);
  assert.deepEqual(restNames, [...restNames].sort((a, b) => a.localeCompare(b, 'pl')));
});
