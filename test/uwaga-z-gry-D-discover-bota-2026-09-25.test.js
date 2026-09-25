import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUMAN_ID, BOT_ID, createSession, isMainLogEvent, PUBLIC_INFO_EVENTS, botMovesPaintedUpdate,
} from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * UWAGA D (zgłoszenie właściciela 2026-09-25):
 *   „Gdy tą kartę [Geological Appraiser] wystawia bot, w Rozgrywce i w Logu
 *    powinny być widoczne karty, które w ten sposób są odsłaniane zdolnością
 *    Discover. A nie są."
 *
 * Dwie warstwy, obie zmierzone (nie zgadywane):
 *  1. BRAMKA: `card_revealed` / `discover_started` / `discover_resolved`
 *     wchodziły do panelu wyłącznie tylnymi drzwiami — przez
 *     `BOT_RESOLUTION_EVENTS` (czyli TYLKO gdy `stackSize > 0`) albo przez
 *     `HUMAN_DIGEST_EVENTS` (czyli TYLKO dla człowieka). Rozstrzygnięcie
 *     triggera, które wypada w oknie bez pauzy (człowiek auto-passuje,
 *     `botActing` false) i bez obiektów w `stackObjects`, wyrzucało całą
 *     serię odsłonięć. Naprawa: rodzina `PUBLIC_INFO_EVENTS` puszczana
 *     bezwarunkowo (CR 701.20 — odsłonięte karty są informacją publiczną).
 *  2. ŻYWOTNOŚĆ MODALA: `showBotMoves()` renderował bufor i natychmiast wołał
 *     `clearBotMoves()`, więc wpisy, które doszły PO renderze (skutek czaru
 *     rozstrzygany po „Rozumiem"), były kasowane przy najbliższym `apply()`.
 *     Naprawa w `main.js`: bufor żyje, re-render tylko przy zmianie
 *     zawartości — a sam kontrakt „czy jest CO pokazać" jest tu, w czystej
 *     funkcji (ADR 0011: bez DOM-u, bez jsdomu — repo ma zero zależności).
 */

const gate = (e, ctx = {}) => isMainLogEvent(e, {
  botActing: false, phase: 'precombat_main', stackSize: 0, ...ctx,
});

test('D1: odsłonięcia i bieg discover BOTA przechodzą bramkę bez okna i bez stosu', () => {
  const evs = [
    { type: 'card_revealed', playerId: BOT_ID, cardId: 'highland-game' },
    { type: 'discover_started', playerId: BOT_ID, amount: 3 },
    { type: 'discover_resolved', playerId: BOT_ID, found: true },
  ];
  for (const e of evs) {
    assert.equal(gate(e), true, `${e.type} nie może znikać przy botActing:false / stackSize:0`);
    assert.equal(gate(e, { phase: 'upkeep', stackSize: 0 }), true,
      `${e.type} opóźnionego triggera (upkeep/cleanup) też jest treścią`);
  }
});

test('D2: ta sama reguła dla CZŁOWIEKA — asymetria „odsłonięcie" (brak w HUMAN_DIGEST) zamknięta', () => {
  assert.equal(gate({ type: 'card_revealed', playerId: HUMAN_ID, cardId: 'plains' }), true,
    'własne odsłonięcie było jedynym typem discovera niewpuszczanym przy stosie 0');
  for (const type of ['discover_started', 'discover_resolved']) {
    assert.equal(gate({ type, playerId: HUMAN_ID }), true, `${type} dla człowieka jak dotąd`);
  }
});

test('D3: rodzina przypięta zbiorowi — bez cichych edycji (nowy typ = jawna decyzja)', () => {
  assert.deepEqual([...PUBLIC_INFO_EVENTS], ['card_revealed', 'discover_started', 'discover_resolved']);
});

test('D4: szum NIE wchodzi tą samą furtką (mana, tap, pass — bez zmian)', () => {
  for (const e of [
    { type: 'mana_produced', playerId: BOT_ID },
    { type: 'object_tapped', objectId: 'o1' },
    { type: 'priority_passed', playerId: BOT_ID },
  ]) {
    assert.equal(gate(e), false, `${e.type} nadal nie jest treścią panelu poza botActing`);
  }
});

test('D5: ruchy bota między strefami ZAKRYTYMI zostają maskowane (brak nowej dziury)', () => {
  // `card_revealed` jest jawne (CR 701.20); `object_moved` reka/biblioteka
  // NIE — i nie może być wpuszczany tą samą furtką (M192/Z1).
  assert.equal(gate({ type: 'object_moved', from: 'library', to: 'hand', controllerId: BOT_ID }), false);
});

test('D6: modal bez czyszczenia bufora przy otwarciu — „doklejać" tylko gdy DOSZŁO', () => {
  const a = { type: 'permanent_entered_battlefield', text: 'X wchodzi na pole bitwy' };
  const b = { type: 'trigger_resolved', text: 'X — trigger się rozstrzyga' };
  // otwarcie modala: wszystko jest nowe
  assert.deepEqual(botMovesPaintedUpdate({ moves: [a, b], painted: 0 }), { visible: true, painted: 2 });
  // odświeżenie przy niezmienionym buforze: nie ma CO doklejać (koniec pętli
  // „modal otwarty, gracz klika w kółko tę samą treść")
  assert.deepEqual(botMovesPaintedUpdate({ moves: [a, b], painted: 2 }), { visible: false, painted: 2 });
  // skutek doszedł PO renderze (dawna dziura): bufor żyje i licznik widzi nową linię
  const c = { type: 'card_revealed', text: 'Nieprzyjaciel odsłania Y' };
  assert.deepEqual(botMovesPaintedUpdate({ moves: [a, b, c], painted: 2 }), { visible: true, painted: 3 });
});

test('D7: „Rozumiem" konsumuje POKAZANY prefiks, a nie cały bufor (niepokazane dożywają)', () => {
  const moves = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
  // sesja z jednym lądem w talii — wystarczy do sprawdzenia metody na buforze
  const consume = createSession({
    seed: 7, registry: createCardRegistry(),
    decks: new Map([[HUMAN_ID, ['basic-plains']], [BOT_ID, ['basic-mountain']]]),
  });
  assert.equal(typeof consume.consumeBotMoves, 'function', 'kontrakt `consumeBotMoves(n)` istnieje');
  consume.clearBotMoves();
  for (const m of moves) consume.botMoves.push(m);
  assert.equal(consume.consumeBotMoves(2), 1, 'zostaje jeden niepokazany wpis');
  assert.deepEqual(consume.botMoves, [{ text: 'c' }], 'kasowany jest DOKŁADNIE przeczytany prefiks');
  assert.equal(consume.consumeBotMoves(0), 1, '0 = bez zmian (modal otwarty bez kliknięcia nic nie zjada)');
  assert.equal(consume.consumeBotMoves(99), 0, 'ponad stan = pusty bufor, bez wyjątku');
  assert.equal(consume.consumeBotMoves(), 0);
});

test('D8: odporność licznika — pusty/świeży bufor, `painted` poza zakresem', () => {
  assert.deepEqual(botMovesPaintedUpdate({ moves: [], painted: 0 }), { visible: false, painted: 0 });
  assert.deepEqual(botMovesPaintedUpdate({ moves: [], painted: 5 }), { visible: false, painted: 0 },
    'bufor skasowany przez sesję (apply/turn_started) zeruje licznik, nie ujemuje');
  assert.deepEqual(botMovesPaintedUpdate({ moves: undefined, painted: 3 }), { visible: false, painted: 0 });
  assert.deepEqual(botMovesPaintedUpdate({ moves: ['x'], painted: -4 }), { visible: true, painted: 1 });
  assert.deepEqual(botMovesPaintedUpdate({}), { visible: false, painted: 0 });
});
