import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import { parseDeckText, writeDeckText } from '../src/cards/deck-text.js';

const registry = createRegistry([
  defineCard({ id: 'mountain', name: 'Mountain', types: ['Basic', 'Land'], support: { status: 'supported' } }),
  defineCard({ id: 'bolt', name: 'Lightning Bolt', types: ['Instant'], support: { status: 'supported' } }),
]);

test('parser i writer używają identycznego tekstowego formatu talii (singleton)', () => {
  const text = '# Burn Test\n\n20x Mountain\n1x Lightning Bolt\n';
  const deck = parseDeckText(text, registry);
  assert.equal(deck.name, 'Burn Test');
  assert.equal(deck.cardIds.length, 21);
  // minNonland 0 — testowa talia ma 1 kartę nielandową (za mało na domyślne 15).
  assert.equal(writeDeckText(deck, registry, { minNonland: 0 }), text);
});

test('parser odrzuca nieznaną kartę i błędną linię', () => {
  assert.throws(() => parseDeckText('# X\n1x Missing\n', registry), /Nieznana karta/);
  assert.throws(() => parseDeckText('# X\nMountain\n', registry), /Nieprawidłowa linia/);
});

test('writer egzekwuje singleton (2 kopie → błąd)', () => {
  const ids = [...Array.from({ length: 5 }, () => 'mountain'), 'bolt'];
  assert.doesNotThrow(() => writeDeckText({ name: 'Basics', cardIds: ids }, registry, { minNonland: 0 }));
  assert.throws(() => writeDeckText({ name: 'Invalid', cardIds: ['bolt', 'bolt'] }, registry, { minNonland: 0 }), /Nieprawidłowa talia/);
});
