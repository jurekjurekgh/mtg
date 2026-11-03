import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { resolveUntilDecision, optionalPayOpen } from './helpers/deferred-trigger.js';

const registry = createCardRegistry();
function put(state, id, cardId, playerId, zone, patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
}
const commands = (state) => playerView(state, state.turn.priorityPlayerId).legalCommands;

function scene({ bestow = true, lethal = true } = {}) {
  const state = createGameState({ seed: 65, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) {
    for (let i = 0; i < 6; i++) put(state, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  }
  put(state, 'edifice', 'ambulatory-edifice', 'p1', 'hand');
  put(state, 'theirs', 'alaborn-trooper', 'p2', 'battlefield', {
    power: 1, toughness: 1, manaCost: 3, ...(bestow && lethal ? { damage: 2 } : {}),
  });
  if (bestow) {
    put(state, 'dryad', 'leafcrown-dryad', 'p2', 'battlefield');
    attachAuraToCreature(state, 'dryad', 'theirs');
  }
  addMana(state, 'p1', 3, { colors: ['B'] });
  return state;
}
function decide(state) {
  const cast = commands(state).find(c => c.type === 'cast_permanent' && c.objectId === 'edifice');
  assert.ok(cast && execute(state, cast).ok);
  assert.ok(resolveUntilDecision(state, optionalPayOpen));
  const bot = createHeuristicBot({ seed: 650340, randomness: 0, lookahead: 0, registry });
  const choice = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(choice.type, 'resolve_optional_pay_choice');
  return choice;
}

test('A10: próg inwestycji liczy aurę bestow, która po śmierci hosta pozostaje stworem', () => {
  const state = scene();
  const view = playerView(state, 'p1');
  const host = view.zones.battlefield.find(o => o.id === 'theirs');
  const aura = view.zones.battlefield.find(o => o.id === 'dryad');
  assert.equal(host.toughness, 3);
  assert.equal(aura.kind, 'aura');
  assert.equal(aura.attachedTo, 'theirs');
  const choice = decide(state);
  assert.equal(choice.pay, true);
  assert.ok(execute(state, choice).ok);
  const target = commands(state).find(c => c.type === 'resolve_trigger_target' && c.targetId === 'theirs');
  assert.ok(target && execute(state, target).ok);
  for (let i = 0; i < 12 && state.zones.stack.length; i++) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  assert.equal(state.objects.get('theirs')?.zone, undefined, 'host opuszcza pole');
  assert.equal(state.objects.get('dryad')?.kind, 'creature', 'bestow zostaje jako stwór');
});

test('A10: bez aury próg inwestycji 5 nie jest spełniony', () => {
  assert.equal(decide(scene({ bestow: false })).pay, false);
});

test('A10: inwestycja w aurę nie wystarcza, jeśli −1/−1 nie zabije stwora', () => {
  assert.equal(decide(scene({ lethal: false })).pay, false);
});
