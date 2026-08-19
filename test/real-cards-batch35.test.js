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
import { addCounter } from '../src/engine/counters.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';

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
    // M146: obniżki kosztu (affinity — Steelfin Whale) i deskryptor sprzętu
    // (grantedAbilities — Blazing Torch) muszą dotrzeć na obiekt gry, inaczej
    // mechanika jest martwa (lekcja L21 — pole spoza fabryki ginie po cichu).
    costReduction: data.costReduction ?? null,
    equipment: data.equipment ?? def.equipment ?? null,
    // Suspend (Mindstab): deskryptor specjalnej akcji z ręki.
    suspend: data.suspend ?? null,
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
  assert.ok(ape, 'małpa weszła na pole bitwy');
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
  assert.ok(bf, 'wrócił na pole bitwy');
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

test('Simian Simulacrum: unearth NIE jest oferowane na polu bitwy', () => {
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

// --- Trade Route Envoy {3}{G} 4/3: ETB draw-if-counter else +1/+1 ----------

test('Trade Route Envoy: dane zgodne z Oracle ({3}{G} Dog Soldier 4/3)', () => {
  const def = REGISTRY.get('trade-route-envoy');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 4);
  assert.equal(MANA_COSTS['trade-route-envoy'], '{3}{G}');
  assert.equal(def.power, 4);
  assert.equal(def.toughness, 3);
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Dog', 'Soldier']);
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].effect.type, 'conditional');
});

test('Trade Route Envoy: ETB dobiera, gdy kontrolujesz stwora z licznikiem', () => {
  const state = newState();
  putBlank(state, 'licznikowy', 'p1', { power: 1, toughness: 1 });
  addCounter(state, 'licznikowy', '+1/+1', 1);
  // Karta w bibliotece, żeby dobranie nie kończyło gry deck-outem (CR 104.3c).
  putCard(state, 'lib1', 'titans-strength', 'p1', 'library');
  const before = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  putCard(state, 'envoy', 'trade-route-envoy', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['G'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'envoy'));
  resolveStack(state);
  const after = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(after, before + 1, 'dobrał kartę (licznik na stworze)');
  const self = [...state.objects.values()].find((o) => o.cardId === 'trade-route-envoy' && o.zone === 'battlefield');
  assert.equal(self.counters?.['+1/+1'] ?? 0, 0, 'bez licznika na sobie');
});

test('Trade Route Envoy: ETB bez stwora z licznikiem → +1/+1 na siebie', () => {
  const state = newState();
  putBlank(state, 'zwykly', 'p1', { power: 1, toughness: 1 });
  const before = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  putCard(state, 'envoy', 'trade-route-envoy', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['G'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'envoy'));
  resolveStack(state);
  const after = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(after, before, 'bez dobrania');
  const self = [...state.objects.values()].find((o) => o.cardId === 'trade-route-envoy' && o.zone === 'battlefield');
  assert.equal(self.counters?.['+1/+1'] ?? 0, 1, '+1/+1 na sobie');
});

// --- Twiddle {U} Instant: tap or untap artifact/creature/land --------------

test('Twiddle: dane zgodne z Oracle ({U} Instant, tryby tap/untap)', () => {
  const def = REGISTRY.get('twiddle');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 1);
  assert.equal(MANA_COSTS['twiddle'], '{U}');
  assert.equal(def.spell.timing, 'instant');
  assert.equal(def.spell.modes.length, 2);
  assert.equal(def.spell.modes[0].effects[0].type, 'tap_permanent');
  assert.equal(def.spell.modes[1].effects[0].type, 'untap_permanent');
  for (const mode of def.spell.modes) {
    assert.equal(mode.targets[0].type, 'artifact_or_creature_or_land');
  }
});

test('Twiddle: tryb Tap tapuje stwora', () => {
  const state = newState();
  putBlank(state, 'cel', 'p1', { power: 2, toughness: 2 });
  putCard(state, 'tw', 'twiddle', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'tw'
      && c.modeIndex === 0 && (c.targets ?? [])[0] === 'cel');
  assert.ok(cast, 'oferta trybu Tap z celem');
  execute(state, cast);
  resolveStack(state);
  assert.equal(state.objects.get('cel').tapped, true);
});

