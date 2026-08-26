// M218/3 — keywordy: flying/reach/first strike — własne logiki właściciela
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

function baseState(seed = 31, active = 'p2', step = 'declare_blockers') {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
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
  return state.objects.get(id);
}

function addCobra(state, id = 'cobra') {
  const def = REAL_REGISTRY.get('death-hood-cobra');
  addObject(state, {
    id,
    instanceId: `i-${id}`,
    cardId: 'death-hood-cobra',
    controllerId: 'p2',
    ownerId: 'p2',
    zone: 'battlefield',
    kind: 'creature',
    power: 2,
    toughness: 2,
    manaCost: 2,
    abilities: def.abilities ?? [],
    keywords: [],
    subtypes: ['Snake'],
    types: ['Creature'],
    colors: ['G'],
    summoningSickness: false,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

// Synthetic cards for FS and flying with custom power
const testFlyingCard = defineCard({
  id: 'test-flying-granter',
  name: 'Test Flying Granter',
  types: ['Creature'],
  colors: ['U'],
  power: 2,
  toughness: 2,
  manaCost: 2,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.activated,
      cost: { mana: 2, colors: ['U'] },
      effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['flying'] },
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

const testFlyingCard3 = defineCard({
  id: 'test-flying-granter-3',
  name: 'Test Flying Granter 3/3',
  types: ['Creature'],
  colors: ['U'],
  power: 3,
  toughness: 3,
  manaCost: 2,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.activated,
      cost: { mana: 2, colors: ['U'] },
      effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['flying'] },
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

const testFSCard = defineCard({
  id: 'test-fs-granter',
  name: 'Test FS Granter',
  types: ['Creature'],
  colors: ['W'],
  power: 2,
  toughness: 2,
  manaCost: 2,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.activated,
      cost: { mana: 1, colors: ['W'] },
      effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['first_strike'] },
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

const testFSCard3 = defineCard({
  id: 'test-fs-granter-3',
  name: 'Test FS Granter 3/3',
  types: ['Creature'],
  colors: ['W'],
  power: 3,
  toughness: 3,
  manaCost: 2,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.activated,
      cost: { mana: 1, colors: ['W'] },
      effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['first_strike'] },
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

const testDTCard = defineCard({
  id: 'test-dt-granter',
  name: 'Test DT Granter',
  types: ['Creature'],
  colors: ['G'],
  power: 1,
  toughness: 1,
  manaCost: 1,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.activated,
      cost: { mana: 1 },
      effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['deathtouch'] },
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

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
    colors: ['U'],
    summoningSickness: false,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

const REG_WITH_FS = makeTestRegistry([testFSCard, testFSCard3, testFlyingCard, testFlyingCard3, testDTCard]);

const isCobraReach = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'cobra' && cmd.abilityIndex === 0;
const isCobraDT = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'cobra' && cmd.abilityIndex === 1;

// --- reach tests ---

test('M218/3a: reach — bot AKTYWUJE gdy wróg atakuje z flying (M173/E2)', () => {
  const state = baseState(31, 'p1', 'declare_attackers');
  addCobra(state);
  addCreature(state, 'flyer', 'p1', 1, 2, ['flying']);
  state.combat = {
    attackers: ['flyer'],
    attackingPlayerId: 'p1',
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.priorityPlayerId = 'p2';
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some(isCobraReach), 'oferta reach');
  const chosen = createHeuristicBot({ seed: 31 }).chooseCommand(view, {});
  assert.ok(isCobraReach(chosen), `reach vs flying attack: ${JSON.stringify(chosen)}`);
});

test('M218/3b: reach — bot NIE aktywuje gdy wróg NIE ma flying', () => {
  const state = baseState(32, 'p1', 'declare_blockers');
  addCobra(state);
  addCreature(state, 'foe', 'p1', 2, 2, []);
  state.combat = {
    attackers: ['foe'],
    attackingPlayerId: 'p1',
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some(isCobraReach), 'oferta reach');
  const chosen = createHeuristicBot({ seed: 32 }).chooseCommand(view, {});
  assert.ok(!isCobraReach(chosen), `reach bez flying attacker: ${JSON.stringify(chosen)}`);
});

test('M218/3c: reach — bot NIE aktywuje gdy stwór ma cantBlock', () => {
  const state = baseState(33, 'p1', 'declare_blockers');
  addCobra(state, 'cobra');
  const base = state.objects.get('cobra');
  state.objects.set('cobra', Object.freeze({ ...base, cantBlock: true }));
  addCreature(state, 'flyer', 'p1', 1, 2, ['flying']);
  state.combat = {
    attackers: ['flyer'],
    attackingPlayerId: 'p1',
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
  const view = playerView(state, 'p2');
  const cobraView = view.zones.battlefield.find((o) => o.id === 'cobra');
  assert.equal(cobraView.cantBlock, true, 'cobra cantBlock w widoku');
  assert.ok(view.legalCommands.some(isCobraReach), 'oferta reach mimo cantBlock');
  const chosen = createHeuristicBot({ seed: 33 }).chooseCommand(view, {});
  assert.ok(!isCobraReach(chosen), `reach na cantBlock: ${JSON.stringify(chosen)}`);
});

// --- flying tests ---

test('M218/3d: flying na atakującym — bot AKTYWUJE gdy wróg NIE MA latających blokerów', () => {
  const state = baseState(34, 'p2', 'declare_attackers');
  addTestCreature(state, testFlyingCard, 'grantr');
  addCreature(state, 'blk', 'p1', 2, 2, []); // ground blocker
  state.combat = {
    attackers: ['grantr'],
    attackingPlayerId: 'p2',
    blockers: new Map([['grantr', ['blk']]]),
    blockedAttackers: new Set(['grantr']),
  };
  const view = playerView(state, 'p2');
  const isFlying = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'grantr';
  assert.ok(view.legalCommands.some(isFlying), 'oferta flying');
  const chosen = createHeuristicBot({ seed: 34, registry: REG_WITH_FS }).chooseCommand(view, {});
  assert.ok(isFlying(chosen), `flying vs ground blocker: ${JSON.stringify(chosen)}`);
});

test('M218/3e: flying na atakującym — bot NIE aktywuje gdy wróg MA latającego blokera', () => {
  const state = baseState(35, 'p2', 'declare_attackers');
  addTestCreature(state, testFlyingCard, 'grantr');
  addCreature(state, 'fblk', 'p1', 2, 2, ['flying']);
  state.combat = {
    attackers: ['grantr'],
    attackingPlayerId: 'p2',
    blockers: new Map([['grantr', ['fblk']]]),
    blockedAttackers: new Set(['grantr']),
  };
  const view = playerView(state, 'p2');
  const isFlying = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'grantr';
  assert.ok(view.legalCommands.some(isFlying), 'oferta flying');
  const chosen = createHeuristicBot({ seed: 35, registry: REG_WITH_FS }).chooseCommand(view, {});
  assert.ok(!isFlying(chosen), `flying vs flying blocker (nie czyni nieblokowalnym): ${JSON.stringify(chosen)}`);
});

test('M218/3f: flying na atakującym — bot NIE aktywuje gdy wróg MA reach blokera', () => {
  const state = baseState(36, 'p2', 'declare_attackers');
  addTestCreature(state, testFlyingCard, 'grantr');
  addCreature(state, 'rblk', 'p1', 2, 3, ['reach']);
  state.combat = {
    attackers: ['grantr'],
    attackingPlayerId: 'p2',
    blockers: new Map([['grantr', ['rblk']]]),
    blockedAttackers: new Set(['grantr']),
  };
  const view = playerView(state, 'p2');
  const isFlying = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'grantr';
  const chosen = createHeuristicBot({ seed: 36, registry: REG_WITH_FS }).chooseCommand(view, {});
  assert.ok(!isFlying(chosen), `flying vs reach blocker: ${JSON.stringify(chosen)}`);
});

test('M218/3g: flying na blokującym — bot AKTYWUJE gdy wróg atakuje z flying (jak reach)', () => {
  const state = baseState(37, 'p1', 'declare_blockers');
  addTestCreature(state, testFlyingCard, 'grantr');
  addCreature(state, 'flyer', 'p1', 2, 2, ['flying']);
  state.combat = {
    attackers: ['flyer'],
    attackingPlayerId: 'p1',
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
  const view = playerView(state, 'p2');
  const isFlying = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'grantr';
  assert.ok(view.legalCommands.some(isFlying), 'oferta flying jako bloker');
  const chosen = createHeuristicBot({ seed: 37, registry: REG_WITH_FS }).chooseCommand(view, {});
  assert.ok(isFlying(chosen), `flying jako obrona vs flying: ${JSON.stringify(chosen)}`);
});

// --- first strike tests ---

test('M218/3h: first strike — bot AKTYWUJE gdy zmienia wynik (2/2 vs 2/2 FS blokera)', () => {
  const state = baseState(38, 'p2', 'declare_blockers');
  addTestCreature(state, testFSCard, 'fsgrantr');
  addCreature(state, 'blk', 'p1', 2, 2, ['first_strike']);
  state.combat = {
    attackers: ['fsgrantr'],
    attackingPlayerId: 'p2',
    blockers: new Map([['fsgrantr', ['blk']]]),
    blockedAttackers: new Set(['fsgrantr']),
  };
  const view = playerView(state, 'p2');
  const isFS = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'fsgrantr';
  assert.ok(view.legalCommands.some(isFS), 'oferta first strike');
  const chosen = createHeuristicBot({ seed: 38, registry: REG_WITH_FS }).chooseCommand(view, {});
  assert.ok(isFS(chosen), `FS zmienia wynik 2/2 vs 2/2 FS: ${JSON.stringify(chosen)}`);
});

test('M218/3i: first strike — bot NIE aktywuje gdy NIE zmienia wyniku (3/3 vs 2/2)', () => {
  // 3/3 vs 2/2 bez FS: 3/3 zabija 2/2 i przeżywa (2<3). Z FS wynik identyczny (deadBlockers, attackerDies) — brak zmiany.
  const state = baseState(39, 'p2', 'declare_blockers');
  addTestCreature(state, testFSCard3, 'fsgrantr');
  addCreature(state, 'blk', 'p1', 2, 2, []);
  state.combat = {
    attackers: ['fsgrantr'],
    attackingPlayerId: 'p2',
    blockers: new Map([['fsgrantr', ['blk']]]),
    blockedAttackers: new Set(['fsgrantr']),
  };
  const view = playerView(state, 'p2');
  const isFS = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'fsgrantr';
  const chosen = createHeuristicBot({ seed: 39, registry: REG_WITH_FS }).chooseCommand(view, {});
  assert.ok(!isFS(chosen), `FS bez zmiany wyniku 3/3 vs 2/2: ${JSON.stringify(chosen)}`);
});

test('M218/3j: deathtouch — bot AKTYWUJE gdy zmienia wynik (1/1 vs 5/5)', () => {
  const state = baseState(40, 'p2', 'declare_blockers');
  addTestCreature(state, testDTCard, 'dtgrantr');
  addCreature(state, 'blk', 'p1', 5, 5, []);
  state.combat = {
    attackers: ['dtgrantr'],
    attackingPlayerId: 'p2',
    blockers: new Map([['dtgrantr', ['blk']]]),
    blockedAttackers: new Set(['dtgrantr']),
  };
  const view = playerView(state, 'p2');
  const isDT = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'dtgrantr';
  assert.ok(view.legalCommands.some(isDT), 'oferta deathtouch');
  const chosen = createHeuristicBot({ seed: 40, registry: REG_WITH_FS }).chooseCommand(view, {});
  assert.ok(isDT(chosen), `deathtouch 1/1 vs 5/5 zmienia wynik: ${JSON.stringify(chosen)}`);
});

test('M218/3k: deathtouch — bot NIE aktywuje gdy NIE zmienia wyniku (3/3 vs 2/2)', () => {
  // 3/3 vs 2/2: bez DT i tak zabija 2/2 i przeżywa. Z DT wynik identyczny.
  const state = baseState(41, 'p2', 'declare_blockers');
  const dtCard3 = defineCard({
    id: 'test-dt-granter-3',
    name: 'Test DT 3/3',
    types: ['Creature'],
    colors: ['G'],
    power: 3,
    toughness: 3,
    manaCost: 1,
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 1 },
        effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['deathtouch'] },
      }),
    ],
    support: { status: 'supported', limitations: [] },
  });
  const reg = makeTestRegistry([dtCard3]);
  addObject(state, {
    id: 'dtgrantr',
    instanceId: 'i-dt',
    cardId: dtCard3.id,
    controllerId: 'p2',
    ownerId: 'p2',
    zone: 'battlefield',
    kind: 'creature',
    power: 3,
    toughness: 3,
    manaCost: 1,
    abilities: dtCard3.abilities ?? [],
    keywords: [],
    subtypes: [],
    types: ['Creature'],
    colors: ['G'],
    summoningSickness: false,
  });
  state.objects.set('dtgrantr', Object.freeze({ ...state.objects.get('dtgrantr'), summoningSickness: false }));
  addCreature(state, 'blk', 'p1', 2, 2, []);
  state.combat = {
    attackers: ['dtgrantr'],
    attackingPlayerId: 'p2',
    blockers: new Map([['dtgrantr', ['blk']]]),
    blockedAttackers: new Set(['dtgrantr']),
  };
  const view = playerView(state, 'p2');
  const isDT = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'dtgrantr';
  const chosen = createHeuristicBot({ seed: 41, registry: reg }).chooseCommand(view, {});
  assert.ok(!isDT(chosen), `deathtouch bez zmiany 3/3 vs 2/2: ${JSON.stringify(chosen)}`);
});
