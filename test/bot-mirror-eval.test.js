import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mirrorEval } from '../tools/mirror-eval.mjs';

/**
 * B6 — ewaluacja lustrzana (kandydat vs baseline, obaj `heuristic`).
 * Mała próbka (1 talia, 2 seedy) — plik szybki. Sprawdza uczciwość (identyczne
 * parametry → 0.5 w rozstrzygniętych), determinizm i że kontrakt wyniku trzyma.
 */

const SMALL = { decks: ['tarkir'], seedsCount: 2, seedBase: 3000, maxCommands: 8000 };

test('mirror: identyczne parametry dają dokładnie 0.5 w rozstrzygniętych', () => {
  // Kandydat == baseline (oba undefined = defaulty). Lustro (obie strony)
  // gwarantuje, że każda wygrana p1 ma odbicie jako wygrana p2 — symetria.
  const r = mirrorEval({ paramsA: undefined, paramsB: undefined, ...SMALL });
  assert.equal(r.winsA, r.winsB, 'identyczne parametry → tyle samo wygranych po obu stronach');
  assert.equal(r.winRateA, 0.5);
});

test('mirror: wynik jest deterministyczny (ADR 0005)', () => {
  const a = mirrorEval({ paramsA: { removalEnemyBase: 60 }, ...SMALL });
  const b = mirrorEval({ paramsA: { removalEnemyBase: 60 }, ...SMALL });
  assert.deepEqual(a, b);
});

test('mirror: kontrakt wyniku (games = winsA + winsB + unfinished)', () => {
  const r = mirrorEval({ paramsA: { creatureBase: 90 }, ...SMALL });
  assert.equal(r.games, r.winsA + r.winsB + r.unfinished);
  assert.equal(r.games, SMALL.decks.length * SMALL.seedsCount * 2); // obie strony
  assert.ok(r.winRateA >= 0 && r.winRateA <= 1);
});
