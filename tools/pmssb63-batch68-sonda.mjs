// PMSSB-63 (batch 68) — sonda POMIARU PRZED / PO dla wyceny bota.
// Uruchomienie: node tools/pmssb63-batch68-sonda.mjs
// Każdy scenariusz opisuje, co dobry gracz zrobi na tym stole (oczekiwanie),
// a sonda pokazuje, co wybiera bot. Sonda NIE jest testem zachowania — to
// tabela do audytu; piny są w test/audyt-pmssb63-batch68.test.js.
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

export function botTurn({ life = 20, libraryP2 = 30, libraryP1 = 30 } = {}) {
  const state = createGameState({ seed: 68, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const p1 = state.players.find((p) => p.id === 'p1');
  const p2 = state.players.find((p) => p.id === 'p2');
  if (p1) p1.life = life;
  if (p2) p2.life = life;
  for (let i = 0; i < libraryP2; i += 1) {
    addObject(state, { id: `lib2-${i}`, instanceId: `lib2-${i}`, cardId: 'basic-swamp', controllerId: 'p2', ownerId: 'p2', zone: 'library', kind: 'land', types: ['Land'], abilities: [], keywords: [], subtypes: [], colors: [] });
  }
  for (let i = 0; i < libraryP1; i += 1) {
    addObject(state, { id: `lib1-${i}`, instanceId: `lib1-${i}`, cardId: 'basic-swamp', controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'land', types: ['Land'], abilities: [], keywords: [], subtypes: [], colors: [] });
  }
  return state;
}

/** Stawia kartę z rejestru (lub syntetyczny stwór/artefakt) na stole/ręce/cmentarzu. */
export function putCard(state, id, cardId, controllerId, zone, overrides = {}) {
  const def = REGISTRY.get(cardId);
  if (!def) throw new Error(`karta ${cardId} nieznana`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...overrides,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Syntetyczny stwór (bez karty w rejestrze): moc/wytrzymałość/MV podane wprost. */
export function putSynthCreature(state, id, controllerId, { power, toughness, mv = 2, keywords = [] }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synth-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', types: ['Creature'], subtypes: [], power, toughness, manaCost: mv,
    keywords, abilities: [], colors: [], spell: null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

export function putSynthNoncreature(state, id, controllerId, { types, mv = 2 }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synth-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: types[0].toLowerCase(), types, subtypes: [], manaCost: mv, power: 0, toughness: 0,
    keywords: [], abilities: [], colors: [], spell: null,
  });
  return state.objects.get(id);
}

export const choose = (state, params = undefined) => createHeuristicBot({ seed: 68, params }).chooseCommand(playerView(state, 'p2'), {});

/** Nazwa pary trybów Austere (kolejność chooseTwoModes). */
export const PAIR_NAME = ['art+ench', 'art+MV≤3', 'art+MV≥4', 'ench+MV≤3', 'ench+MV≥4', 'MV≤3+MV≥4'];

export const SCENARIOS = [
  {
    id: 'A-trzy-male-vs-jeden-duzy',
    opis: 'wróg: 3× 2/2 MV2; ja: 1× 5/5 MV5. Dobry gracz: rzuca, zabija trzy małe, zostawia swój 5/5.',
    oczekuje: (c) => c.type === 'cast_spell' && [1, 3].includes(c.modeIndex),
    setup(state) {
      putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
      putSynthCreature(state, 'f2', 'p1', { power: 2, toughness: 2, mv: 2 });
      putSynthCreature(state, 'f3', 'p1', { power: 2, toughness: 2, mv: 2 });
      putSynthCreature(state, 'mine', 'p2', { power: 5, toughness: 5, mv: 5 });
    },
  },
  {
    id: 'B-moj-tlum-vs-jeden-maly',
    opis: 'wróg: 1× 2/2 MV2; ja: 4× 3/3 MV3. Dobry gracz: NIE rzuca (zabiłby mój tłum).',
    oczekuje: (c) => c.type !== 'cast_spell',
    setup(state) {
      putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
      for (let i = 0; i < 4; i += 1) putSynthCreature(state, `m${i}`, 'p2', { power: 3, toughness: 3, mv: 3 });
    },
  },
  {
    id: 'C-duzy-wrog-maly-moj',
    opis: 'wróg: 1× 6/6 MV6; ja: 1× 1/1 MV1. Najlepsza para: tylko ≥4 (art+MV≥4 lub ench+MV≥4), NIE MV≤3+MV≥4 (zabiłaby też mojego 1/1).',
    oczekuje: (c) => c.type === 'cast_spell' && [2, 4].includes(c.modeIndex),
    setup(state) {
      putSynthCreature(state, 'f1', 'p1', { power: 6, toughness: 6, mv: 6 });
      putSynthCreature(state, 'mine', 'p2', { power: 1, toughness: 1, mv: 1 });
    },
  },
  {
    id: 'D-zagrozenie-zycie',
    opis: 'wróg: 3× 2/2 MV2 (atak 6), moje życie 4. Dobry gracz: rzuca — zabija zagrożenie.',
    oczekuje: (c) => c.type === 'cast_spell' && [1, 3].includes(c.modeIndex),
    life: 4,
    setup(state) {
      putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
      putSynthCreature(state, 'f2', 'p1', { power: 2, toughness: 2, mv: 2 });
      putSynthCreature(state, 'f3', 'p1', { power: 2, toughness: 2, mv: 2 });
    },
  },
  {
    id: 'E-artefakty-1-za-1',
    opis: 'wróg: artefakt MV5; ja: artefakt MV1. Tryby „artefakty” nie mają filtra MV, więc zabijają OBA. Wymiana 1 za 1 za 6 many = NIE rzucam (wartość 11 − 8.4 − koszt karty 6 < 0).',
    oczekuje: (c) => c.type !== 'cast_spell',
    setup(state) {
      putSynthNoncreature(state, 'fa', 'p1', { types: ['Artifact'], mv: 5 });
      putSynthNoncreature(state, 'ma', 'p2', { types: ['Artifact'], mv: 1 });
    },
  },
  {
    id: 'E2-artefakty-wroga-TMC',
    opis: 'wróg: 2 artefakty MV5 i MV4; ja: artefakt MV1. Wartość 11+10 − 8.4 = 12.6 > koszt karty 6 → RZUCAM (tryb artefaktów: art+cokolwiek).',
    oczekuje: (c) => c.type === 'cast_spell' && [0, 1, 2].includes(c.modeIndex),
    setup(state) {
      putSynthNoncreature(state, 'fa', 'p1', { types: ['Artifact'], mv: 5 });
      putSynthNoncreature(state, 'fb', 'p1', { types: ['Artifact'], mv: 4 });
      putSynthNoncreature(state, 'ma', 'p2', { types: ['Artifact'], mv: 1 });
    },
  },
  {
    id: 'F-material-nie-liczba',
    opis: 'wróg: 3× 1/1 MV1 (materiał 9); ja: 2× 3/3 MV3 (materiał 18). Dobry gracz: NIE rzuca — tracę więcej materiału, niż zabiję.',
    oczekuje: (c) => c.type !== 'cast_spell',
    setup(state) {
      for (let i = 0; i < 3; i += 1) putSynthCreature(state, `f${i}`, 'p1', { power: 1, toughness: 1, mv: 1 });
      putSynthCreature(state, 'm0', 'p2', { power: 3, toughness: 3, mv: 3 });
      putSynthCreature(state, 'm1', 'p2', { power: 3, toughness: 3, mv: 3 });
    },
  },
  {
    id: 'H-zycie-20-rownowaga',
    opis: 'wróg: 1× 3/3 MV3 (atak 3); ja: 1× 3/3 MV3; życie 20. Dobry gracz: NIE rzuca — wymiana 1 za 1 bez zagrożenia.',
    oczekuje: (c) => c.type !== 'cast_spell',
    life: 20,
    setup(state) {
      putSynthCreature(state, 'f1', 'p1', { power: 3, toughness: 3, mv: 3 });
      putSynthCreature(state, 'm0', 'p2', { power: 3, toughness: 3, mv: 3 });
    },
  },
  {
    id: 'H2-zycie-3-zagrozenie',
    opis: 'wróg: 2× 3/3 MV3 (atak 6); ja: 1× 3/3 MV3 (jeden blok); życie 3. Dobry gracz: RZUCA — jeden nieblokowany atak mnie zabija.',
    oczekuje: (c) => c.type === 'cast_spell' && [1, 3].includes(c.modeIndex),
    life: 3,
    setup(state) {
      putSynthCreature(state, 'f1', 'p1', { power: 3, toughness: 3, mv: 3 });
      putSynthCreature(state, 'f2', 'p1', { power: 3, toughness: 3, mv: 3 });
      putSynthCreature(state, 'm0', 'p2', { power: 3, toughness: 3, mv: 3 });
    },
  },
];

export function runScenario(sc, params = undefined) {
  const state = botTurn({ life: sc.life ?? 20 });
  addMana(state, 'p2', 6, { colors: ['W'] });
  putCard(state, 'aus', 'austere-command', 'p2', 'hand');
  sc.setup(state);
  const c = choose(state, params);
  return {
    id: sc.id,
    wybor: c.type === 'cast_spell' ? `cast ${PAIR_NAME[c.modeIndex] ?? c.modeIndex}` : c.type,
    ok: sc.oczekuje(c),
    opis: sc.opis,
  };
}

// Uruchomienie bezpośrednie: tabela PRZED/PO.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const sc of SCENARIOS) {
    const r = runScenario(sc);
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(30)} bot: ${r.wybor}`);
  }
}
