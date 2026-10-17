// PMSSB-64 (batch 68) — ewaluacja lustrzana: wycena z słowami kluczowymi (domyślne) vs baseline
// bez wagi słów (wszystkie creatureKw* = 0). Narzędzie OFFLINE, nie wchodzi do artefaktu.
// Uruchomienie: node tools/pmssb64-mirror.mjs [liczbaTalii=6] [seedy=40] [seedBase=3000]
// Wyniki (finalny model) w raporcie PMSSB-64: seedBase 3000 → 271 : 209; seedBase 5000 → patrz raport.
import { mirrorEval } from './mirror-eval.mjs';
import { BENCH_DECKS } from './benchmark.mjs';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const KW = ['creatureKwFlying', 'creatureKwFlyingFloor', 'creatureKwRefPower', 'creatureKwHaste',
  'creatureKwLifelinkWeight', 'creatureKwDeathtouch', 'creatureKwVigilance', 'creatureKwFirstStrike',
  'creatureKwDoubleStrike', 'creatureKwMenace', 'creatureKwTrample', 'creatureKwReach',
  'creatureKwIndestructible', 'creatureKwHexproof'];
// Baseline: brak wagi słów. Uwaga: płaski +3 za latanie usunięty w kodzie nie da się wyzerować
// parametrem — baseline jest więc „słowa nie liczone” z dolną granicą latania 0 (przybliżenie PRZED).
const zero = Object.fromEntries(KW.map((k) => [k, 0]));
const decksN = Number(process.argv[2] ?? 6);
const seeds = Number(process.argv[3] ?? 40);
const seedBase = Number(process.argv[4] ?? 3000);
const decks = BENCH_DECKS.slice(0, decksN);
const t = Date.now();
const r = mirrorEval({ paramsA: normalizeHeuristicParams(), paramsB: normalizeHeuristicParams(zero), decks, seedsCount: seeds, seedBase });
console.log(JSON.stringify({ decks, seeds, seedBase, ...r, sec: (Date.now() - t) / 1000 }));
