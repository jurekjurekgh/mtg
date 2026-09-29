import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// PMSSB-19 (metoda M429) — search_library (CR 701.23b — search + shuffle):
// rider szukania w trzech ścieżkach + Final Parting. 11 kart rodziny
// (ETB-tutory, aktywacje poświęcające, czary).
//
// Findingi (pomiar PRZED: /tmp/pmssb19-search-przed.mjs):
//   R1 — rider 0 w cast_spell i activate_ability: 9/10 żyły TYLKO w tabeli
//     ETB (`etbEnterBonusValue`); S01 Final Parting = 50 (sama baza —
//     2-kartowy tutor warty 0!), S06b aktywacja Elka = bot nigdy nie widział
//     payoffu. Unifikacja `searchRiderValue` (L41 — 3 ścieżki, 4 typy).
//   R2 — `search_library_two_cards_hand_and_grave` = 0 WSZĘDZIE: wartość,
//     tabela ETB, I `LIBRARY_SEARCH_EFFECTS` (deck-out — C zgłoszenie Elka;
//     Final Parting zabiera AŻ 2 karty). Guard: biblioteka 10 kart → kara
//     thin-library 132 (60 + 12·6) przebija zysk.
//   R3 — tutor = NAJLEPSZA karta kategorii (nie losowa — drawCardValue 6):
//     baza do ręki 9 = 6 + selekcja; ląd do ręki przy manascrew (moje lądy
//     < 3) = odbraniczanie gry (+5 — stan gry).
//   R4 — wybór karty (`resolve_search_choice`: found > fail, ląd +30,
//     statystyki, domain) zostaje jak jest (Temat 6 + zgłoszenie B).
//
// Kotwice PO (biblioteka 24 = brak kary cienkiej): S01 66 (50+16),
// S03 chocobo 0 lądów ≈ 83,96 (delta 5 = screw), S06b elk activate = 12,
// S04 kor ≈ 72,9009 i S05 empath ≈ 70,1991 (bazy ETB 10/9 BEZ dryfu, L41).

const REGISTRY = createCardRegistry();

function approx(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${label}: ${actual} ≠ ${expected} ±0.01`);
}

function putSpell(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

function base(libraryCount = 24) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  for (let i = 0; i < libraryCount; i++) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

function decide(state, params = undefined) {
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(view, {});
  const last = bot.trace().at(-1) ?? {};
  return { choice, options: last.options ?? [] };
}

function optionScore(options, cmd) {
  const found = options.find((o) => o.cmd === cmd);
  assert.ok(found, `brak opcji ${cmd} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

// ---------------------------------------------------------------------------
// R2 — Final Parting (2 karty: ręka + grób) + guard deck-outu.
// ---------------------------------------------------------------------------

test('PMSSB-19/R2: Final Parting = 66 (było 50: 2-kartowy tutor warty 0)', () => {
  const state = base(24);
  putSpell(state, 'a', 'final-parting', 'p2', 'hand');
  const { choice, options } = decide(state);
  assert.deepEqual(choice, { type: 'cast_spell', playerId: 'p2', objectId: 'a', targets: [] });
  assert.equal(optionScore(options, 'cast_spell(a->)'), 66);
});

test('PMSSB-19/R2-guard: cienka biblioteka (10) — kara 2 kart przebija zysk (−66)', () => {
  const state = base(10);
  putSpell(state, 'a', 'final-parting', 'p2', 'hand');
  const { options } = decide(state);
  // 50 + 16 (dwie karty) − 132 (thin: 60 + 12·6 przy margin 20) = −66.
  assert.equal(optionScore(options, 'cast_spell(a->)'), -66);
});

test('PMSSB-19/pokrętło: searchTwoCardsValue:0 → Final Parting = 50 (baza)', () => {
  const state = base(24);
  putSpell(state, 'a', 'final-parting', 'p2', 'hand');
  const { options } = decide(state, { searchTwoCardsValue: 0 });
  assert.equal(optionScore(options, 'cast_spell(a->)'), 50);
});

// ---------------------------------------------------------------------------
// R1+R3 — rider w cast_spell (Chocobo: ląd do ręki + token).
// ---------------------------------------------------------------------------

test('PMSSB-19/R1+R3: chocobo 0 lądów = 83.96 (screw +5); bez screw = 78.96', () => {
  const withScrew = base(24);
  putSpell(withScrew, 'a', 'call-the-mountain-chocobo', 'p2', 'hand');
  const s1 = optionScore(decide(withScrew).options, 'cast_spell(a->)');
  const noScrew = base(24);
  putSpell(noScrew, 'a', 'call-the-mountain-chocobo', 'p2', 'hand');
  const s2 = optionScore(decide(noScrew, { searchLandScrewBonus: 0 }).options, 'cast_spell(a->)');
  approx(s1, 83.96, 'chocobo z screw');
  approx(s2, 78.96, 'chocobo bez screw');
});

// ---------------------------------------------------------------------------
// R1 — rider w activate_ability (Dawntreader Elk: poświęć po ląd).
// ---------------------------------------------------------------------------

test('PMSSB-19/R1: aktywacja Elka = 12 (było 2 — payoff szukania niewidoczny)', () => {
  const state = base(24);
  putSpell(state, 'elk', 'dawntreader-elk', 'p2', 'hand');
  // Wystaw i odczekaj sickness — prosty obiekt z abilities karty.
  const view0 = playerView(state, 'p2');
  const bot0 = createHeuristicBot({ seed: 99 });
  bot0.chooseCommand(view0, {});
  const cast = bot0.trace().at(-1)?.options?.find((o) => o.cmd.startsWith('cast_permanent(elk'));
  assert.ok(cast, 'cast_permanent(elk) w ofercie');
  // Ręcznie: postaw gotowego Elka (skrócenie setupu — aktywacja wymaga
  // battlefield; scoring aktywacji nie zależy od sposobu wejścia).
  const state2 = base(24);
  putSpell(state2, 'elk', 'dawntreader-elk', 'p2', 'battlefield');
  state2.objects.set('elk', Object.freeze({ ...state2.objects.get('elk'), summoningSickness: false }));
  const { options } = decide(state2);
  assert.equal(optionScore(options, 'activate_ability(elk#0)'), 12);
});

// ---------------------------------------------------------------------------
// L41 — bazy ETB bez dryfu (stara tabela 10/9 przez wspólny helper).
// ---------------------------------------------------------------------------

test('PMSSB-19/L41: kor-cartographer (ETB na planszę) ≈ 72.9009 — baza 10 bez zmian', () => {
  const state = base(24);
  putSpell(state, 'a', 'kor-cartographer', 'p2', 'hand');
  const { options } = decide(state);
  approx(optionScore(options, 'cast_permanent(a)'), 72.9009, 'kor');
});

test('PMSSB-19/L41: fierce-empath (ETB do ręki, nie ląd) ≈ 70.1991 — baza 9 bez zmian', () => {
  const state = base(24);
  putSpell(state, 'a', 'fierce-empath', 'p2', 'hand');
  const { options } = decide(state);
  approx(optionScore(options, 'cast_permanent(a)'), 70.1991, 'empath');
});
