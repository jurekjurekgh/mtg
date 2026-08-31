// M261 — granica tury zamyka paczkę modala „Rozgrywka" (zgłoszenie
// właściciela 2026-08-31): dopisywanie zdarzeń do bufora modala ma się
// zatrzymywać na rozpoczęciu kolejnej TURY. Po informacji „Tura N — Ty /
// Nieprzyaciel" modal kończy dopisywać i czeka na „Rozumiem"; dopiero po
// kliknięciu otwiera się NOWY modal, który zaczyna się od nagłówka tury.
// Chodzi o NIEŁĄCZENIE w jednym modalu tur graczy — np. ogon tury bota
// (nieistotne zdarzenia końca tury) doklejony do „Tura N+1 — Ty" + dobrania.
//
// Test patrzy na INWARIANTY bloków modala (jak M252/human-draw-turn-header):
//  1. każdy blok zawiera CO NAJWYŻEJ JEDEN nagłówek „Tura N — <gracz>";
//  2. jeśli blok ma nagłówek, to jest jego PIERWSZĄ linią (nowa tura =
//     nowy modal, nie doklejka do starej paczki).
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

test('M261: nagłówek „Tura N — …" zawsze OTWIERA blok (nowa tura = nowy modal)', () => {
  for (const seed of [127, 42, 7, 11, 77, 5, 99, 163]) {
    const blocks = collectBlocks(makeSession(seed));
    for (let i = 0; i < blocks.length; i += 1) {
      const headerIdx = blocks[i].findIndex((line) => HEADER_RE.test(line));
      if (headerIdx === -1) continue;
      assert.equal(headerIdx, 0,
        `seed ${seed}, blok #${i + 1}: nagłówek tury jest linią #${headerIdx + 1}, a nie pierwszą — ` +
        `blok dokleja nową turę do starej paczki (linie: ${blocks[i].slice(0, 4).join(' | ')})`);
    }
  }
});

test('M261: para „nagłówek tury + dobranie" nie jest doklejana do ogona poprzedniej tury', () => {
  // Własna tura gracza: „Tura N — Ty" + „Ty dobiera: …" to OTWARCIE nowego
  // modala — przed nimi nie może wisieć ogon tury bota (np. jego nieistotne
  // zdarzenia końca tury). Szukamy bloków z dobieraniem i sprawdzamy, że
  // linie PRZED nagłówkiem tury to wyłącznie nagłówki faz (szum „Faza:").
  for (const seed of [127, 42, 7, 11]) {
    const blocks = collectBlocks(makeSession(seed));
    for (let i = 0; i < blocks.length; i += 1) {
      const lines = blocks[i];
      const headerIdx = lines.findIndex((line) => HEADER_RE.test(line));
      if (headerIdx === -1) continue;
      const header = HEADER_RE.exec(lines[headerIdx]);
      if (header[2] !== 'Ty') continue;
      // Interesuje nas blok z dobieraniem gracza (para nagłówkowa M100/E8).
      if (!lines.some((line, idx) => idx > headerIdx && /Dobierasz|dobiera/.test(line) && /Ty/.test(line))) continue;
      const before = lines.slice(0, headerIdx);
      assert.ok(before.every((line) => /^Faza:/.test(line)),
        `seed ${seed}, blok #${i + 1}: przed „${lines[headerIdx]}" są treściwe linie z INNEJ tury ` +
        `(${before.filter((l) => !/^Faza:/.test(l)).slice(0, 3).join(' | ')}) — ogon poprzedniej tury ` +
        'musi zamknąć poprzedni modal, nie otwierać wspólny');
    }
  }
});
