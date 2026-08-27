import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmark, BENCH_DECKS } from '../tools/benchmark.mjs';
import {
  summarizeTuningResult,
  tuningObjective,
} from '../tools/tune-bot.mjs';

/**
 * B6 T2 — wpięcie proxy w harness + funkcję celu (opt-in).
 * Mała próbka (1 talia, 1 seed) — plik szybki. Sprawdza, że:
 *  - domyślny benchmark NIE ma pól proxy (zero zaśmiecania, regresja bez zmian),
 *  - collectProxy:true dokłada proxyMean w (0,1),
 *  - proxy jest deterministyczne,
 *  - tuningObjective z β=0 == klasyczny win-rate, a β>0 miesza proxy.
 */

const SMALL = {
  bots: ['heuristic', 'random'],
  pairs: [['heuristic', 'random']],
  decks: ['tarkir-bg'],
  seedsCount: 1,
  seedBase: 3000,
  maxCommands: 8000,
};

test('proxy-benchmark: domyślnie brak pól proxy (regresja niezmieniona)', () => {
  const r = runBenchmark(SMALL);
  const entry = r.pairs['heuristic | random'];
  assert.ok(entry, 'para musi istnieć');
  assert.equal(entry.proxyMean, undefined, 'bez collectProxy nie ma proxyMean');
});

test('proxy-benchmark: collectProxy dokłada proxyMean w (0,1)', () => {
  const r = runBenchmark({ ...SMALL, collectProxy: true });
  const entry = r.pairs['heuristic | random'];
  assert.equal(typeof entry.proxyMean, 'number');
  assert.ok(entry.proxyMean > 0 && entry.proxyMean < 1, `proxyMean w (0,1): ${entry.proxyMean}`);
});

test('proxy-benchmark: proxy jest deterministyczne (ADR 0005)', () => {
  const a = runBenchmark({ ...SMALL, collectProxy: true }).pairs['heuristic | random'].proxyMean;
  const b = runBenchmark({ ...SMALL, collectProxy: true }).pairs['heuristic | random'].proxyMean;
  assert.equal(a, b);
});

test('proxy-objective: β=0 zwraca klasyczny win-rate', () => {
  const r = runBenchmark({
    bots: ['aggro', 'heuristic', 'random'],
    pairs: [['heuristic', 'random'], ['heuristic', 'aggro']],
    decks: ['tarkir-bg'],
    seedsCount: 1,
    seedBase: 3000,
    maxCommands: 8000,
    collectProxy: true,
  });
  const summary = summarizeTuningResult(r);
  const expected = (summary.vsRandom + summary.vsAggro) / 2;
  assert.equal(tuningObjective(r), expected);
  assert.equal(tuningObjective(r, { proxyWeight: 0 }), expected);
});

test('proxy-objective: β>0 miesza proxy (różny wynik gdy proxy != winRate)', () => {
  const r = runBenchmark({
    bots: ['aggro', 'heuristic', 'random'],
    pairs: [['heuristic', 'random'], ['heuristic', 'aggro']],
    decks: ['tarkir-bg'],
    seedsCount: 1,
    seedBase: 3000,
    maxCommands: 8000,
    collectProxy: true,
  });
  const summary = summarizeTuningResult(r);
  assert.ok(summary.proxyMean != null, 'proxy musi być zebrane');
  const winObj = (summary.vsRandom + summary.vsAggro) / 2;
  const mixed = tuningObjective(r, { proxyWeight: 0.5 });
  const expected = 0.5 * winObj + 0.5 * summary.proxyMean;
  assert.ok(Math.abs(mixed - expected) < 1e-9, `β=0.5 miesza po połowie (${mixed} vs ${expected})`);
});

test('proxy-objective: bez zebranego proxy β>0 jest ignorowane (brak danych)', () => {
  const r = runBenchmark({
    bots: ['aggro', 'heuristic', 'random'],
    pairs: [['heuristic', 'random'], ['heuristic', 'aggro']],
    decks: ['tarkir-bg'],
    seedsCount: 1,
    seedBase: 3000,
    maxCommands: 8000,
    // collectProxy pominięty → brak proxy
  });
  const winObj = tuningObjective(r);
  assert.equal(tuningObjective(r, { proxyWeight: 0.9 }), winObj, 'bez proxy β nie zmienia celu');
});
