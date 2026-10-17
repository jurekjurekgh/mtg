// PMSSB-63 (batch 68) — sonda POMIARU PRZED / PO dla rodzin kart batcha 68, które nie miały
// jeszcze własnej sesji PMSSB: Secure the Scene, Stymied Hopes, Kulrath Zealot (ETB + landcycling),
// Bloodfire Expert (prowess), Meteorite, Child of Night (lifelink), Neurok Invisimancer, Halo Scarab.
// Uruchomienie: node tools/pmssb63-batch68-audyt-sonda.mjs
// Każdy scenariusz: co DOBRY GRACZ zrobi na tym stole (opis + oczekiwanie), co wybiera bot,
// i najlepszy wynik wariantów danej karty z trace (do pinów liczbowych).
import { playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import {
  botTurn, putCard, putSynthCreature, putSynthNoncreature,
} from './pmssb63-batch68-sonda.mjs';

/** Wynik z trace dla wariantów danego obiektu (prefiks komendy). */
export function bestOf(bot, prefix) {
  const entry = bot.trace().at(-1);
  const scores = (entry?.options ?? []).filter((o) => o?.cmd?.startsWith(prefix)).map((o) => o.score);
  return scores.length ? Math.max(...scores) : null;
}

export function decideWith(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 68, params });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  return { choice, bot };
}

const TURN_SETUP = (life = 20) => botTurn({ life, libraryP2: 30, libraryP1: 30 });

