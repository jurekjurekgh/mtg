// Batch 35 (2026-08-18). Transza E2: karty bez nowej mechaniki.
// Oracle ze Scryfalla (docs/cards/scryfall-*.json). ADR 0010 §2a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main' } = {}) {
  const state = createGameState({ seed: 35, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    aura: data.aura ?? def.aura ?? null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    ownerId: controllerId,
    zone: extra.zone ?? 'battlefield', kind: extra.kind ?? 'creature',
    power: extra.power ?? 2, toughness: extra.toughness ?? 2, manaCost: 1,
    abilities: [], keywords: extra.keywords ?? [], subtypes: extra.subtypes ?? [],
    types: extra.types ?? ['Creature'], colors: [], cardName: extra.cardName ?? id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

const resolveStack = (state) => {
  for (let i = 0; i < 16 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
};

// --- Titan's Strength {R} Instant: +3/+1, Scry 1 ---------------------------

test("Titan's Strength: dane zgodne z Oracle ({R} Instant +3/+1 Scry 1)", () => {
  const def = REGISTRY.get('titans-strength');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 1);
  assert.equal(MANA_COSTS['titans-strength'], '{R}');
  assert.equal(def.spell.timing, 'instant');
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['creature']);
  assert.equal(def.spell.effects[0].type, 'pump');
  assert.equal(def.spell.effects[0].power, 3);
  assert.equal(def.spell.effects[0].toughness, 1);
  assert.equal(def.spell.effects[1].type, 'scry');
  assert.equal(def.spell.effects[1].amount, 1);
});

test("Titan's Strength: cel dostaje +3/+1 do końca tury", () => {
  const state = newState();
  putBlank(state, 'cel', 'p1', { power: 2, toughness: 2 });
  putCard(state, 'ts', 'titans-strength', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ts' && (c.targets ?? [])[0] === 'cel');
  assert.ok(cast, 'oferta rzutu z celem');
  execute(state, cast);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('cel'), state), 5);
  assert.equal(effectiveToughness(state.objects.get('cel'), state), 3);
});

test("Titan's Strength: bez stwora na stole brak legalnego rzutu", () => {
  const state = newState();
  putCard(state, 'ts', 'titans-strength', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'ts');
  assert.equal(casts.length, 0, 'CR 601.2c: brak celu = brak oferty');
});

test("Titan's Strength: niebieska mana nie opłaca {R}", () => {
  const state = newState();
  putBlank(state, 'cel', 'p1');
  putCard(state, 'ts', 'titans-strength', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'ts');
  assert.equal(casts.length, 0, 'CR 202.1: pip {R} wymaga czerwonej many');
});

// --- Wolfkin Bond {4}{G} Aura: ETB Wolf 2/2, enchanted +2/+2 ---------------

test('Wolfkin Bond: dane zgodne z Oracle (Aura +2/+2, ETB token Wolf)', () => {
  const def = REGISTRY.get('wolfkin-bond');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 5);
  assert.equal(MANA_COSTS['wolfkin-bond'], '{4}{G}');
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.subtypes, ['Aura']);
  assert.deepEqual(def.aura.pump, { power: 2, toughness: 2 });
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].effect.type, 'create_token');
  assert.equal(def.abilities[0].effect.cardId, 'token_wolf');
});

test('Wolfkin Bond: zaczarowany stwór +2/+2 i powstaje token Wolf 2/2', () => {
  const state = newState();
  putBlank(state, 'gosc', 'p1', { power: 2, toughness: 2 });
  putCard(state, 'bond', 'wolfkin-bond', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'bond'
      && ((c.targets ?? [])[0] === 'gosc' || c.targetId === 'gosc'));
  assert.ok(cast, 'rzut aury na stwora');
  execute(state, cast);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('gosc'), state), 4, 'enchanted +2/+2');
  assert.equal(effectiveToughness(state.objects.get('gosc'), state), 4);
  const wolf = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'token_wolf');
  assert.ok(wolf, 'token Wolf powstał');
  assert.equal(wolf.power, 2);
  assert.equal(wolf.toughness, 2);
  assert.deepEqual(wolf.colors, ['G']);
});

test('Wolfkin Bond: bez stwora nie da się rzucić (Enchant creature)', () => {
  const state = newState();
  putCard(state, 'bond', 'wolfkin-bond', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['G'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'bond');
  assert.equal(casts.length, 0);
});

// --- Mark of the Vampire {3}{B} Aura: +2/+2 lifelink -----------------------

test('Mark of the Vampire: dane zgodne z Oracle ({3}{B} Aura +2/+2 lifelink)', () => {
  const def = REGISTRY.get('mark-of-the-vampire');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 4);
  assert.equal(MANA_COSTS['mark-of-the-vampire'], '{3}{B}');
  assert.deepEqual(def.aura.pump, { power: 2, toughness: 2 });
  assert.deepEqual(def.aura.keywords, ['lifelink']);
});