test('Twiddle: tryb Odkręcenie odkręca stwora', () => {
  const state = newState();
  putBlank(state, 'cel', 'p1', { power: 2, toughness: 2 });
  state.objects.set('cel', Object.freeze({ ...state.objects.get('cel'), tapped: true }));
  putCard(state, 'tw', 'twiddle', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'tw'
      && c.modeIndex === 1 && (c.targets ?? [])[0] === 'cel');
  assert.ok(cast, 'oferta trybu Odkręcenie');
  execute(state, cast);
  resolveStack(state);
  assert.equal(state.objects.get('cel').tapped, false);
});

test('Twiddle: celuje w artefakt i land, nie w enchantment', () => {
  const state = newState();
  // artefakt na stole
  addObject(state, {
    id: 'art', instanceId: 'i-art', cardId: 'x-art', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact', manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Artifact'],
  });
  // land na stole
  addObject(state, {
    id: 'land', instanceId: 'i-land', cardId: 'x-land', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'],
  });
  // enchantment (nielegalny cel)
  addObject(state, {
    id: 'ench', instanceId: 'i-ench', cardId: 'x-ench', controllerId: 'p1', zone: 'battlefield',
    kind: 'enchantment', manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Enchantment'],
  });
  putCard(state, 'tw', 'twiddle', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'tw');
  const targets = new Set(casts.flatMap((c) => c.targets ?? []));
  assert.ok(targets.has('art'), 'artefakt jest celem');
  assert.ok(targets.has('land'), 'land jest celem');
  assert.ok(!targets.has('ench'), 'enchantment NIE jest celem (Oracle: artifact, creature, or land)');
});

test('Twiddle: {U} nie opłaca się czerwoną maną', () => {
  const state = newState();
  putBlank(state, 'cel', 'p1');
  putCard(state, 'tw', 'twiddle', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'tw');
  assert.equal(casts.length, 0, 'CR 202.1: pip {U} wymaga niebieskiej many');
});

// --- Steelfin Whale {5}{U} 3/4: affinity, artifact ETB untap ---------------

test('Steelfin Whale: dane zgodne z Oracle ({5}{U} Whale 3/4, affinity)', () => {
  const def = REGISTRY.get('steelfin-whale');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 6);
  assert.equal(MANA_COSTS['steelfin-whale'], '{5}{U}');
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 4);
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.costReduction, { amount: 1, condition: { affinityToArtifacts: true } });
  assert.equal(def.abilities[0].trigger.event, 'artifact_you_control_enters');
  assert.equal(def.abilities[0].effect.type, 'untap_permanent');
});

test('Steelfin Whale: affinity — koszt mniejszy o liczbę artefaktów', () => {
  const state = newState();
  // 2 artefakty kontrolowane
  for (const id of ['a1', 'a2']) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-art', controllerId: 'p1', zone: 'battlefield',
      kind: 'artifact', manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Artifact'],
    });
  }
  putCard(state, 'whale', 'steelfin-whale', 'p1', 'hand');
  // Koszt {5}{U} = 6; affinity redukuje o 2 → trzeba 4 many + {U}.
  addMana(state, 'p1', 4, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'whale');
  assert.ok(cast, `affinity: rzut przy 4 manach z 2 artefaktami (oferty: ${playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'whale').length})`);
  execute(state, cast);
  resolveStack(state);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'steelfin-whale' && o.zone === 'battlefield'), 'whale wszedł na pole bitwy');
});

test('Steelfin Whale: bez artefaktów pełny koszt 6 many', () => {
  const state = newState();
  putCard(state, 'whale', 'steelfin-whale', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['U'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'whale');
  assert.equal(casts.length, 0, 'bez affinity potrzeba pełnych 6 many');
  addMana(state, 'p1', 1, { colors: ['U'] });
  assert.ok(playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'cast_permanent' && c.objectId === 'whale'), 'po dosypaniu many rzut możliwy');
});

test('Steelfin Whale: wejście artefaktu odkręca wieloryba', () => {
  const state = newState();
  putCard(state, 'whale', 'steelfin-whale', 'p1', 'battlefield');
  state.objects.set('whale', Object.freeze({ ...state.objects.get('whale'), tapped: true, summoningSickness: false }));
  assert.equal(state.objects.get('whale').tapped, true);
  // artefakt WCHODZI na pole bitwy prawdziwym rzutem (addObject nie emituje
  // zdarzenia enter_battlefield — trigger by się nie odpalił).
  putCard(state, 'seers', 'seers-lantern', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'seers');
  assert.ok(cast, 'rzut Seer\'s Lantern');
  execute(state, cast);
  resolveStack(state);
  assert.equal(state.objects.get('whale').tapped, false, 'artifact ETB odkręcił wieloryba');
});

