// M150/C2 — log aktywacji zdolności dodającej manę podaje też KOLORY many
// (Jeskai Devotee „{1}: Add {U}, {R}, or {W}\" → „… — dodanie many do puli
// ({U}, {R}, {W})\" zamiast milczeć o kolorze). Uwaga właściciela 2026-08-19.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

const NAMES = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' };
const helpers = { nameOf: (cardId) => cardId, nameOfObject: () => '?', isPlayer: (id) => NAMES[id] != null };

test('C2: log aktywacji add_mana pokazuje kolory many (Jeskai Devotee)', () => {
  const e = {
    type: 'ability_activated', playerId: 'p1', cardId: 'jeskai-devotee',
    effectTypes: ['add_mana'], manaColors: ['U', 'R', 'W'],
  };
  const text = describeGameEvent(e, helpers, NAMES);
  assert.match(text, /dodanie many do puli/);
  assert.match(text, /\{U\}/);
  assert.match(text, /\{R\}/);
  assert.match(text, /\{W\}/);
  // helper testowy zwraca surowe cardId (małymi literami) — w sesji nameOf
  // poda „Jeskai Devotee\"; tu wystarczy, że nazwa źródła się pojawia.
  assert.match(text, /jeskai-devotee/);
});

test('C2: aktywacja bez kolorów many nie dodaje szumu do logu', () => {
  const e = {
    type: 'ability_activated', playerId: 'p1', cardId: 'seers-lantern',
    effectTypes: ['add_mana'], manaColors: [],
  };
  const text = describeGameEvent(e, helpers, NAMES);
  assert.match(text, /dodanie many do puli/);
  assert.doesNotMatch(text, /\{U\}|\{R\}|\{W\}|\{B\}|\{G\}/);
});
