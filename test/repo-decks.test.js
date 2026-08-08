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
  // Po M55/B24 (Scorch Spitter..Welder Automaton + Goblin Battle Jester,
  // Brawler's Plate): 45 kart — 15 Mountains + 30 nielandowych.
  assert.equal(summary.total, 45);
  assert.equal(summary.lands, 15);
  assert.equal(summary.spells, 30);
  assert.ok((summary.colors.get('R') ?? 0) >= 12, 'czerwone karty obecne');
});

test('każda wspierana karta nielandowa jest w którejś talii (konwencja M33+)', () => {
  const registry = createCardRegistry();
  const text = deckFiles.map((file) => fs.readFileSync(`decks/${file}`, 'utf8')).join('\n');
  const namesInDecks = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(\d+)x\s+(.+)$/);
    if (match) namesInDecks.add(match[2].trim());
  }
  const missing = [];
  for (const card of registry.all()) {
    if (card.support?.status !== 'supported') continue;
    if ((card.types ?? []).includes('Land')) continue;
    if (!namesInDecks.has(card.name)) missing.push(card.name);
  }
  assert.deepEqual(missing, [], `karty bez talii: ${missing.join(', ')}`);
});
