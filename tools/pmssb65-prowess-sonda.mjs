// PMSSB-65 (batch 68) — sonda POMIARU PRZED / PO: prowess Bloodfire Experta w rzucie stworzenia.
// Problem: Bloodfire Expert (3/1, {2}{R}) ma wyzwalacz `you_cast_noncreature_spell` → pump +1/+1 do
// końca tury. Rzut z ręki nie wycenia tego wyzwalacza (PRZED: 67.05 z i bez zdolności).
// Uruchomienie: node tools/pmssb65-prowess-sonda.mjs
import { playerView, addObject } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { botTurn, putSynthCreature } from './pmssb63-batch68-sonda.mjs';

const REAL = createCardRegistry();

/** Rejestr z podmienioną definicją `cardId` (np. Bloodfire bez zdolności — wariant kontrolny). */
function registryWith(cardId, def) {
  return { ...REAL, get: (id) => (id === cardId ? def : REAL.get(id)), has: (id) => id === cardId || REAL.has(id) };
}

/**
 * Wyniki rzutu `cardId` z ręki (cast_permanent) przy zadanych nieziemskich kartach w ręce
 * (`handSpells`: id czarów nie-stworzeń, np. 'shock') i stole (`board`).
 */
export function prowessScore({ cardId = 'bloodfire-expert', noAbility = false, handSpells = [], life = 20, board = () => {}, lands = 4, params = undefined }) {
  const state = botTurn({ life });
  // Pula = mana na TEN rzut. Budżet many NASTĘPNEJ tury = lądy pod kontrolą (pula się czyści),
  // więc lądy idą na stół jako prawdziwe definicje `basic-forest`.
  addMana(state, 'p2', 4, { colors: ['R'] });
  const landDef = gameObjectDataOf(REAL.get('basic-forest'));
  for (let i = 0; i < lands; i++) {
    addObject(state, { id: `l${i}`, instanceId: `i-l${i}`, cardId: 'basic-forest', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'land', types: ['Land'], subtypes: [], colors: ['G'], abilities: landDef.abilities ?? [], keywords: [] });
  }
  const realDef = REAL.get(cardId);
  const def = noAbility ? { ...realDef, abilities: [] } : realDef;
  const registry = noAbility ? registryWith(cardId, def) : REAL;
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'x', instanceId: 'i-x', cardId, controllerId: 'p2', ownerId: 'p2', zone: 'hand',
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: [...(def.keywords ?? [])],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  handSpells.forEach((sid, i) => {
    const sd = REAL.get(sid);
    const sdata = gameObjectDataOf(sd);
    addObject(state, {
      id: `s${i}`, instanceId: `i-s${i}`, cardId: sid, controllerId: 'p2', ownerId: 'p2', zone: 'hand',
      kind: sdata.kind, manaCost: sdata.manaCost, spell: sdata.spell, abilities: sdata.abilities ?? [],
      keywords: [], subtypes: sd.subtypes ?? [], types: sd.types ?? [], colors: sdata.colors ?? [],
    });
  });
  board(state);
  const bot = createHeuristicBot({ seed: 68, registry, params });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const entry = bot.trace().at(-1);
  return (entry?.options ?? []).filter((o) => o?.cmd?.startsWith('cast_permanent(x')).map((o) => o.score);
}

export { putSynthCreature };

const enemyBody = (s) => putSynthCreature(s, 'ev', 'p1', { power: 2, toughness: 2, mv: 2 });

export const PROWESS_SCENARIOS = [
  { id: 'PR1-jeden-czar-w-rece', opis: 'jeden czar nie-stworzenia w ręce (lądy 4): prowess ma wartość > 0 (jeden pump w pierwszym oknie)',
    a: { handSpells: ['shock'] }, b: { noAbility: true, handSpells: ['shock'] }, oczekuje: (a, b) => a > b },
  { id: 'PR2-wiecej-czarow-wyzej', opis: 'dwa czary zamiast jednego = dwa pumpy = wyższa wartość (stan, nie płaska stała)',
    a: { handSpells: ['shock', 'shock'] }, b: { handSpells: ['shock'] }, oczekuje: (a, b) => a > b },
  { id: 'PR3-bez-czarow-zero', opis: 'brak czarów nie-stworzeń w ręce: prowess nie ma na co zadziałać → Δ 0 (płaska wersja dawała 1.35)',
    a: { handSpells: [] }, b: { noAbility: true, handSpells: [] }, oczekuje: (a, b) => a === b },
  { id: 'PR4-antioverfix-bez-zdolnosci-bez-zmian', opis: 'wariant kontrolny: bez wyzwalacza czary w ręce nie zmieniają wyniku',
    a: { noAbility: true, handSpells: ['shock', 'shock'] }, b: { noAbility: true, handSpells: [] }, oczekuje: (a, b) => a === b },
  { id: 'PR5-brak-lądow-brak-budzetu', opis: 'zero lądów na stole: czary w ręce nie są zagrywalne w następnej turze → Δ 0 (budżet many)',
    a: { handSpells: ['shock', 'shock'], lands: 0 }, b: { noAbility: true, handSpells: ['shock', 'shock'], lands: 0 }, oczekuje: (a, b) => a === b },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const sc of PROWESS_SCENARIOS) {
    const a = prowessScore({ ...sc.a })[0];
    const b = prowessScore({ ...sc.b })[0];
    const ok = a != null && b != null && sc.oczekuje(a, b);
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${sc.id.padEnd(46)} a=${a?.toFixed(2)} b=${b?.toFixed(2)} Δ=${(a - b).toFixed(2)}`);
  }
}
