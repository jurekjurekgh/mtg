// Srebrny audyt danych: card-data vs snapshoty Scryfall (docs/cards/*.json).
import fs from 'node:fs';
import { createCardRegistry } from './src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const snaps = {};
for (const f of fs.readdirSync('docs/cards')) {
  if (!f.startsWith('scryfall-') || !f.endsWith('.json')) continue;
  const j = JSON.parse(fs.readFileSync('docs/cards/' + f, 'utf8'));
  const id = f.slice('scryfall-'.length, -'.json'.length);
  snaps[id] = j;
}
console.log('snapshots:', Object.keys(snaps).length);

const norm = (s) => String(s ?? '').toLowerCase().replace(/’/g, "'");
let checked = 0;
const miss = { types: [], cmc: [], pt: [], colors: [], subtype: [] };
for (const card of REGISTRY.all()) {
  if (card.support?.status !== 'supported') continue;
  const snap = snaps[card.id];
  if (!snap) continue;
  checked += 1;
  // 1. typy: lewa strona type_line (przed —), tokeny pomijamy (brak snapshotów i tak)
  const left = String(snap.type_line ?? '').split('—')[0].trim().split(/\s+/);
  for (const t of left) {
    if (['Legendary', 'Basic', 'Snow', 'Token'].includes(t)) continue;
    if (!(card.types ?? []).some((x) => x.toLowerCase() === t.toLowerCase())) {
      miss.types.push(`${card.id}: brak typu ${t} (snapshot: ${snap.type_line})`);
    }
  }
  // odwrotnie: typy karty spoza snapshotu (poza Vehicle/Spacecraft z podtypami? nie — typy główne)
  for (const t of (card.types ?? [])) {
    if (!left.some((x) => x.toLowerCase() === String(t).toLowerCase())) {
      miss.types.push(`${card.id}: nadmiar typu ${t} (snapshot: ${snap.type_line})`);
    }
  }
  // 2. cmc vs manaCost (X w koszcie = 0 w cmc; sprawdzamy MANA_COSTS? tu tylko manaCost)
  if (card.manaCost != null && snap.cmc != null && Number(card.manaCost) !== Number(snap.cmc)) {
    miss.cmc.push(`${card.id}: manaCost=${card.manaCost} vs cmc=${snap.cmc} (${snap.mana_cost})`);
  }
  // 3. P/T (pomijamy */*)
  if (card.power != null && snap.power != null && !String(snap.power).includes('*')) {
    if (Number(card.power) !== Number(snap.power) || Number(card.toughness) !== Number(snap.toughness)) {
      miss.pt.push(`${card.id}: ${card.power}/${card.toughness} vs ${snap.power}/${snap.toughness}`);
    }
  }
  // 4. kolory (devoid = [] poprawne!)
  const want = [...(snap.colors ?? [])].sort().join('');
  const got = [...(card.colors ?? [])].sort().join('');
  if (want !== got) miss.colors.push(`${card.id}: colors=${JSON.stringify(card.colors)} vs ${JSON.stringify(snap.colors)} (${snap.mana_cost})`);
  // 5. podtypy: prawa strona type_line
  const right = String(snap.type_line ?? '').split('—')[1];
  if (right) {
    const subs = right.trim().split(/\s+/);
    for (const s of subs) {
      if (s === '*') continue;
      if (!(card.subtypes ?? []).some((x) => norm(x) === norm(s))) {
        miss.subtype.push(`${card.id}: brak podtypu ${s} (snapshot: ${snap.type_line})`);
      }
    }
  }
}
console.log('checked:', checked);
for (const [k, v] of Object.entries(miss)) {
  console.log(`--- ${k}: ${v.length}`);
  for (const m of v.slice(0, 25)) console.log('  ' + m);
}
