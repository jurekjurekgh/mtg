// ADR 0025 — pełna macierz pod BUDŻET meczów, nie pod „wszystkie kombinacje".
//
// Powód: kombinacje rosną z kwadratem liczby talii. Przy 12 taliach pełna
// macierz to 23 400 meczów (~40 min), przy 22 (po podziałach ADR 0024) już
// 75 900, a przy 45 — około 300 tysięcy. Nikt tego nie dogra, więc nikt też
// nie zauważył, że szacunek „~40 minut" w ADR 0018 jest martwy od miesięcy.
//
// Kontrakt po zmianie:
//   1. rozmiar wyznacza budżet (~6 000 meczów), nie liczba kombinacji;
//   2. algorytm dobiera kształt do liczby talii (mało talii → więcej seedów,
//      dużo talii → próbka par);
//   3. KAŻDA talia jest w próbce (pokrycie gwarantowane, nie tylko losowanie);
//   4. wynik jest deterministyczny (ADR 0005) — seedowany PRNG.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCH_DECKS,
  benchmarkDecks,
  listRepoDeckNames,
  REGRESSION_CONFIG,
  mulberry32,
  resolveMatrixShape,
  runBenchmark,
  sampleDeckPairs,
} from '../tools/benchmark.mjs';

const BUDGET = 6_000;
const BOT_PAIRS = [['aggro', 'heuristic'], ['aggro', 'random'], ['heuristic', 'random']];
const talie = (n) => Array.from({ length: n }, (_, i) => `talia-${String(i).padStart(2, '0')}`);

test('budżet trzyma rozmiar niezależnie od liczby talii (6 / 22 / 45 / 120)', () => {
  for (const n of [6, 22, 45, 120]) {
    const decks = talie(n);
    const shape = resolveMatrixShape({ decks, botPairs: BOT_PAIRS, budgetMatches: BUDGET, seedBase: 1000 });
    const wszystkichPar = (n * (n + 1)) / 2;
    const total = shape.deckPairs.length * shape.seedsCount * 2 * BOT_PAIRS.length;

    assert.ok(total <= BUDGET, `${n} talii: ${total} meczów > budżet ${BUDGET}`);
    assert.ok(total >= BUDGET * 0.7, `${n} talii: ${total} meczów marnuje budżet (${BUDGET})`);
    assert.ok(shape.deckPairs.length <= wszystkichPar, `${n} talii: próbka większa niż pula par`);
    assert.ok(shape.seedsCount >= 4, `${n} talii: za mało seedów na pojedynek (${shape.seedsCount})`);
    // Kombinacji NIE wyczerpujemy, gdy jest ich więcej niż budżet pozwala.
    if (wszystkichPar * 4 * 2 * BOT_PAIRS.length > BUDGET) {
      assert.ok(shape.deckPairs.length < wszystkichPar, `${n} talii: powinniśmy próbkować, nie wyczerpywać`);
    }
  }
});

test('kształt dopasowuje się do liczby talii: mało talii → seedy, dużo talii → próbka par', () => {
  const malo = resolveMatrixShape({ decks: talie(6), botPairs: BOT_PAIRS, budgetMatches: BUDGET, seedBase: 1000 });
  const duzo = resolveMatrixShape({ decks: talie(45), botPairs: BOT_PAIRS, budgetMatches: BUDGET, seedBase: 1000 });

  assert.equal(malo.deckPairs.length, 21, '6 talii: wszystkie 21 par (jest ich tylko 21)');
  assert.ok(malo.seedsCount > 20, `6 talii: budżet idzie w seedy (było ${malo.seedsCount})`);

  assert.ok(duzo.seedsCount <= 6, `45 talii: seedy schodzą do minimum (było ${duzo.seedsCount})`);
  assert.ok(duzo.deckPairs.length < 1035, '45 talii: próbka par, nie wszystkie kombinacje');
  assert.ok(duzo.deckPairs.length > 200, `45 talii: próbka wykorzystuje budżet (było ${duzo.deckPairs.length})`);
});

test('każda talia jest w próbce — pokrycie gwarantowane, nie tylko losowanie', () => {
  for (const n of [7, 22, 45, 120]) {
    const decks = talie(n);
    const shape = resolveMatrixShape({ decks, botPairs: BOT_PAIRS, budgetMatches: BUDGET, seedBase: 1000 });
    const widziane = new Set(shape.deckPairs.flat());
    assert.equal(widziane.size, n, `${n} talii: ${n - widziane.size} talii w ogóle nie zmierzono`);
  }
});

