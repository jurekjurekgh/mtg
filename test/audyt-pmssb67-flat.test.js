// PMSSB-67 F4 (caveat PMSSB-64 pkt 1) — płaskie wagi 9 słów kluczowych zastąpione udziałem stanu.
// PRZED: Δ każdego słowa identyczne na każdym stole, przy każdej mocy i każdej ręce wroga.
// PO: floorShare(x) = creatureKwStateFloor + (1 − floor)·x; x = sygnał stanu (stół, ręka wroga, moc).
// Pomiar: tools/pmssb67-kw-sonda.mjs (F4). Pokrętło creatureKwStateFloor = 1 przywraca płaskie wagi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castScore } from '../tools/pmssb64-keywords-sonda.mjs';
import { BOARDS } from '../tools/pmssb67-kw-sonda.mjs';
import { normalizeHeuristicParams, DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const delta = (kw, board, params) => {
  const body = { power: 3, toughness: 3 };
  return castScore({ keywords: [kw], board, body, params })[0] - castScore({ keywords: [], board, body, params })[0];
};

// Stosunek Δ(stół) / Δ(pusty) — wartość stanu względem neutralnego stołu.
const ratio = (kw, board) => delta(kw, BOARDS[board]) / delta(kw, BOARDS.pusty);

test('PMSSB-67/F4 deathtouch: wróg, którego nie pokonujemy (4/5), podnosi wartość (×4/3)', () => {
  assert.ok(Math.abs(ratio('deathtouch', 'blokerDuzy') - (0.5 + 0.5 / 3) / 0.5) < 0.01, `r=${ratio('deathtouch', 'blokerDuzy')}`);
});

test('PMSSB-67/F4 vigilance: presja wroga (2 × 5/5 przy życiu 20) podnosi wartość', () => {
  assert.ok(ratio('vigilance', 'atakDuzy') > 1.2, `r=${ratio('vigilance', 'atakDuzy')}`);
});

test('PMSSB-67/F4 first_strike: wróg 3/3 (wygrywamy wymianę pierwszym ciosem) = pełna wartość (×2)', () => {
  assert.ok(Math.abs(ratio('first_strike', 'trojka') - 2) < 0.01, `r=${ratio('first_strike', 'trojka')}`);
});

test('PMSSB-67/F4 first_strike: wróg 4/5 (nie przegrywamy wymiany, nie wygrywamy) nie podnosi wartości', () => {
  assert.ok(Math.abs(ratio('first_strike', 'blokerDuzy') - 1) < 0.01, `r=${ratio('first_strike', 'blokerDuzy')}`);
});

test('PMSSB-67/F4 double_strike: bez wrogów pełna wartość; bloker 4/5 blokuje (sygnał połowiczny, ×0.5)', () => {
  assert.ok(Math.abs(ratio('double_strike', 'blokerDuzy') - 0.5) < 0.01, `r=${ratio('double_strike', 'blokerDuzy')}`);
  assert.ok(Math.abs(delta('double_strike', BOARDS.pusty) - DEFAULT_HEURISTIC_PARAMS.creatureKwDoubleStrike * 0.9 * 3 / 3) < 0.01);
});

test('PMSSB-67/F4 menace: dwóch blokerów zmniejsza wartość (×0.75), jeden lub zero = pełna', () => {
  assert.ok(Math.abs(ratio('menace', 'dwaBlokery') - 0.75) < 0.01, `r=${ratio('menace', 'dwaBlokery')}`);
  assert.ok(Math.abs(ratio('menace', 'blokerMaly') - 1) < 0.01, `r=${ratio('menace', 'blokerMaly')}`);
});

test('PMSSB-67/F4 trample: bloker 1/1 (nadwyżka 2 ponad blokera) podnosi wartość; bloker 4/5 (brak nadwyżki) nie', () => {
  assert.ok(ratio('trample', 'blokerMaly') > 1.2, `r=${ratio('trample', 'blokerMaly')}`);
  assert.ok(Math.abs(ratio('trample', 'blokerDuzy') - 1) < 0.01, `r=${ratio('trample', 'blokerDuzy')}`);
});

test('PMSSB-67/F4 reach: wrogi latający podnosi wartość (×2), bez latających — połowa', () => {
  assert.ok(Math.abs(ratio('reach', 'latajacy') - 2) < 0.01, `r=${ratio('reach', 'latajacy')}`);
});

test('PMSSB-67/F4 indestructible i hexproof: karty w ręce wroga podnoszą wartość (×2)', () => {
  assert.ok(Math.abs(ratio('indestructible', 'rekaP1') - 2) < 0.01, `r=${ratio('indestructible', 'rekaP1')}`);
  assert.ok(Math.abs(ratio('hexproof', 'rekaP1') - 2) < 0.01, `r=${ratio('hexproof', 'rekaP1')}`);
});

test('PMSSB-67/F4 pokrętło creatureKwStateFloor = 1: stan nie zmienia wartości (płaskie wagi wracają)', () => {
  const params = normalizeHeuristicParams({ creatureKwStateFloor: 1 });
  const d1 = delta('deathtouch', BOARDS.blokerDuzy, params);
  const d0 = delta('deathtouch', BOARDS.pusty, params);
  assert.ok(Math.abs(d1 - d0) < 0.01, `stół=${d1} pusty=${d0}`);
  assert.ok(Math.abs(d0 - DEFAULT_HEURISTIC_PARAMS.creatureKwDeathtouch * 0.9) < 0.01, `Δ=${d0}`);
});
