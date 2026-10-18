// PMSSB-67 F1 (caveat PMSSB-64 pkt 4) — brak pinu na MASS_EVASION_KEYWORDS.
// Lista (heuristic-bot.js) dodaje massDestroyEvasionBonus do wartości niszczonego permanentu.
// Literówka 'first strike' (PMSSB-63) cicho wyłączała first_strike z tej wyceny — pin łapie taką regresję.
// Pomiar: tools/pmssb67-kw-sonda.mjs (measureF1). PRZED: lista → Δ 4 na każde z 6 słów; spoza listy → 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { austereMax, F1_KEYWORDS } from '../tools/pmssb67-kw-sonda.mjs';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const LISTA = ['flying', 'reach', 'deathtouch', 'lifelink', 'first_strike', 'double_strike'];
const SPOZA = F1_KEYWORDS.filter((k) => !LISTA.includes(k));
const BONUS = DEFAULT_HEURISTIC_PARAMS.massDestroyEvasionBonus;

const van = austereMax([]);

for (const kw of LISTA) {
  test(`PMSSB-67/F1 ${kw} (lista MASS_EVASION) podnosi wycenę masowego zniszczenia o massDestroyEvasionBonus`, () => {
    const d = austereMax([kw]) - van;
    assert.ok(Math.abs(d - BONUS) < 0.01, `Δ(${kw})=${d} oczekiwano ${BONUS}`);
  });
}

for (const kw of SPOZA) {
  test(`PMSSB-67/F1 ${kw} (spoza listy) NIE zmienia wyceny masowego zniszczenia (anty-over-fix)`, () => {
    const d = austereMax([kw]) - van;
    assert.ok(Math.abs(d) < 0.01, `Δ(${kw})=${d} oczekiwano 0`);
  });
}
