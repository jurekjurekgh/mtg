// Zgłoszenie właściciela 2026-11-08 (Roiling Regrowth, deck `decks/zendikar-rg.txt`):
//
//   „Użycie jej powoduje wyjęcie lądów z talii i uszczuplenie jej. Czyli library
//    draining. Bot nie powinien jej rzucać mając mniej niż 10 kart na ręku.
//    A właśnie to zrobił mając 2 karty w ręce. Dodatkowo bot nie powinien jej
//    rzucać jeśli w bibliotece nie ma przynajmniej 2 lądów, a przed chwilą to
//    zrobił mając 0 lądów w bibliotece - marnotrastwo many i poświęcanego lądu."
//
// Roiling Regrowth {2}{G}, instant: „Sacrifice a land. Search your library for
// up to two basic land cards, put them onto the battlefield tapped, then
// shuffle.” To TUTOR — karta opuszcza bibliotekę bezpowrotnie (CR 701.23),
// więc każde użycie przybliża deck-out (CR 121.4, 704.5b).
//
// Dwa niezależne zarzuty, dwa niezależne mechanizmy w `heuristic-bot.js`:
//   R/1–R/2  DRENAŻ — twarde weto `springbloomDrainVeto` przy < 10 kartach
//            (ten sam próg i ten sam kształt co `lootCastVeto`,
//            `SYMMETRIC_DRAIN_MIN_LIBRARY`).
//   R/3–R/5  BRAK CELU — kara w WYCENIE (`springbloomSacrificeSearchValue`):
//            bot nie zna zawartości własnej biblioteki (`playerView` oznacza ją
//            jako `hidden`), więc wnioskuje z kart JAWNYCH przez
//            `searchTargetsRemaining` i odpuszcza tylko przy 0 (nie może się
//            mylić).
//
// Klasa po TYPIE EFEKTU (`springbloom_sacrifice_search`), nie po nazwie karty
// (ADR 0002) — ta sama mechanika obsługuje Springbloom Druid.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { game, put, lands, decide, score, choices } from './helpers/pmssb58.js';
import { DEFAULT_HEURISTIC_WEIGHTS } from '../src/controllers/heuristic-weights.js';

/** Świat z Roiling Regrowth w ręce i podaną liczbą lądów w bibliotece. */
function scena({ bibliotekaLadow = 3, bibliotekaInnych = 20, reka = 2 } = {}) {
  const s = game({ lib: 0 });
  lands(s, 3, 'basic-forest');
  put(s, 'roiling', 'roiling-regrowth', 'p1', 'hand');
  // Karty „puste” trzymają licznik biblioteki na zadanym poziomie.
  for (let i = 0; i < bibliotekaInnych; i += 1) put(s, `lib-x-${i}`, 'highland-game', 'p1', 'library');
  for (let i = 0; i < bibliotekaLadow; i += 1) put(s, `lib-l-${i}`, 'basic-forest', 'p1', 'library');
  // Dodatkowe karty w ręce (właściciel: „mając 2 karty w ręce”).
  for (let i = 1; i < reka; i += 1) put(s, `reka-${i}`, 'highland-game', 'p1', 'hand');
  return s;
}

