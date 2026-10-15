// Pętla jakości 2026-10-15c — Żywy Tester, partia 67008 (tarkir-wur × worek-mroczny,
// seed 67008) i partia 67004 (worek-legend × worek-mroczny).
//
// Objaw (transkrypt tools/table-tester/.arena/tester/g-67008-*.txt, linia ~344):
//   [ROZGRYWKA] • Nieprzyjaciel — Manifest Dread: wybór, którą z 2 kart z wierzchu zmanifestować
//   [ROZGRYWKA] • Nieprzyjaciel: Cancel — biblioteka → pole bitwy
//   [ROZGRYWKA] • Nieprzyjaciel manifestuje kartę (2/2 twarzą w dół), drugą do grobu
// Gracz zobaczył NAZWĘ zmanifestowanej karty, choć leży zakryta (CR 701.40a, 708.2):
// to przeciek ukrytej informacji w modalu „Rozgrywka\" (ta sama klasa co M192/Z1).
//
// Root cause: M192/Z1 ukrywa nazwę tylko przy ruchu MIĘDZY strefami ukrytymi
// (ręka/biblioteka). Manifest i morph z ręki wchodzą na POLE BITWY (strefa jawna),
// więc bramka nie działała — a karta jest zakryta (`object.faceDown`). Klasa L41:
// reguła „czy nazwać kartę w ruchu\" mieszkała w jednej gałęzi jako warunek inline.
// Naprawa: jedna czysta funkcja `czyNazwacKarteRuchu`, testowana bezpośrednio.

import test from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_ID, czyNazwacKarteRuchu } from '../src/table/session.js';

// Stan minimalny: tylko mapa obiektów (czytana, gdy zdarzenie nie niesie `object`).
const emptyState = { objects: new Map() };
const BOT = 'bot';

test('manifest przeciwnika: zakryta karta wchodząca z biblioteki na pole bitwy NIE jest nazwana', () => {
  const e = {
    type: 'object_moved', fromZone: 'library', toZone: 'battlefield', manifested: true,
    object: { cardId: 'cancel', controllerId: BOT, faceDown: true, faceDownCause: 'manifest' },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), false,
    'Cancel zmanifestowany zakryty — nazwa nie może trafić do logu gracza');
});

test('morph przeciwnika zagrany zakryty z ręki na pole bitwy: bez nazwy', () => {
  const e = {
    type: 'object_moved', fromZone: 'hand', toZone: 'battlefield',
    object: { cardId: 'battlefield-butcher', controllerId: BOT, faceDown: true, faceDownCause: 'morph' },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), false);
});

test('zakryta karta przeciwnika wygnana zakryta: bez nazwy (CR 406.3)', () => {
  const e = {
    type: 'object_moved', fromZone: 'battlefield', toZone: 'exile',
    object: { cardId: 'some-card', controllerId: BOT, faceDown: true },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), false);
});

test('anty-over-fix: zakryty permanent przeciwnika, który ODSŁONIŁ się (revealed) — nazwany', () => {
  const e = {
    type: 'object_moved', fromZone: 'library', toZone: 'battlefield', revealed: true,
    object: { cardId: 'cancel', controllerId: BOT, faceDown: true },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), true,
    'odsłonięta karta jest jawna — gracz ma wiedzieć, co to było');
});

test('anty-over-fix: zakryta karta przeciwnika umierająca na cmentarz — nazwana (strefa jawna, karta odsłonięta przy śmierci)', () => {
  const e = {
    type: 'object_moved', fromZone: 'battlefield', toZone: 'graveyard',
    object: { cardId: 'fear-of-burning-alive', controllerId: BOT, faceDown: true },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), true,
    'grób jest publiczny — nazwa musi zostać');
});

test('anty-over-fix: jawna karta przeciwnika przeszukana z biblioteki na pole bitwy — nazwana', () => {
  // Np. „znajdź Swamp i zagraj na pole bitwy\" — karta odkryta w wyszukiwaniu.
  const e = {
    type: 'object_moved', fromZone: 'library', toZone: 'battlefield',
    object: { cardId: 'swamp', controllerId: BOT, faceDown: false },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), true);
});

test('anty-over-fix: własna zakryta karta gracza (manifest własny) — nazwana', () => {
  const e = {
    type: 'object_moved', fromZone: 'library', toZone: 'battlefield',
    object: { cardId: 'cancel', controllerId: HUMAN_ID, faceDown: true, faceDownCause: 'manifest' },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), true,
    'własne karty gracza są jego wiedzą (CR 400.2) — anonimizacja dotyczy przeciwnika');
});

test('M192/Z1 zachowane: przeciwnik biblioteka → ręka (strefy ukryte) — bez nazwy', () => {
  const e = {
    type: 'object_moved', fromZone: 'library', toZone: 'hand',
    object: { cardId: 'krumar-initiate', controllerId: BOT, faceDown: false },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), false);
});

test('M192/Z1 zachowane: przeciwnik na cmentarz (strefa jawna, jawna karta) — nazwana', () => {
  const e = {
    type: 'object_moved', fromZone: 'library', toZone: 'graveyard',
    object: { cardId: 'mountain', controllerId: BOT, faceDown: false },
  };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), true);
});

test('brak kontrolera (nieznany obiekt): nazwa zostaje — jak dotąd', () => {
  const e = { type: 'object_moved', fromZone: 'library', toZone: 'battlefield', object: { cardId: 'x' } };
  assert.equal(czyNazwacKarteRuchu(e, emptyState, HUMAN_ID), true);
});