// --- Blazing Torch {1} Equipment ------------------------------------------

test('Blazing Torch: dane zgodne z Oracle ({1} Equipment, Equip {1})', () => {
  const def = REGISTRY.get('blazing-torch');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 1);
  assert.equal(MANA_COSTS['blazing-torch'], '{1}');
  assert.deepEqual(def.types, ['Artifact']);
  assert.deepEqual(def.subtypes, ['Equipment']);
  assert.equal(def.equipment.equip, 1);
  const [staticAb, activatedAb] = def.equipment.grantedAbilities;
  assert.equal(staticAb.type, 'static');
  assert.deepEqual(staticAb.cantBeBlockedBySubtypes, ['Vampire', 'Zombie']);
  assert.equal(activatedAb.type, 'activated');
  assert.equal(activatedAb.effect.type, 'damage');
  assert.equal(activatedAb.effect.amount, 2);
});

test('Blazing Torch: wyposażony stwór nie może być blokowany przez Vampira', () => {
  const state = newState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.phase = 'combat';
  putBlank(state, 'atk', 'p1', { power: 2, toughness: 2 });
  state.objects.set('atk', Object.freeze({ ...state.objects.get('atk'), summoningSickness: false }));
  putCard(state, 'torch', 'blazing-torch', 'p1', 'battlefield');
  state.objects.set('torch', Object.freeze({ ...state.objects.get('torch'), summoningSickness: false }));
  attachEquipmentToCreature(state, 'torch', 'atk');
  putBlank(state, 'vamp', 'p2', { power: 1, toughness: 1, subtypes: ['Vampire'] });
  putBlank(state, 'gob', 'p2', { power: 1, toughness: 1, subtypes: ['Goblin'] });
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  const bad = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['vamp'] } });
  assert.ok(!bad.ok, 'Vampire nie może blokować (CR — can\'t be blocked by Vampires)');
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['gob'] } }).ok, 'Goblin może blokować');
});

test('Blazing Torch: zdolność nosiciela — {T}, poświęć pochodnię: 2 obrażenia', () => {
  const state = newState();
  putBlank(state, 'host', 'p1', { power: 2, toughness: 2 });
  state.objects.set('host', Object.freeze({ ...state.objects.get('host'), summoningSickness: false }));
  putCard(state, 'torch', 'blazing-torch', 'p1', 'battlefield');
  attachEquipmentToCreature(state, 'torch', 'host');
  const p2Life = state.players.find((p) => p.id === 'p2').life;
  // „any target" — celujemy w GRACZA (obrażenia idą w życie, nie w stwora)
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'torch'
      && c.grantedFromEquipment && (c.targets ?? [])[0] === 'p2');
  assert.ok(act, 'oferta zdolności nosiciela z celem-graczem');
  execute(state, act);
  resolveStack(state);
  // pochodnia poświęcona (koszt sacrificeSelf)
  assert.ok(!state.objects.get('torch') || state.objects.get('torch').zone !== 'battlefield', 'pochodnia poświęcona');
  // nosiciel zatapnięty ({T} w koszcie — tapHost)
  assert.equal(state.objects.get('host').tapped, true, 'nosiciel zatapnięty');
  // 2 obrażenia na graczu-celu
  assert.equal(state.players.find((p) => p.id === 'p2').life, p2Life - 2);
});

test('Blazing Torch: zdolność nosiciela może też celować w stwora', () => {
  const state = newState();
  putBlank(state, 'host', 'p1', { power: 2, toughness: 2 });
  state.objects.set('host', Object.freeze({ ...state.objects.get('host'), summoningSickness: false }));
  putCard(state, 'torch', 'blazing-torch', 'p1', 'battlefield');
  attachEquipmentToCreature(state, 'torch', 'host');
  putBlank(state, 'cel', 'p2', { power: 1, toughness: 1 });
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'torch'
      && c.grantedFromEquipment && (c.targets ?? [])[0] === 'cel');
  assert.ok(act, 'oferta z celem-stworem');
  execute(state, act);
  resolveStack(state);
  // 1/1 dostaje 2 obrażenia → ginie
  assert.ok(!state.objects.get('cel') || state.objects.get('cel').zone !== 'battlefield', '1/1 ginie od 2 obrażeń');
});

