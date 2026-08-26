// M218/4 — regenerate + scry/surveil w czarach — okna i zagrożenie
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAbility, ABILITY_TYPE } from '../src/engine/abilities.js';

const REAL_REGISTRY = createCardRegistry();

function makeTestRegistry(extraCards) {
  const all = [...REAL_REGISTRY.all(), ...extraCards];
  return createRegistry(all);
}

function baseState(seed = 51, active = 'p2', step = 'declare_blockers') {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  // Library for scry/surveil
  for (let i = 0; i < 5; i += 1) {
    addObject(state, {
      id: `lib${i}`,
      instanceId: `i-lib${i}`,
      cardId: 'goblin-piker',
      controllerId: 'p2',
      ownerId: 'p2',
      zone: 'library',
      kind: 'creature',
      power: 2,
      toughness: 2,
      manaCost: 2,
      abilities: [],
      keywords: [],
      subtypes: [],
      types: ['Creature'],
      colors: ['R'],
    });
  }
  return state;
}

function addCreature(state, id, controllerId, power, toughness, keywords = [], extra = {}) {
  addObject(state, {
    id,
    instanceId: `i-${id}`,
    cardId: 'goblin-piker',
    controllerId,
    ownerId: controllerId,
    zone: 'battlefield',
    kind: 'creature',
    power,
    toughness,
    manaCost: 2,
    abilities: [],
    keywords,
    subtypes: [],
    types: ['Creature'],
    colors: ['R'],
    summoningSickness: false,
    ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
}

// Test cards
const regenCard = defineCard({
  id: 'test-regenerate',
  name: 'Test Regenerate',
  types: ['Creature'],
  colors: ['B'],
  power: 2,
  toughness: 2,
  manaCost: 2,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.activated,
      cost: { mana: 2, colors: ['B'] },
      effect: { type: 'regenerate' },
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

const scryInstantCard = defineCard({
  id: 'test-scry-instant',
  name: 'Test Scry Instant',
  types: ['Instant'],
  colors: ['U'],
  manaCost: 2,
  spell: {
    timing: 'instant',
    effects: [{ type: 'scry', amount: 1 }],
  },
  support: { status: 'supported', limitations: [] },
});

const scrySorceryCard = defineCard({
  id: 'test-scry-sorcery',
  name: 'Test Scry Sorcery',
  types: ['Sorcery'],
  colors: ['U'],
  manaCost: 2,
  spell: {
    timing: 'sorcery',
    effects: [{ type: 'scry', amount: 1 }],
  },
  support: { status: 'supported', limitations: [] },
});

const REG = makeTestRegistry([regenCard, scryInstantCard, scrySorceryCard]);

function addTestCreature(state, def, id) {
  addObject(state, {
    id,
    instanceId: `i-${id}`,
    cardId: def.id,
    controllerId: 'p2',
    ownerId: 'p2',
    zone: 'battlefield',
    kind: 'creature',
    power: def.power ?? 2,
    toughness: def.toughness ?? 2,
    manaCost: def.manaCost ?? 2,
    abilities: def.abilities ?? [],
    keywords: [],
    subtypes: [],
    types: ['Creature'],
    colors: ['B'],
    summoningSickness: false,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function addSpellToHand(state, def, id) {
  addObject(state, {
    id,
    instanceId: `i-${id}`,
    cardId: def.id,
    controllerId: 'p2',
    ownerId: 'p2',
    zone: 'hand',
    kind: 'spell',
    manaCost: def.manaCost ?? 2,
    spell: def.spell ?? null,
    types: def.types ?? [],
    colors: def.colors ?? [],
  });
}

// --- regenerate tests ---

test('M218/4a: regenerate — bot AKTYWUJE gdy stwór zagrożony w walce (1/1 blokuje 2/2)', () => {
  const state = baseState(51, 'p1', 'declare_blockers');
  addTestCreature(state, regenCard, 'regen');
  addCreature(state, 'foe', 'p1', 2, 2, []);
  state.combat = {
    attackers: ['foe'],
    attackingPlayerId: 'p1',
    blockers: new Map([['foe', ['regen']]]),
    blockedAttackers: new Set(['foe']),
  };
  const view = playerView(state, 'p2');
  const isRegen = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'regen';
  assert.ok(view.legalCommands.some(isRegen), 'oferta regenerate');
  const chosen = createHeuristicBot({ seed: 51, registry: REG }).chooseCommand(view, {});
  assert.ok(isRegen(chosen), `regen gdy zagrożony: ${JSON.stringify(chosen)}`);
});

test('M218/4b: regenerate — bot NIE aktywuje gdy stwór NIE zagrożony (brak walki)', () => {
  const state = baseState(52, 'p2', 'main');
  addTestCreature(state, regenCard, 'regen');
  const view = playerView(state, 'p2');
  const isRegen = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'regen';
  assert.ok(view.legalCommands.some(isRegen), 'oferta regenerate');
  const chosen = createHeuristicBot({ seed: 52, registry: REG }).chooseCommand(view, {});
  assert.ok(!isRegen(chosen), `regen bez zagrożenia: ${JSON.stringify(chosen)}`);
});

test('M218/4c: regenerate — bot NIE aktywuje gdy tarcza już istnieje', () => {
  const state = baseState(53, 'p1', 'declare_blockers');
  addTestCreature(state, regenCard, 'regen');
  addCreature(state, 'foe', 'p1', 2, 2, []);
  state.combat = {
    attackers: ['foe'],
    attackingPlayerId: 'p1',
    blockers: new Map([['foe', ['regen']]]),
    blockedAttackers: new Set(['foe']),
  };
  state.regenerationShields = ['regen'];
  const view = playerView(state, 'p2');
  assert.ok((view.regenerationShields ?? []).includes('regen'), 'tarcza w widoku');
  const isRegen = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'regen';
  const chosen = createHeuristicBot({ seed: 53, registry: REG }).chooseCommand(view, {});
  assert.ok(!isRegen(chosen), `regen gdy tarcza już jest: ${JSON.stringify(chosen)}`);
});

// --- scry instant tests ---

test('M218/4d: scry instant — bot RZUCA w end step przeciwnika (optymalne okno)', () => {
  const state = baseState(54, 'p1', 'end');
  addSpellToHand(state, scryInstantCard, 'scry');
  addMana(state, 'p2', 2);
  const view = playerView(state, 'p2');
  const isScry = (cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'scry';
  assert.ok(view.legalCommands.some(isScry), 'oferta scry instant');
  const chosen = createHeuristicBot({ seed: 54, registry: REG }).chooseCommand(view, {});
  assert.ok(isScry(chosen), `scry instant w end step wroga: ${JSON.stringify(chosen)}`);
});

test('M218/4e: scry instant — bot NIE rzuca w main1 własnej tury (przedwczesny wydatek)', () => {
  const state = baseState(55, 'p2', 'main');
  addSpellToHand(state, scryInstantCard, 'scry');
  addMana(state, 'p2', 2);
  const view = playerView(state, 'p2');
  const isScry = (cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'scry';
  assert.ok(view.legalCommands.some(isScry), 'oferta scry instant');
  const chosen = createHeuristicBot({ seed: 55, registry: REG }).chooseCommand(view, {});
  assert.ok(!isScry(chosen), `scry instant w main1: ${JSON.stringify(chosen)}`);
});

test('M218/4f: scry sorcery — bot RZUCA w postcombat main2 (optymalne okno sorcery)', () => {
  const state = baseState(56, 'p2', 'main');
  state.turn.phase = 'postcombat_main';
  state.turn.step = 'main2';
  addSpellToHand(state, scrySorceryCard, 'scry');
  addMana(state, 'p2', 2);
  const view = playerView(state, 'p2');
  const isScry = (cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'scry';
  assert.ok(view.legalCommands.some(isScry), 'oferta scry sorcery');
  const chosen = createHeuristicBot({ seed: 56, registry: REG }).chooseCommand(view, {});
  assert.ok(isScry(chosen), `scry sorcery w main2: ${JSON.stringify(chosen)}`);
});

test('M218/4g: scry sorcery — bot NIE rzuca w precombat main1 gdy brak walki', () => {
  const state = baseState(57, 'p2', 'main');
  state.turn.phase = 'precombat_main';
  state.turn.step = 'main1';
  addSpellToHand(state, scrySorceryCard, 'scry');
  addMana(state, 'p2', 2);
  const view = playerView(state, 'p2');
  const isScry = (cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'scry';
  const chosen = createHeuristicBot({ seed: 57, registry: REG }).chooseCommand(view, {});
  assert.ok(!isScry(chosen), `scry sorcery w precombat main1: ${JSON.stringify(chosen)}`);
});
