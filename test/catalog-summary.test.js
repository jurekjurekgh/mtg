import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import { querySupportedCards } from '../src/cards/catalog.js';
import { summarizeDeck } from '../src/cards/deck-summary.js';

const registry = createRegistry([
  defineCard({ id: 'bolt', name: 'Lightning Bolt', set: 'Alpha', plan: 'Burn', colors: ['R'], types: ['Instant'], support: { status: 'supported' } }),
  defineCard({ id: 'mountain', name: 'Mountain', set: 'Alpha', plan: 'Burn', colors: ['R'], types: ['Basic', 'Land'], support: { status: 'supported' } }),
  defineCard({ id: 'future', name: 'Future Bolt', set: 'Beta', plan: 'Burn', colors: ['R'], types: ['Instant'], support: { status: 'in-development' } }),
]);

test('katalog filtruje tylko supported po Plan, Set i nazwie', () => {
  assert.deepEqual(querySupportedCards(registry, { plan: 'burn', set: 'alpha', name: 'mount' }).map((card) => card.id), ['mountain']);
  assert.deepEqual(querySupportedCards(registry, { name: 'future' }), []);
});

test('podsumowanie liczy kolory i lądy osobno', () => {
  const summary = summarizeDeck(['mountain', 'mountain', 'bolt'], registry);
  assert.equal(summary.total, 3);
  assert.equal(summary.lands, 2);
  assert.equal(summary.spells, 1);
  assert.equal(summary.colors.get('R'), 3);
});
