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
// Dwa niezależne zarzuty właściciela w `springbloomDrainVeto` (`heuristic-bot.js`):
//   R/1–R/2  DRENAŻ — twarde weto przy < 10 kartach w bibliotece
//            (ten sam próg i kształt co `lootCastVeto`, `SYMMETRIC_DRAIN_MIN_LIBRARY`).
//   R/3–R/5  BRAK CELU — twarde weto przy < 2 basic landach pozostałych wg
//            `searchTargetsRemaining` (bot nie zna zawartości ukrytej biblioteki,
//            więc wnioskuje wyłącznie ze stref jawnych i znanego `ownDeck`).
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

// ── Audyt PR #184 / F-4: odmowa w oknie *_cast i spójność resolve_springbloom ─

test('R/7 (Audyt PR #184 / F-4a): odmowa resolve_exile_cast (cast: false) na Roiling Regrowth NIE dostaje NEVER i nie remisuje z rzutem', () => {
  const s = game({ lib: 0 });
  lands(s, 4, 'basic-forest');
  put(s, 'roiling', 'roiling-regrowth', 'p1', 'exile');
  for (let i = 0; i < 6; i += 1) put(s, `lib-x-${i}`, 'highland-game', 'p1', 'library');
  s.pendingExileCast = { playerId: 'p1', objectId: 'roiling', cardId: 'roiling-regrowth' };

  const { cmd, scores } = decide(s);
  const skipScore = scores.get('resolve_exile_cast(skip)');
  const castKey = [...scores.keys()].find((k) => k.startsWith('resolve_exile_cast(') && k !== 'resolve_exile_cast(skip)');
  assert.ok(castKey, `oferta rzutu z wygnania istnieje: ${JSON.stringify([...scores])}`);
  assert.ok(scores.get(castKey) <= -900, `wariant rzutu przy 6 kartach w bibliotece jest wetowany: ${scores.get(castKey)}`);
  assert.ok(skipScore > -900, `odmowa (cast: false) NIE jest wetowana na NEVER: ${skipScore}`);
  assert.notEqual(skipScore, scores.get(castKey), 'odmowa i rzut nie mogą remisować na NEVER');
  assert.equal(cmd.cast, false, `bot wybiera odmowę: ${JSON.stringify(cmd)}`);
});

test('R/8 (Audyt PR #184 / F-4a): odmowa resolve_exile_cast (cast: false) na Duskmantle Seer również nie wpada w weto NEVER', () => {
  const s = game({ lib: 20 });
  lands(s, 4, 'basic-island');
  lands(s, 2, 'basic-swamp');
  s.players.find((p) => p.id === 'p1').life = 10;
  s.players.find((p) => p.id === 'p2').life = 20;
  put(s, 'seer', 'duskmantle-seer', 'p1', 'exile');
  s.pendingExileCast = { playerId: 'p1', objectId: 'seer', cardId: 'duskmantle-seer' };

  const { cmd, scores } = decide(s);
  const skipScore = scores.get('resolve_exile_cast(skip)');
  const castKey = [...scores.keys()].find((k) => k.startsWith('resolve_exile_cast(') && k !== 'resolve_exile_cast(skip)');
  assert.ok(castKey);
  assert.ok(scores.get(castKey) <= -900, `rzut Seera przy 10 vs 20 życia jest wetowany: ${scores.get(castKey)}`);
  assert.ok(skipScore > -900, `odmowa (cast: false) nie dostaje NEVER: ${skipScore}`);
  assert.equal(cmd.cast, false);
});

test('R/9 (Audyt PR #184 / F-4b): opcjonalne resolve_springbloom (Springbloom Druid po blinku/reanimacji) wybiera skip przy <10 kartach lub <2 basic landach', () => {
  // 1) Cienka biblioteka (6 kart)
  const sThin = game({ lib: 0 });
  lands(sThin, 2, 'basic-forest');
  put(sThin, 'druid', 'springbloom-druid', 'p1', 'battlefield');
  for (let i = 0; i < 6; i += 1) put(sThin, `lib-l-${i}`, 'basic-forest', 'p1', 'library');
  sThin.pendingSpringbloom = {
    controllerId: 'p1', sourceId: 'druid', cardId: 'springbloom-druid',
    landIds: ['land-0', 'land-1'], mandatory: false, restorePriorityTo: 'p1',
  };
  const dThin = decide(sThin);
  assert.equal(dThin.cmd.type, 'resolve_springbloom');
  assert.equal(dThin.cmd.skip, true, `przy 6 kartach w bibliotece Druid nie poświęca lądu: ${JSON.stringify(dThin.cmd)}`);

  // 2) Zdrowa biblioteka (20 kart), ale wg ownDeck w bibliotece został tylko 1 basic land (< 2)
  const sNoBasic = game({ lib: 0 });
  lands(sNoBasic, 3, 'basic-forest');
  put(sNoBasic, 'druid', 'springbloom-druid', 'p1', 'battlefield');
  put(sNoBasic, 'lib-l-0', 'basic-forest', 'p1', 'library');
  for (let i = 0; i < 19; i += 1) put(sNoBasic, `lib-x-${i}`, 'highland-game', 'p1', 'library');
  sNoBasic.pendingSpringbloom = {
    controllerId: 'p1', sourceId: 'druid', cardId: 'springbloom-druid',
    landIds: ['land-0', 'land-1'], mandatory: false, restorePriorityTo: 'p1',
  };
  const dNoBasic = decide(sNoBasic, {
    ownDeck: [...Array(4).fill('basic-forest'), ...Array(19).fill('highland-game'), 'springbloom-druid'],
  });
  assert.equal(dNoBasic.cmd.type, 'resolve_springbloom');
  assert.equal(dNoBasic.cmd.skip, true, `przy <2 basic landach w bibliotece Druid nie marnuje lądu: ${JSON.stringify(dNoBasic.cmd)}`);
});
