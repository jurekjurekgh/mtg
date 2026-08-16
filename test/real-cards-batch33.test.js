// Batch 33 (2026-08-16, lista właściciela) — TRANSZA 1: Somberwald Spider,
// Murder of Crows, Kazuul's Toll Collector. Dane Oracle ze Scryfall.
// Pozostałe karty z listy: docs/plans/2026-08-16-m108-batch33.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main' } = {}) {
  const state = createGameState({ seed: 33, players: [{ id: 'p1' }, { id: 'p2' }] });
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
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    equipment: def.equipment, entersWithCounters: def.entersWithCounters,
    entersWithCountersIf: def.entersWithCountersIf,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

const resolveStack = (state) => {
  for (let i = 0; i < 14 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
};

// --- Somberwald Spider {4}{G} 2/4 Reach, Morbid ---------------------------

test('Somberwald Spider: dane karty zgodne z Oracle (2/4, reach, {4}{G})', () => {
  const def = REGISTRY.get('somberwald-spider');
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 5);
  assert.deepEqual(def.keywords, ['reach']);
});

test('Somberwald Spider: BEZ śmierci stwora wchodzi jako 2/4 (brak liczników)', () => {
  const state = newState();
  putCard(state, 'spider', 'somberwald-spider', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'spider');
  assert.ok(cast, 'rzut jest legalny');
  execute(state, cast);
  resolveStack(state);
  const spider = [...state.objects.values()].find((o) => o.cardId === 'somberwald-spider' && o.zone === 'battlefield');
  assert.ok(spider);
  assert.equal(spider.counters?.['+1/+1'] ?? 0, 0, 'morbid nie zachodzi — bez liczników');
});

test('Somberwald Spider: po śmierci stwora wchodzi z dwoma +1/+1 (morbid, CR 614.1c)', () => {
  const state = newState();
  state.creatureDiedThisTurn = true;
  putCard(state, 'spider', 'somberwald-spider', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'spider');
  execute(state, cast);
  resolveStack(state);
  const spider = [...state.objects.values()].find((o) => o.cardId === 'somberwald-spider' && o.zone === 'battlefield');
  assert.equal(spider.counters?.['+1/+1'] ?? 0, 2, 'morbid: dwa liczniki +1/+1');
  assert.ok(effectiveKeywords(spider, state).includes('reach'));
});

// --- Murder of Crows {3}{U}{U} 4/4 Flying ---------------------------------

test('Murder of Crows: śmierć INNEGO stwora daje opcjonalne dobranie z odrzuceniem', () => {
  const state = newState();
  putCard(state, 'crows', 'murder-of-crows', 'p1');
  addObject(state, {
    id: 'victim', instanceId: 'iv', cardId: 'x-test', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('victim', Object.freeze({ ...state.objects.get('victim'), damage: 5 }));
  const before = state.events.length;
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const fired = state.events.slice(before).some((e) => e.type === 'optional_trigger_required'
    || (e.type === 'ability_triggered' && e.cardId === 'murder-of-crows'));
  assert.ok(fired, `trigger „another creature dies" odpalił: ${state.events.slice(before).map((e) => e.type).join(',')}`);
});

test('Murder of Crows: WŁASNA śmierć NIE odpala triggera (excludeSelf)', () => {
  const state = newState();
  putCard(state, 'crows', 'murder-of-crows', 'p1');
  state.objects.set('crows', Object.freeze({ ...state.objects.get('crows'), damage: 99 }));
  const before = state.events.length;
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const fired = state.events.slice(before).some((e) => (e.type === 'ability_triggered' || e.type === 'optional_trigger_required')
    && e.cardId === 'murder-of-crows');
  assert.equal(fired, false, 'Oracle mówi „ANOTHER creature dies" — własna śmierć się nie liczy');
});

// --- Kazuul's Toll Collector {2}{R} 3/2 -----------------------------------

test("Kazuul's Toll Collector: {0} przypina wybrany sprzęt do siebie", () => {
  const state = newState();
  putCard(state, 'ogre', 'kazuuls-toll-collector', 'p1');
  putCard(state, 'sword', 'greatsword-of-tyr', 'p1');
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'ogre' && (c.targets ?? []).includes('sword'));
  assert.ok(act, 'zdolność {0} z celem-sprzętem jest oferowana');
  execute(state, act);
  resolveStack(state);
  assert.equal(state.objects.get('sword').attachedTo, 'ogre', 'sprzęt przypięty do źródła');
});

test("Kazuul's Toll Collector: zdolność tylko jako sorcery (CR 602.5d)", () => {
  const state = newState();
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  putCard(state, 'ogre', 'kazuuls-toll-collector', 'p1');
  putCard(state, 'sword', 'greatsword-of-tyr', 'p1');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'ogre');
  assert.equal(offers.length, 0, 'poza fazą główną zdolności nie ma w ofercie');
});

test("Kazuul's Toll Collector: sprzet PRZECIWNIKA nie jest celem (you control)", () => {
  const state = newState();
  putCard(state, 'ogre', 'kazuuls-toll-collector', 'p1');
  putCard(state, 'sword', 'greatsword-of-tyr', 'p2');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'ogre');
  assert.equal(offers.length, 0);
});
