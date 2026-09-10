import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Zgłoszenie właściciela A (2026-09-10): „Na początku tury przeciwnika nie
 * pojawiło się okno Rozgrywka z napisem: Tura X — Nieprzyjaciel i przyciskiem
 * Rozumiem. Wystawiłem górę. Nie mam nic co mógłbym rzucić albo wykorzystać,
 * więc moja tura przeleciała cała, ale gra nie zatrzymała się, żeby mnie
 * poinformować — tylko poleciała dalej; bot wystawił kreaturę i dopiero na
 * rozstrzygnięciu tego się zatrzymała.”
 *
 * Root cause (dwa splecione defekty, oba w src/table/session.js):
 *
 * 1. SZUM: advance() pauzował na passie BOTA, który jedynie rozstrzygał
 *    własny czar CZŁOWIEKA (np. Blazing Torch: „Zagrywasz… / wchodzi… /
 *    zostaje rozstrzygnięty” jako jedyna treść pauzy). To modal bez treści
 *    dla gracza (jego własny czar) i dokładnie ten „pusty postój” prowokuje
 *    niecierpliwe klikanie. streamAutoEvents oznaczał zdarzenia z
 *    BOT_PAUSE_EVENTS jako istotne BEZ wzglądu na kontrolera — a M205
 *    ustalił, że auto-pass nie pauzuje.
 *
 * 2. UTRATA NAGŁÓWKA: apply() na UDANEJ komendzie czyścił bufor modala
 *    i kasował awaitingBotAck nawet wtedy, gdy pauza była NIEpotwierdzona
 *    (na ekranach dotykowych komenda potrafi przyjść w trakcie pauzy —
 *    podwójne tapnięcie, przycisk z poprzedniego renderu). Nagłówek
 *    „Tura N — Nieprzyjaciel” czekał w buforze i ginął — kontrakt M261
 *    („nagłówek tury jest OBOWIĄZKOWY i NIEpomijalny”) był łamany.
 *
 * Naprawa: (1) w streamAutoEvents zdarzenie z BOT_PAUSE_EVENTS jest istotne
 * tylko, gdy NIE jest wyłącznie własnym zagraniem człowieka (kontroler ≠
 * HUMAN_ID); (2) apply() przy udanej komendzie w trakcie pauzy zachowuje
 * NIEpokazaną zawartość bufora (w tym nagłówek tury) zamiast ją kasować.
 */

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/innistrad-brg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/wiedzmin-wu.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

/** Rozgrywa otwarcie partii aż do głównej 1 tury 2 człowieka (seed 30001). */
function openingToTurn2Main() {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 30001, registry, decks, pauseOnBotMoves: true });
  const ack = () => { session.clearBotMoves(); session.continueBotPlay(); };
  session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice'));
  for (let i = 0; i < 8 && session.botPausePending; i += 1) ack();
  assert.equal(session.state.turn.number, 2, 'setup: tura 2 człowieka');
  return session;
}

test('A/1: rozstrzygnięcie WŁASNEGO czaru w auto-passie nie jest pauzą (szum)', () => {
  const session = openingToTurn2Main();
  session.apply(session.view().legalCommands.find((c) => c.type === 'play_land'));
  session.clearBotMoves();
  const torch = session.view().legalCommands.filter((c) => c.type === 'cast_permanent')[1];
  assert.ok(torch, 'setup: drugi czar do rzucenia (Blazing Torch)');
  session.apply(torch);
  // Po rzucie własnego torcha i jego rozstrzygnięciu (bot nie odpowiada) gra
  // ma DOJECHAĆ do granicy tury i pauzować RAZ — z nagłówkiem nowej tury,
  // zamiast stawiać beztreściowy postój na „własny czar wchodzi/rozstrzyga
  // się”, a dopiero za drugim kliknięciem pokazywać „Tura 3 — Nieprzyjaciel”.
  assert.equal(session.botPausePending, true, 'granica tury pauzuje');
  const texts = session.botMoves.map((m) => m.text ?? '');
  assert.ok(
    texts.some((t) => t.startsWith('Tura 3 — ')),
    `nagłówek tury 3 musi być w buforze pauzy (jest: ${JSON.stringify(texts)})`,
  );
});

