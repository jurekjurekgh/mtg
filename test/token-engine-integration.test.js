import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToken } from '../src/engine/tokens.js';

test('token ma właściwość cardId i statystyki do renderowania', () => {
  const t = createToken({ name: 'Goblin', kind: 'creature', power: 1, toughness: 1 });
  assert.equal(typeof t.cardId, 'string');
  assert.equal(t.power, 1);
  assert.equal(t.toughness, 1);
});
