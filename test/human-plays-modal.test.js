// M100/E5 — panel „Rozgrywka" jako wspólne streszczenie rozgrywki:
// istotne zagrania CZŁOWIEKA (rzut, zagranie lądu, aktywacja zdolności,
// token/wejście permanentu) dostają wpis tak samo jak zagrania bota,
// a raport z walki obejmuje także ataki gracza.
//
// Luka przed M100: `apply()` opisywał ruch człowieka wyłącznie do LOGU
// (a po E2 — rejestrował na stosie i wpuszczał rozstrzygnięcia). Sama
// nagłówkowa akcja („Zagrywasz Forest") nie trafiała do bufora modala,
// więc po powrocie do telefonu gracz widział tylko odpowiedź bota bez
// własnego ruchu jako kontekstu.

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

test('M100/E5: istotne zagranie CZŁOWIEKA (rzut/ląd) dostaje wpis w buforze „Rozgrywka"', () => {
  // Seed 42 → 1 po transzy 2 batcha 33 (azorius +2 karty) — przelosowane
  // hunterem: przy nowej kolejności talii seed 42 nie dawał okazji zagrania.
  const session = makeSession(1);
  let checked = 0;
  for (let i = 0; i < 250 && session.state.status === 'active' && checked === 0; i += 1) {
    if (session.botPausePending) { session.clearBotMoves(); session.continueBotPlay(); continue; }
    const view = session.view();
    const play = view.legalCommands.find((c) => ['cast_spell', 'cast_permanent', 'play_land'].includes(c.type));
    if (!play) {
      const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type))
        ?? view.legalCommands.find((c) => c.type === 'pass_priority');
      if (!cmd || !session.apply(cmd).ok) break;
      continue;
    }
    const r = session.apply(play);
    assert.ok(r.ok, `zagranie odrzucone: ${r.reason}`);
    const texts = session.botMoves.map((m) => m.text ?? '');
    checked += 1;
    assert.ok(
      texts.some((t) => /^(Zagrywasz|Rzucasz) /.test(t)),
      `po własnym zagraniu bufor modala powinien zawierać jego wpis, jest: ${JSON.stringify(texts)}`,
    );
  }
  assert.ok(checked > 0, 'nie znaleziono żadnej okazji zagrania — test nic nie sprawdził');
});

test('M100/E5: raport z walki obejmuje atak CZŁOWIEKA (nie tylko ataki bota)', () => {
  let checked = 0;
  for (const seed of [42, 7, 11, 77, 123, 202, 5, 9]) {
    const session = makeSession(seed);
    for (let i = 0; i < 300 && session.state.status === 'active' && checked === 0; i += 1) {
      if (session.botPausePending) { session.clearBotMoves(); session.continueBotPlay(); continue; }
      const view = session.view();
      const attack = view.legalCommands.find((c) => c.type === 'declare_attackers' && (c.attackerIds?.length ?? 0) > 0);
      if (attack) {
        const r = session.apply(attack);
        assert.ok(r.ok, `deklaracja ataku odrzucona: ${r.reason}`);
        const texts = session.botMoves.map((m) => m.text ?? '');
        checked += 1;
        assert.ok(
          texts.some((t) => /^Atak: /.test(t)),
          `atak człowieka bez wpisu w raporcie z walki: ${JSON.stringify(texts)}`,
        );
        continue;
      }
      const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type))
        ?? view.legalCommands.find((c) => c.type === 'pass_priority');
      if (!cmd || !session.apply(cmd).ok) break;
    }
    if (checked > 0) break;
  }
  assert.ok(checked > 0, 'w żadnym seedzie człowiek nie zadeklarował ataku — test nic nie sprawdził');
});
