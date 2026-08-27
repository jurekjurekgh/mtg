// M176 (uwaga właściciela 2026-08-22): sekcja „Przebieg tur (dla AI)” opisuje
// OBU graczy w 3. osobie — „Czarodziejka zagrywa X” (rodzaj żeński), nie
// „Zagrywasz X”. Główny log stołu zostaje w 2. osobie (M101/C).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, PLAYER_NAMES, TURN_NAMES, createSession, describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/innistrad-brg.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

function playSome(session, maxCommands = 300) {
  for (let i = 0; i < maxCommands && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    session.apply(cmd);
  }
}

const HELPERS = { nameOf: (id) => String(id), nameOfObject: (id) => String(id) };

test('describeGameEvent z drugaOsoba:false zostawia 3. osobę o człowieku', () => {
  const e = { type: 'land_played', playerId: HUMAN_ID, cardId: 'forest' };
  const druga = describeGameEvent(e, HELPERS, TURN_NAMES);
  const trzecia = describeGameEvent(e, HELPERS, TURN_NAMES, { drugaOsoba: false });
  assert.match(druga, /^Zagrywasz/, `domyślnie 2. osoba (bez zmian): ${druga}`);
  assert.match(trzecia, /^Czarodziejka zagrywa/, `opcja wyłącza odmianę: ${trzecia}`);
});

test('przebieg tur: zagrania Czarodziejki w 3. osobie, bez form „-sz” o graczu', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 5, registry, decks });
  playSome(session);
  const text = session.turnHistoryText(2);
  assert.ok(text.length > 0, 'historia tur niepusta');
  assert.match(text, /Czarodziejka \p{Ll}+/u, `linie o graczu zaczynają się od imienia: ${text.slice(0, 200)}`);
  // Żadna linia nie mówi do gracza w 2. osobie („Zagrywasz”, „Dobierasz”…).
  const lines = text.split('\n').filter((l) => l.startsWith('• '));
  const drugaOsoba = lines.filter((l) => /^• (Nie )?\p{Lu}?\p{Ll}*(asz|esz|isz|ysz)\b/u.test(l));
  assert.deepEqual(drugaOsoba, [], 'zero linii w 2. osobie w przebiegu tur');
});

test('główny log stołu ZOSTAJE w 2. osobie (M101/C bez regresji)', () => {
  const e = { type: 'land_played', playerId: HUMAN_ID, cardId: 'forest' };
  const opis = describeGameEvent(e, HELPERS, PLAYER_NAMES);
  assert.match(opis, /^Zagrywasz/, `główny log: ${opis}`);
});
