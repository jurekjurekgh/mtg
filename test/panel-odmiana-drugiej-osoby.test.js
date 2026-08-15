// M101/C — zgłoszenie właściciela (2026-08-15): panel „Rozgrywka" pisze
// „Ty dobiera: Idyllic Grange" zamiast „Dobierasz: Idyllic Grange".
//
// To nie jest literówka w jednym miejscu. `describeGameEvent` buduje ~124
// komunikaty wzorcem `${whoN(playerId)} <czasownik-w-3-osobie>`, a dla gracza
// `whoN` zwraca „Ty" — stąd „Ty dobiera", „Ty wybiera", „Ty poświęca",
// „Ty przegrywa". Zdania o przeciwniku („Nieprzyjaciel dobiera") są poprawne,
// bo tam 3. osoba pasuje. Fix u root cause: jedna warstwa odmiany, która dla
// HUMAN_ID stawia czasownik w 2. osobie i opuszcza podmiot.
//
// Test broni własności całej klasy komunikatów, nie pojedynczego napisu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const helpers = {
  nameOf: (id) => (id == null ? 'karta' : String(id)),
  nameOfObject: (id) => (id == null ? 'obiekt' : String(id)),
  isPlayer: (id) => id === HUMAN_ID || id === BOT_ID,
};

test('M101/C: zgłoszony komunikat brzmi „Dobierasz: …", nie „Ty dobiera: …"', () => {
  const text = describeGameEvent(
    { type: 'card_drawn', playerId: HUMAN_ID, object: { cardId: 'Idyllic Grange' } },
    helpers,
  );
  assert.equal(text, 'Dobierasz: Idyllic Grange');
});

test('M101/C: tura przeciwnika zostaje w 3. osobie', () => {
  const text = describeGameEvent(
    { type: 'card_drawn', playerId: BOT_ID, object: { cardId: 'Idyllic Grange' } },
    helpers,
  );
  assert.equal(text, 'Nieprzyjaciel dobiera kartę');
});

/**
 * Skan całej partii: żaden komunikat pokazany graczowi nie może zawierać
 * podmiotu „Ty" sklejonego z czasownikiem w 3. osobie. Lista końcówek pokrywa
 * odmianę czasowników użytych w describeGameEvent (dobiera, wybiera, poświęca,
 * przegrywa, tworzy, mieli, płaci, …).
 */
const ZLA_ODMIANA = /(^|[^\p{L}])Ty (nie )?[\p{L}]+(a|e|i|y)($|[^\p{L}])/u;

function makeSession(seed, deckA, deckB) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${deckA}.txt`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${deckB}.txt`, 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: false });
}

test('M101/C: w całej partii żaden komunikat nie łączy „Ty" z czasownikiem w 3. osobie', () => {
  const zle = new Set();
  for (const [seed, a, b] of [[13, 'azorius', 'graveyard'], [7, 'azorius', 'graveyard'], [3, 'black', 'green'], [21, 'red', 'azorius']]) {
    const session = makeSession(seed, a, b);
    for (let i = 0; i < 400 && session.state.status === 'active'; i += 1) {
      const view = session.view();
      const meaningful = view.legalCommands.filter(
        (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
      );
      const cmd = meaningful[0]
        ?? view.legalCommands.find((c) => c.type === 'pass_priority')
        ?? view.legalCommands.find((c) => c.type !== 'concede');
      if (!cmd) break;
      if (!session.apply(cmd).ok) break;
    }
    for (const entry of session.log) {
      const text = entry.text ?? String(entry);
      if (ZLA_ODMIANA.test(text)) zle.add(text);
    }
  }
  assert.equal(
    zle.size,
    0,
    `Komunikaty z podmiotem „Ty" i czasownikiem w 3. osobie:\n${[...zle].slice(0, 30).map((t) => `  - ${t}`).join('\n')}`,
  );
});
