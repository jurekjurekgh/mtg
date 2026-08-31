// M261 — granica tury zamyka paczkę modala „Rozgrywka" (zgłoszenie
// właściciela 2026-08-31). KOREKTA właściciela z tego samego dnia: stop ma
// być ZARAZ PO nagłówku „Tura N — Ty / Nieprzyaciel" (nie przed granicą,
// jak w pierwotnej wersji M261, i nie zależnie od zawartości bufora — przy
// autopass bez komend stary mechanizm w ogóle nie zatrzymywał i cała tura
// bota leciała bez pauzy). Nagłówek jest NIEpomijalny i OBOWIĄZKOWY.
//
// Konsekwencja kontraktu: nagłówek tury jest OSTATNIĄ linią bloku modala
// (modal kończy się na „Tura N — …"), a zdarzenia, które silnik wygenerował
// w tym samym strumieniu za nagłówkiem (untapy, upkeep, triggery), wychodzą
// dopiero po kliknięciu „Rozumiem" — w NASTĘPNYM bloku. Blok graniczny może
// zawierać ogon starej tury PRZED nagłówkiem (np. „Nieprzyjaciel zatrzymuje
// rękę otwarcia" + „Tura 1 — Ty").
//
// Test patrzy na INWARIANTY bloków modala (jak M252/human-draw-turn-header):
//  1. każdy blok zawiera CO NAJWYŻEJ JEDEN nagłówek „Tura N — <gracz>";
//  2. nagłówek jest OSTATNIĄ linią bloku — pauza następuje ZARAZ PO nim
//     (stop-before-header i stop-w-środku-tury są wadliwe);
//  3. „Dobierasz: X" (para nagłówkowa M100/E8) NIE jest doklejane do bloku
//     z nagłówkiem — wychodzi w osobnym bloku po kliknięciu „Rozumiem".
// Harness „zbiera bloki" dokładnie jak gracz klikający „Rozumiem".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

function makeSession(seed) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/innistrad-brg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/wiedzmin.txt', 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

/** Zbiera bloki modala „Rozgrywka" jak gracz klikający „Rozumiem". */
function collectBlocks(session, { maxMoves = 300 } = {}) {
  const blocks = [];
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      blocks.push(session.botMoves.map((m) => m.text ?? ''));
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    if (!session.apply(cmd).ok) break;
  }
  return blocks;
}

const HEADER_RE = /^Tura (\d+) — (Ty|Nieprzyaciel)$/;

test('M261: jeden blok modala = jedna tura (co najwyżej jeden nagłówek „Tura N")', () => {
  for (const seed of [127, 42, 7, 11, 77, 5, 99, 163]) {
    const blocks = collectBlocks(makeSession(seed));
    assert.ok(blocks.length > 4, `seed ${seed}: harness ma zebrać kilka bloków (jest ${blocks.length})`);
    for (let i = 0; i < blocks.length; i += 1) {
      const headers = blocks[i].filter((line) => HEADER_RE.test(line));
      assert.ok(headers.length <= 1,
        `seed ${seed}, blok #${i + 1}: ${headers.length} nagłówków tur w JEDNYM modalu (${headers.join(' + ')}) — ` +
        'modal łączy tury dwóch graczy (zgłoszenie właściciela: granica tury ma zamykać paczkę)');
    }
  }
});

test('M261: nagłówek „Tura N — …" jest OSTATNIĄ linią bloku (STOP zaraz PO nagłówku)', () => {
  for (const seed of [127, 42, 7, 11, 77, 5, 99, 163]) {
    const blocks = collectBlocks(makeSession(seed));
    for (let i = 0; i < blocks.length; i += 1) {
      const headerIdx = blocks[i].findIndex((line) => HEADER_RE.test(line));
      if (headerIdx === -1) continue;
      assert.equal(headerIdx, blocks[i].length - 1,
        `seed ${seed}, blok #${i + 1}: po nagłówku „${blocks[i][headerIdx]}" są jeszcze linie ` +
        `(${blocks[i].slice(headerIdx + 1).join(' | ')}) — pauza ma być ZARAZ PO nagłówku, ` +
        'a zdarzenia zza niego (upkeep, triggery) wychodzą po „Rozumiem"');
    }
  }
});

test('M261: „Dobierasz: X" wychodzi w OSOBNYM bloku, nie doklejone do nagłówka tury', () => {
  // Własna tura gracza: „Tura N — Ty" zamyka modal (STOP), a „Dobierasz: X"
  // pojawia się w następnym bloku — po kliknięciu „Rozumiem". Doklejenie
  // dobrania do bloku nagłówkowego naruszałoby kontrakt „pauza zaraz po
  // nagłówku"; oddzielenie od nagłówka NIE może jednak gubić linii dobrania.
  for (const seed of [127, 42, 7, 11, 77, 5, 99, 163]) {
    const blocks = collectBlocks(makeSession(seed));
    let headerBlocks = 0;
    let drawBlocks = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      const lines = blocks[i];
      const headerIdx = lines.findIndex((line) => HEADER_RE.test(line));
      if (headerIdx !== -1) {
        headerBlocks += 1;
        assert.ok(headerIdx === lines.length - 1,
          `seed ${seed}, blok #${i + 1}: nagłówek nie zamyka bloku (${JSON.stringify(lines)})`);
      }
      const drawIdx = lines.findIndex((line, idx) => /^Dobierasz: /.test(line));
      if (drawIdx >= 0) {
        drawBlocks += 1;
        // Dobranie z kroku dobierania gracza: nigdy w bloku, który zamyka
        // nagłówek tury (STOP jest zaraz po nagłówku).
        assert.ok(headerIdx === -1,
          `seed ${seed}, blok #${i + 1}: „Dobierasz" doklejone do bloku z nagłówkiem ` +
          `(${JSON.stringify(lines)}) — ma wyjść po kliknięciu „Rozumiem"`);
      }
    }
    assert.ok(headerBlocks > 3, `seed ${seed}: harness ma obserwować kilka nagłówków (jest ${headerBlocks})`);
    assert.ok(drawBlocks > 0, `seed ${seed}: harness ma zobaczyć własne dobranie jako komunikat (jest ${drawBlocks})`);
  }
});
