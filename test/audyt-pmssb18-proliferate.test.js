import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// PMSSB-18 (metoda M429) — Proliferate (CR 701.34a — „another counter of
// each kind already there"; dawniej 701.27a) jako rider czaru. 3 karty:
// courage-in-crisis (+1/+1 → proliferate), spread-the-sickness
// (destroy → proliferate), fuel-for-the-cause (counter spell → proliferate).
//
// Findingi (pomiar PRZED: /tmp/pmssb18-proliferate-przed.mjs):
//   R1 — rider `proliferate` = 0 pkt (brak gałęzi w pętli efektów). Unifikacja
//     per-cel: `proliferateTargetValue` (TA SAMA skala co resolve_proliferate,
//     L41) + `proliferateBestValue` (najlepszy podzbiór = suma dodatnich).
//   R2 — synergia kolejności: add_counter rozstrzyga się PRZED proliferate —
//     świeży licznik też jest proliferowany (Courage = 2× +1/+1!);
//     destroy usuwa cel z kandydatów (Spread — liczniki giną z nosicielem).
//   R3 — wyścig trucizn nieliniowy: tick wroga = `1 + poison` (flat 1 z M341
//     niedowartościowywało presję); 9→10 = WYGRANA (CR 104.3d — 1000 jak
//     resolve); własna 9→10 = NEVER/cały podzbiór odrzucony (CR 104.4b:
//     obaj po 10 = remis — nie jest wygraną; M341/F3).
//   R4 — -1/-1 finishing: tick na wytrzymałości 1 = dobiecie (+4/−6,
//     SBA 704.5a); inaczej +2/−2. +1/+1 = ±2 per-cel (płasko — wzrost
//     +2/+2 niezależnie od zasobu liczników).
//   R5 — jałowość: Proliferate bez ISTNIEJĄCYCH liczników/poison = 0
//     (CR 701.34a). L119: charge/oil/shield… bez wagi.
//
// Kotwice (PRZED→PO): S01 68→70 (synergia), S02 80→87 (+2 licznik +5 poison),
// S03 68→1068 (wygrana!), S04 86→90 (dobicie), S05 86→86 (jałowy),
// S06 50→57.

const REGISTRY = createCardRegistry();

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

function putCreature(state, id, controllerId, power, toughness, counters = undefined) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSickness: false, ...(counters ? { counters } : {}),
  }));
  return state.objects.get(id);
}

function setPoison(state, playerId, n) {
  state.players = state.players.map((p) => (p.id === playerId ? { ...p, poison: n } : p));
}

function base() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  for (let i = 0; i < 8; i++) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
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
// R1+R2 — rider: Courage in Crisis (counter → proliferate).
// ---------------------------------------------------------------------------

test('PMSSB-18/R1+R2: courage na pustym 2/2 = 70 (było 68 — rider 0; +2 synergia)', () => {
  const state = base();
  putSpell(state, 'a', 'courage-in-crisis', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2);
  const { choice, options } = decide(state);
  assert.deepEqual(choice, { type: 'cast_spell', playerId: 'p2', objectId: 'a', targets: ['mine'] });
  assert.equal(optionScore(options, 'cast_spell(a->mine)'), 70);
});

test('PMSSB-18/R2+R3: courage 2/2 z 2×+1/+1 + wróg 4 poison = 87 (było 80)', () => {
  const state = base();
  putSpell(state, 'a', 'courage-in-crisis', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2, { '+1/+1': 2 });
  setPoison(state, 'p1', 4);
  const { options } = decide(state);
  // +7 ridera: 2 (odświeżony +1/+1) + 5 (poison 4→5 = 1+4).
  assert.equal(optionScore(options, 'cast_spell(a->mine)'), 87);
});

test('PMSSB-18/R3: wróg 9 poison — tick = WYGRANA (1068, było 68)', () => {
  const state = base();
  putSpell(state, 'a', 'courage-in-crisis', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2);
  setPoison(state, 'p1', 9);
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->mine)'), 1068);
});

