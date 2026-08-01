import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCH_BOT_FACTORIES,
  REGRESSION_CONFIG,
  defaultPairs,
  formatBenchmarkReport,
  listRepoDeckNames,
  parseBenchmarkArgs,
  runBenchmark,
} from '../tools/benchmark.mjs';

/**
 * Test regresji jakości bota — część harnessu B0 (docs/BOT_ROADMAP.md).
 *
 * Próbka `REGRESSION_CONFIG` jest deterministyczna (ADR 0005): ten sam kod daje
 * zawsze te same liczby zwycięstw. Progi poniżej pilnują, żeby zmiana bota (B1+)
 * mogła je wyłącznie PODNIEŚĆ. Po każdej świadomej zmianie bota:
 *
 *   1. uruchom pełny pomiar: `node tools/benchmark.mjs` (~1–2 min);
 *   2. sprawdź w macierzy, że nowy bot nie jest słabszy od poprzedniego;
 *   3. zaktualizuj progi i liczby w komentarzu do zmierzonych wartości
 *      (z marginesem ~15 p.p. w dół — próbka rośnie wraz z decks/*.txt).
 *
 * Pomiar z dnia wdrożenia B0 (2026-08-01, ta konfiguracja): heuristic 153/224
 * (68.3%) vs random oraz 145/224 (64.7%) vs aggro; pełna macierz 50 seedów:
 * 70.8% vs random, 61.6% vs aggro, 0 niedokończonych.
 */
const MIN_WIN_RATE_VS_RANDOM = 0.55;
const MIN_WIN_RATE_VS_AGGRO = 0.5;

function gamesWon(board, bot) {
  return board.wins[bot] ?? 0;
}

test('harness jest deterministyczny: dwa przebiegi dają identyczny wynik', () => {
  const config = {
    bots: ['aggro', 'heuristic'],
    decks: ['real-batch1', 'real-batch2'],
    seedsCount: 2,
    seedBase: 11,
    maxCommands: 3000,
  };
  const first = runBenchmark(config);
  const second = runBenchmark(config);
  assert.deepEqual(second, first);
});

test('rejestr botów benchmarku pokrywa się z domyślną macierzą par', () => {
  assert.deepEqual(Object.keys(BENCH_BOT_FACTORIES).sort(), ['aggro', 'heuristic', 'random']);
  assert.deepEqual(defaultPairs(['heuristic', 'random'], false), [['heuristic', 'random']]);
  assert.deepEqual(defaultPairs(['heuristic', 'random'], true), [['heuristic', 'heuristic'], ['heuristic', 'random'], ['random', 'random']]);
  assert.ok(listRepoDeckNames().includes('real-batch1'), 'harness powinien widzieć talie z decks/*.txt');
});

test('argumenty CLI: walidacja i odrzucanie nieznanych opcji', () => {
  assert.deepEqual(parseBenchmarkArgs(['--seeds', '7', '--self', '--json', 'raport.json']), {
    seedsCount: 7, selfPlay: true, jsonPath: 'raport.json',
  });
  assert.deepEqual(parseBenchmarkArgs(['--pairs', 'heuristic:random, aggro:heuristic']).pairs, [['heuristic', 'random'], ['aggro', 'heuristic']]);
  assert.throws(() => parseBenchmarkArgs(['--nonsense']), /Nieznana opcja/);
  assert.throws(() => parseBenchmarkArgs(['--seeds']), /wymaga wartości/);
  assert.throws(() => parseBenchmarkArgs(['--seeds', 'abc']), /dodatnią liczbą całkowitą/);
});

// Próbka regresji liczona RAZ na plik (~3 s) — testy poniżej dzielą wynik.
const regressionResult = runBenchmark(REGRESSION_CONFIG);

test('próbka regresji kończy wszystkie mecze rozstrzygnięciem', () => {
  for (const [key, entry] of Object.entries(regressionResult.pairs)) {
    assert.equal(entry.unfinished, 0, `para ${key} ma niedokończone mecze — podnieś maxCommands albo zbadaj patowanie`);
  }
});

test('bot heurystyczny nie jest słabszy niż próg regresji vs RandomBot', () => {
  const board = regressionResult.pairs['heuristic | random'];
  assert.ok(board, 'brak pary heuristic vs random w próbce regresji');
  const winRate = gamesWon(board, 'heuristic') / board.games;
  assert.ok(
    winRate >= MIN_WIN_RATE_VS_RANDOM,
    `heuristic wygrał tylko ${(winRate * 100).toFixed(1)}% vs random (próg ${MIN_WIN_RATE_VS_RANDOM * 100}%) — regresja jakości bota, zob. docs/BOT_ROADMAP.md`,
  );
});

test('bot heurystyczny nie jest słabszy niż próg regresji vs aggro', () => {
  const board = regressionResult.pairs['aggro | heuristic'];
  assert.ok(board, 'brak pary heuristic vs aggro w próbce regresji');
  const winRate = gamesWon(board, 'heuristic') / board.games;
  assert.ok(
    winRate >= MIN_WIN_RATE_VS_AGGRO,
    `heuristic wygrał tylko ${(winRate * 100).toFixed(1)}% vs aggro (próg ${MIN_WIN_RATE_VS_AGGRO * 100}%) — regresja jakości bota, zob. docs/BOT_ROADMAP.md`,
  );
});

test('raport tekstowy zawiera macierz i wyniki par (smoke formatowania)', () => {
  const result = runBenchmark({
    bots: ['heuristic', 'random'],
    decks: ['synthetic-aggro', 'synthetic-growth'],
    seedsCount: 1,
    seedBase: 5,
    maxCommands: 3000,
  });
  const report = formatBenchmarkReport(result);
  assert.match(report, /Benchmark botów \(B0\)/);
  assert.match(report, /Macierz win-rate/);
  assert.match(report, /== heuristic vs random ==/);
  assert.match(report, /synthetic-aggro \| synthetic-growth/);
});
