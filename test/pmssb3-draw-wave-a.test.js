// PMSSB-3 fala A: strażnicy deck-outu (waskie-smiertelne).
// F9b: mayFire-draw (murder/curiosity) przy pustej bibliotece = odmowa (-100, lustro E2/A1b).
// F10: ETB-draw/draw_then_discard dostaje drawDeckingPenalty (lustro cast/ability, L41).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}
function fillLibrary(state, n) {
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: `x-lib${i}`, controllerId: 'p1', zone: 'library',
      kind: 'creature', power: 0, toughness: 0, manaCost: 2,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `lib${i}`,
    });
  }
}
function addBasics(state, cardId, count, tag) {
  const def = REGISTRY.get(cardId);
  for (let i = 0; i < count; i += 1) {
    addObject(state, {
      id: `${tag}${i}`, instanceId: `i-${tag}${i}`, cardId, controllerId: 'p1',
      zone: 'battlefield', ...gameObjectDataOf(def),
    });
  }
}
function handCard(state, id, cardId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'hand', ...gameObjectDataOf(def),
  });
}
function botChoice(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  return { chosen, trace: bot.trace().at(-1) };
}

test('F9b: mayFire-draw przy PUSTEJ bibliotece — bot odmawia (pass, nie fire:-100)', () => {
  const state = newState();
  state.zones.library = [];
  addObject(state, {
    id: 'mur', instanceId: 'i-mur', cardId: 'murder-of-crows', controllerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(REGISTRY.get('murder-of-crows')),
  });
  state.pendingOptionalTrigger = {
    playerId: 'p1', sourceId: 'mur', cardId: 'murder-of-crows',
    ability: { effect: { type: 'draw_then_discard', amount: 1 } },
    extra: {}, targets: [], restorePriorityTo: null, resolveAbility: true,
  };
  state.turn.priorityPlayerId = 'p1';
  const { chosen, trace } = botChoice(state);
  const fire = trace.options.find((o) => o.cmd.includes('fire'));
  assert.equal(chosen.type, 'pass_priority', `przy lib0 fire to samobojstwo: ${JSON.stringify(chosen)}`);
  assert.ok(fire && fire.score === -100, `fire przy lib0 = -100 (E2/A1b-mirror), jest: ${JSON.stringify(fire)}`);
});

test('F9b: mayFire-draw przy lib30 (poza marginesem E) — bot odpala (fire:50, bez zmian)', () => {
  const state = newState();
  fillLibrary(state, 30);
  addObject(state, {
    id: 'mur', instanceId: 'i-mur', cardId: 'murder-of-crows', controllerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(REGISTRY.get('murder-of-crows')),
  });
  state.pendingOptionalTrigger = {
    playerId: 'p1', sourceId: 'mur', cardId: 'murder-of-crows',
    ability: { effect: { type: 'draw_then_discard', amount: 1 } },
    extra: {}, targets: [], restorePriorityTo: null, resolveAbility: true,
  };
  state.turn.priorityPlayerId = 'p1';
  const { chosen } = botChoice(state);
  assert.equal(chosen.type, 'resolve_optional_trigger_choice');
  assert.equal(chosen.fire, true);
});

test('F9b/E: mayFire-draw przy lib10 — odmowa via PRE-ISTNIEJACY thin-tax E (fire:-76, nie F9b)', () => {
  const state = newState();
  fillLibrary(state, 10);
  addObject(state, {
    id: 'mur', instanceId: 'i-mur', cardId: 'murder-of-crows', controllerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(REGISTRY.get('murder-of-crows')),
  });
  state.pendingOptionalTrigger = {
    playerId: 'p1', sourceId: 'mur', cardId: 'murder-of-crows',
    ability: { effect: { type: 'draw_then_discard', amount: 1 } },
    extra: {}, targets: [], restorePriorityTo: null, resolveAbility: true,
  };
  state.turn.priorityPlayerId = 'p1';
  const { chosen, trace } = botChoice(state);
  const fire = trace.options.find((o) => o.cmd.includes('fire'));
  assert.equal(chosen.type, 'pass_priority');
  assert.ok(fire && fire.score === -76, `E-tax: fire@lib10 = 50-(60+11*6) = -76, jest: ${JSON.stringify(fire)}`);
});

test('F10: Rager przy PUSTEJ bibliotece — bot nie rzuca (ETB-guard, L41)', () => {
  const state = newState();
  state.zones.library = [];
  addBasics(state, 'basic-swamp', 5, 'b');
  handCard(state, 'rager', 'phyrexian-rager');
  const { chosen, trace } = botChoice(state);
  const cast = trace.options.find((o) => o.cmd.includes('cast_permanent(rager'));
  assert.equal(chosen.type, 'pass_priority', `Rager@lib0 to samobojstwo: ${JSON.stringify(chosen)}`);
  assert.ok(cast && cast.score < 0, `Rager@lib0 ujemny, jest: ${JSON.stringify(cast)}`);
});

test('F10: Rager przy lib10 — guard milczy (F1: pin 71.1018 -> 68.4018)', () => {
  const state = newState();
  fillLibrary(state, 10);
  addBasics(state, 'basic-swamp', 5, 'b');
  handCard(state, 'rager', 'phyrexian-rager');
  const { chosen, trace } = botChoice(state);
  const cast = trace.options.find((o) => o.cmd.includes('cast_permanent(rager'));
  assert.equal(chosen.type, 'cast_permanent');
  assert.ok(cast && Math.abs(cast.score - 68.4018) < 0.001, `Rager@lib10 = 68.4018 (F1), jest: ${JSON.stringify(cast)}`);
});

test('F10: Quicksilver (ETB-loot) przy PUSTEJ bibliotece — bot nie rzuca', () => {
  const state = newState();
  state.zones.library = [];
  addBasics(state, 'basic-island', 7, 'i');
  handCard(state, 'q', 'quicksilver-fisher');
  const { chosen } = botChoice(state);
  assert.equal(chosen.type, 'pass_priority', `Quicksilver@lib0 to samobojstwo: ${JSON.stringify(chosen)}`);
});
