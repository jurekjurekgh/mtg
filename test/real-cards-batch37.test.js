// Batch 37 (2026-08-19, lista właściciela). Transza A: reuse mechanik.
// Oracle ze Scryfalla (docs/cards/scryfall-*.json), artId/plan ze słownika.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords } from '../src/engine/permanents.js';
import { applyEffect } from '../src/engine/effects.js';
import { processTriggers } from '../src/engine/triggers.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 37, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: over.power ?? data.power, toughness: over.toughness ?? data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Dodaje `n` pustych kart do biblioteki `playerId` (żeby mill/draw miały z czego). */
function seedLibrary(state, playerId, n = 10) {
  for (let i = 0; i < n; i += 1) {
    const id = `lib-${playerId}-${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `libcard-${i}`, controllerId: playerId,
      ownerId: playerId, zone: 'library', kind: 'spell', power: null, toughness: null,
      manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'],
      colors: [], cardName: `Karta ${i}`,
    });
  }
}

const resolveStack = (state) => {
  for (let i = 0; i < 24 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
};

const libraryOf = (state, playerId) =>
  state.zones.library.filter((id) => state.objects.get(id)?.controllerId === playerId);

// --- Returned Centaur {3}{B} 2/4: ETB target player mills 4 -----------------
test('Returned Centaur: dane zgodne z Oracle ({3}{B} 2/4 Zombie Centaur)', () => {
  const def = REGISTRY.get('returned-centaur');
  assert.equal(MANA_COSTS['returned-centaur'], '{3}{B}');
  assert.equal(def.manaCost, 4);
  assert.equal(def.power, 2); assert.equal(def.toughness, 4);
  assert.deepEqual(def.types, ['Creature']);
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].trigger.requiresTarget.type, 'player');
  assert.equal(def.abilities[0].effect.type, 'mill_cards');
  assert.equal(def.abilities[0].effect.amount, 4);
});

test('Returned Centaur: ETB mieli wybranego gracza (preferuje przeciwnika)', () => {
  const state = newState();
  seedLibrary(state, 'p2', 10);
  putCard(state, 'centaur', 'returned-centaur', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const libP2Before = libraryOf(state, 'p2').length;
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'centaur'));
  resolveStack(state); // rozstrzygnij permanent — ETB trigger czeka na cel
  const choices = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(choices.length > 0, 'ETB pyta o cel-gracza');
  const targetP2 = choices.find((c) => c.targetId === 'p2');
  assert.ok(targetP2, 'przeciwnik dostępny jako cel');
  execute(state, targetP2);
  resolveStack(state);
  const libP2After = libraryOf(state, 'p2').length;
  assert.equal(libP2Before - libP2After, 4, 'przeciwnik mieli 4');
});

// --- Liliana's Triumph {1}{B} Instant: each opponent sacrifices a creature --
test("Liliana's Triumph: dane zgodne z Oracle ({1}{B} Instant)", () => {
  const def = REGISTRY.get('lilianas-triumph');
  assert.equal(MANA_COSTS['lilianas-triumph'], '{1}{B}');
  assert.equal(def.manaCost, 2);
  assert.deepEqual(def.types, ['Instant']);
  assert.equal(def.spell.effects[0].type, 'player_sacrifices_creature');
});

test("Liliana's Triumph: wróg poświęca stwora swojego wyboru", () => {
  const state = newState();
  putCard(state, 'triumph', 'lilianas-triumph', 'p1', 'hand');
  putCard(state, 'foe1', 'highland-game', 'p2', 'battlefield', { power: 3, toughness: 3 });
  putCard(state, 'foe2', 'highland-game', 'p2', 'battlefield', { power: 1, toughness: 1 });
  addMana(state, 'p1', 2);
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'triumph'));
  // Czar celuje w przeciwnika; wróg decyduje, co poświęcić (auto-resolve
  // bierze pierwszy wariant — kluczowe jest to, że ginie DOKŁADNIE jeden).
  resolveStack(state);
  const remaining = state.zones.battlefield.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.equal(remaining, 1, 'wróg poświęcił dokładnie jednego stwora');
});

// --- Palace Familiar {1}{U} 1/1: Flying; dies -> draw a card ---------------
test('Palace Familiar: dane zgodne z Oracle ({1}{U} 1/1 Bird, flying)', () => {
  const def = REGISTRY.get('palace-familiar');
  assert.equal(MANA_COSTS['palace-familiar'], '{1}{U}');
  assert.equal(def.manaCost, 2);
  assert.equal(def.power, 1); assert.equal(def.toughness, 1);
  assert.ok(def.keywords.includes('flying'));
  assert.equal(def.abilities[0].trigger.event, 'dies');
  assert.equal(def.abilities[0].effect.type, 'draw_cards');
});

test('Palace Familiar: dies → dobranie karty', () => {
  const state = newState();
  seedLibrary(state, 'p1', 10);
  putCard(state, 'bird', 'palace-familiar', 'p1', 'battlefield');
  const before = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  const marker = state.events.length;
  applyEffect(state, { type: 'sacrifice_permanent' }, state.objects.get('bird'), []);
  processTriggers(state, state.events.slice(marker));
  resolveStack(state);
  const after = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(after, before + 1, 'draw po śmierci ptaka');
});

// --- Thornhide Wolves {4}{G} 4/5 Wolf: vanilla ------------------------------
test('Thornhide Wolves: dane zgodne z Oracle ({4}{G} 4/5 Wolf, bez zdolności)', () => {
  const def = REGISTRY.get('thornhide-wolves');
  assert.equal(MANA_COSTS['thornhide-wolves'], '{4}{G}');
  assert.equal(def.manaCost, 5);
  assert.equal(def.power, 4); assert.equal(def.toughness, 5);
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.abilities ?? [], []);
});

test('Thornhide Wolves: vanilla 4/5 bez keywordów', () => {
  const state = newState();
  putCard(state, 'wolves', 'thornhide-wolves', 'p1', 'battlefield');
  const obj = state.objects.get('wolves');
  assert.equal(obj.power, 4); assert.equal(obj.toughness, 5);
  assert.deepEqual(effectiveKeywords(state, obj), []);
});

// --- Village Bell-Ringer {2}{W} 1/4: Flash; ETB untap all creatures you control
test('Village Bell-Ringer: dane zgodne z Oracle ({2}{W} 1/4, flash)', () => {
  const def = REGISTRY.get('village-bell-ringer');
  assert.equal(MANA_COSTS['village-bell-ringer'], '{2}{W}');
  assert.equal(def.manaCost, 3);
  assert.equal(def.power, 1); assert.equal(def.toughness, 4);
  assert.ok(def.keywords.includes('flash'));
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].effect.type, 'untap_all_creatures_you_control');
});

test('Village Bell-Ringer: ETB odkręca WSZYSTKIE twoje stwory', () => {
  const state = newState();
  const a = putCard(state, 'a', 'highland-game', 'p1', 'battlefield');
  const b = putCard(state, 'b', 'highland-game', 'p1', 'battlefield');
  // Przeciwnik ma też zatapniętego stwora — nie może zostać odkręcony.
  const foe = putCard(state, 'foe', 'highland-game', 'p2', 'battlefield');
  for (const o of [a, b, foe]) {
    state.objects.set(o.id, Object.freeze({ ...state.objects.get(o.id), tapped: true }));
  }
  putCard(state, 'bell', 'village-bell-ringer', 'p1', 'hand');
  addMana(state, 'p1', 3);
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'bell'));
  resolveStack(state); // rozstrzygnij permanent + ETB trigger
  assert.equal(state.objects.get('a').tapped, false, 'twój stwór A odkręcony');
  assert.equal(state.objects.get('b').tapped, false, 'twój stwór B odkręcony');
  assert.equal(state.objects.get('foe').tapped, true, 'stwór przeciwnika zostaje zatapnięty');
});

// --- Urza's Mine (2XM) Land: {T}: Add {C}; tron {C}{C} z PP+Tower ----------
test("Urza's Mine: dane zgodne z Oracle (Land — Urza's Mine, bez kosztu)", () => {
  const def = REGISTRY.get('urza-s-mine');
  assert.equal(MANA_COSTS['urza-s-mine'], '');
  assert.equal(def.manaCost, 0);
  assert.deepEqual(def.types, ['Land']);
  assert.deepEqual(def.subtypes, ["Urza's Mine"]);
});

test("Urza's Mine: źródło many {C} (1) bez pozostałych lądów Urzy", () => {
  const state = newState();
  putCard(state, 'mine', 'urza-s-mine', 'p1', 'battlefield');
  const src = getSourceForObject(state.objects.get('mine'), state);
  assert.ok(src, 'urza-s-mine w MANA_SOURCE_MAP');
  assert.deepEqual(src.colors, [], '{C} — bezbarwna');
  assert.equal(src.amount, 1, '{T}: Add {C} — bez trona');
});

test("Urza's Mine: tron — z Urza's Power-Plant i Urza's Tower daje {C}{C} (2)", () => {
  const state = newState();
  putCard(state, 'mine', 'urza-s-mine', 'p1', 'battlefield');
  // Pozostałe lądy Urzy nie są jeszcze w katalogu — dodajemy obiekty z tymi
  // cardId wprost (jak zrobi to przyszły batch). Warunek jest w danych
  // (mana-sources.js tronRequired), nie w core (ADR 0002).
  const addPlain = (id, cardId) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', power: null, toughness: null, manaCost: 0,
      abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: [],
    });
  };
  const srcWithout = getSourceForObject(state.objects.get('mine'), state);
  assert.equal(srcWithout.amount, 1, 'przed dodaniem pozostałych lądów — {C}');
  addPlain('pp', 'urza-s-power-plant');
  addPlain('tower', 'urza-s-tower');
  const srcWith = getSourceForObject(state.objects.get('mine'), state);
  assert.equal(srcWith.amount, 2, 'z Power-Plant + Tower — {C}{C} (tron)');
});

// --- Liliana's Triumph: planeswalker condition ------------------------------
test("Liliana's Triumph: dane zgodne z Oracle — conditional planswalker", () => {
  const def = REGISTRY.get('lilianas-triumph');
  assert.equal(def.spell.effects.length, 2, 'sacrifice + conditional discard');
  assert.equal(def.spell.effects[0].type, 'player_sacrifices_creature');
  assert.equal(def.spell.effects[1].type, 'conditional');
  assert.equal(def.spell.effects[1].condition, 'controlsPlaneswalkerWithSubtype');
  assert.equal(def.spell.effects[1].subtype, 'Liliana');
  assert.equal(def.spell.effects[1].then.type, 'discard_each_opponent');
});

/** Dodaje permanent planeswalkera o danym podtypie pod kontrolą `controllerId`. */
function putPlaneswalker(state, id, subtype, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-planeswalker-${id}`, controllerId,
    ownerId: controllerId, zone: 'battlefield', kind: 'planeswalker', power: null,
    toughness: null, manaCost: 3, abilities: [], keywords: [], subtypes: [subtype],
    types: ['Planeswalker'], colors: [], cardName: `${subtype} Planeswalker`,
  });
  return state.objects.get(id);
}

