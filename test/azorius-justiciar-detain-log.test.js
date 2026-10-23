import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (cardId) => cardId,
  nameOfObject: (objectId) => ({ elder: 'Mysidian Elder', hero: 'Hero' })[objectId] ?? '?',
};

test('Azorius Justiciar: log detain nie wstawia „Ty” jako podmiotu celu', () => {
  for (const [objectId, name] of [['elder', 'Mysidian Elder'], ['hero', 'Hero']]) {
    const text = describeGameEvent({
      type: 'object_detained', objectId, byPlayerId: 'p1',
    }, HELPERS, NAMES);

    assert.equal(text,
      `${name} zatrzymany (detain): do następnej tury nie atakuje, nie blokuje i nie aktywuje zdolności`);
    assert.doesNotMatch(text, /\bTy\b/, 'detainer nie jest podmiotem zdania o zatrzymanym stworze');
  }
});
