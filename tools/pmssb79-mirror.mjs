// PMSSB-79 (batch 70) — ewaluacja lustrzana czterech NAPRAWIONYCH wymiarów:
//   1. Converge            convergeDamagePerColor 1 vs 0
//   2. manifest dread      manifestDreadTriggerValue 4 vs 0
//   3. licznik z cmentarza graveyardCounterWeight 1 vs 0
//   4. ewazja po typie     brak pokrętła → porównanie kodu (patrz docs/PMSSB.md,
//      wymiar nie ma knobu, bo jest FILTREM poprawności, nie dopłatą heurystyczną)
// Talie z kartami batcha 70 (Kaleidoscorch = mh2, Paranormal Analyst = dsk,
// Moldgraf Millipede = vow). Narzędzie OFFLINE.
// Uruchomienie: node tools/pmssb79-mirror.mjs [seedy=40] [seedBase=3000]
import { mirrorEval } from './mirror-eval.mjs';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const seeds = Number(process.argv[2] ?? 40);
const seedBase = Number(process.argv[3] ?? 3000);

// Talie celowo z kartami danej mechaniki (sprawdzone grepem w decks/*.txt) —
// na taliach bez tych kart lustro mierzy szum (wynik 50/50 bez rozstrzygnięcia).
const KNOBS = [
  ['converge', { convergeDamagePerColor: 0 }, ['worek-legend', 'alara', 'eldraine']],
  ['manifest-dread', { manifestDreadTriggerValue: 0 }, ['worek-dziki', 'innistrad-brg', 'eldraine']],
  ['licznik-z-cmentarza', { graveyardCounterWeight: 0 }, ['innistrad-brg', 'worek-dziki', 'alara']],
];

const out = { seeds, seedBase, pomiary: {} };
for (const [nazwa, off, DECKS] of KNOBS) {
  const t = Date.now();
  const r = mirrorEval({
    paramsA: normalizeHeuristicParams(),
    paramsB: normalizeHeuristicParams(off),
    decks: DECKS,
    seedsCount: seeds,
    seedBase,
  });
  out.pomiary[nazwa] = { decks: DECKS, ...r, sec: (Date.now() - t) / 1000 };
}
console.log(JSON.stringify(out));
