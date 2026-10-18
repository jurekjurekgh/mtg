// PMSSB-67/F5 — sonda POMIARU latania: próg dolny (creatureKwFlyingFloor) skalowany mocą.
// Δ = wynik(ciało z flying) − wynik(ciało vanilla) na TYM SAMYM stole, MV 4, życie 20.
// Stoły: pusty (bez latającego blokera), latajacy (wróg 2/2 z flying = blokuje latanie),
// blokerDuzy (wróg 4/5 bez latania), atakDuzy (dwa 5/5 — presja).
// Uruchomienie: node tools/pmssb67-prog-latania-sonda.mjs [--json]
import { BOARDS } from './pmssb67-kw-sonda.mjs';
import { castScore } from './pmssb64-keywords-sonda.mjs';

const POWERS = [0, 1, 2, 3, 4, 5];
const STOLY = ['pusty', 'latajacy', 'blokerDuzy', 'atakDuzy'];

export function measureLatanie(params = undefined) {
  const out = {};
  for (const power of POWERS) {
    for (const board of STOLY) {
      const body = { power, toughness: 3, mv: 4 };
      const vanilla = castScore({ keywords: [], board: BOARDS[board], body, params })[0];
      const flyer = castScore({ keywords: ['flying'], board: BOARDS[board], body, params })[0];
      out[`moc${power}|${board}`] = +(flyer - vanilla).toFixed(2);
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = measureLatanie();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    for (const [k, v] of Object.entries(r)) console.log('LAT', k.padEnd(22), v);
  }
}