test('Blazing Torch: zdolność nosiciela nieaktywna bez nosiciela (nieprzypięty)', () => {
  const state = newState();
  putCard(state, 'torch', 'blazing-torch', 'p1', 'battlefield');
  putBlank(state, 'cel', 'p2');
  const acts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'torch');
  assert.equal(acts.length, 0, 'bez nosiciela zdolność nie istnieje');
});

// --- Basilisk Gate Land — Gate --------------------------------------------

test('Basilisk Gate: dane zgodne z Oracle (Land — Gate, {T}: {C})', () => {
  const def = REGISTRY.get('basilisk-gate');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(MANA_COSTS['basilisk-gate'], '');
  assert.deepEqual(def.types, ['Land']);
  assert.deepEqual(def.subtypes, ['Gate']);
  assert.equal(def.abilities[0].timing, 'sorcery');
  assert.equal(def.abilities[0].effect.type, 'pump_by_gates');
  const src = getSourceForObject({ id: 'bg', cardId: 'basilisk-gate', kind: 'land', types: ['Land'], subtypes: ['Gate'], controllerId: 'p1' });
  assert.ok(src, 'źródło many (MANA_SOURCE_MAP)');
  assert.deepEqual(src.colors, [], '{T}: Add {C} — bezbarwna');
});

test('Basilisk Gate: {2},{T}: +X/+X, X = liczba bram — 1 brama daje +1/+1', () => {
  const state = newState();
  putCard(state, 'gate', 'basilisk-gate', 'p1', 'battlefield');
  putBlank(state, 'cel', 'p1', { power: 2, toughness: 2 });
  addMana(state, 'p1', 2);
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'gate' && (c.targets ?? [])[0] === 'cel');
  assert.ok(act, 'oferta {2},{T} z celem');
  execute(state, act);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('cel'), state), 3, '+1/+1 przy 1 bramie');
  assert.equal(effectiveToughness(state.objects.get('cel'), state), 3);
  assert.equal(state.objects.get('gate').tapped, true, 'brama zatapnięta');
});

test('Basilisk Gate: X rośnie z liczbą bram — 2 bramy dają +2/+2', () => {
  const state = newState();
  putCard(state, 'gate1', 'basilisk-gate', 'p1', 'battlefield');
  putCard(state, 'gate2', 'basilisk-gate', 'p1', 'battlefield');
  putBlank(state, 'cel', 'p1', { power: 2, toughness: 2 });
  addMana(state, 'p1', 2);
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'gate1' && (c.targets ?? [])[0] === 'cel');
  assert.ok(act, 'oferta z celem');
  execute(state, act);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('cel'), state), 4, '+2/+2 przy 2 bramach');
  assert.equal(effectiveToughness(state.objects.get('cel'), state), 4);
});

test('Basilisk Gate: „Activate only as a sorcery" — brak oferty w upkeepie', () => {
  const state = newState({ step: 'upkeep' });
  putCard(state, 'gate', 'basilisk-gate', 'p1', 'battlefield');
  putBlank(state, 'cel', 'p1');
  addMana(state, 'p1', 2);
  const acts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'gate');
  assert.equal(acts.length, 0, 'tylko sorcery');
});

// --- Mindstab {5}{B} Sorcery: discard 3, Suspend 4—{B} --------------------

test('Mindstab: dane zgodne z Oracle ({5}{B} Sorcery, Suspend 4—{B})', () => {
  const def = REGISTRY.get('mindstab');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 6);
  assert.equal(MANA_COSTS['mindstab'], '{5}{B}');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['player']);
  assert.equal(def.spell.effects[0].type, 'discard_cards');
  assert.equal(def.spell.effects[0].amount, 3);
  assert.equal(def.spell.effects[0].applyTo, 'target');
  assert.deepEqual(def.suspend, { cost: 1, colors: ['B'], timeCounters: 4 });
});

