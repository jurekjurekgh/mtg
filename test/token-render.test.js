import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToken } from '../src/engine/tokens.js';

test('token ma właściwość cardId z token_', () => {
  const t = createToken({ name: 'Goblin', kind: 'creature', power: 1, toughness: 1 });
  assert.ok(t.cardId.startsWith('token_'));
});
