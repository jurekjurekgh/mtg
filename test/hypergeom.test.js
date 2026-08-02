import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probAtLeastOne } from '../src/engine/hypergeom.js';

/**
 * B3 — modelowanie przeciwnika: deterministyczna hipergeometria
 * (docs/BOT_ROADMAP.md). Wartości sprawdzone ręcznie (małe przypadki).
 */

test('P(≥1) dla małych przypadków — wartości ręcznie policzalne', () => {
  // N=10, K=2, n=3: P(0) = C(8,3)/C(10,3) = 56/120 → P(≥1) = 64/120.
  assert.ok(Math.abs(probAtLeastOne(10, 2, 3) - 64 / 120) < 1e-12);
  // Wszystkie karty wyróżnione → pewne.
  assert.equal(probAtLeastOne(10, 10, 3), 1);
  // Żadna wyróżniona → zero.
  assert.equal(probAtLeastOne(10, 0, 3), 0);
  // Pusta próbka → zero.
  assert.equal(probAtLeastOne(10, 2, 0), 0);
  // Pusta populacja → zero.
  assert.equal(probAtLeastOne(0, 2, 3), 0);
});

test('K > N i n > N są przycinane, nie psują wyniku', () => {
  assert.equal(probAtLeastOne(5, 7, 3), 1, 'więcej wyróżnionych niż populacja → pewne');
  assert.equal(probAtLeastOne(5, 2, 9), 1, 'próbka ≥ populacja = cała populacja');
  assert.equal(probAtLeastOne(5, 2, 2), 1 - (3 / 5) * (2 / 4), 'próbka 2 z 5, 2 wyróżnione');
});

test('monotoniczność: rośnie z K i z n, maleje z N', () => {
  assert.ok(probAtLeastOne(20, 4, 4) > probAtLeastOne(20, 2, 4));
  assert.ok(probAtLeastOne(20, 4, 5) > probAtLeastOne(20, 4, 3));
  assert.ok(probAtLeastOne(20, 4, 4) > probAtLeastOne(30, 4, 4));
});

test('deterministyczna i odporna na niepoprawne wejścia', () => {
  assert.equal(probAtLeastOne(20, 4, 4), probAtLeastOne(20, 4, 4));
  assert.throws(() => probAtLeastOne(20.5, 4, 4), TypeError);
  assert.throws(() => probAtLeastOne(20, 4, 4.5), TypeError);
  assert.throws(() => probAtLeastOne(-1, 4, 4), RangeError);
});
