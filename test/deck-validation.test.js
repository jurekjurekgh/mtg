import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineCard, createRegistry } from '../src/cards/registry.js';
import { validateDeck } from '../src/cards/deck-validation.js';

const bolt = defineCard({ id: 'bolt', name: 'Bolt', types: ['Instant'], support: { status: 'supported' } });
const mountain = defineCard({ id: 'mountain', name: 'Mountain', types: ['Basic', 'Land'], support: { status: 'supported' } });
const registry = createRegistry([bolt, mountain]);

test('singleton: zwykła karta maksymalnie 1 kopia', () => {
  const result = validateDeck(['bolt', 'bolt'], registry, { minNonland: 0 });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['max_copies:bolt:2']);
});

test('land podstawowy bez limitu kopii (singleton go nie dotyczy)', () => {
  const result = validateDeck(Array.from({ length: 20 }, () => 'mountain'), registry, { minNonland: 0 });
  assert.equal(result.valid, true);
});

test('minimum 15 kart nielandowych (lądy podstawowe się nie liczą)', () => {
  // 1 karta nielandowa < 15 → nieprawidłowe (domyślny minNonland 15).
  assert.equal(validateDeck(['bolt'], registry).valid, false);
  assert.ok(validateDeck(['bolt'], registry).errors.some((e) => e.startsWith('deck_min_nonland')));
  // Relaks progu — 1 nielandowa spełnia minNonland 1.
  assert.equal(validateDeck(['bolt'], registry, { minNonland: 1 }).valid, true);
});

test('rozmiar talii pozostaje opcjonalnym parametrem formatu', () => {
  assert.equal(validateDeck(['bolt'], registry, { minNonland: 0 }).valid, true);
  assert.equal(validateDeck(['bolt'], registry, { minNonland: 0, size: 2 }).valid, false);
});