test('Mark of the Vampire: zaczarowany stwór ma +2/+2 i lifelink', () => {
  const state = newState();
  putBlank(state, 'gosc', 'p1', { power: 2, toughness: 2 });
  putCard(state, 'mark', 'mark-of-the-vampire', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'mark'
      && ((c.targets ?? [])[0] === 'gosc' || c.targetId === 'gosc'));
  assert.ok(cast, 'rzut aury');
  execute(state, cast);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('gosc'), state), 4);
  assert.equal(effectiveToughness(state.objects.get('gosc'), state), 4);
  assert.ok(effectiveKeywords(state.objects.get('gosc'), state).includes('lifelink'));
});

test('Mark of the Vampire: {3}{B} nie opłaca się samą niebieską maną', () => {
  const state = newState();
  putBlank(state, 'gosc', 'p1');
  putCard(state, 'mark', 'mark-of-the-vampire', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['U'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'mark');
  assert.equal(casts.length, 0);
});

// --- Simian Simulacrum {3} 2/1: ETB 2x +1/+1, Unearth {2}{G}{G} ------------

test('Simian Simulacrum: dane zgodne z Oracle ({3} 2/1, ETB 2 liczniki, unearth)', () => {
  const def = REGISTRY.get('simian-simulacrum');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 3);
  assert.equal(MANA_COSTS['simian-simulacrum'], '{3}');
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 1);
  assert.deepEqual(def.types, ['Artifact', 'Creature']);
  assert.deepEqual(def.subtypes, ['Ape']);
  const [etb, unearth] = def.abilities;
  assert.equal(etb.trigger.event, 'enter_battlefield');
  assert.equal(etb.trigger.requiresTarget.type, 'creature_you_control');
  assert.equal(etb.effect.type, 'add_counter');
  assert.equal(etb.effect.amount, 2);
  assert.equal(unearth.fromGraveyard, true);
  assert.equal(unearth.timing, 'sorcery');
  assert.equal(unearth.cost.mana, 4);
  assert.deepEqual(unearth.cost.colors, ['G', 'G']);
  assert.equal(unearth.effect.type, 'unearth_return');
});

test('Simian Simulacrum: ETB kładzie 2 liczniki +1/+1 na twojego stwora (także siebie)', () => {
  const state = newState();
  putCard(state, 'malpa', 'simian-simulacrum', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2', { cardName: 'Wrogi' });
  addMana(state, 'p1', 3);
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'malpa'));
  resolveStack(state);
  const ape = [...state.objects.values()].find((o) => o.cardId === 'simian-simulacrum' && o.zone === 'battlefield');
  assert.ok(ape, 'małpa weszła na bitwisko');
  const choices = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(choices.length > 0, 'ETB pyta o cel');
  assert.ok(!choices.some((c) => c.targetId === 'wrog'), 'Oracle: creature you control — wróg odpada');
  const self = choices.find((c) => c.targetId === ape.id);
  assert.ok(self, `może celować w siebie (id=${ape.id}; oferty=${choices.map((c) => c.targetId).join(',')})`);
  execute(state, self);
  resolveStack(state);
  const after = state.objects.get(ape.id);
  assert.equal(after.counters?.['+1/+1'] ?? 0, 2);
});

test('Simian Simulacrum: unearth z grobu — haste, exile na end step', () => {
  const state = newState();
  putCard(state, 'malpa', 'simian-simulacrum', 'p1', 'graveyard');
  addMana(state, 'p1', 4, { colors: ['G', 'G'] });
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'malpa');
  assert.ok(act, 'unearth w ofercie z grobu');
  execute(state, act);
  resolveStack(state);
  const bf = [...state.objects.values()].find((o) => o.cardId === 'simian-simulacrum' && o.zone === 'battlefield');
  assert.ok(bf, 'wrócił na bitwisko');
  assert.ok(effectiveKeywords(bf, state).includes('haste'), 'haste');
  assert.equal(bf.unearthExile, true);
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'end', phase: 'ending' }]);
  resolveStack(state);
  const ex = [...state.objects.values()].find((o) => o.cardId === 'simian-simulacrum' && o.zone === 'exile');
  assert.ok(ex, 'wygnany na end step');
});

test('Simian Simulacrum: unearth NIE jest oferowane na bitwisku', () => {
  const state = newState();
  putCard(state, 'malpa', 'simian-simulacrum', 'p1', 'battlefield');
  addMana(state, 'p1', 4, { colors: ['G', 'G'] });
  const acts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'malpa'
      && c.abilityIndex === 1);
  assert.equal(acts.length, 0, 'fromGraveyard tylko z grobu');
});

test('Simian Simulacrum: unearth tylko jako sorcery', () => {
  const state = newState({ step: 'upkeep' });
  putCard(state, 'malpa', 'simian-simulacrum', 'p1', 'graveyard');
  addMana(state, 'p1', 4, { colors: ['G', 'G'] });
  const acts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'malpa');
  assert.equal(acts.length, 0, 'Activate only as a sorcery');
});
