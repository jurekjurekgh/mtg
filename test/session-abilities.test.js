import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, ['syn-razorback', 'syn-shock']],
    [BOT_ID, ['syn-woodcaller', 'syn-might']],
  ]);
  return { registry, decks };
}

test('abilitiesOf zwraca listę zdolności z registry', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 1, registry, decks });
  assert.deepEqual(session.abilitiesOf('syn-shock'), []);
  assert.ok(Array.isArray(session.abilitiesOf('syn-razorback')));
});

test('abilitiesOf zwraca listę zdolności z registry', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 1, registry, decks });
  assert.deepEqual(session.abilitiesOf('syn-shock'), []);
  assert.ok(Array.isArray(session.abilitiesOf('nieistnieje')));
});