// Etykieta oferty niesie deskryptor celu: `cast_spell(roiling->...)`.
const ETYKIETA_RE = /^cast_spell\(roiling/i;
const ocena = (s, opts = {}) => score(s, ETYKIETA_RE, opts);

test('R/1: przy 9 kartach w bibliotece rzut jest WETOWANY (twarde weto drenażu)', () => {
  // Właściciel: „nie powinien jej rzucać mając mniej niż 10 kart”.
  const s = scena({ bibliotekaLadow: 3, bibliotekaInnych: 6 }); // 9 kart razem
  const { cmd, entry, scores } = decide(s);
  const klucz = [...scores.keys()].find((k) => ETYKIETA_RE.test(k));
  assert.ok(klucz, `oferta rzutu istnieje (harness): ${JSON.stringify([...scores])}`);
  const wynik = scores.get(klucz);
  assert.ok(wynik < 0, `weto: rzut ma zostać odrzucony, jest ${wynik}`);
  assert.notEqual(cmd.type, 'cast_spell', `bot nie rzuca: wybrał ${entry.chosen}`);
});

test('R/2: przy 10 kartach weto NIE działa (granica właściciela, nie „poniżej 11”)', () => {
  const s = scena({ bibliotekaLadow: 3, bibliotekaInnych: 7 }); // 10 kart razem
  const wynik = ocena(s);
  assert.ok(wynik > 0,
    `10 kart to jeszcze nie drenaż — rzut ma być opłacalny, jest ${wynik}`);
});

test('R/3: 0 lądów w bibliotece ⇒ wartość 0 (sama strata many i poświęcanego lądu)', () => {
  // Właściciel: „nie powinien jej rzucać jeśli w bibliotece nie ma przynajmniej
  // 2 lądów, a przed chwilą to zrobił mając 0 lądów w bibliotece”.
  const s = scena({ bibliotekaLadow: 0, bibliotekaInnych: 20 });
  const wynik = ocena(s, { ownDeck: [...Array(3).fill('basic-forest'), ...Array(20).fill('highland-game'), 'roiling-regrowth'] });
  // `finish()` mnoży przez wagę rodziny komend; zero przechodzi przez wagę bez
  // zmiany znaku — pinujemy ZNAK i brak wartości dodatniej, nie konkretną liczbę.
  assert.ok(wynik <= 0, `brak celu = brak wartości, jest ${wynik}`);
});

test('R/4: JEDEN ląd w bibliotece też jest wetowany — kryterium właściciela to „2 lądy"', () => {
  // Właściciel: „nie powinien jej rzucać jeśli w bibliotece nie ma przynajmniej
  // 2 lądów". Jeden ląd to nie „częściowy skutek" — karta obiecuje DWA, a płaci
  // pełną manę i poświęca ląd. Granica jest ostra: 2 przechodzi (R/c niżej),
  // 1 nie. Ten test jest tu po to, żeby nikt nie „zmiękczył" weta do 0.
  const talia = (ladow) => [...Array(3).fill('basic-forest'), ...Array(20).fill('highland-game'),
    ...Array(ladow).fill('basic-forest'), 'roiling-regrowth'];
  const jeden = scena({ bibliotekaLadow: 1, bibliotekaInnych: 20 });
  const w1 = ocena(jeden, { ownDeck: talia(1) });
  assert.ok(w1 < 0, `jeden ląd = weto (mniej niż 2), jest ${w1}`);
});

test('R/4b: DWA lądy w bibliotece przechodzą — weto nie jest nadgorliwe', () => {
  const talia = (ladow) => [...Array(3).fill('basic-forest'), ...Array(20).fill('highland-game'),
    ...Array(ladow).fill('basic-forest'), 'roiling-regrowth'];
  const dwa = scena({ bibliotekaLadow: 2, bibliotekaInnych: 20 });
  const w2 = ocena(dwa, { ownDeck: talia(2) });
  assert.ok(w2 > 0, `dwa cele = pełna wartość, jest ${w2}`);
});

test('R/5: anty-over-fix — bez wiedzy o talii bot nie zgaduje i zostawia dawne zachowanie', () => {
  // `searchTargetsRemaining` zwraca `null` przy nieznanej talii (test
  // jednostkowy bez `ownDeck`), a wtedy NIE wolno karać: inaczej bot
  // przestawałby grać kartą w każdej partii bez kontekstu talii.
  const bezTalii = scena({ bibliotekaLadow: 0, bibliotekaInnych: 20 });
  const zTalii = scena({ bibliotekaLadow: 0, bibliotekaInnych: 20 });
  const wBez = ocena(bezTalii);
  const wZ = ocena(zTalii, { ownDeck: [...Array(3).fill('basic-forest'), ...Array(20).fill('highland-game'), 'roiling-regrowth'] });
  assert.ok(wBez > wZ,
    `nieznana talia = brak kary (zachowanie sprzed zgłoszenia): ${wBez} vs ${wZ}`);
});

test('R/6: weto nie dotyka innych czarów — karta bez tej mechaniki ocenia się normalnie', () => {
  const s = game({ lib: 0 });
  lands(s, 3, 'basic-forest');
  put(s, 'inny', 'highland-game', 'p1', 'hand');
  for (let i = 0; i < 6; i += 1) put(s, `lib-x-${i}`, 'highland-game', 'p1', 'library');
  const { scores } = decide(s);
  const etykieta = [...scores.keys()].find((k) => k.includes('cast_permanent(inny'));
  assert.ok(etykieta, `oferta innego czaru: ${JSON.stringify([...scores])}`);
  assert.ok(scores.get(etykieta) > 0,
    `cienka biblioteka nie wetuje zwykłego czaru: ${scores.get(etykieta)}`);
});
