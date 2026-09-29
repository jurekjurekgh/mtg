import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// PMSSB-22 — Insatiable Appetite (`sacrifice_food_choice`).
//
// Zgłoszenie właściciela (uwaga A, 2026-09-29), kryterium akceptacji:
//   „Bot kompletnie nie umie używać tej karty. Rzuca ją w mojej turze na moją
//   kreaturę. To jest combat trick, który trzeba rzucać TYLKO na SWOJE
//   KREATURY i to tylko w fazie walki — na swoje atakujące po deklaracji ataku
//   i na swoje blokujące w fazie ataku przeciwnika po zadeklarowaniu
//   blokujących. W obu przypadkach tylko wtedy jeśli ten buff (+3/+3)
//   cokolwiek zmieni w walce kreatury-celu.”
//
// Pomiar PRZED (tools/pmssb22-insatiable-sonda.mjs): KAŻDY wariant celu miał
// dokładnie 50.0 — karta nie należała do rodziny pump (`sacrifice_food_choice`
// nie występował w heuristic-bot.js ani razu), więc nie działało ani okno
// walki (M146/M96/M179), ani symulacja wyniku (M218/2), ani klamra
// „nie wzmacniaj przeciwnika” (M179/E). W S3/S4/S5/S6 bot brał PIERWSZY cel
// z brzegu — stwora przeciwnika.
//
// Naprawa F1: wpis w TEMPORARY_PUMP_EFFECTS + delta z widoku (Food → 5/5,
// inaczej 3/3) — karta wchodzi do ISTNIEJĄCEJ rodziny (L41/L28), dziedzicząc
// okna i symulację. F2/F3: decyzja `resolve_food_choice` dostała cel w
// komendzie i wycenę zamiast płaskiego 50/30.

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putFood(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'food-token', controllerId, zone: 'battlefield',
    kind: 'token', power: null, toughness: null, manaCost: 0,
    types: ['Artifact'], subtypes: ['Food'], colors: [], abilities: [], keywords: [],
  });
  return state.objects.get(id);
}

