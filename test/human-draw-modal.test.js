// M100/E8 — uwaga właściciela (2026-08-15): „Własne dobranie też powinno być
// jako komunikat w Rozgrywka, to lepszy UX."
//
// Do E8 dobranie w kroku dobierania było globalnym szumem (`isCardDrawnNoise`
// odfiltrowywało wszystkie źródła poza 'effect'). Gracz grający przez modale
// (tak gra właściciel na telefonie) nie dostawał żadnej informacji o własnym
// dobraniu — choć to własna karta (pełna legalność FoW) i dla niego
// najważniejszy moment tury. Decyzja M98 („początek tury = treść") tu
// wzmacniona: „Tura N — Ty" + „Ty dobiera: X" to para nagłówkowa każdej
// własnej tury. Dobranie BOTA w kroku dobierania zostaje szumem.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

function makeSession(seed) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/azorius.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/black.txt', 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

/** Zbiera bloki modala „Rozgrywka" jak gracz klikający „Rozumiem". */
function collectBlocks(session, { maxMoves = 260 } = {}) {
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
    if (session.botPausePending) continue; // blok zostanie zebrany na górze pętli
  }
  return blocks;
}

test('M100/E8: dobranie CZŁOWIEKA w kroku dobierania pokazuje się jako komunikat w Rozgrywka', () => {
  let checked = 0;
  for (const seed of [42, 7, 11, 77]) {
    const blocks = collectBlocks(makeSession(seed));
    for (const block of blocks) {
      const turnIdx = block.findIndex((t) => /^Tura \d+ — Ty$/.test(t));
      if (turnIdx < 0) continue; // blok bez startu mojej tury
      const drawIdx = block.findIndex((t) => /^Ty dobiera: /.test(t));
      if (drawIdx < 0) continue; // czerwone przed E8: żadnej linii dobrania
      // „Dobranie tury", nie skutek czaru: przed linią dobrania nie było
      // własnego rzutu/zagrania w tym bloku.
      const ownPlayIdx = block.findIndex((t) => /^Ty (rzuca|zagrywa|aktywuje) /.test(t));
      if (ownPlayIdx >= 0 && ownPlayIdx < drawIdx) continue;
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'w żadnym bloku modala nie pojawiło się dobranie z kroku dobierania człowieka');
});

test('M100/E8: dobranie BOTA w kroku dobierania NADAL szumem (FoW + gadatliwość)', () => {
  // Strażnik przeciw przesadzie: nie każde card_drawn może wchodzić do panelu —
  // dobranie przeciwnika w jego kroku dobierania nie jest informacją dla
  // gracza. (Dobrania bota z efektów były pokazywane od dawna bez nazwy
  // — tu pilnujemy tylko kroku dobierania.)
  let botTurnDrawBlocks = 0;
  for (const seed of [42, 7, 11, 77]) {
    const blocks = collectBlocks(makeSession(seed));
    for (const block of blocks) {
      const turnIdx = block.findIndex((t) => /^Tura \d+ — Nieprzyjaciel$/.test(t));
      if (turnIdx < 0) continue;
      // Za nagłówkiem tury bota nie ma linii „Nieprzyjaciel dobiera kartę"
      // jako pierwszej treści kroku dobierania (przed jego pierwszym ruchem).
      const firstActionIdx = block.findIndex((t, i) => i > turnIdx && !/^Faza: /.test(t));
      if (firstActionIdx > 0 && /^Nieprzyjaciel dobiera kartę/.test(block[firstActionIdx])) {
        botTurnDrawBlocks += 1;
      }
    }
  }
  assert.equal(botTurnDrawBlocks, 0, 'dobranie bota w kroku dobierania nie ma być komunikatem modala');
});
