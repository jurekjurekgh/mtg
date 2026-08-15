// M99 — znalezisko Żywego Testera (weryfikacja mutacyjna detektorów,
// `black vs spellslinger --policy-seed 32 --seed 732`):
//
//   LOG: Ty wskazuje ? z ręki przeciwnika
//
// Detektor `detectRawText` (kategoria `ui`, placeholder) zgłosił znak zapytania
// w tekście widocznym dla gracza — i miał rację.
//
// Dreams of Steel and Oil (BRO) każe wybrać kartę z RĘKI, a potem z GROBU
// przeciwnika. Gdy w ręce nie ma żadnego kandydata (artefakt/stwór), wybór
// jest pomijany i engine wysyła `reveal_exile_hand_chosen` z `cardId: null`
// — to poprawne zachowanie silnika (CR 608.2: część efektu, której nie da się
// wykonać, jest pomijana).
//
// Root cause jest w warstwie opisu: `describeGameEvent` dla wariantu GROBU
// obsługuje `cardId == null` („nie wskazuje karty z grobu\"), ale dla wariantu
// RĘKI wołało bezwarunkowo `nameOf(null)`, które zwraca fallback „?\".
// Gracz dostawał komunikat, z którego nie wynikało NIC.
//
// Fix u root cause: symetryczna obsługa `cardId == null` w obu wariantach.
// Nie maskujemy tego w detektorze — placeholder „?\" ma pozostać sygnałem błędu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (cardId) => (cardId ? `Karta-${cardId}` : cardId),
  nameOfObject: (id) => `Obiekt-${id}`,
  isPlayer: (id) => id === 'p1' || id === 'p2',
};

const describe = (e) => describeGameEvent(e, HELPERS, NAMES);

test('M99: brak kandydata w ręce nie daje „wskazuje ? z ręki przeciwnika"', () => {
  const line = describe({
    type: 'reveal_exile_hand_chosen', playerId: 'p1', opponentId: 'p2', cardId: null,
  });
  assert.ok(line, 'zdarzenie musi mieć opis');
  assert.ok(!line.includes('?'), `placeholder w tekście dla gracza: ${line}`);
  assert.match(line, /nie wskazuje/i, `opis powinien mówić, że wyboru nie było: ${line}`);
});

test('M99: wariant grobu (już poprawny) zachowuje się tak samo — symetria', () => {
  const line = describe({
    type: 'reveal_exile_grave_chosen', playerId: 'p1', opponentId: 'p2', cardId: null,
  });
  assert.ok(!line.includes('?'), `placeholder w tekście dla gracza: ${line}`);
  assert.match(line, /nie wskazuje/i);
});

test('M99: gdy karta JEST wybrana, log niesie jej nazwę (bez regresji)', () => {
  const hand = describe({
    type: 'reveal_exile_hand_chosen', playerId: 'p1', opponentId: 'p2', cardId: 'marut',
  });
  assert.match(hand, /Karta-marut/);
  assert.match(hand, /z ręki przeciwnika/);
  const grave = describe({
    type: 'reveal_exile_grave_chosen', playerId: 'p1', opponentId: 'p2', cardId: 'index',
  });
  assert.match(grave, /Karta-index/);
  assert.match(grave, /z grobu przeciwnika/);
});
