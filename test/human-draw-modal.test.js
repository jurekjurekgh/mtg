// M100/E8 — uwaga właściciela (2026-08-15): „Własne dobranie też powinno być
// jako komunikat w Rozgrywka, to lepszy UX."
//
// Do E8 dobranie w kroku dobierania było globalnym szumem (`isCardDrawnNoise`
// odfiltrowywało wszystkie źródła poza 'effect'). Gracz grający przez modale
// (tak gra właściciel na telefonie) nie dostawał żadnej informacji o własnym
// dobraniu — choć to własna karta (pełna legalność FoW) i dla niego
// najważniejszy moment tury.
//
// KOREKTA M261 (2026-08-31): nagłówek „Tura N — Ty" jest OSTATNIĄ linią
// bloku i zatrzymuje modal; „Dobierasz: X" wychodzi w KOLEJNYM bloku — po
// kliknięciu „Rozumiem". Para nagłówkowa M100/E8 („Tura N — Ty" + „Dobierasz")
// żyje więc w STRUMIENIU bloków, nie w jednym modalu: dobranie musi być
// POPRZEDZONE nagłówkiem własnej tury (nigdy nie wisieć po turze bota),
// a samo nie może ginąć.
//
// Dobranie BOTA w kroku dobierania NADAL zostaje szumem (FoW + gadatliwość).

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
    [BOT_ID, parseDeckText(fs.readFileSync('decks/dominaria-brg.txt', 'utf8'), registry).cardIds],
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
  }
  return blocks;
}

test('M100/E8: dobranie CZŁOWIEKA w kroku dobierania pokazuje się jako komunikat w Rozgrywka', () => {
  let checked = 0;
  for (const seed of [42, 7, 11, 77]) {
    const blocks = collectBlocks(makeSession(seed));
    // Śledzimy STRUMIEŃ: po nagłówku własnej tury (zamykającym blok) musi
    // przyjść blok z „Dobierasz: X" — dobranie nie ginie po M261.
    for (let i = 0; i < blocks.length; i += 1) {
      const drawIdx = blocks[i].findIndex((t) => /^Dobierasz: /.test(t));
      if (drawIdx < 0) continue;
      let prevHeaderIdx = -1;
      for (let j = i - 1; j >= 0; j -= 1) {
        if (blocks[j].some((t) => /^Tura \d+ — Ty$/.test(t))) { prevHeaderIdx = j; break; }
      }
      assert.ok(prevHeaderIdx >= 0,
        `seed ${seed}, blok #${i + 1}: „Dobierasz: X" bez poprzedzającego nagłówka „Tura N — Ty" ` +
        `(${blocks[i].join(' | ')}) — para nagłówkowa M100/E8 zginęła`);
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
  // Po M261 blok z nagłówkiem tury bota kończy się na nagłówku; blok NASTĘPNY
  // może zacząć od upkeep, ale pierwsza treść kroku dobierania (przed pierwszym
  // ruchem bota) nie może być „Nieprzyjaciel dobiera kartę".
  let botTurnDrawBlocks = 0;
  for (const seed of [42, 7, 11, 77]) {
    const blocks = collectBlocks(makeSession(seed));
    for (let i = 0; i + 1 < blocks.length; i += 1) {
      const hasBotHeader = blocks[i].some((t) => /^Tura \d+ — Nieprzyjaciel$/.test(t));
      if (!hasBotHeader) continue;
      const next = blocks[i + 1];
      const firstActionIdx = next.findIndex((t) => !/^Faza: /.test(t));
      if (firstActionIdx > 0 && /^Nieprzyjaciel dobiera kartę/.test(next[firstActionIdx])) {
        botTurnDrawBlocks += 1;
      }
    }
  }
  assert.equal(botTurnDrawBlocks, 0, 'dobranie bota w kroku dobierania nie ma być komunikatem modala');
});
