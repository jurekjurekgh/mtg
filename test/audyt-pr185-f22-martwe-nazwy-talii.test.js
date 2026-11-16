// Audyt PR #185 — F-22 (ŚREDNI, narzędzia/klasa L21): migracja talii Dominaria
// zostawiła MARTWE nazwy w kodzie — audyt remisów bota nie uruchamia się.
//
// Pomiar (E3, `node tools/bot-tie-audit.mjs` na stanie 48d0636):
//   Error: ENOENT: no such file or directory, open '…/decks/dominaria-wu.txt'
//       at deckOf (tools/bot-tie-audit.mjs:61)  ← AUDIT_PAIRS, pozycja 9
// PR #185 (`5df0e96`) usunął `decks/dominaria-brg.txt` i `decks/dominaria-wu.txt`
// (pomiar `git ls-tree 0d0a12b decks/` vs HEAD) i dodał `dominaria-ub.txt` oraz
// `dominaria-wrg.txt`. Migracja objęła JEDNO z dwóch odwołań w `AUDIT_PAIRS`
// (`dominaria-brg` → `dominaria-wrg`) i listę par w teście bramkowym
// (`test/audyt-bot-walka-remisy.test.js` ma już `dominaria-ub`), a pominęła
// drugie — więc domyślny audyt (CLI i każdy, kto woła `audytRemisow()` bez
// argumentów) pada zamiast mierzyć. Testy bramkowe pozostały zielone, bo
// podają własną listę par: awaria dotyczyła wyłącznie pomiaru z narzędzia.
//
// Ta sama migracja zostawiła drugi ślad klasy L21 (cichy no-op): listy
// `deckFiles` w `test/real-cards-batch25.test.js` i `-batch26` wciąż wymieniają
// `dominaria-brg`, a pętla ma `if (!fs.existsSync(path)) continue;` — talia
// zniknęła z pomiaru BEZ śladu (test dalej zielony, pokrycie o jedną talię
// mniejsze).
//
// Zasady: L21 (cichy no-op to defekt), L24 (skutek bez śladu nie istnieje),
// ADR 0024 §3 (rotacja próbki wymaga pomiaru — tu: wymaga też migracji
// odwołań), L192 („pre-existing" tylko z pomiarem bazy).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AUDIT_PAIRS } from '../tools/bot-tie-audit.mjs';
import { BENCH_DECKS } from '../tools/benchmark.mjs';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const registry = createCardRegistry();
const plik = (nazwa) => `decks/${nazwa}.txt`;

test('F-22/1: każda talia z AUDIT_PAIRS istnieje i parsuje się — narzędzie nie może padać ENOENT', () => {
  const nazwy = [...new Set(AUDIT_PAIRS.flat())];
  assert.equal(AUDIT_PAIRS.length, 12, `liczba par audytu (pomiar PRZED: 12): ${AUDIT_PAIRS.length}`);
  const martwe = nazwy.filter((n) => !fs.existsSync(plik(n)));
  assert.deepEqual(martwe, [],
    `martwe nazwy talii w tools/bot-tie-audit.mjs — audyt remisów nie uruchomi się (ENOENT): ${martwe.join(', ')}`);
  for (const n of nazwy) {
    const { cardIds } = parseDeckText(fs.readFileSync(plik(n), 'utf8'), registry);
    assert.ok(cardIds.length > 0, `${n}: talia bez kart — audyt mierzyłby puste partie`);
  }
});

test('F-22/2: domyślne pary audytu znają talie, którymi gra test bramkowy (jedna migracja, nie dwie prawdy)', () => {
  // `test/audyt-bot-walka-remisy.test.js` (slow) woła `audytRemisow({ pary: […] })`
  // jawną listą — po migracji Dominarii miał `dominaria-ub`, podczas gdy
  // `AUDIT_PAIRS` zostało przy usuniętym `dominaria-wu`. Strażnik: przeglądane
  // pary testu bramkowego są PODZBIOREM domyślnych, więc przeglądając wynik
  // narzędzia przeglądamy też to, co bramkuje test (a nie odwrotnie).
  const jawneWBramce = [
    'ravnica-wur', 'innistrad-wu', 'dominaria-wrg', 'mirrodin-wu', 'tarkir-bg',
    'warhammer-ubr', 'wiedzmin-bg', 'srodziemie', 'theros', 'kaladesh',
    'zendikar-wu', 'dominaria-ub', 'worek-mroczny',
  ];
  const domyslne = new Set(AUDIT_PAIRS.flat());
  const poza = jawneWBramce.filter((n) => !domyslne.has(n));
  assert.deepEqual(poza, [],
    `test bramkowy gra taliami spoza domyślnego audytu (rozjazd po migracji): ${poza.join(', ')}`);
});

test('F-22/3: nakładanie audytu na próbkę benchmarkową jest ZMIERZONE i nie rośnie po cichu', () => {
  // Docstring narzędzia chce par „SPOZA próbki benchmarkowej". Pomiar bazy
  // `0d0a12b` (L192): `AUDIT_PAIRS` zawierało wtedy dominaria-brg, dominaria-wu
  // i forgotten-realms-br, a `selectBenchDecks()` wybierał 6 pierwszych talii
  // jednoplanowych alfabetycznie — czyli te same trzy. Nakładanie jest więc
  // PRE-ISTNIEJĄCE (3 talie), a PR #185 go nie powiększył (zmieniły się tylko
  // nazwy Dominarii). Pin pilnuje, by nie urosło bez świadomej decyzji.
  const bench = new Set(BENCH_DECKS);
  const nakladanie = [...new Set(AUDIT_PAIRS.flat())].filter((n) => bench.has(n)).sort();
  assert.deepEqual(nakladanie, ['dominaria-ub', 'dominaria-wrg', 'forgotten-realms-br'],
    `nakładanie AUDIT_PAIRS na BENCH_DECKS (${BENCH_DECKS.join(', ')}) — pre-existing 3, jest ${nakladanie.length}`);
});

test('F-22/4: listy `deckFiles` w testach batchy nie mają martwych nazw ani cichego pominięcia (L21)', () => {
  const pliki = ['test/real-cards-batch25.test.js', 'test/real-cards-batch26.test.js'];
  for (const p of pliki) {
    const zrodlo = fs.readFileSync(p, 'utf8');
    const lista = zrodlo.match(/const deckFiles = \[([^\]]*)\]/);
    assert.ok(lista, `${p}: nie znaleziono listy deckFiles — wzorzec strażnika się zestarzał`);
    const nazwy = [...lista[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(nazwy.length >= 12, `${p}: lista talii skurczyła się (${nazwy.length})`);
    const martwe = nazwy.filter((n) => !fs.existsSync(plik(n)));
    assert.deepEqual(martwe, [], `${p}: martwe nazwy talii w deckFiles: ${martwe.join(', ')}`);
    // Wzorzec jest ZAKOTWICZONY w początku linii, bo komentarz wyjaśniający
    // naprawę cytuje stare `continue` — liczy się kod, nie jego opis.
    assert.ok(!/^\s*if \(!fs\.existsSync\(path\)\) continue;/m.test(zrodlo),
      `${p}: ciche pominięcie brakującej talii (L21) — brak pliku musi być błędem, nie ` +
      '„continue", które zmniejsza pokrycie bez śladu');
  }
});
