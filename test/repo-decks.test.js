import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseDeckText, writeDeckText } from '../src/cards/deck-text.js';
import { validateDeck } from '../src/cards/deck-validation.js';
import { summarizeDeck } from '../src/cards/deck-summary.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { buildDecks } from '../tools/generate-plan-decks.mjs';

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

test('M178: talia Innistrad streszcza się przewidywalnie (kolory i landy)', () => {
  // Następca testu „talia red”: talie per PLAN (ADR 0023) — Innistrad to
  // największa talia jednoplanowa; landy = ceil(nielandów/2) z generatora.
  const registry = createCardRegistry();
  const deck = parseDeckText(fs.readFileSync('decks/innistrad.txt', 'utf8'), registry);
  const summary = summarizeDeck(deck.cardIds, registry);
  assert.equal(summary.spells, 31, '31 wspieranych kart planu Innistrad');
  assert.equal(summary.lands, 16, 'ceil(31/2) = 16 landów');
  assert.equal(summary.total, 47);
});

test('M178 (ADR 0023): każda wspierana karta jest w DOKŁADNIE jednej talii', () => {
  // Rewolucja talii: talie per PLAN pokrywają CAŁY wspierany katalog bez
  // duplikatów między taliami (singleton globalny — nie tylko w talii).
  const registry = createCardRegistry();
  const seen = new Map(); // cardId -> [pliki]
  for (const file of deckFiles) {
    const deck = parseDeckText(fs.readFileSync(`decks/${file}`, 'utf8'), registry);
    for (const id of new Set(deck.cardIds)) {
      if (id.startsWith('basic-')) continue;
      if (!seen.has(id)) seen.set(id, []);
      seen.get(id).push(file);
    }
  }
  const dupes = [...seen.entries()].filter(([, files]) => files.length > 1)
    .map(([id, files]) => `${id}: ${files.join(', ')}`);
  assert.deepEqual(dupes, [], `karty w wielu taliach:\n${dupes.join('\n')}`);
  const missing = registry.all()
    .filter((card) => card.support?.status === 'supported' && !card.id.startsWith('basic-') && !seen.has(card.id))
    .map((card) => card.id);
  assert.deepEqual(missing, [], `wspierane karty bez talii: ${missing.join(', ')}`);
});

test('M178 (ADR 0023): generator talii jest zgodny z plikami w decks/', () => {
  // Talie SĄ wygenerowane — ręczna edycja bez przepuszczenia przez
  // tools/generate-plan-decks.mjs rozjedzie się z tym testem.
  const files = buildDecks();
  const onDisk = new Set(deckFiles.map((f) => f.replace(/\.txt$/, '')));
  assert.deepEqual([...files.keys()].sort(), [...onDisk].sort(), 'zestaw talii = wyjście generatora');
  for (const [file, text] of files) {
    assert.equal(fs.readFileSync(`decks/${file}.txt`, 'utf8'), text, `decks/${file}.txt różni się od generatora`);
  }
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
