// PMSSB-68 (amass) — sonda POMIARU PRZED / PO dla wyceny bota.
// Uruchomienie: node tools/pmssb68-amass-sonda.mjs
//
// Rodzina: `amass` (CR 701.47) — dwie karty w katalogu, obie ścieżki:
//   * Dunland Crebain (ETB: amass Orcs 2) — wycena ETB = stała 6 (ETB_EFFECT_BONUS),
//   * Toll of the Invasion (czar: amass Zombies 1) — wycena cast = 6 + 3·N (stała bez armii).
// Pytanie właściciela-procedury (L41): czy wycena zależy od tego, co już mam na stole
// (armia do podrośnięcia vs nowa armia) i czy ścieżki ETB/cast liczą to samo?
//
// Sonda NIE jest testem zachowania — to tabela do audytu; piny są w
// test/audyt-pmssb68-amass.test.js.
import { addObject, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { botTurn, putCard, putSynthCreature } from './pmssb63-batch68-sonda.mjs';

/** Armia (Army) kontrolera p2 — zwykły stwór z podtypem Army, bez karty w rejestrze. */
export function putArmy(state, id, { power, toughness }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synth-${id}`, controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    kind: 'creature', types: ['Creature'], subtypes: ['Army'], power, toughness, manaCost: 0,
    keywords: [], abilities: [], colors: ['B'], spell: null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Wynik najlepszej opcji o podanym prefiksie `cmd` (np. `cast_permanent(dun)`) z trace. */
export function scoreOf(bot, prefix) {
  const opts = bot.trace().at(-1)?.options ?? [];
  const hit = opts.filter((o) => o?.cmd?.startsWith(prefix)).map((o) => o.score);
  return hit.length ? Math.max(...hit) : null;
}

/** Stół: bot p2 w swojej głównej, 6 many, ręka = karta z amass, wróg z jedną kartą w ręce. */
export function table({ card, army = null }) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', 6, { colors: ['B', 'R', 'G', 'W', 'U'] });
  putCard(state, 'x', card, 'p2', 'hand');
  putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
  if (army) putArmy(state, 'army', army);
  return state;
}

/** Wynik kandydata na czar (cast/permanent) przy danym stole. */
export function probe({ card, army = null, prefix }) {
  const state = table({ card, army });
  const bot = createHeuristicBot({ seed: 68 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  return scoreOf(bot, prefix);
}

export const VARIANTS = [
  { id: 'brak-armii', army: null },
  { id: 'armia-1/1', army: { power: 1, toughness: 1 } },
  { id: 'armia-3/3', army: { power: 3, toughness: 3 } },
];

export const CARDS = [
  { id: 'dunland-crebain', label: 'Dunland Crebain (ETB amass 2)', prefix: 'cast_permanent(x)' },
  { id: 'toll-of-the-invasion', label: 'Toll of the Invasion (cast amass 1)', prefix: 'cast_spell(x' },
];

// Uruchomienie bezpośrednie: tabela PRZED/PO.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const card of CARDS) {
    const row = VARIANTS.map((v) => {
      const s = probe({ card: card.id, army: v.army, prefix: card.prefix });
      return `${v.id}=${s === null ? 'brak' : s.toFixed(4)}`;
    });
    console.log(`${card.label.padEnd(34)} ${row.join('  ')}`);
  }
}