export const AUDYT_SCENARIOS = [
  // ---------------- Secure the Scene (M21 35): {4}{W} sorcery, wygnaj nie-ziemię, kontroler celu dostaje 1/1
  {
    id: 'SEC1-duzy-wrog', fam: 'secure', obj: 'kar', card: 'secure-the-scene', mana: ['W', 5],
    opis: 'wróg 5/5 MV5 sam na stole. Dobry gracz RZUCA: wygnanie 5/5 za token 1/1 to realna poprawa.',
    setup(s) { putSynthCreature(s, 'f1', 'p1', { power: 5, toughness: 5, mv: 5 }); },
    oczekuje: (c) => c.type === 'cast_spell',
  },
  {
    id: 'SEC2-maly-wrog', fam: 'secure', obj: 'kar', card: 'secure-the-scene', mana: ['W', 5],
    opis: 'wróg 1/1 MV1 sam. Dobry gracz NIE rzuca: wygnanie 1/1 daje wrogowi 1/1 (wymiana zerowa), 5 many za nic.',
    setup(s) { putSynthCreature(s, 'f1', 'p1', { power: 1, toughness: 1, mv: 1 }); },
    oczekuje: (c) => c.type !== 'cast_spell',
  },
  {
    id: 'SEC3-zagrozenie-trzy-stwory', fam: 'secure', obj: 'kar', card: 'secure-the-scene', mana: ['W', 5],
    opis: 'wróg 4/4 MV4 i ja 3/3 MV3. Dobry gracz RZUCA: 4/4 wroga to największe zagrożenie, a token 1/1 nie zastąpi go w ataku.',
    setup(s) {
      putSynthCreature(s, 'f1', 'p1', { power: 4, toughness: 4, mv: 4 });
      putSynthCreature(s, 'm1', 'p2', { power: 3, toughness: 3, mv: 3 });
    },
    oczekuje: (c) => c.type === 'cast_spell',
  },
  {
    id: 'SEC4-tylko-moj-stwor', fam: 'secure', obj: 'kar', card: 'secure-the-scene', mana: ['W', 5],
    opis: 'na stole tylko MÓJ stwór 5/5. Dobry gracz NIE rzuca: celem może być tylko wróg; wygnanie własnego dałoby mi 1/1.',
    setup(s) { putSynthCreature(s, 'm1', 'p2', { power: 5, toughness: 5, mv: 5 }); },
    oczekuje: (c) => !(c.type === 'cast_spell' && c.targets?.includes('m1')),
  },
  // ---------------- Stymied Hopes (THS 64): {1}{U} instant, kontra „unless pays {1}”, scry 1
  {
    id: 'STY1-ciezki-czar-wroga-bez-many', fam: 'stymied', obj: 'stym', card: 'stymied-hopes', mana: ['U', 2],
    opis: 'wróg rzuca Kulratha (6 MV) i nie ma otwartej many. Dobry gracz KONTRUJE: płacić nie może.',
    setup(s) { putCard(s, 'big', 'kulrath-zealot', 'p1', 'stack'); s.zones.stack.push('big'); },
    oczekuje: (c) => c.type === 'cast_spell' && c.objectId === 'stym',
  },
  {
    id: 'STY2-ciezki-czar-wroga-ma-mane', fam: 'stymied', obj: 'stym', card: 'stymied-hopes', mana: ['U', 2],
    opis: 'to samo, ale wróg ma 2 otwarte many: zapłaci {1} i kontra nic nie da. Dobry gracz NIE kontruje.',
    setup(s) {
      putCard(s, 'big', 'kulrath-zealot', 'p1', 'stack'); s.zones.stack.push('big');
      addMana(s, 'p1', 2, { colors: ['G'] });
    },
    oczekuje: (c) => !(c.type === 'cast_spell' && c.objectId === 'stym'),
  },
  {
    id: 'STY3-tani-czar-wroga', fam: 'stymied', obj: 'stym', card: 'stymied-hopes', mana: ['U', 2],
    opis: 'wróg rzuca Child of Night (2/1 lifelink, MV2), bez many na tarczę. Dobry gracz: 2 many za trzymanie 2-drop to zwykle przegrana wymiana; NIE kontruje.',
    setup(s) { putCard(s, 'small', 'child-of-night', 'p1', 'stack'); s.zones.stack.push('small'); },
    oczekuje: (c) => !(c.type === 'cast_spell' && c.objectId === 'stym'),
  },
  // ---------------- Kulrath Zealot (ECL 148): {5}{R} 6/5; ETB exile top, graj do końca następnej tury; landcycling {1}{R}
  {
    id: 'KUL1-szesc-many-pusty-stol', fam: 'kulrath', obj: 'kz', card: 'kulrath-zealot', mana: ['R', 6],
    opis: 'pusty stół, 6 many. Dobry gracz RZUCA: 6/5 + ETB z dobraniem karty.',
    setup() {},
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'kz',
  },
  {
    id: 'KUL2-piec-many', fam: 'kulrath', obj: 'kz', card: 'kulrath-zealot', mana: ['R', 5],
    opis: 'mam 5 many, Kulrath kosztuje 6. Nie ma czym rzucić: NIE rzuca.',
    setup() {},
    oczekuje: (c) => !(c.type === 'cast_permanent' && c.objectId === 'kz'),
  },
  {
    id: 'KUL3-landcycling-bez-lądow', fam: 'kulrath', obj: 'kz', card: 'kulrath-zealot', mana: ['R', 2],
    opis: 'na stole 0 ziem, 2 many, w ręce Kulrath (6 MV). Dobry gracz LANDCYKLUJE ({1}{R}) — bez ziem nie zagra nic.',
    setup() {},
    oczekuje: (c) => c.type === 'activate_ability' && c.objectId === 'kz',
  },
  {
    id: 'KUL4-landcycling-pięć-ziem', fam: 'kulrath', obj: 'kz', card: 'kulrath-zealot', mana: ['R', 2],
    opis: 'na stole 5 ziem, 2 many. Dobry gracz NIE landcykluje: ma już ziemię na każdy koszt; karta-stwór jest warta więcej.',
    setup(s) { for (let i = 0; i < 5; i += 1) putSynthNoncreature(s, `ziemia${i}`, 'p2', { types: ['Land'], mv: 0 }); },
    oczekuje: (c) => !(c.type === 'activate_ability' && c.objectId === 'kz'),
  },
  // ---------------- Bloodfire Expert (KTK 101): {2}{R} 3/1 prowess
  {
    id: 'BLF1-pusty-stol', fam: 'bloodfire', obj: 'bf', card: 'bloodfire-expert', mana: ['R', 3],
    opis: 'pusty stół, 3 many. Dobry gracz RZUCA: 3-drop na pustą planszę.',
    setup() {},
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'bf',
  },
  {
    id: 'BLF2-wrog-2-2', fam: 'bloodfire', obj: 'bf', card: 'bloodfire-expert', mana: ['R', 3],
    opis: 'wróg 2/2 na stole. Dobry gracz RZUCA: 3/1 prowess blokuje i atakuje; czary dają mu +1/+1.',
    setup(s) { putSynthCreature(s, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 }); },
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'bf',
  },
  // ---------------- Meteorite (DMU 235): {5} artefakt; ETB 2 obrażeń w dowolny cel; {T}: mana dowolnego koloru
  {
    id: 'MET1-cel-stworek', fam: 'meteorite', obj: 'met', card: 'meteorite', mana: ['W', 5],
    opis: 'wróg 2/1 na stole. Dobry gracz RZUCA: ETB zabija 2/1, plus kamień many.',
    setup(s) { putSynthCreature(s, 'f1', 'p1', { power: 2, toughness: 1, mv: 2 }); },
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'met',
  },
  {
    id: 'MET2-pusty-stol', fam: 'meteorite', obj: 'met', card: 'meteorite', mana: ['W', 5],
    opis: 'pusty stół, wróg bez stworów. Dobry gracz RZUCA: kamień many (ramp) i 2 obrażenia w twarz.',
    setup() {},
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'met',
  },
  // ---------------- Child of Night (M19 89): {1}{B} 2/1 lifelink (porównanie: ten sam obiekt bez lifelinka)
  {
    id: 'CON1-pusty-stol', fam: 'child', obj: 'con', card: 'child-of-night', mana: ['B', 2],
    opis: 'pusty stół, 2 many. Dobry gracz RZUCA: 2-drop z lifelinkiem.',
    setup() {},
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'con',
  },
  // ---------------- Neurok Invisimancer (SOM 37): {1}{U}{U} 2/1; can't be blocked; ETB: cel can't be blocked tej tury
  {
    id: 'NEU1-wrog-blokuje', fam: 'neurok', obj: 'neu', card: 'neurok-invisimancer', mana: ['U', 3],
    opis: 'wróg 3/3 na stole. Dobry gracz RZUCA: mój 2/1 nie do blokowania, ETB odblokowuje mój atak.',
    setup(s) { putSynthCreature(s, 'f1', 'p1', { power: 3, toughness: 3, mv: 3 }); },
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'neu',
  },
  {
    id: 'NEU2-pusty-stol', fam: 'neurok', obj: 'neu', card: 'neurok-invisimancer', mana: ['U', 3],
    opis: 'pusty stół (brak celu ETB, ale 2/1 nie do blokowania nadal zadaje 2 w turę). Dobry gracz RZUCA.',
    setup() {},
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'neu',
  },
  // ---------------- Halo Scarab (SNC 239): {2} artefakt-stwór 2/1; {2}, wyjmij z cmentarza: Skarb
  {
    id: 'HAL1-reka-pusty-stol', fam: 'halo', obj: 'halo', card: 'halo-scarab', mana: ['C', 2],
    opis: 'pusty stół, 2 many, Scarab w ręce. Dobry gracz RZUCA: 2/1 na planszę.',
    setup() {},
    oczekuje: (c) => c.type === 'cast_permanent' && c.objectId === 'halo',
  },
  {
    id: 'HAL2-cmentarz-2-many', fam: 'halo', obj: 'halo', card: 'halo-scarab', mana: ['C', 2],
    opis: 'Scarab w cmentarzu, 2 many, nic innego w ręce. Dobry gracz NIE bankuje many w Skarb (M243/C): pass.',
    setup() {},
    where: 'graveyard',
    oczekuje: (c) => c.type === 'pass_priority' || c.type === 'concede' ? true : !(c.type === 'activate_ability'),
  },
];

