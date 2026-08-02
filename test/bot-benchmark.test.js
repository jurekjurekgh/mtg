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
 * Pomiar z dnia wdrożenia B0 (2026-08-01, ta konfiguracja, 7 talii):
 * heuristic 153/224 (68.3%) vs random oraz 145/224 (64.7%) vs aggro.
 * Po dodaniu decks/real-batch3.txt (2026-08-01, 8 talii, 576 meczów/parę):
 * heuristic 187/288 (64.9%) vs random oraz 181/288 (62.8%) vs aggro.
 * Po pełnym wdrożeniu bestow i naprawie instalacji talii (deskryptory
 * types/entersTapped/bestow przechodzą do obiektów; 2026-08-01): heuristic
 * 198/288 (68.8%) vs random oraz 185/288 (64.2%) vs aggro; pełna macierz
 * 50 seedów (10 800 meczów): 70.6% vs random, 61.1% vs aggro, 69.3% aggro
 * vs random, 0 niedokończonych.
 * Po Batchu 4 (aura/equipment/cycling/backup + zmiany botów: equip w obu
 * botach, cycling tylko dla kart dalekich od wyrzucenia, tap_for_mana
 * reaguje też na artefakty/enchantmenty w ręce; 2026-08-01, 9 talii):
 * heuristic 225/360 (62.5%) vs random oraz 219/360 (60.8%) vs aggro;
 * 0 niedokończonych. Pełna macierz 50 seedów (13 500 meczów): 67.4% vs
 * random, 59.0% vs aggro, 71.4% aggro vs random. Progi przeliczone regułą
 * „zmierzone −15 p.p.".
 * Po B1 (lepsza heurystyka, 2026-08-02; szczegóły: docs/BOT_ROADMAP.md):
 * heuristic 263/360 (73.1%) vs random oraz 228/360 (63.3%) vs aggro;
 * 0 niedokończonych. Pełna macierz 50 seedów (13 500 meczów): 75.4% vs
 * random, 60.9% vs aggro, 71.4% aggro vs random; patologia deck-out na
 * synthetic-abilities (0% vs random) naprawiona (100%). Progi ponownie
 * przeliczone regułą „zmierzone −15 p.p.".
 * Po Batchu 5 (Midnight Guard / Holdout Settlement / Skyclave Geopede;
 * 2026-08-02, 10 talii, 440 meczów/parę): heuristic 329/440 (74.8%) vs
 * random oraz 278/440 (63.2%) vs aggro; 0 niedokończonych. Pełna macierz
 * 50 seedów (16 500 meczów): 77.1% vs random, 60.4% vs aggro, 73.5% aggro
 * vs random. Progi (0.59/0.48) przeliczone regułą „zmierzone −15 p.p.".
 */
const MIN_WIN_RATE_VS_RANDOM = 0.59;
const MIN_WIN_RATE_VS_AGGRO = 0.48;

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
