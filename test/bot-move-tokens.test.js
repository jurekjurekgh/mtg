// M89 cd. — bug C: modal „Ruch przeciwnika" NIE pokazuje tokenów stworzonych
// przez czar bota. Właściciel: „Bot rzucił Carrion Call, w modalu ruchu
// przeciwnika brak wpisu o tokenach, które stworzył czar" (2026-08-14).
//
// Root cause: `token_created` jest w `BOT_PAUSE_EVENTS` (sesja pauzuje
// po tokenie), ale NIE jest w `BOT_MOVE_CARD_EVENTS` — `noteBotMove` nie
// pobiera cardId tokena (tokeny mają własne id kart, ale NIE mają
// imageUri z Scryfalla). Brak cardId w botMoves powoduje, że modal
// pokazuje tylko tekst „Nieprzyjaciel tworzy token Carrion (1/1)"
// bez miniaturki.
//
// Fix: dla zdarzenia token_created cardId = name (skan synthetic), albo
// w ogóle pokaż symboliczny wpis z obrazem syntetycznym (textless tile).
// Najprostsze: dodać token_created do BOT_MOVE_CARD_EVENTS i ustawić
// cardId z eventu (tokeny mają własny cardId, ale UI użyje tego samego
// renderera co inne ruchy — bez imageUri zostaje twarz syntetyczna).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('bug C: BOT_MOVE_CARD_EVENTS w session.js zawiera token_created', () => {
  // Zdarzenie token_created MUSI być w BOT_MOVE_CARD_EVENTS, żeby modal
  // pokazał wpis (choćby z syntetyczną twarzą) — bez tego Carrion Call
  // tworzy wpis tekstowy bez miniaturki.
  const src = fs.readFileSync('src/table/session.js', 'utf8');
  const match = src.match(/BOT_MOVE_CARD_EVENTS\s*=\s*new Set\(\[\s*([^\]]+)\s*\]\)/);
  assert.ok(match, 'BOT_MOVE_CARD_EVENTS powinien istnieć w session.js');
  assert.match(match[1], /token_created/,
    'BOT_MOVE_CARD_EVENTS MUSI zawierać token_created (Carrion Call, Raise the Alarm itd.)');
});

test('bug C: noteBotMove w session.js ustawia cardId przez BOT_MOVE_CARD_EVENTS.has', () => {
  // noteBotMove MUSI sprawdzać BOT_MOVE_CARD_EVENTS.has(e.type) — wtedy
  // dla token_created (w BOT_MOVE_CARD_EVENTS) pobiera cardId z eventu
  // (tokeny mają cardId typu `token_*`; UI wyświetla syntetyczną twarz).
  const src = fs.readFileSync('src/table/session.js', 'utf8');
  assert.match(src, /if\s*\(\s*BOT_MOVE_CARD_EVENTS\.has\(e\.type\)\s*\)/,
    'noteBotMove MUSI sprawdzać BOT_MOVE_CARD_EVENTS.has(e.type) dla pobierania cardId');
});

test('bug C: BOT_MOVE_CARD_EVENTS w session.js zawiera land_played (istniejący fix, regression)', () => {
  // Strażnik regresji: M89 dodał land_played do BOT_MOVE_CARD_EVENTS, żeby
  // modal ruchu bota pokazywał miniaturkę zagranego landa. Sprawdzamy, czy
  // fix nadal tam jest.
  const src = fs.readFileSync('src/table/session.js', 'utf8');
  const match = src.match(/BOT_MOVE_CARD_EVENTS\s*=\s*new Set\(\[\s*([^\]]+)\s*\]\)/);
  assert.ok(match, 'BOT_MOVE_CARD_EVENTS powinien istnieć w session.js');
  assert.match(match[1], /land_played/,
    'BOT_MOVE_CARD_EVENTS MUSI zawierać land_played (regression strażnik)');
});
