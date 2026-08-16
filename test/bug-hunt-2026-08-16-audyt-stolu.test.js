// M106 — audyt „z perspektywy gracza" Żywym Testerem (zlecenie właściciela
// 2026-08-16). Testy regresyjne dla DZIESIĘCIU znalezisk z siedmiu partii na
// prawdziwym artefakcie. Metoda i transkrypty:
// docs/plans/2026-08-16-m106-audyt-stolu.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { beginTurn } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main', activePlayerId = 'p1', turnNumber = 5 } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, activePlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
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
    equipment: def.equipment, aura: def.aura, bestow: def.bestow, morph: def.morph,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

const resolveStack = (state) => {
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
};

const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (id) => id,
  cardIdOf: () => null,
};

// =============================================================================
// Z1 — masowy buff „do końca tury" MUSI być widoczny (oś 2 audytu)
// =============================================================================

test('Z1: Hysterical Blindness (−4/−0 stworom przeciwnika) emituje opisywalne zdarzenie', () => {
  const state = newState();
  putCard(state, 'hb', 'hysterical-blindness', 'p1', 'hand');
  addCreature(state, 'foe1', 'p2');
  addCreature(state, 'foe2', 'p2');
  addMana(state, 'p1', 3, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'hb');
  assert.ok(cast, 'czar jest w ofercie');
  execute(state, cast);
  resolveStack(state);
  const mass = state.events.filter((e) => e.type === 'mass_stats_modified');
  assert.equal(mass.length, 1, 'masowy buff zgłasza się jednym zdarzeniem');
  assert.equal(mass[0].scope, 'opponents');
  assert.equal(mass[0].objectIds.length, 2, 'zbiór ustalony przy rozstrzygnięciu (CR 611.2c)');
  const text = describeGameEvent(mass[0], HELPERS);
  assert.match(text, /stwory przeciwnika/, `opis dla gracza: ${text}`);
  assert.match(text, /-4\/-0/, `konwencja MtG „-4/-0": ${text}`);
});

test('Z1: buff własnych stworów też jest opisany (Angel of the Dawn)', () => {
  const state = newState();
  addCreature(state, 'mine', 'p1');
  const event = {
    type: 'mass_stats_modified', scope: 'yours', objectIds: ['mine'],
    powerModifier: 1, toughnessModifier: 1, keywords: ['vigilance'],
  };
  const text = describeGameEvent(event, HELPERS);
  assert.match(text, /twoje stwory/);
  assert.match(text, /\+1\/\+1/);
  assert.match(text, /czujno/i, `keyword w opisie: ${text}`);
});

test('Z1: pusty zbiór (nie ma na kogo działać) nie zaśmieca logu', () => {
  const text = describeGameEvent({
    type: 'mass_stats_modified', scope: 'opponents', objectIds: [],
    powerModifier: -4, toughnessModifier: 0, keywords: [],
  }, HELPERS);
  assert.equal(text, null);
});

// =============================================================================
// Z4 — turn_started PRZED odkręceniem (CR 500.1/502.1)
// =============================================================================

test('Z4: zdarzenia kroku odkręcania należą do NOWEJ tury, nie do poprzedniej', () => {
  const state = newState({ turnNumber: 4 });
  addCreature(state, 'tapped-one', 'p1');
  state.objects.set('tapped-one', Object.freeze({ ...state.objects.get('tapped-one'), tapped: true }));
  const before = state.events.length;
  beginTurn(state, 'p1');
  const types = state.events.slice(before).map((e) => e.type);
  const startIndex = types.indexOf('turn_started');
  const untapIndex = types.indexOf('object_untapped');
  assert.ok(startIndex >= 0 && untapIndex >= 0, `oba zdarzenia są: ${types.join(',')}`);
  assert.ok(startIndex < untapIndex,
    'CR 500.1/502.1: tura zaczyna się krokiem odkręcania — nagłówek tury musi być PIERWSZY');
});

test('Z4: turn_started nadal niesie listę odkręconych obiektów', () => {
  const state = newState({ turnNumber: 4 });
  addCreature(state, 'tapped-one', 'p1');
  state.objects.set('tapped-one', Object.freeze({ ...state.objects.get('tapped-one'), tapped: true }));
  const before = state.events.length;
  beginTurn(state, 'p1');
  const started = state.events.slice(before).find((e) => e.type === 'turn_started');
  assert.deepEqual(started.untapped, ['tapped-one']);
});

// =============================================================================
// Z8 — widok stosu niesie cele zdolności aktywowanych (ADR 0017)
// =============================================================================

test('Z8: cele zdolności na stosie są widoczne w PlayerView (informacja publiczna)', () => {
  const state = newState();
  putCard(state, 'bark', 'barkform-harvester');
  putCard(state, 'gy', 'hunters-blowgun', 'p1', 'graveyard');
  addMana(state, 'p1', 4);
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'bark');
  assert.ok(act, 'zdolność jest oferowana');
  execute(state, act);
  const stack = playerView(state, 'p1').zones.stack;
  assert.equal(stack.length, 1, 'zdolność czeka na stosie');
  assert.deepEqual(stack[0].targets, ['gy'],
    'bez celów w widoku bot nie wie, że już celuje w ten obiekt (M106/Z8)');
});

// =============================================================================
// Z5 — grupa equipu nazywa się „Wyposaż", nie „Cel zdolności"
// =============================================================================

test('Z5: tytuł grupy wariantów equipu mówi „Wyposaż"', async () => {
  const { choiceGroupTitle } = await import('../src/table/render.js');
  const state = newState();
  putCard(state, 'blowgun', 'hunters-blowgun');
  addCreature(state, 'c1', 'p1');
  addCreature(state, 'c2', 'p1');
  addMana(state, 'p1', 4);
  const view = playerView(state, 'p1');
  const equips = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'blowgun');
  assert.ok(equips.length >= 2, `dwa warianty equipu: ${equips.length}`);
  const session = { state, nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId };
  const title = choiceGroupTitle({ type: 'target', options: equips }, session, view);
  assert.match(title, /Wyposaż: Hunter's Blowgun/, `tytuł grupy: ${title}`);
});
