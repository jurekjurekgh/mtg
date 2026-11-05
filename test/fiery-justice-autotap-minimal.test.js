import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import {
  manaSourcesOf,
  paymentDescriptorOf,
  shouldOpenManaWizard,
} from '../src/table/mana-wizard.js';

const registry = createCardRegistry();

function put(state, id, cardId, zone) {
  const def = registry.get(cardId);
  assert.ok(def, `missing card definition: ${cardId}`);
  addObject(state, {
    id,
    instanceId: `instance-${id}`,
    cardId,
    controllerId: 'p1',
    ownerId: 'p1',
    zone,
    ...gameObjectDataOf(def),
    types: def.types ?? [],
    subtypes: def.subtypes ?? [],
    spell: def.spell,
  });
}

test('Fiery Justice auto-taps only one source for each colored pip', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'fiery-justice', 'fiery-justice', 'hand');
  for (const [index, cardId] of [
    'basic-mountain', 'basic-plains', 'basic-plains', 'basic-mountain', 'basic-forest',
  ].entries()) {
    put(state, `land-${index}`, cardId, 'battlefield');
  }

  const view = playerView(state, 'p1');
  const command = view.legalCommands.find((item) =>
    item.type === 'cast_spell' && item.objectId === 'fiery-justice');
  assert.ok(command, 'Fiery Justice should be castable');

  const descriptor = paymentDescriptorOf(command, view);
  const sources = manaSourcesOf(view, 'p1');
  assert.equal(descriptor.totalNeeded, 3);
  assert.deepEqual(descriptor.requirements, [['R'], ['G'], ['W']]);
  assert.equal(shouldOpenManaWizard({
    sources,
    poolMana: 0,
    totalNeeded: descriptor.totalNeeded,
    requirements: descriptor.requirements,
  }), false, 'five lands provide a straightforward automatic payment');

  const result = execute(state, command);
  assert.equal(result.ok, true);
  const tappedLandIds = ['land-0', 'land-1', 'land-2', 'land-3', 'land-4']
    .filter((id) => state.objects.get(id).tapped);
  assert.equal(tappedLandIds.length, 3, 'only R, G, and W sources should be tapped');
  assert.equal(state.players.find((player) => player.id === 'p1').mana, 0,
    'Fiery Justice costs three mana; no extra mana should remain in the pool');
});
