// PMSSB-66 (batch 68) — ewaluacja lustrzana „okno many włączone vs wyłączone” (pokrętło
// `lastingManaWindowOn` 1 vs 0). Talie z kartami tej mechaniki (Halo Scarab, Austere, Kulrath),
// bo domyślny BENCH_DECKS prawie ich nie ma i lustro nic by nie zmierzyło. Narzędzie OFFLINE.
// Uruchomienie: node tools/pmssb66-mirror.mjs [seedy=40] [seedBase=3000]
// Wynik → raport PMSSB-66 (docs/audits/PMSSB66_BATCH68_2026-10-17.md).
import { mirrorEval } from './mirror-eval.mjs';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const DECKS = ['worek-mroczny', 'worek-legend', 'lorwyn', 'mirrodin-brg'];
const seeds = Number(process.argv[2] ?? 40);
const seedBase = Number(process.argv[3] ?? 3000);
const t = Date.now();
const r = mirrorEval({
  paramsA: normalizeHeuristicParams(),
  paramsB: normalizeHeuristicParams({ lastingManaWindowOn: 0 }),
  decks: DECKS,
  seedsCount: seeds,
  seedBase,
});
console.log(JSON.stringify({ decks: DECKS, seeds, seedBase, ...r, sec: (Date.now() - t) / 1000 }));
