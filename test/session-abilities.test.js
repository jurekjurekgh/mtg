import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, ['highland-game', 'goblin-piker']],
    [BOT_ID, ['kappa-tech-wrecker', 'dragonbroods-relic']],
  ]);
  return { registry, decks };
}

test('abilitiesOf: karta bez zdolności (vanilla) → pusta lista', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 1, registry, decks });
  assert.deepEqual(session.abilitiesOf('goblin-piker'), []);
  assert.ok(session.abilitiesOf('dragonbroods-relic').length > 0, 'Dragonbroods ma zdolności');
});

test('abilitiesOf: nieznana karta → pusta lista (nie wywala sesji)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 1, registry, decks });
  assert.ok(Array.isArray(session.abilitiesOf('nieistnieje')));
  assert.deepEqual(session.abilitiesOf('nieistnieje'), []);
});
