// PMSSB-67 F2 (caveat PMSSB-64 pkt 3) — Necrosquito (0/0 latający, wchodzi z 2 licznikami oil = 2/2)
// był wyceniany mocą z karty (0): rzut wyglądał gorzej niż vanilla 2/2 (PRZED: 62.55 < 64.80).
// Po poprawce liczniki wejścia wchodzą do P/T wyceny (entryCounterStats, cast_permanent i warp — L41).
// Pomiar: tools/pmssb67-kw-sonda.mjs (F2: PRZED 62.55, PO 70.05; latający 2/2 69.60; vanilla 2/2 64.80).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realCastScore } from '../tools/pmssb67-kw-sonda.mjs';
import { castScore } from '../tools/pmssb64-keywords-sonda.mjs';

const necro = () => realCastScore('necrosquito', { board: () => {} })[0];
const vanilla22 = () => castScore({ keywords: [], body: { power: 2, toughness: 2, mv: 4 } })[0];
const flyer22 = () => castScore({ keywords: ['flying'], body: { power: 2, toughness: 2, mv: 4 } })[0];

test('PMSSB-67/F2 Necrosquito wyżej niż vanilla 2/2 tego samego MV (PRZED: 62.55 < 64.80)', () => {
  const n = necro();
  const v = vanilla22();
  assert.ok(n > v, `Necrosquito=${n} vanilla2/2=${v}`);
});

test('PMSSB-67/F2 Necrosquito ≈ latający 2/2 (ciało 2/2 z lataniem; różnica tylko od mechanizmu oil)', () => {
  const n = necro();
  const f = flyer22();
  assert.ok(Math.abs(n - f) < 1, `Necrosquito=${n} flyer2/2=${f}`);
});

test('PMSSB-67/F2 karta bez licznika wejścia: wycena vanilli bez zmian (anty-over-fix)', () => {
  // 64.8018 zmierzone PRZED (HEAD) i PO — identyczne, bo ciało bez liczników nie zmienia P/T wyceny.
  assert.ok(Math.abs(vanilla22() - 64.8018) < 0.0005, `vanilla=${vanilla22()}`);
});

test('PMSSB-67/F2 licznik wejścia formułą stołu (Sheriff: 1 + inne stworzenia kontrolera) rośnie liniowo', async () => {
  const { putSynthCreature } = await import('../tools/pmssb63-batch68-sonda.mjs');
  const sheriff = (n) => realCastScore('sheriff-of-safe-passage', {
    mana: 3, colors: ['W'],
    board: (s) => { for (let i = 0; i < n; i += 1) putSynthCreature(s, `own${i}`, 'p2', { power: 1, toughness: 1, mv: 1 }); },
  })[0];
  const d0 = sheriff(0);
  const d1 = sheriff(1);
  const d2 = sheriff(2);
  assert.ok(d1 > d0, `1 własny=${d1} 0 własnych=${d0}`);
  assert.ok(Math.abs((d2 - d1) - (d1 - d0)) < 0.0005, `Δ1=${d1 - d0} Δ2=${d2 - d1}`);
});
