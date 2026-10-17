// PMSSB-67/F5 (decyzja właściciela 2026-10-18: „skalować próg do mocy") — dolna granica latania
// skalowana mocą. PRZED: płaskie 3 w gałęzi zablokowanej (Δ 2.7 dla każdej mocy), a w gałęzi odblokowanej
// próg martwy (8·moc/3 > 3 od mocy 2). PO: próg = creatureKwFlyingFloor · moc/creatureKwRefPower.
// Pomiar: tools/pmssb67-prog-latania-sonda.mjs. Pokrętło creatureKwFlyingFloorScaled = 0 przywraca PRZED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castScore } from '../tools/pmssb64-keywords-sonda.mjs';
import { BOARDS } from '../tools/pmssb67-kw-sonda.mjs';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const TOL = 0.05;
// Δ = wynik(latanie) − wynik(vanilla) na tym samym stole, MV 4 (jak sonda).
const delta = (power, board, params) => {
  const body = { power, toughness: 3, mv: 4 };
  return castScore({ keywords: ['flying'], board, body, params })[0]
    - castScore({ keywords: [], board, body, params })[0];
};
const blisko = (a, b) => Math.abs(a - b) <= TOL;

test('F5: zablokowany lot (wróg z flying) skaluje się mocą: moc 0 → 0, moc 3 → 2.7 (bez zmian), moc 5 → 4.5', () => {
  assert.ok(blisko(delta(0, BOARDS.latajacy), 0), `moc 0: ${delta(0, BOARDS.latajacy)}`);
  assert.ok(blisko(delta(1, BOARDS.latajacy), 0.9), `moc 1: ${delta(1, BOARDS.latajacy)}`);
  assert.ok(blisko(delta(3, BOARDS.latajacy), 2.7), `moc 3 (kotwica bez zmian): ${delta(3, BOARDS.latajacy)}`);
  assert.ok(blisko(delta(5, BOARDS.latajacy), 4.5), `moc 5: ${delta(5, BOARDS.latajacy)}`);
});

test('F5: odblokowany lot: moc 0 → 0 (brak obrażeń), moc 1 → 2.4 (8·1/3·0.9), moc 3 → 7.2 (bez zmian)', () => {
  assert.ok(blisko(delta(0, BOARDS.pusty), 0), `moc 0: ${delta(0, BOARDS.pusty)}`);
  assert.ok(blisko(delta(1, BOARDS.pusty), 2.4), `moc 1: ${delta(1, BOARDS.pusty)}`);
  assert.ok(blisko(delta(3, BOARDS.pusty), 7.2), `moc 3: ${delta(3, BOARDS.pusty)}`);
});

test('F5 anty-inwersja: dla każdej mocy przepuszczony lot ≥ zablokowany; zablokowany rośnie z mocą', () => {
  let prev = -Infinity;
  for (const p of [0, 1, 2, 3, 4, 5]) {
    const open = delta(p, BOARDS.pusty);
    const blocked = delta(p, BOARDS.latajacy);
    assert.ok(open + TOL >= blocked, `moc ${p}: przepuszczony ${open} < zablokowany ${blocked}`);
    assert.ok(blocked + TOL >= prev, `moc ${p}: zablokowany ${blocked} spadł względem ${prev}`);
    prev = blocked;
  }
});

test('F5 pokrętło creatureKwFlyingFloorScaled = 0 przywraca płaski próg 3 (PRZED)', () => {
  const params = normalizeHeuristicParams({ creatureKwFlyingFloorScaled: 0 });
  assert.ok(blisko(delta(0, BOARDS.latajacy, params), 2.7), `moc 0 zablokowany: ${delta(0, BOARDS.latajacy, params)}`);
  assert.ok(blisko(delta(5, BOARDS.latajacy, params), 2.7), `moc 5 zablokowany: ${delta(5, BOARDS.latajacy, params)}`);
  assert.ok(blisko(delta(0, BOARDS.pusty, params), 2.7), `moc 0 odblokowany: ${delta(0, BOARDS.pusty, params)}`);
});
