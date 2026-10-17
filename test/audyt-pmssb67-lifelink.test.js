// PMSSB-67 F3 (caveat PMSSB-64 pkt 2) — lifelink nie wiedział o blokerach ani atakujących.
// PRZED: Δ lifelinku = 1.8 (życie 20) na każdym stole, także gdy bloker 4/5 zabija ciało 3/3.
// PO: udział zabójców (moc wroga ≥ wytrzymałość ciała) obniża wartość do creatureKwLifelinkSurvivalFloor.
// Pomiar: tools/pmssb67-kw-sonda.mjs (F3). Pokrętło = 1 przywraca dawne zachowanie (×0 wpływu stanu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castScore } from '../tools/pmssb64-keywords-sonda.mjs';
import { BOARDS } from '../tools/pmssb67-kw-sonda.mjs';
import { putSynthCreature } from '../tools/pmssb63-batch68-sonda.mjs';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const delta = (board, { life = 20, params } = {}) => {
  const ll = castScore({ keywords: ['lifelink'], board, life, body: { power: 3, toughness: 3 }, params })[0];
  const base = castScore({ keywords: [], board, life, body: { power: 3, toughness: 3 }, params })[0];
  return ll - base;
};

const PUSTY = delta(BOARDS.pusty);

test('PMSSB-67/F3 pusty stół: lifelink bez zmiany (Δ 1.8, PRZED = PO)', () => {
  assert.ok(Math.abs(PUSTY - 1.8) < 0.01, `Δ=${PUSTY}`);
});

test('PMSSB-67/F3 zabójca na stole (bloker 4/5 zabija ciało 3/3): Δ = połowa (creatureKwLifelinkSurvivalFloor 0.5)', () => {
  const d = delta(BOARDS.blokerDuzy);
  assert.ok(Math.abs(d / PUSTY - 0.5) < 0.01, `ratio=${d / PUSTY} Δ=${d}`);
});

test('PMSSB-67/F3 dwóch zabójców (atak 5/5 ×2): ta sama połowa, nie więcej (udział 100 %)', () => {
  const d = delta(BOARDS.atakDuzy);
  assert.ok(Math.abs(d / PUSTY - 0.5) < 0.01, `ratio=${d / PUSTY}`);
});

test('PMSSB-67/F3 nie-zabójca (bloker 1/1 nie zabija ciała 3/3): wartość bez zmian (anty-over-fix)', () => {
  const d = delta(BOARDS.blokerMaly);
  assert.ok(Math.abs(d - PUSTY) < 0.01, `Δ=${d} pusty=${PUSTY}`);
});

test('PMSSB-67/F3 udział mieszany (1 zabójca + 1 nie-zabójca = 1/2): ratio 0.75', () => {
  const board = (s) => {
    putSynthCreature(s, 'kill', 'p1', { power: 4, toughness: 5, mv: 4 });
    putSynthCreature(s, 'safe', 'p1', { power: 1, toughness: 1, mv: 1 });
  };
  const d = delta(board);
  assert.ok(Math.abs(d / PUSTY - 0.75) < 0.01, `ratio=${d / PUSTY}`);
});

test('PMSSB-67/F3 pokrętło ×1 (creatureKwLifelinkSurvivalFloor = 1): zabójca nie zmienia wartości (dawne zachowanie)', () => {
  const params = normalizeHeuristicParams({ creatureKwLifelinkSurvivalFloor: 1 });
  const d = delta(BOARDS.blokerDuzy, { params });
  assert.ok(Math.abs(d - PUSTY) < 0.01, `Δ=${d} pusty=${PUSTY}`);
});
