// PMSSB-63 (batch 68) — audyt wyceny pojedynczych kart: Raze to the Ground (dobranie warunkowe).
// Pomiar PRZED/PO: tools/pmssb63-batch68-karty-sonda.mjs (PRZED na HEAD przed poprawką: R2 = cast 80).
// Secure the Scene (S2) NIE jest tu pinowany: wynik OTWARTY (rodzina usuwania nie wycenia kosztu
// many czaru; patrz docs/audits/PMSSB63_BATCH68_2026-10-17.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARTY_SCENARIOS, runKartaScenario } from '../tools/pmssb63-batch68-karty-sonda.mjs';

const scen = (prefix) => KARTY_SCENARIOS.find((s) => s.id.startsWith(prefix));

test('PMSSB-63/R1 Raze MV1, biblioteka pełna: rzut (dobranie kartą warte)', () => {
  assert.equal(runKartaScenario(scen('R1')).ok, true);
});

test('PMSSB-63/R2 Raze MV1, biblioteka pusta: pass (dobranie z pustej talii przegrywa grę)', () => {
  assert.equal(runKartaScenario(scen('R2')).ok, true);
});

test('PMSSB-63/R3 Raze MV5, biblioteka pusta: rzut (cel bez dobierania, bez kary deck-outu)', () => {
  assert.equal(runKartaScenario(scen('R3')).ok, true);
});

test('PMSSB-63/R-kara: różnica wyniku pełna biblioteka − pusta = 126 = −(120 + drawCardValue 6) (strefa krytyczna)', async () => {
  const { bestCardScore, KARTY_SCENARIOS: all } = await import('../tools/pmssb63-batch68-karty-sonda.mjs');
  const { botTurn, putCard } = await import('../tools/pmssb63-batch68-sonda.mjs');
  const { addMana } = await import('../src/engine/resources.js');
  const sc = all.find((s) => s.id.startsWith('R1'));
  const build = (lib) => {
    const state = botTurn({ life: 20, libraryP2: lib, libraryP1: 30 });
    addMana(state, 'p2', 3, { colors: ['R'] });
    putCard(state, 'kar', 'raze-to-the-ground', 'p2', 'hand');
    sc.setup(state);
    return state;
  };
  const a = bestCardScore(build(30), 'kar').best;
  const b = bestCardScore(build(0), 'kar').best;
  assert.equal(Math.round((a - b) * 100) / 100, 126);
});

test('PMSSB-63/R-granica: biblioteka 4 (przed dobraniem 3 = strefa 1–3) kara −(60+6), biblioteka 5 bez kary', async () => {
  const { bestCardScore, KARTY_SCENARIOS: all } = await import('../tools/pmssb63-batch68-karty-sonda.mjs');
  const { botTurn, putCard } = await import('../tools/pmssb63-batch68-sonda.mjs');
  const { addMana } = await import('../src/engine/resources.js');
  const sc = all.find((s) => s.id.startsWith('R1'));
  const build = (lib) => {
    const state = botTurn({ life: 20, libraryP2: lib, libraryP1: 30 });
    addMana(state, 'p2', 3, { colors: ['R'] });
    putCard(state, 'kar', 'raze-to-the-ground', 'p2', 'hand');
    sc.setup(state);
    return state;
  };
  const full = bestCardScore(build(30), 'kar').best;
  const at4 = bestCardScore(build(4), 'kar').best; // po dobraniu zostaje 3 → strefa krytyczna
  const at5 = bestCardScore(build(5), 'kar').best; // po dobraniu zostaje 4 → brak kary
  assert.equal(Math.round((full - at5) * 100) / 100, 0, 'biblioteka 5 bez kary');
  assert.equal(Math.round((full - at4) * 100) / 100, 66, 'biblioteka 4: −(60 + 6)');
});
