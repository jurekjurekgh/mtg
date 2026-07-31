import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineCard, createRegistry } from '../src/cards/registry.js';
import { validateDeck } from '../src/cards/deck-validation.js';

const bolt = defineCard({ id: 'bolt', name: 'Bolt', types: ['Instant'], support: { status: 'supported' } });
const mountain = defineCard({ id: 'mountain', name: 'Mountain', types: ['Basic', 'Land'], support: { status: 'supported' } });
const registry = createRegistry([bolt, mountain]);

test('zwykła karta ma limit czterech kopii', () => {
  const result = validateDeck(['bolt', 'bolt', 'bolt', 'bolt', 'bolt'], registry);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['max_copies:bolt:5']);
});

test('land podstawowy nie ma limitu czterech kopii', () => {
  const result = validateDeck(Array.from({ length: 20 }, () => 'mountain'), registry);
  assert.equal(result.valid, true);
});

test('rozmiar talii jest opcjonalnym parametrem formatu', () => {
  assert.equal(validateDeck(['bolt'], registry).valid, true);
  assert.equal(validateDeck(['bolt'], registry, { size: 2 }).valid, false);
});