/** Buduje stan scenariusza. */
export function buildAudyt(sc, { params } = {}) {
  const state = TURN_SETUP(20);
  addMana(state, 'p2', sc.mana[1], { colors: [sc.mana[0]] });
  if (sc.where === 'graveyard') putCard(state, sc.obj, sc.card, 'p2', 'graveyard');
  else putCard(state, sc.obj, sc.card, 'p2', 'hand');
  sc.setup(state);
  return state;
}

export function runAudyt(sc, params = undefined) {
  const state = buildAudyt(sc);
  const { choice, bot } = decideWith(state, params);
  const best = bestOf(bot, `cast_spell(${sc.obj}`) ?? bestOf(bot, `cast_permanent(${sc.obj}`)
    ?? bestOf(bot, `activate_ability(${sc.obj}`);
  return { id: sc.id, choice, best, ok: sc.oczekuje(choice), opis: sc.opis, trace: bot.trace().at(-1)?.options ?? [] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const sc of AUDYT_SCENARIOS) {
    const r = runAudyt(sc);
    const wyb = r.choice.type === 'cast_spell' || r.choice.type === 'cast_permanent' ? 'cast'
      : r.choice.type === 'activate_ability' ? 'activate' : r.choice.type;
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(32)} bot: ${wyb.padEnd(12)} best=${r.best}`);
  }
}
