import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToken } from '../src/engine/tokens.js';

test('token ma stałą definicję z nazwą i statystykami', () => {
  const t = createToken({ name: 'Goblin', kind: 'creature', power: 1, toughness: 1, colors: ['R'] });
  assert.equal(t.name, 'Goblin');
  assert.equal(t.cardId, 'token_goblin');
  assert.equal(t.power, 1);
  assert.deepEqual(t.colors, ['R']);
});

test('token odrzuca brak nazwy', () => {
  assert.throws(() => createToken({ name: '' }), TypeError);
});
