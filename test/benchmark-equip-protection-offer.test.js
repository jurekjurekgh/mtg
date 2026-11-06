import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalActivatedAbilities } from '../src/engine/abilities.js';

const registry = createCardRegistry();
function put(state, id, cardId, zone, extra = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    colors: def.colors ?? [], equipment: def.equipment, ...extra,
  });
}

test('Benchmark regression: equip offer excludes a protected creature for red source', () => {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  put(state, 'sword', 'warriors-sword', 'battlefield', { attachedTo: 'bearer' });
  put(state, 'bearer', 'token_hero', 'battlefield');
  put(state, 'protected', 'gaelicat', 'battlefield', { protectionFromColors: ['R'] });
  put(state, 'safe', 'highland-game', 'battlefield');
  addMana(state, 'p1', 5, { colors: ['R'] });

  const offers = legalActivatedAbilities(state, 'p1')
    .filter((cmd) => cmd.objectId === 'sword' && cmd.abilityIndex === 1);
  assert.ok(offers.some((cmd) => cmd.targets?.[0] === 'safe'), 'legal unprotected creature remains available');
  assert.ok(!offers.some((cmd) => cmd.targets?.[0] === 'protected'),
    'CR 702.16b: protection from red forbids red Equipment from targeting this creature');
});
