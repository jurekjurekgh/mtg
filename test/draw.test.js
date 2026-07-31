import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';

function toDraw(state) {
  for (let i = 0; i < 4; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
}

test('draw_card przenosi wierzchnią kartę biblioteki do ręki', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'library-1', instanceId: 'i-1', cardId: 'Mountain', controllerId: 'p1', zone: 'library' });
  toDraw(state);
  const command = playerView(state, 'p1').legalCommands.find((c) => c.type === 'draw_card');
  const result = execute(state, command);
  assert.equal(result.ok, true);
  assert.equal(result.events[0].type, 'card_drawn');
  assert.deepEqual(state.zones.library, []);
  assert.equal(state.zones.hand[0], 'drawn-0');
  assert.equal(state.objects.get('drawn-0').instanceId, 'i-1');
});

test('draw_card jest odrzucane poza krokiem draw', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'library-1', instanceId: 'i-1', cardId: 'Mountain', controllerId: 'p1', zone: 'library' });
  const result = execute(state, { type: 'draw_card', playerId: 'p1', objectId: 'library-1' });
  assert.equal(result.ok, false);
  assert.equal(result.events[0].reason, 'wrong_timing');
});
