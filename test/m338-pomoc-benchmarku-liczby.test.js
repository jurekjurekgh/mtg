// M338 (F13) — HELP narzędzia benchmarku musi mówić PRAWDZĘ o domyślnych
// liczbach, a liczby w HELP-ie muszą wynikać z kodu, nie z pamięci autora.
//
// Powód: `--help` twierdził miesiącami, że budżet pełnej macierzy to
// „~10 000 meczów", że profil szybki gra „4 seedy", a pełna przy „22 talie"
// bierze 6 seedów. W kodu tymczasem DEFAULT_BUDGET_MATCHES = 6_000,
// QUICK_CONFIG.seedsCount = 8, a katalog ma 19 talii (22 pliki to był stan
// z dnia decyzji ADR 0025). Nikt tego nie liczył — help nie miał strażnika,
// więc rozpadał się cicho przy każdej zmianie (ten sam wzorzec co brak
// bramki dla `limitations` — L41/L137: fakt w dwóch miejscach bez porównania).
//
// Kontrakt: JEDEN test, dwie strony.
//  (1) liczby w HELP-ie wyprowadzone z wyliczeń na KATALOGU (nie zgadywanki),
//  (2) zakaz powrotu znanych starych wartości — jeśli kod zmieni domyślną,
//      HELP trzeba zaktualizować RAZEM (czerwony test mówi, gdzie).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BUDGET_MATCHES,
  DEFAULT_MIN_SEEDS_PER_MATCHUP,
  HELP,
  QUICK_CONFIG,
  benchmarkDecks,
  resolveMatrixShape,
} from '../tools/benchmark.mjs';

/** Polskie grupowanie tysięcy w HELP-ie: 6 000, nie 6000. */
function grub(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

test('M338/1: HELP--budget == DEFAULT_BUDGET_MATCHES', () => {
  assert.ok(HELP.includes(`budżet meczów dla pełnej macierzy (domyślnie ${grub(DEFAULT_BUDGET_MATCHES)})`),
    `HELP obiecuje inny budżet niż kod (${DEFAULT_BUDGET_MATCHES}) — zaktualizuj tekst w tools/benchmark.mjs RAZEM ze stałą`);
});

test('M338/2: HELP--quick „N seedów" == QUICK_CONFIG.seedsCount', () => {
  assert.ok(HELP.includes(`DOMYŚLNY: ${QUICK_CONFIG.seedsCount} seed${QUICK_CONFIG.seedsCount === 1 ? '' : 'ów'}, pary`),
    `HELP--quick mówi o złej liczbie seedów (kod: ${QUICK_CONFIG.seedsCount})`);
});

test('M338/3: HELP--seeds cytuje realny kształt macierzy na bieżącym katalogu', () => {
  const decks = benchmarkDecks();
  const botPairs = [['aggro', 'heuristic'], ['aggro', 'random'], ['heuristic', 'random']];
  const shape = resolveMatrixShape({
    decks,
    botPairs,
    budgetMatches: DEFAULT_BUDGET_MATCHES,
    minSeedsPerMatchup: DEFAULT_MIN_SEEDS_PER_MATCHUP,
    seedBase: 1000,
  });
  const total = shape.deckPairs.length * shape.seedsCount * 2 * botPairs.length;
  // Zdanie „pełna: wyliczana — dziś <N> talii → <S>" musi odpowiadać wyliczeniu.
  assert.ok(HELP.includes(`dziś ${decks.length} talii → ${shape.seedsCount}`),
    `HELP--seeds nie oddaje dzisiejszego katalogu: talii ${decks.length}, seedów z budżetu ${shape.seedsCount} (rozegrane mecze: ${total})`);
  // A zdanie o budżecie musi mieścić przebieg: próbka nie wychodzi poza budżet.
  assert.ok(total <= DEFAULT_BUDGET_MATCHES,
    `próbkowanie przekracza budżet: ${total} > ${DEFAULT_BUDGET_MATCHES}`);
  assert.ok(shape.deckPairs.length === shape.allPairsCount && total >= DEFAULT_BUDGET_MATCHES * 0.7,
    `przy ${decks.length} taliach pełne pokrycie (${shape.deckPairs.length}/${shape.allPairsCount} par, ${total} meczów) powinno mieścić się w budżecie ze sporym zapasem — jeśli katalog urósł, zaktualizuj ZDJĘCIA w HELP-ie (--full) i ADR 0025, nie ten test`);
});

test('M338/4: zakaz powrotu starych liczb w HELP-ie', () => {
  // Wartości, które HELP głosił przed M338. Jeśli któraś wróci, to znaczy,
  // że ktoś edytował help bez przejrzenia domyślnych w kodzie (albo kopiuj-wklej
  // ze starego dokumentu) — niech czerwieni się tutaj, nie w raporcie właściciela.
  for (const zakaz of ['domyślnie 10 000', '10 000 meczów', 'DOMYŚLNY: 4 seedy', '22 talie → 6']) {
    assert.ok(!HELP.includes(zakaz), `HELP zawiera odrzuconą starą liczbę: ${JSON.stringify(zakaz)}`);
  }
});

test('M338/5: --max-commands w HELP-ie == domyślny maxCommands w kodzie', async () => {
  const src = HELP;
  const m = src.match(/--max-commands N\s+limit komend na mecz \(domyślnie (\d+)\)/);
  assert.ok(m, 'HELP nie opisuje już --max-commands w znanym formacie — przenieś liczbę do pinu ŚWIADOMIE');
  // Domyślna wartość siedzi w sygnaturze runBenchmark; wyciągamy ją ze źródła,
  // żeby test nie dublował stałej (L41: jedno źródło, tu: sam plik).
  const fs = await import('node:fs');
  const tool = fs.readFileSync(new URL('../tools/benchmark.mjs', import.meta.url), 'utf8');
  const def = tool.match(/\n  maxCommands = (\d+),/);
  assert.ok(def, 'nie znaleziono domyślnego maxCommands w runBenchmark — zmienił się kształt sygnatury, zaktualizuj test');
  assert.equal(Number(m[1]), Number(def[1]),
    `HELP--max-commands obiecuje ${m[1]}, kod przyjmuje ${def[1]}`);
});
