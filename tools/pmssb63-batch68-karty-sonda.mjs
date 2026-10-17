// PMSSB-63 (batch 68) — sonda POMIARU PRZED / PO dla wyceny pojedynczych kart batcha 68
// (Raze to the Ground, Secure the Scene, Stymied Hopes, Kulrath Zealot ETB, Bloodfire prowess).
// Uruchomienie: node tools/pmssb63-batch68-karty-sonda.mjs
// Każdy scenariusz: karta w ręce bota (p2), stół, biblioteka, oczekiwany wybór (opis w `opis`).
import { playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { botTurn, putCard, putSynthCreature, putSynthNoncreature } from './pmssb63-batch68-sonda.mjs';

/** Najlepsza wartość rzutu danej karty (cast_spell/cast_permanent) z trace — do pomiaru. */
export function bestCardScore(state, objectId, params = undefined) {
  const bot = createHeuristicBot({ seed: 68, params });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const entry = bot.trace().at(-1);
  const scores = (entry?.options ?? []).filter((o) => o?.cmd?.startsWith(`cast_spell(${objectId}`)
    || o?.cmd?.startsWith(`cast_permanent(${objectId}`)).map((o) => o.score);
  return { choice, best: scores.length ? Math.max(...scores) : null };
}

export const KARTY_SCENARIOS = [
  // ---- Raze to the Ground (BRO 149): {2}{R} sorcery, zniszcz artefakt; jeśli MV celu ≤1 dobierz kartę.
  {
    id: 'R1-raze-MV1-biblioteka-pelna',
    card: 'raze-to-the-ground', mana: ['R', 3], lib: 30,
    opis: 'wróg: artefakt MV1; moja biblioteka 30. Dobry gracz: RZUCA — niszczę artefakt i dobieram kartę.',
    setup(state) { putSynthNoncreature(state, 'fa', 'p1', { types: ['Artifact'], mv: 1 }); },
    oczekuje: (c) => c.type === 'cast_spell',
  },
  {
    id: 'R2-raze-MV1-biblioteka-pusta',
    card: 'raze-to-the-ground', mana: ['R', 3], lib: 0,
    opis: 'wróg: artefakt MV1; moja biblioteka 0. Dobry gracz: NIE rzuca — dobranie z pustej biblioteki przegrywa grę (deck-out), a artefakt MV1 jest mało wart.',
    setup(state) { putSynthNoncreature(state, 'fa', 'p1', { types: ['Artifact'], mv: 1 }); },
    oczekuje: (c) => c.type !== 'cast_spell',
  },
  {
    id: 'R3-raze-MV5-biblioteka-pusta',
    card: 'raze-to-the-ground', mana: ['R', 3], lib: 0,
    opis: 'wróg: artefakt MV5 (bez dobrania); moja biblioteka 0. Dobry gracz: RZUCA — niszczę wartościowy artefakt, bez dobierania z pustej biblioteki.',
    setup(state) { putSynthNoncreature(state, 'fa', 'p1', { types: ['Artifact'], mv: 5 }); },
    oczekuje: (c) => c.type === 'cast_spell',
  },
  // ---- Secure the Scene (M21 35): {4}{W} sorcery, wygnaj niebędący ziemią permanent; kontroler celu dostaje 1/1.
  {
    id: 'S1-secure-duzy-wrog',
    card: 'secure-the-scene', mana: ['W', 5], lib: 30,
    opis: 'wróg: stwór 5/5 MV5. Dobry gracz: RZUCA — wygnanie 5/5 za token 1/1 dla wroga to dobra wymiana.',
    setup(state) { putSynthCreature(state, 'f1', 'p1', { power: 5, toughness: 5, mv: 5 }); },
    oczekuje: (c) => c.type === 'cast_spell',
  },
  {
    id: 'S2-secure-maly-wrog',
    card: 'secure-the-scene', mana: ['W', 5], lib: 30,
    opis: 'wróg: stwór 1/1 MV1. Dobry gracz: NIE rzuca — wygnanie 1/1 daje wrogowi token 1/1 (wymiana zerowa), a karta za 5 many przepada.',
    setup(state) { putSynthCreature(state, 'f1', 'p1', { power: 1, toughness: 1, mv: 1 }); },
    oczekuje: (c) => c.type !== 'cast_spell',
  },
];

export function runKartaScenario(sc, params = undefined) {
  const state = botTurn({ life: 20, libraryP2: sc.lib, libraryP1: 30 });
  addMana(state, 'p2', sc.mana[1], { colors: [sc.mana[0]] });
  putCard(state, 'kar', sc.card, 'p2', 'hand');
  sc.setup(state);
  const { choice, best } = bestCardScore(state, 'kar', params);
  return {
    id: sc.id,
    wybor: choice.type === 'cast_spell' || choice.type === 'cast_permanent' ? `cast (${best})` : `${choice.type} (${best})`,
    ok: sc.oczekuje(choice),
    opis: sc.opis,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const sc of KARTY_SCENARIOS) {
    const r = runKartaScenario(sc);
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(34)} bot: ${r.wybor}`);
  }
}