test('Mindstab: normalny rzut {5}{B} — cel odrzuca 3 karty', () => {
  const state = newState();
  putCard(state, 'ms', 'mindstab', 'p1', 'hand');
  // przeciwnik ma 3 karty w ręce
  putBlank(state, 'h1', 'p2', { zone: 'hand' });
  putBlank(state, 'h2', 'p2', { zone: 'hand' });
  putBlank(state, 'h3', 'p2', { zone: 'hand' });
  addMana(state, 'p1', 6, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ms' && (c.targets ?? [])[0] === 'p2');
  assert.ok(cast, 'oferta rzutu na gracza');
  execute(state, cast);
  resolveStack(state);
  const p2Hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.equal(p2Hand, 0, 'cel odrzucił 3 karty');
});

test('Mindstab: suspend — zapłać {B}, karta do exile z 4 licznikami czasu', () => {
  const state = newState();
  putCard(state, 'ms', 'mindstab', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const susp = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'suspend_card' && c.objectId === 'ms');
  assert.ok(susp, 'oferta suspend');
  execute(state, susp);
  const ex = [...state.objects.values()].find((o) => o.cardId === 'mindstab' && o.zone === 'exile');
  assert.ok(ex, 'karta w exile');
  assert.equal(ex.suspended, true);
  assert.equal(ex.timeCounters, 4);
  // mana wydana — w puli nic nie zostało ({B} = 1)
  assert.equal(state.players.find((p) => p.id === 'p1').mana ?? 0, 0, 'koszt {B} zapłacony');
});

test('Mindstab: ostatni licznik → zdolność wyzwalana → rzut bez kosztu (CR 702.62a)', () => {
  const state = newState();
  putCard(state, 'ms', 'mindstab', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'suspend_card' && c.objectId === 'ms'));
  // 4 upkeeppy — każdy zdejmuje po jednym liczniku; czwarty odpala zdolność
  // wyzwalaną (idzie na stos)
  for (let i = 0; i < 4; i += 1) {
    state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
    state.turn.activePlayerId = 'p1';
    state.turn.priorityPlayerId = 'p1';
    processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
    resolveStack(state);
  }
  const ex = [...state.objects.values()].find((o) => o.cardId === 'mindstab' && o.zone === 'exile');
  assert.ok(ex, 'karta wciąż w exile');
  assert.equal(ex.timeCounters, 0, 'wszystkie liczniki zdjęte');
  assert.equal(ex.suspended, true, 'nadal zawieszona (decyzja czeka)');
  // Decyzja jednorazowa: resolve_suspend_cast z wariantami rzutu
  putBlank(state, 'h1', 'p2', { zone: 'hand' });
  putBlank(state, 'h2', 'p2', { zone: 'hand' });
  putBlank(state, 'h3', 'p2', { zone: 'hand' });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_suspend_cast');
  assert.ok(offers.some((c) => !c.cast), 'oferta rezygnacji');
  const cast = offers.find((c) => c.cast && (c.targets ?? [])[0] === 'p2');
  assert.ok(cast, 'oferta rzutu bez kosztu (bez many w puli)');
  execute(state, cast);
  resolveStack(state);
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 0, 'cel odrzucił 3');
});

test('Mindstab: rezygnacja = karta zostaje w wygnaniu NA STAŁE (bez drugiej szansy)', () => {
  const state = newState();
  putCard(state, 'ms', 'mindstab', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'suspend_card' && c.objectId === 'ms'));
  for (let i = 0; i < 4; i += 1) {
    state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
    state.turn.activePlayerId = 'p1';
    state.turn.priorityPlayerId = 'p1';
    processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
    resolveStack(state);
  }
  const decline = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_suspend_cast' && !c.cast);
  assert.ok(decline, 'oferta rezygnacji');
  execute(state, decline);
  const ex = [...state.objects.values()].find((o) => o.cardId === 'mindstab' && o.zone === 'exile');
  assert.ok(ex, 'karta w exile');
  assert.equal(ex.suspended, false, 'status zawieszenia zdjęty');
  // Kolejne upkeeppy nie dają drugiej szansy — brak oferty rzutu
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  resolveStack(state);
  assert.ok(!playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'resolve_suspend_cast' && c.cast), 'brak drugiej szansy na rzut');
  assert.ok(!playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'cast_spell' && c.objectId === ex.id), 'karta nie jest rzucalna z exile');
});

test('Mindstab: suspend tylko gdy można zacząć rzucać (sorcery — nie w upkeepie)', () => {
  const state = newState({ step: 'upkeep' });
  putCard(state, 'ms', 'mindstab', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const susp = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'suspend_card');
  assert.equal(susp.length, 0, 'suspend jak rzut sorcery — tylko w main phase przy pustym stosie');
});
