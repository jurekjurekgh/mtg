import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';

test('biblioteka przeciwnika nie ujawnia cardId ani kolejności kart', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'library-1', instanceId: 'i-1', cardId: 'secret-one', controllerId: 'p2', zone: 'library' });
  addObject(state, { id: 'library-2', instanceId: 'i-2', cardId: 'secret-two', controllerId: 'p2', zone: 'library' });
  const view = playerView(state, 'p1');
  assert.deepEqual(view.zones.library, [
    { id: 'library-1', controllerId: 'p2', hidden: true },
    { id: 'library-2', controllerId: 'p2', hidden: true },
  ]);
  assert.equal(JSON.stringify(view).includes('secret-one'), false);
  assert.equal(JSON.stringify(view).includes('secret-two'), false);
});

test('własna biblioteka również nie trafia do zwykłego PlayerView', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'library-1', instanceId: 'i-1', cardId: 'own-card', controllerId: 'p1', zone: 'library' });
  assert.deepEqual(playerView(state, 'p1').zones.library, [{ id: 'library-1', controllerId: 'p1', hidden: true }]);
});
