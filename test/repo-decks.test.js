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
  assert.equal(summary.spells, 35, '35 wspieranych kart planu Innistrad (Batch 45: +Doomed Dissenter)');
  assert.equal(summary.lands, 18, 'ceil(35/2) = 18 landów');
  assert.equal(summary.total, 53);
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
  // M181: po każdym batchu uruchom `node tools/generate-plan-decks.mjs` —
  // generator sam AWANSUJE plan z worka przy 15+ kartach (nowa talia,
  // przeliczone landy); ten strażnik wymusza regenerację.
  assert.deepEqual([...files.keys()].sort(), [...onDisk].sort(),
    'zestaw talii = wyjście generatora — uruchom: node tools/generate-plan-decks.mjs (auto-awans planów 15+, ADR 0023 §4)');
  for (const [file, text] of files) {
    assert.equal(fs.readFileSync(`decks/${file}.txt`, 'utf8'), text,
      `decks/${file}.txt różni się od generatora — uruchom: node tools/generate-plan-decks.mjs`);
  }
});

test('każda wspierana karta nielandowa jest w którejś talii (konwencja M33+)', () => {
  // M194/K1 (Batch 47): katalog ma DWA egzemplarze niektórych kart (Curate
  // BRO/STX, Negate M20/M15). Porównywanie po NAZWIE uznałoby oba za pokryte,
  // gdy w taliach jest tylko jeden — a to dokładnie ta cicha pomyłka, przed
  // którą chroni sufiks setu. Strażnik liczy więc EGZEMPLARZE (cardId),
  // parsując pliki tym samym parserem co gra.
  const registry = createCardRegistry();
  const idsInDecks = new Set();
  for (const file of deckFiles) {
    const deck = parseDeckText(fs.readFileSync(`decks/${file}`, 'utf8'), registry);
    for (const id of deck.cardIds) idsInDecks.add(id);
  }
  const missing = [];
  for (const card of registry.all()) {
    if (card.support?.status !== 'supported') continue;
    if ((card.types ?? []).includes('Land')) continue;
    if (!idsInDecks.has(card.id)) missing.push(`${card.name} (${card.set ?? '?'})`);
  }
  assert.deepEqual(missing, [], `karty bez talii: ${missing.join(', ')}`);
});
