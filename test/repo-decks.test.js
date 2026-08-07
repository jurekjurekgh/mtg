import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseDeckText, writeDeckText } from '../src/cards/deck-text.js';
import { validateDeck } from '../src/cards/deck-validation.js';
import { summarizeDeck } from '../src/cards/deck-summary.js';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * Strażnik ADR 0011/0012: każda talia wersjonowana w decks/ musi parsować się
 * wspólnym formatem, przechodzić walidację względem katalogu i zapisywać się
 * z powrotem do identycznego tekstu.
 */

const deckFiles = fs.readdirSync('decks').filter((name) => name.endsWith('.txt'));

test('repozytorium zawiera co najmniej jedną talię testową', () => {
  assert.ok(deckFiles.length >= 1, 'brak plików talii w decks/');
});

for (const file of deckFiles) {
  test(`talia ${file} jest poprawna i round-tripuje tekstowo`, () => {
    const registry = createCardRegistry();
    const text = fs.readFileSync(`decks/${file}`, 'utf8');
    const deck = parseDeckText(text, registry);
    const validation = validateDeck(deck.cardIds, registry);
    assert.equal(validation.valid, true, validation.errors.join(', '));
    assert.equal(writeDeckText(deck, registry), text);
  });
}

test('talia red streszcza się przewidywalnie (kolory i landy)', () => {
  const registry = createCardRegistry();
  const deck = parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), registry);
  const summary = summarizeDeck(deck.cardIds, registry);
  assert.equal(summary.total, 34);
  assert.equal(summary.lands, 13);
  assert.equal(summary.spells, 21);
  assert.ok((summary.colors.get('R') ?? 0) >= 12, 'czerwone karty obecne');
});