test('PMSSB-18/R3-guard: własna 9 poison nie traci wygranej — wybór bez siebie', () => {
  const state = base();
  putSpell(state, 'a', 'courage-in-crisis', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2);
  setPoison(state, 'p1', 9);
  setPoison(state, 'p2', 9);
  const { options } = decide(state);
  // Własna 9→10 = NEVER dla podzbioru z sobą — najlepszy podzbiór TICZUJE
  // tylko wroga (wygrana bez ryzyka remisu, CR 104.4b).
  assert.equal(optionScore(options, 'cast_spell(a->mine)'), 1068);
});

// ---------------------------------------------------------------------------
// R2+R4 — Spread the Sickness (destroy → proliferate).
// ---------------------------------------------------------------------------

test('PMSSB-18/R2+R4: spread + ich -1/-1 na wytrzymałości 1 = 90 (było 86; +4 dobiecie)', () => {
  const state = base();
  putSpell(state, 'a', 'spread-the-sickness', 'p2', 'hand');
  putCreature(state, 'their', 'p1', 2, 2);
  putCreature(state, 'dying', 'p1', 1, 1, { '-1/-1': 1 });
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->their)'), 90);
});

test('PMSSB-18/R2: spread — zniszczony cel wypada z kandydatów (78 ≠ 82)', () => {
  const state = base();
  putSpell(state, 'a', 'spread-the-sickness', 'p2', 'hand');
  putCreature(state, 'their', 'p1', 2, 2);
  putCreature(state, 'dying', 'p1', 1, 1, { '-1/-1': 1 });
  const { options } = decide(state);
  // Niszczenie 'dying' (1/1 z -1/-1): bez wykluczenia proliferate dobiłoby
  // jego licznik (+4) — z wykluczeniem rider = 0 (liczniki giną z nosicielem).
  assert.equal(optionScore(options, 'cast_spell(a->dying)'), 78);
  // Niszczenie 'their' (2/2): proliferate tyka 'dying' (+4) = 90.
  assert.equal(optionScore(options, 'cast_spell(a->their)'), 90);
});

test('PMSSB-18/R5: spread na pustej planszy = 86 — proliferate jałowy', () => {
  const state = base();
  putSpell(state, 'a', 'spread-the-sickness', 'p2', 'hand');
  putCreature(state, 'their', 'p1', 2, 2);
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->their)'), 86);
});

// ---------------------------------------------------------------------------
// Fuel for the Cause (counter spell → proliferate) + resolve_proliferate
// (ta sama skala, L41).
// ---------------------------------------------------------------------------

test('PMSSB-18/R1: fuel — rider proliferate na planszy z licznikiem+poison = +7 (57)', () => {
  const state = base();
  putSpell(state, 'a', 'fuel-for-the-cause', 'p2', 'hand');
  putSpell(state, 'foespell', 'act-of-treason', 'p1', 'stack');
  putCreature(state, 'mine', 'p2', 2, 2, { '+1/+1': 1 });
  setPoison(state, 'p1', 4);
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->foespell)'), 57);
});

test('PMSSB-18/resolve: wybór wygrywającego podzbioru; własna 10 = NEVER', () => {
  const state = base();
  putCreature(state, 'mine', 'p2', 2, 2, { '+1/+1': 1 });
  setPoison(state, 'p1', 9);
  setPoison(state, 'p2', 9);
  state.pendingProliferate = { playerId: 'p2', candidateIds: ['p1', 'p2', 'mine'] };
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 5 });
  const choice = bot.chooseCommand(view, {});
  const options = bot.trace().at(-1)?.options ?? [];
  // Ślad nie niesie targetIds — po wynikach: 1000 = wygrana (tick wroga),
  // NEVER = podzbiór z własną 9→10 (remis 104.4b nie jest wygraną).
  assert.equal(choice.type, 'resolve_proliferate');
  assert.deepEqual([...(choice.targetIds ?? [])].sort(), ['p1'],
    `bot wybiera wygrywający podzbiór [p1]: ${JSON.stringify(choice)}`);
  assert.ok(options.some((o) => o.cmd === 'resolve_proliferate' && o.score === 1000),
    'podzbiór z tickiem wygranej = 1000 (CR 104.3d)');
  assert.ok(options.some((o) => o.cmd === 'resolve_proliferate' && o.score <= -1e9),
    'podzbiór z własną 10 = NEVER');
});
