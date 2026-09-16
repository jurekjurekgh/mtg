// Srebrny audyt kosztów v4: MANA_COSTS vs snapshoty (mana_cost) + parse'owalność.
import fs from 'node:fs';
import { createCardRegistry } from './src/cards/card-data.js';
import { MANA_COSTS } from './src/cards/mana-costs-data.js';
import { parseManaCost } from './src/engine/mana-cost.js';

const REGISTRY = createCardRegistry();
const snaps = {};
for (const f of fs.readdirSync('docs/cards')) {
  if (!f.startsWith('scryfall-') || !f.endsWith('.json')) continue;
  snaps[f.slice('scryfall-'.length, -'.json'.length)] = JSON.parse(fs.readFileSync('docs/cards/' + f, 'utf8'));
}
const canon = (s) => String(s ?? '').replace(/\s+/g, '');
let checked = 0;
const problems = [];
for (const card of REGISTRY.all()) {
  if (card.support?.status !== 'supported') continue;
  const snap = snaps[card.id];
  if (!snap || snap.card_faces) continue; // DFC osobno
  const want = snap.mana_cost ?? '';
  const got = MANA_COSTS[card.id];
  if (got == null) { problems.push(`${card.id}: brak wpisu MANA_COSTS (Oracle ${want})`); continue; }
  checked += 1;
  if (canon(got) !== canon(want)) {
    // X w koszcie: silnik koduje X jako...? pokaż oba.
    problems.push(`${card.id}: MANA_COSTS=${got} vs Oracle=${want}`);
  }
  try { parseManaCost(got); } catch (e) { problems.push(`${card.id}: nieparsowalny ${got}: ${e.message}`); }
}
console.log('checked:', checked);
console.log('problems:', problems.length);
for (const p of problems.slice(0, 40)) console.log('  ' + p);
