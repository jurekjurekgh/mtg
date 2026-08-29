// M255: pełna macierz (23 400 meczów) liczyła się ponad godzinę BEZ ŻADNEGO
// logu — raport powstaje dopiero po ostatnim meczu, więc nie dało się odróżnić
// wolnego liczenia od meczu, który utknął. Harness dostał dwa instrumenty:
//  1. `onProgress` — postęp przyrostowy (done/total, tempo, ETA, adres),
//  2. `stallMs`    — watchdog przerywający POJEDYNCZY mecz, który przekroczył
//                    limit, z wpisem w `result.stalls` (adres + liczniki).
//
// Ten test pilnuje obu: bez nich następna „godzinna cisza" znów nic nie powie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBenchmarkArgs, runBenchmark } from '../tools/benchmark.mjs';

// Mała, szybka konfiguracja: jedna talia, jeden bot, dwa seedy.
const MALA = { decks: ['innistrad-wu'], pairs: [['random', 'random']], seedsCount: 2, maxCommands: 4000 };

test('postęp: onProgress dostaje rosnący licznik i kończy na done === total', () => {
  const ticks = [];
  const result = runBenchmark({ ...MALA, progressEvery: 1, onProgress: (p) => ticks.push(p) });

  assert.ok(ticks.length >= 2, `onProgress powinien być wołany co mecz i na końcu (było ${ticks.length})`);
  assert.equal(ticks.at(-1).done, ticks.at(-1).total, 'ostatni tick: done === total');
  assert.equal(ticks.at(-1).total, result.config.totalMatches);
  assert.equal(ticks.at(-1).done, 2, 'dwa seedy × jeden wariant stron = 2 mecze');

  for (let i = 1; i < ticks.length; i += 1) {
    assert.ok(ticks[i].done >= ticks[i - 1].done, 'licznik postępu nie może się cofać');
    assert.ok(ticks[i].elapsedMs >= 0 && ticks[i].msPerMatch > 0, 'tick niesie tempo przebiegu');
  }
  // Pierwszy tick daje od razu tempo i ETA — nie czekamy na próg progressEvery.
  assert.equal(ticks[0].done, 1);
  assert.ok(ticks[0].etaMs != null, 'pierwszy tick ma już prognozę ETA');
  assert.ok(ticks[0].current?.deckX, 'tick niesie adres aktualnej pozycji');
});

test('postęp: bez progressEvery wołanie jest TYLKO jedno — na końcu', () => {
  const ticks = [];
  const result = runBenchmark({ ...MALA, onProgress: (p) => ticks.push(p) });
  assert.equal(ticks.length, 1, 'bez progressEvery log milczy w trakcie (testy regresji bez szumu)');
  assert.equal(ticks[0].done, ticks[0].total, 'ostatnie wołanie podsumowuje przebieg');
  assert.deepEqual(result.stalls, [], 'bez watchdoga: zero zacinek');
});

test('watchdog: mecz, który utknął, jest przerywany i wpisany do stalls (adres + liczniki)', () => {
  const config = {
    decks: ['innistrad-wu', 'mirrodin-wu'],
    pairs: [['heuristic', 'random']],
    seedsCount: 1,
    maxCommands: 8000,
    stallMs: 1, // 1 ms: każdy mecz „utknie" — deterministycznie
  };
  const stalls = [];
  const result = runBenchmark({ ...config, onStall: (s) => stalls.push(s) });

  // 2 talie → 3 pary talii (x|x, x|y, y|y) × 2 strony stołu × 1 seed = 6 meczów.
  assert.equal(result.config.totalMatches, 6);
  assert.equal(result.stalls.length, 6, 'każdy mecz przekroczył limit i został przerwany');
  assert.equal(stalls.length, 6, 'onStall zgłasza każdą zacinkę osobno');

  for (const stall of result.stalls) {
    assert.match(stall.bots, /(heuristic\|random)|(random\|heuristic)/, 'adres niesie obu botów (kolejność par jest sortowana)');
    assert.match(stall.decks, /\|/, 'adres niesie OBIE talie');
    assert.equal(typeof stall.seed, 'number');
    assert.ok(stall.elapsedMs > 0 && stall.steps > 0, 'wpis niesie czas i liczbę kroków');
    assert.ok(stall.turn != null, 'wpis niesie numer tury');
  }

  // Przerwany mecz liczy się jako niedokończony, ale macierz DOCHODZI DO KOŃCA.
  const para = Object.values(result.pairs)[0];
  assert.equal(para.games, 6);
  assert.equal(para.unfinished, 6);
});

test('watchdog wyłączony (stallMs = 0): mecze kończą się normalnie, stalls puste', () => {
  const result = runBenchmark({ ...MALA, stallMs: 0 });
  assert.deepEqual(result.stalls, []);
  const para = Object.values(result.pairs)[0];
  assert.equal(para.unfinished, 0, 'bez watchdoga mecze są rozgrywane do końca');
});

test('CLI: --progress i --stall-ms (0 = wyłącz; wartości ujemne odrzucane)', () => {
  assert.equal(parseBenchmarkArgs(['--progress', '5']).progressEvery, 5);
  assert.equal(parseBenchmarkArgs(['--stall-ms', '0']).stallMs, 0, '0 wyłącza watchdoga');
  assert.equal(parseBenchmarkArgs(['--stall-ms', '250']).stallMs, 250);
  assert.throws(() => parseBenchmarkArgs(['--stall-ms', '-3']), /nieujemną liczbą całkowitą/);
  assert.throws(() => parseBenchmarkArgs(['--progress', 'x']), /nieujemną liczbą całkowitą/);
  // Flagi opcjonalne nie psują dotychczasowego zestawu opcji (bez nich: cisza).
  assert.deepEqual(parseBenchmarkArgs(['--seeds', '7']), { jsonPath: null, seedsCount: 7 });
});
