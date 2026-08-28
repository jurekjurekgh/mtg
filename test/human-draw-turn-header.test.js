// M252 (audyt Żywym Testerem, oś 2 „kompletność modala Rozgrywka"),
// partia innistrad-brg/wiedzmin seed 127 (profil explorer): nagłówki tur
// w strumieniu modala to było (unikalne w całej partii):
//
//   T2-N, T3-Ty, T4-N, T5-Ty, T7-Ty, T8-N, T9-Ty, T10-N,
//   T12-N, T13-Ty, T14-N, T16-N, T18-N, T19-Ty, T20-N
//
// — brak T6-N, T11-Ty, T15-Ty, T17-Ty (numery skaczą o 2 przy tym samym
// graczu). Przy T11 gracz zobaczył „Dobierasz: Snarling Wolf" dociśnięte do
// bloku tury bota (bez „Tura 11 — Ty"), choć komentarz przy kolekcji
// nagłówków mówi: „Nowa tura: nagłówek «Tura N — <gracz>». Zawsze (uwaga
// A)", a M100/E8 domaga się pary nagłówkowej każdej własnej tury.
//
// Root cause (session): bufor botMoves jest wyświetlany i czyszczony, gdy
// pauza „da się pokazać". Gdy nie pojawi się pauzowalne zdarzenie dokładnie
// NA granicy tury, a potem CRYSZBUŁ odpala w połowie następnej, nagłówki
// potrafią spaść razem z buforem albo wylądować w bloku, który gracz już
// odkleił. Efekt na stole: nagłówki giną bezalarmowo.
//
// Test patrzy na INWARJANT strumienia, nie na pojedynczy blok:
// w zlożeniu wszystkich bloków numery tur rosną co najwyżej o 1 (tymczasem
// gracz się zmienia). Gdy strumień skacze T10 → T12 przy „Nieprzyjaciel",
// nagłówek T11 (Ty) nie istnieje NIGDZIE — defekt klasy „ślad pauzy
// gubi kontekst" (L24). RED→GREEN względem naprawy kolekcji w session.js.

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

test('M252: nagłówek „Tura N — <gracz>" nigdy nie ginie w strumieniu modala (numery rosną co najwyżej o 1)', () => {
  for (const seed of [127, 42, 7, 11, 77, 5, 99, 163]) {
    const stream = collectBlocks(makeSession(seed)).flat();
    const headers = [];
    for (const line of stream) {
      const m = /^Tura (\d+) — (Ty|Nieprzyjaciel)$/.exec(line);
      if (m) headers.push({ n: Number(m[1]), who: m[2] });
    }
    let prev = null;
    for (const h of headers) {
      if (prev != null) {
        const jump = h.n - prev.n;
        assert.ok(
          jump <= 1,
          `seed ${seed}: strumień nagłówków skacze Tura ${prev.n} (${prev.who}) → Tura ${h.n} (${h.who}) — nagłówek tury ${prev.n + 1} zginął`,
        );
      }
      prev = h;
    }
    assert.ok(headers.length > 3, `seed ${seed}: harness ma obserwować kilka tur (jest ${headers.length})`);
  }
});
