import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HEURISTIC_WEIGHTS,
  HEURISTIC_WEIGHT_KEYS,
  normalizeHeuristicWeights,
} from '../src/controllers/heuristic-weights.js';
import {
  hillClimb,
  parseTuningArgs,
  summarizeTuningResult,
  tuningObjective,
} from '../tools/tune-bot.mjs';

function resultFor(vsRandom, vsAggro, unfinished = 0) {
  const entry = (rate) => ({
    games: 100,
    unfinished,
    wins: { heuristic: Math.round(rate * 100), random: Math.round((1 - rate) * 100), aggro: Math.round((1 - rate) * 100) },
  });
  return {
    pairs: {
      'heuristic | random': entry(vsRandom),
      'aggro | heuristic': entry(vsAggro),
    },
  };
}

test('domyślne wagi B4 są jawne, kompletne i zachowują wartości strategii', () => {
  assert.deepEqual(HEURISTIC_WEIGHT_KEYS, ['land', 'mana', 'permanent', 'spell', 'ability', 'attack', 'block']);
  assert.deepEqual(DEFAULT_HEURISTIC_WEIGHTS, {
    land: 1,
    mana: 1.1,
    permanent: 0.9,
    spell: 1,
    ability: 1,
    attack: 1,
    block: 1,
  });
  const copy = normalizeHeuristicWeights();
  assert.notEqual(copy, DEFAULT_HEURISTIC_WEIGHTS);
  assert.equal(Object.isFrozen(copy), true);
});

test('normalizacja wag odrzuca literówki i niepoprawne liczby', () => {
  assert.throws(() => normalizeHeuristicWeights({ atack: 1 }), /Nieznane wagi/);
  assert.throws(() => normalizeHeuristicWeights({ attack: -0.1 }), />= 0/);
  assert.throws(() => normalizeHeuristicWeights({ block: Number.NaN }), /skończoną/);
  assert.throws(() => normalizeHeuristicWeights([]), /obiektem/);
});

test('funkcja celu B4 uwzględnia obie pary i dyskwalifikuje niedokończone mecze', () => {
  const result = resultFor(0.8, 0.6);
  assert.deepEqual(summarizeTuningResult(result), {
    vsRandom: 0.8,
    vsAggro: 0.6,
    unfinished: 0,
    games: 200,
    proxyMean: null, // B6 T2: null gdy benchmark nie zbierał proxy (collectProxy=false)
  });
  assert.equal(tuningObjective(result), 0.7);
  assert.equal(tuningObjective(resultFor(1, 1, 1)), Number.NEGATIVE_INFINITY);
});

test('hill-climbing jest deterministyczny, nie mutuje wejścia i nie kupuje regresji', () => {
  const initial = { ...DEFAULT_HEURISTIC_WEIGHTS, mana: 1 };
  const evaluate = (weights) => {
    const distance = Math.abs(weights.mana - 1.1);
    const bonus = Math.max(0, 0.1 - distance);
    return resultFor(0.6 + bonus, 0.6 + bonus);
  };
  const first = hillClimb({
    initialWeights: initial,
    keys: ['mana'],
    step: 0.1,
    min: 0.5,
    max: 1.5,
    rounds: 1,
    evaluate,
  });
  const second = hillClimb({
    initialWeights: initial,
    keys: ['mana'],
    step: 0.1,
    min: 0.5,
    max: 1.5,
    rounds: 1,
    evaluate,
  });
  assert.deepEqual(second, first);
  assert.equal(initial.mana, 1);
  assert.equal(first.weights.mana, 1.1);
  assert.equal(first.summary.vsRandom, 0.7);
  assert.equal(first.summary.vsAggro, 0.7);
  assert.equal(first.evaluations, 3);
  assert.ok(first.history.some((entry) => entry.accepted && entry.key === 'mana'));
});

test('parser tunera jest deterministyczny i waliduje zakres', () => {
  assert.deepEqual(parseTuningArgs(['--seeds', '8', '--rounds', '2', '--keys', 'mana,permanent', '--step', '0.2']), {
    seedsCount: 8,
    seedBase: 2026,
    rounds: 2,
    step: 0.2,
    min: 0.5,
    max: 1.5,
    keys: ['mana', 'permanent'],
    jsonPath: null,
  });
  assert.throws(() => parseTuningArgs(['--step', '0']), /dodatnia/);
  assert.throws(() => parseTuningArgs(['--keys', 'unknown']), /Nieznana waga tunera/);
  assert.throws(() => parseTuningArgs(['--unknown']), /Nieznana opcja/);
});
