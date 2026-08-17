// M109 — opisy w logu/modalu dla zdarzeń transzy 2 batcha 33.
// Lekcja L24: efekt bez zdarzenia (i bez zrozumiałego opisu) nie istnieje dla
// gracza. Cztery nowe zdarzenia — reveal ręki, rezygnacja z wyboru karty,
// ochrona przed jakością i kopia z storma — muszą mieć polski opis, a nie
// surowy typ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?'),
  nameOfObject: () => '?',
  isPlayer: (id) => id === 'p1' || id === 'p2',
};

test('log: hand_revealed nazywa gracza i odsłonięte karty (Nightsnare)', () => {
  const text = describeGameEvent({
    type: 'hand_revealed', playerId: 'p2', cardIds: ['a', 'b'],
    cardNames: ['nightsnare', 'chill-of-the-grave'], sourceCardId: 'nightsnare',
  }, HELPERS, NAMES);
  assert.match(text, /^Nieprzyjaciel odsłania rękę \(Nightsnare\): Nightsnare, Chill of the Grave$/, text);
});

test('log: discard_choice_declined tłumaczy „If you don\'t" (dwa odrzucenia)', () => {
  const text = describeGameEvent({
    type: 'discard_choice_declined', playerId: 'p2', chooserId: 'p1', count: 2,
    sourceCardId: 'nightsnare',
  }, HELPERS, NAMES);
  // Warstwa opisu odmienia czasownik dla gracza („Ty nie wskazuje" →
  // „Nie wskazujesz") — sprawdzamy obie dopuszczalne formy.
  assert.match(text, /[Nn]ie wskazuj(esz|e) karty/, text);
  assert.match(text, /Nieprzyjaciel odrzuca 2 karty/, text);
});

test('log: protection_granted nazywa jakość ochrony (Spare from Evil)', () => {
  const text = describeGameEvent({
    type: 'protection_granted', playerId: 'p1', objectIds: ['x', 'y'],
    sourceCardId: 'spare-from-evil', protection: { notSubtype: 'Human', kind: 'creature' },
  }, HELPERS, NAMES);
  assert.match(text, /ochrona przed stworami innymi niż Human/, text);
  assert.match(text, /Spare from Evil/, text);
  assert.match(text, /2 stwory/, text); // odmiana liczebnika (P4)
});

test('log: spell_copied liczy kopie storma (Spreading Insurrection)', () => {
  const text = describeGameEvent({
    type: 'spell_copied', playerId: 'p1', cardId: 'spreading-insurrection',
    copyNumber: 2, totalCopies: 3,
  }, HELPERS, NAMES);
  assert.match(text, /^Storm \(Spreading Insurrection\): kopia 2 z 3 trafia na stos$/, text);
});

test('log: protection_granted odmienia liczebnik (1 stwór, nie „1 stwor")', () => {
  const one = describeGameEvent({
    type: 'protection_granted', playerId: 'p1', objectIds: ['x'],
    sourceCardId: 'spare-from-evil', protection: { notSubtype: 'Human', kind: 'creature' },
  }, HELPERS, NAMES);
  assert.match(one, /1 stwór/, one);
  const many = describeGameEvent({
    type: 'protection_granted', playerId: 'p1', objectIds: ['a', 'b', 'c', 'd', 'e'],
    sourceCardId: 'spare-from-evil', protection: { notSubtype: 'Human', kind: 'creature' },
  }, HELPERS, NAMES);
  assert.match(many, /5 stworów/, many);
});

test('log: żaden z nowych opisów nie zwraca surowego typu zdarzenia', () => {
  const events = [
    { type: 'hand_revealed', playerId: 'p2', cardIds: [], cardNames: [] },
    { type: 'discard_choice_declined', playerId: 'p2', chooserId: 'p1', count: 0 },
    { type: 'protection_granted', playerId: 'p1', objectIds: [], protection: {} },
    { type: 'spell_copied', playerId: 'p1', cardId: 'spreading-insurrection', copyNumber: 1, totalCopies: 1 },
  ];
  for (const e of events) {
    const text = describeGameEvent(e, HELPERS, NAMES);
    assert.ok(text && text !== e.type, `brak opisu dla ${e.type}: ${text}`);
  }
});
