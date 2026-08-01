import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToken } from '../src/engine/tokens.js';

test('token w renderze ma klasę token', () => {
  const t = createToken({ name: 'Goblin', kind: 'creature', power: 1, toughness: 1 });
  assert.equal(t.cardId.startsWith('token_'), true);
  assert.equal(typeof t.name, 'string');
});