test('próbka jest deterministyczna (ADR 0005) i reaguje na seed', () => {
  const decks = talie(45);
  const a = resolveMatrixShape({ decks, botPairs: BOT_PAIRS, budgetMatches: BUDGET, seedBase: 1000 });
  const b = resolveMatrixShape({ decks, botPairs: BOT_PAIRS, budgetMatches: BUDGET, seedBase: 1000 });
  const c = resolveMatrixShape({ decks, botPairs: BOT_PAIRS, budgetMatches: BUDGET, seedBase: 2000 });

  assert.deepEqual(a, b, 'ten sam seed → ta sama próbka');
  assert.equal(a.deckPairs.length, c.deckPairs.length, 'rozmiar próbki nie zależy od seeda');
  assert.notDeepEqual(a.deckPairs, c.deckPairs, 'inny seed → inna próbka');
  // PRNG: ten sam strumień dla tego samego seeda, różny dla innych.
  assert.equal(mulberry32(7)(), mulberry32(7)());
  assert.notEqual(mulberry32(7)(), mulberry32(8)());
});

test('jawne --seeds przesuwa środek ciężkości, ale NIE powiększa macierzy', () => {
  const decks = talie(22);
  const shape = resolveMatrixShape({ decks, botPairs: BOT_PAIRS, budgetMatches: BUDGET, seedsCount: 50, seedBase: 1000 });
  const total = shape.deckPairs.length * shape.seedsCount * 2 * BOT_PAIRS.length;

  assert.equal(shape.seedsCount, 50);
  assert.ok(shape.deckPairs.length < 253, `przy 50 seedach bierzemy mniej par talii (było ${shape.deckPairs.length})`);
  assert.ok(total <= BUDGET, `50 seedów nie może rozsadzić budżetu (wyszło ${total})`);
});

test('próbka par talii: bez duplikatów, bez lustrzanych powtórzeń, wszystkie pary gdy się mieszczą', () => {
  const decks = talie(10);
  const rng = mulberry32(1234);
  const probka = sampleDeckPairs(decks, 20, rng);
  const klucze = probka.map(([a, b]) => [a, b].sort().join('|'));

  assert.equal(probka.length, 20);
  assert.equal(new Set(klucze).size, 20, 'bez powtórzeń tej samej pary (także lustrzanej)');

  const wszystkie = sampleDeckPairs(decks, 999, rng);
  assert.equal(wszystkie.length, 55, 'gdy budżet pozwala — wszystkie pary (10×11/2)');
  // Przypadek brzegowy: nieparzysta liczba talii nie może pominąć ostatniej.
  const nieparzyste = sampleDeckPairs(talie(7), 12, mulberry32(99));
  assert.equal(new Set(nieparzyste.flat()).size, 7);
});

test('profil regresji zostaje bez zmian: 6 talii, 8 seedów, 672 mecze', () => {
  const shape = resolveMatrixShape({
    decks: BENCH_DECKS,
    botPairs: REGRESSION_CONFIG.pairs,
    budgetMatches: BUDGET,
    seedsCount: REGRESSION_CONFIG.seedsCount,
    seedBase: REGRESSION_CONFIG.seedBase,
  });
  assert.equal(shape.deckPairs.length, 21, '6 talii → wszystkie 21 par (jak przed zmianą)');
  assert.equal(shape.seedsCount, 8);
  assert.equal(shape.deckPairs.length * shape.seedsCount * 2 * REGRESSION_CONFIG.pairs.length, 672);
});

test('worki nie wchodzą do macierzy (ADR 0023 §5) — ani do pełnej, ani do szybkiej', () => {
  const wszystkie = listRepoDeckNames();
  const dopuszczone = benchmarkDecks();

  assert.ok(dopuszczone.length > 0, 'benchmark musi mieć talie');
  assert.ok(dopuszczone.length < wszystkie.length, 'co najmniej jeden worek został odsiany');
  for (const name of dopuszczone) {
    assert.ok(!name.startsWith('worek'), `${name} to worek — nie wolno go mierzyć (ADR 0023 §5)`);
  }
  assert.deepEqual(dopuszczone, [...dopuszczone].sort(), 'kolejność deterministyczna');
  assert.ok(dopuszczone.includes('tarkir-bg'), 'talia jednoplanowa musi zostać');
  // Próbka BENCH_DECKS jest początkiem tej samej listy — jedna reguła odsiewu.
  assert.deepEqual(BENCH_DECKS, dopuszczone.slice(0, BENCH_DECKS.length));
});
