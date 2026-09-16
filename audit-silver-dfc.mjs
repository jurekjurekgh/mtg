// Srebrny audyt danych v3: tylne strony DFC + przygody vs snapshoty (card_faces).
import fs from 'node:fs';
import { createCardRegistry } from './src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const snaps = {};
for (const f of fs.readdirSync('docs/cards')) {
  if (!f.startsWith('scryfall-') || !f.endsWith('.json')) continue;
  snaps[f.slice('scryfall-'.length, -'.json'.length)] = JSON.parse(fs.readFileSync('docs/cards/' + f, 'utf8'));
}
const norm = (s) => String(s ?? '').toLowerCase().replace(/’/g, "'");
const problems = [];
for (const card of REGISTRY.all()) {
  const snap = snaps[card.id];
  if (!snap?.card_faces || snap.card_faces.length < 2) continue;
  const backs = [];
  if (card.transformTo) backs.push(['transformTo', card.transformTo]);
  if (card.adventure) backs.push(['adventure', card.adventure]);
  if (backs.length === 0) continue;
  const face = snap.card_faces[1];
  console.log(`--- ${card.id}: back face Oracle: ${face.name} | ${face.mana_cost} | ${face.type_line} | ${face.power}/${face.toughness} | colors=${JSON.stringify(face.colors)}`);
  for (const [kind, back] of backs) {
    const got = back.cardId ? REGISTRY.get(back.cardId) : back;
    if (!got) { problems.push(`${card.id}: ${kind} wskazuje ${back.cardId} spoza rejestru`); continue; }
    console.log(`    dane [${kind}]: types=${JSON.stringify(got.types)} subtypes=${JSON.stringify(got.subtypes)} colors=${JSON.stringify(got.colors)} P/T=${got.power}/${got.toughness} manaCost=${got.manaCost}`);
  }
}
console.log('problems:', problems.length);
for (const p of problems) console.log('  ' + p);