/** Czy gracz ma w ręce kartę o danym cardId (sprawdzane po strefie, nie id). */
function handHas(state, playerId, cardId) {
  return state.zones.hand.some((id) => state.objects.get(id)?.controllerId === playerId
    && state.objects.get(id)?.cardId === cardId);
}

test("Liliana's Triumph: BEZ planeswalkera Liliana — przeciwnik tylko poświęca", () => {
  const state = newState();
  seedLibrary(state, 'p2', 10);
  putCard(state, 'triumph', 'lilianas-triumph', 'p1', 'hand');
  putCard(state, 'foe1', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'foe2', 'highland-game', 'p2', 'battlefield');
  // Przeciwnik ma kartę w ręce — gdyby warunek zachodził, odrzuciłby ją.
  putCard(state, 'foeHand', 'highland-game', 'p2', 'hand');
  addMana(state, 'p1', 2);
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'triumph'));
  resolveStack(state); // sacrifice decision + ewentualne dokończenie czaru
  // Bez Liliany: czar powinien być ROZSTRZYGNIĘTY, a wróg NIE odrzucił karty.
  assert.ok(handHas(state, 'p2', 'highland-game'), 'bez Liliany wróg nie odrzuca');
});

test("Liliana's Triumph: Z planeswalkerem Liliana — przeciwnik też odrzuca", () => {
  const state = newState();
  seedLibrary(state, 'p2', 10);
  putCard(state, 'triumph', 'lilianas-triumph', 'p1', 'hand');
  putCard(state, 'foe1', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'foe2', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'foeHand', 'highland-game', 'p2', 'hand');
  // Liliana pod kontrolą rzucającego — warunek `controlsPlaneswalkerWithSubtype`.
  putPlaneswalker(state, 'lili', 'Liliana', 'p1');
  addMana(state, 'p1', 2);
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'triumph'));
  resolveStack(state); // sacrifice + dokończenie (conditional → discard)
  assert.ok(!handHas(state, 'p2', 'highland-game'), 'z Lilianą wróg odrzuca kartę');
});