function baseState() {
  const state = createGameState({ seed: 22, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  for (let i = 0; i < 10; i++) putCard(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

/** Okno PO deklaracji bloków w MOJEJ turze. */
function ownCombat(state, { attackers, blockers = new Map(), blockedAttackers = new Set() }) {
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.combat = { attackingPlayerId: 'p2', attackers, blockers, blockedAttackers };
}

/** Okno PO deklaracji bloków w turze PRZECIWNIKA (wzorzec PMSSB-15 `foeCombat`). */
function foeCombat(state, { attackers, blockers = new Map(), blockedAttackers = new Set() }) {
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.combat = { attackingPlayerId: 'p1', attackers, blockers, blockedAttackers };
}

function decide(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 22, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const options = (bot.trace().at(-1)?.options ?? []).slice().sort((a, b) => b.score - a.score);
  return { choice, options };
}

const scoreOf = (options, cmd) => {
  const found = options.find((o) => o.cmd === cmd);
  assert.ok(found, `brak oferty ${cmd}: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
};

// --- S1: poza walką trik nie zdąży pomóc (M146/M96) ---
test('PMSSB-22/S1: moja main1 bez walki — NIE rzucać (pump poza oknem)', () => {
  const state = baseState();
  putCard(state, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2);
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'pass_priority', `poza walką trik wyparuje: ${JSON.stringify(choice)}`);
  // 50 (baza czaru) − 75 (okno poza walką, M179/A1) + 2 (moc celu).
  assert.equal(scoreOf(options, 'cast_spell(ia->mine)'), -23);
});

// --- S2: właściwe okno — własny atakujący po deklaracji ataku ---
test('PMSSB-22/S2: mój atakujący nieblokowany — rzucać (+3/+3 = więcej obrażeń)', () => {
  const state = baseState();
  putCard(state, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2);
  ownCombat(state, { attackers: ['mine'] });
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'cast_spell');
  assert.deepEqual(choice.targets, ['mine']);
  // 50 + 18 (okno walki) + 2 (moc celu).
  assert.equal(scoreOf(options, 'cast_spell(ia->mine)'), 70);
});

// --- S3: okno walki to warunek konieczny, nie wystarczający (M218/2) ---
test('PMSSB-22/S3: 1/1 zablokowany przez 5/5 — buff NIC nie zmienia, NIE rzucać', () => {
  const state = baseState();
  putCard(state, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 1, 1);
  putCreature(state, 'foe', 'p1', 5, 5);
  ownCombat(state, { attackers: ['mine'], blockers: new Map([['mine', ['foe']]]), blockedAttackers: new Set(['mine']) });
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'pass_priority', `buff 4/4 nadal ginie i nie zabija: ${JSON.stringify(choice)}`);
  assert.equal(scoreOf(options, 'cast_spell(ia->mine)'), -24);
  // Cel wroga: −60 (wzmacnianie przeciwnika) − 50 (klamra M179/E) + 50 (baza).
  assert.equal(scoreOf(options, 'cast_spell(ia->foe)'), -65);
});

// --- S4: tura przeciwnika, mój bloker — właściwe okno i właściwy cel ---
test('PMSSB-22/S4: tura wroga po blokach — pump na WŁASNEGO blokera, nie na napastnika', () => {
  const state = baseState();
  putCard(state, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 1, 1);
  putCreature(state, 'foe', 'p1', 3, 3);
  foeCombat(state, { attackers: ['foe'], blockers: new Map([['foe', ['mine']]]), blockedAttackers: new Set(['foe']) });
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'cast_spell');
  assert.deepEqual(choice.targets, ['mine'], `+3/+3 = 4/4 zabija 3/3 i przeżywa: ${JSON.stringify(choice)}`);
  assert.equal(scoreOf(options, 'cast_spell(ia->mine)'), 69);
  assert.ok(scoreOf(options, 'cast_spell(ia->foe)') < 0, 'wzmacnianie napastnika wroga = błąd');
});

// --- S5: ZGŁOSZENIE WŁAŚCICIELA — jej tura, jej kreatura ---
test('PMSSB-22/S5: tura Czarodziejki — NIGDY na jej kreaturę (zgłoszenie właściciela)', () => {
  const state = baseState();
  putCard(state, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(state, 'hers', 'p1', 2, 2);
  putCreature(state, 'mine', 'p2', 2, 2);
  foeCombat(state, { attackers: ['hers'], blockers: new Map([['hers', ['mine']]]), blockedAttackers: new Set(['hers']) });
  const { choice, options } = decide(state);
  assert.notDeepEqual(choice.targets ?? [], ['hers'], 'osłanianie/wzmacnianie przeciwniczki = błąd z logu');
  assert.equal(scoreOf(options, 'cast_spell(ia->mine)'), 70);
  assert.equal(scoreOf(options, 'cast_spell(ia->hers)'), -62);
});

// --- S6: overkill — buff nie zmienia wyniku ---
test('PMSSB-22/S6: 4/4 już zabija 2/2 — overkill, NIE rzucać', () => {
  const state = baseState();
  putCard(state, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 4, 4);
  putCreature(state, 'foe', 'p1', 2, 2);
  ownCombat(state, { attackers: ['mine'], blockers: new Map([['mine', ['foe']]]), blockedAttackers: new Set(['mine']) });
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'pass_priority', `zablokowany — nadwyżka mocy nie wchodzi w twarz: ${JSON.stringify(choice)}`);
  assert.equal(scoreOf(options, 'cast_spell(ia->mine)'), -21);
});

// --- S7: delta ZALEŻY od Food na polu (pumpDelta, F1) ---
test('PMSSB-22/S7: z Food na polu trik liczy się jako +5/+5 — rzuca tam, gdzie bez Food PASS', () => {
  const buduj = (zFood) => {
    const state = baseState();
    putCard(state, 'ia', 'insatiable-appetite', 'p2', 'hand');
    putCreature(state, 'mine', 'p2', 1, 1);
    putCreature(state, 'foe', 'p1', 5, 5);
    if (zFood) putFood(state, 'food1', 'p2');
    ownCombat(state, { attackers: ['mine'], blockers: new Map([['mine', ['foe']]]), blockedAttackers: new Set(['mine']) });
    return state;
  };
  const bezFood = decide(buduj(false));
  assert.equal(bezFood.choice.type, 'pass_priority', '+3/+3 = 4/4 nadal ginie i nie zabija');
  const zFood = decide(buduj(true));
  assert.equal(zFood.choice.type, 'cast_spell', '+5/+5 = 6/6 zabija 5/5 i przeżywa');
  assert.deepEqual(zFood.choice.targets, ['mine']);
  assert.ok(scoreOf(zFood.options, 'cast_spell(ia->mine)') > scoreOf(bezFood.options, 'cast_spell(ia->mine)'),
    'ten sam układ walki — z Food trick musi być wyceniony wyżej');
});

// --- F2: decyzja o poświęceniu Food ---
function foodState({ target, blocker = null, life = 20, attackers = [], blocked = [] }) {
  const state = baseState();
  putCard(state, 'ia', 'insatiable-appetite', 'p2', 'stack');
  putCreature(state, target.id, 'p2', target.power, target.toughness);
  if (blocker) putCreature(state, blocker.id, 'p1', blocker.power, blocker.toughness);
  putFood(state, 'food1', 'p2');
  const p2 = state.players.find((p) => p.id === 'p2');
  state.players.splice(state.players.indexOf(p2), 1, { ...p2, life });
  const blockers = new Map(blocker ? [[attackers[0], [blocker.id]]] : []);
  ownCombat(state, { attackers, blockers, blockedAttackers: new Set(blocked) });
  state.turn.priorityPlayerId = 'p2';
  state.pendingFoodChoice = { playerId: 'p2', creatureId: target.id, hasFood: true, foodIds: ['food1'], restorePriorityTo: 'p2' };
  return state;
}

test('PMSSB-22/F2a: Food zostaje, gdy +2/+2 nic nie zmienia (Food = 3 życia)', () => {
  const state = foodState({ target: { id: 'mine', power: 2, toughness: 2 }, attackers: ['mine'], blocked: [] });
  const { choice, options } = decide(state);
  assert.deepEqual({ type: choice.type, sacrifice: choice.sacrifice },
    { type: 'resolve_food_choice', sacrifice: false },
    `nieblokowany 2/2: +2 obrażeń mniej warte niż 3 życia z Food: ${JSON.stringify(choice)}`);
  assert.equal(scoreOf(options, 'resolve_food_choice(keep)'), 42); // 30 + foodKeepValue 12
  assert.equal(scoreOf(options, 'resolve_food_choice(sacrifice)'), 32);  // 30 + 2 obrażenia
});

test('PMSSB-22/F2b: Food idzie, gdy +5/+5 zmienia wynik walki, a +3/+3 nie', () => {
  const state = foodState({
    target: { id: 'mine', power: 1, toughness: 1 },
    blocker: { id: 'foe', power: 5, toughness: 5 },
    attackers: ['mine'], blocked: ['mine'],
  });
  const { choice, options } = decide(state);
  assert.equal(choice.sacrifice, true,
    `+3/+3 = 4/4 ginie, +5/+5 = 6/6 zabija 5/5: ${JSON.stringify(choice)}`);
  assert.equal(scoreOf(options, 'resolve_food_choice(sacrifice)'), 55); // 30 + foodDecisiveBonus 25
});

test('PMSSB-22/F2c: mało życia — Food (3 życia) cenniejszy podwójnie', () => {
  const state = foodState({ target: { id: 'mine', power: 2, toughness: 2 }, life: 8, attackers: ['mine'], blocked: [] });
  const { choice, options } = decide(state);
  assert.equal(choice.sacrifice, false);
  assert.equal(scoreOf(options, 'resolve_food_choice(keep)'), 54); // 30 + 12×2
});

test('PMSSB-22/F2d: anty-over-fix — foodKeepValue ×0 przywraca dawne „zawsze poświęcaj”', () => {
  const state = foodState({ target: { id: 'mine', power: 2, toughness: 2 }, attackers: ['mine'], blocked: [] });
  const { choice } = decide(state, { foodKeepValue: 0 });
  assert.equal(choice.sacrifice, true, 'kotwica M429: najsłabszy realny wariant = dawna wartość');
});
