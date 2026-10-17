// PMSSB-67 (caveaty PMSSB-64) — sonda POMIARU PRZED / PO dla wyceny słów kluczowych ciała.
// F2: Necrosquito (0/0, wchodzi z 2 licznikami oil = 2/2) wyceniany mocą z karty (0).
// F3: lifelink nie zależy od tego, czy ciało przeżyje walkę (blokery, atakujący).
// F4: płaskie wagi deathtouch/vigilance/first_strike/double_strike/menace/trample/reach/
//     indestructible/hexproof — brak zależności od stołu, ręki i mocy.
// Uruchomienie: node tools/pmssb67-kw-sonda.mjs [--json]
import { playerView, addObject } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { botTurn, putCard, putSynthCreature } from './pmssb63-batch68-sonda.mjs';
import { castScore } from './pmssb64-keywords-sonda.mjs';

// --- stoły ---------------------------------------------------------------------------
export const BOARDS = {
  pusty: () => {},
  blokerDuzy: (s) => putSynthCreature(s, 'eb', 'p1', { power: 4, toughness: 5, mv: 4 }),
  blokerMaly: (s) => putSynthCreature(s, 'em', 'p1', { power: 1, toughness: 1, mv: 1 }),
  dwaBlokery: (s) => {
    putSynthCreature(s, 'e1', 'p1', { power: 2, toughness: 2, mv: 2 });
    putSynthCreature(s, 'e2', 'p1', { power: 2, toughness: 2, mv: 2 });
  },
  latajacy: (s) => putSynthCreature(s, 'ef', 'p1', { power: 2, toughness: 2, mv: 2, keywords: ['flying'] }),
  atakDuzy: (s) => {
    putSynthCreature(s, 'a1', 'p1', { power: 5, toughness: 5, mv: 5 });
    putSynthCreature(s, 'a2', 'p1', { power: 5, toughness: 5, mv: 5 });
  },
  rekaP1: (s) => addHand(s, 'p1', 3),
};

/** Karty w ręce przeciwnika (p1): sygnał zagrożenia usunięciem (hexproof, indestructible). */
function addHand(state, owner, n) {
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `h${owner}-${i}`, instanceId: `i-h${owner}-${i}`, cardId: `synth-hand-${i}`,
      controllerId: owner, ownerId: owner, zone: 'hand', kind: 'instant', types: ['Instant'],
      manaCost: 2, spell: null, abilities: [], keywords: [], colors: [],
    });
  }
}

/** Wynik rzutu prawdziwej karty z rejestru (Necrosquito) przy danym stole. */
export function realCastScore(cardId, { mana = 4, colors = ['B'], board = () => {}, life = 20 } = {}) {
  const state = botTurn({ life });
  addMana(state, 'p2', mana, { colors });
  putCard(state, 'x', cardId, 'p2', 'hand');
  board(state);
  const bot = createHeuristicBot({ seed: 68 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const entry = bot.trace().at(-1);
  return (entry?.options ?? []).filter((o) => o?.cmd?.startsWith('cast_permanent(x')).map((o) => o.score);
}

const score = (opts) => castScore(opts)[0];

// --- F4: płaskie wagi słów ----------------------------------------------------------
const FLAT = ['deathtouch', 'vigilance', 'first_strike', 'double_strike', 'menace', 'trample', 'reach', 'indestructible', 'hexproof'];
export const F4_BOARDS = ['pusty', 'blokerDuzy', 'blokerMaly', 'dwaBlokery', 'latajacy', 'atakDuzy', 'rekaP1'];

// --- F3: lifelink -------------------------------------------------------------------
export const F3_BOARDS = ['pusty', 'blokerDuzy', 'blokerMaly', 'atakDuzy'];

export function measure() {
  const out = { f4: {}, f3: {}, f2: {} };
  // F4: Δ = wynik(słowo) − wynik(vanilla) na TYM SAMYM stole, moc 3 i moc 1.
  for (const power of [3, 1]) {
    for (const kw of FLAT) {
      for (const board of F4_BOARDS) {
        const base = score({ keywords: [], board: BOARDS[board], body: { power, toughness: 3 } });
        const withKw = score({ keywords: [kw], board: BOARDS[board], body: { power, toughness: 3 } });
        out.f4[`${kw}|moc${power}|${board}`] = +(withKw - base).toFixed(2);
      }
    }
  }
  // F3: lifelink moc 3, życie 20 i 4, Δ względem vanilli na tym samym stole.
  for (const life of [20, 4]) {
    for (const board of F3_BOARDS) {
      const base = score({ keywords: [], board: BOARDS[board], life, body: { power: 3, toughness: 3 } });
      const ll = score({ keywords: ['lifelink'], board: BOARDS[board], life, body: { power: 3, toughness: 3 } });
      out.f3[`lifelink|zycie${life}|${board}`] = +(ll - base).toFixed(2);
    }
  }
  // F2: Necrosquito (prawdziwa karta) kontra syntetyczny 2/2 latający i 2/2 vanilla, MV 4.
  const necro = realCastScore('necrosquito', { board: BOARDS.pusty })[0];
  const flyer2 = score({ keywords: ['flying'], board: BOARDS.pusty, body: { power: 2, toughness: 2, mv: 4 } });
  const van2 = score({ keywords: [], board: BOARDS.pusty, body: { power: 2, toughness: 2, mv: 4 } });
  out.f2 = { necrosquito: +necro.toFixed(2), latajacy2na2: +flyer2.toFixed(2), vanilla2na2: +van2.toFixed(2) };
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = measure();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('F2', r.f2);
    for (const [k, v] of Object.entries(r.f3)) console.log('F3', k.padEnd(40), v);
    for (const [k, v] of Object.entries(r.f4)) console.log('F4', k.padEnd(40), v);
  }
}
