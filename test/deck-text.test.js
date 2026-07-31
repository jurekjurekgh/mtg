import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import { parseDeckText, writeDeckText } from '../src/cards/deck-text.js';

const registry = createRegistry([
  defineCard({ id: 'mountain', name: 'Mountain', types: ['Basic', 'Land'], support: { status: 'supported' } }),
  defineCard({ id: 'bolt', name: 'Lightning Bolt', types: ['Instant'], support: { status: 'supported' } }),
]);

test('parser i writer używają identycznego tekstowego formatu talii', () => {
  const text = '# Burn Test\n\n20x Mountain\n4x Lightning Bolt\n';
  const deck = parseDeckText(text, registry);
  assert.equal(deck.name, 'Burn Test');
  assert.equal(deck.cardIds.length, 24);
  assert.equal(writeDeckText(deck, registry), text);
});

test('parser odrzuca nieznaną kartę i błędną linię', () => {
  assert.throws(() => parseDeckText('# X\n1x Missing\n', registry), /Nieznana karta/);
  assert.throws(() => parseDeckText('# X\nMountain\n', registry), /Nieprawidłowa linia/);
});

test('writer wykorzystuje limit kopii i wyjątek landów podstawowych', () => {
  const ids = [...Array.from({ length: 5 }, () => 'mountain'), 'bolt'];
  assert.doesNotThrow(() => writeDeckText({ name: 'Basics', cardIds: ids }, registry));
  assert.throws(() => writeDeckText({ name: 'Invalid', cardIds: [...Array.from({ length: 5 }, () => 'bolt')] }, registry), /Nieprawidłowa talia/);
});