/**
 * Dojedź do pauzy na granicy tury CZŁOWIEKA (bufor: raport walki bota
 * + „Tura N — Ty”; priorytet ma człowiek — to jedyna pauza graniczna, w
 * której komenda gracza może zostać PRZYJĘTA w trakcie pauzy).
 */
function playToOwnTurnBoundaryPause() {
  const session = openingToTurn2Main();
  const ack = () => { session.clearBotMoves(); session.continueBotPlay(); };
  for (let i = 0; i < 40; i += 1) {
    if (session.botPausePending) {
      const texts = session.botMoves.map((m) => m.text ?? '');
      const ownHeader = texts.find((t) => /^Tura \d+ — Ty$/.test(t));
      if (ownHeader && texts.some((t) => t.startsWith('Atak:'))) return session;
      ack();
      continue;
    }
    const view = session.view();
    if (view.turn.priorityPlayerId !== HUMAN_ID) { ack(); continue; }
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    assert.ok(cmd, 'setup: brak komendy w oknie człowieka');
    session.apply(cmd);
  }
  assert.fail('setup: nie osiągnięto pauzy granicznej własnej tury z raportem walki');
}

test('A/2: udana komenda w trakcie pauzy NIE gubi niepokazanej zawartości bufora', () => {
  const session = playToOwnTurnBoundaryPause();
  assert.ok(session.botPauseAtTurnBoundary, 'setup: pauza z nagłówkiem granicy tury');
  const before = session.botMoves.map((m) => m.text ?? '');
  const header = before.find((t) => /^Tura \d+ — Ty$/.test(t));
  const combat = before.find((t) => t.startsWith('Atak:'));
  assert.ok(header && combat, `setup: nagłówek i walka w buforze (${JSON.stringify(before)})`);

  // Na ekranie dotykowym komenda gracza potrafi trafić w sesję W TRAKCIE tej
  // pauzy (podwójne tapnięcie). Priorytet należy do człowieka (start własnej
  // tury), więc engine komendę PRZYJMIE — a wtedy niepokazana zawartość
  // bufora (raport walki + nagłówek „Tura N — Ty”) NIE MOŻE zginąć:
  // kontrakt M261 — nagłówek tury jest obowiązkowy i niepomijalny.
  const view = session.view();
  const cmd = view.legalCommands.find((c) => c.type === 'pass_priority');
  assert.ok(cmd, 'setup: legalna komenda w trakcie pauzy');
  const result = session.apply(cmd);
  assert.equal(result.ok, true, 'setup: komenda przyjęta');

  const texts = session.botMoves.map((m) => m.text ?? '');
  assert.ok(
    texts.includes(header),
    `nagłówek granicy tury zginął po udanej komendzie w trakcie pauzy: ${JSON.stringify(texts)}`,
  );
  assert.ok(
    texts.includes(combat),
    `raport walki przepadł po udanej komendzie w trakcie pauzy: ${JSON.stringify(texts)}`,
  );
});

test('A/3: odrzucona komenda w trakcie pauzy wciąż nie gubi pauzy (M90/B stoi)', () => {
  const session = openingToTurn2Main();
  session.apply(session.view().legalCommands.find((c) => c.type === 'play_land'));
  session.clearBotMoves();
  const torch = session.view().legalCommands.filter((c) => c.type === 'cast_permanent')[1];
  session.apply(torch);
  // Po fixie A/1 rzut własnego czaru dojeżdża od razu do granicy tury —
  // pauza z nagłówkiem „Tura 3 — Nieprzyjaciel” (priorytet ma bot).
  assert.ok(session.botPauseAtTurnBoundary, 'setup: pauza granicy tury');
  const movesBefore = session.botMoves.length;
  // Priorytet po granicy w turę bota ma bot — komenda człowieka odrzucona.
  const rejected = session.apply({ type: 'pass_priority', playerId: HUMAN_ID });
  assert.equal(rejected.ok, false, 'komenda w priorytecie bota odrzucona');
  assert.ok(session.botPausePending, 'pauza przetrwała odrzucenie');
  assert.equal(session.botMoves.length, movesBefore, 'bufor przetrwał odrzucenie');
});
