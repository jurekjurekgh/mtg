import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';

function game() {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'o-hand-1', instanceId: 'i-1', cardId: 'secret-card', controllerId: 'p2', zone: 'hand' });
  addObject(state, { id: 'o-hand-2', instanceId: 'i-2', cardId: 'public-card', controllerId: 'p1', zone: 'hand' });
  return state;
}

test('PlayerView ukrywa zawartość ręki przeciwnika', () => {
  const view = playerView(game(), 'p1');
  assert.deepEqual(view.zones.hand[0], { id: 'o-hand-1', hidden: true });
  const own = view.zones.hand[1];
  assert.equal(own.id, 'o-hand-2');
  assert.equal(own.cardId, 'public-card');
  assert.equal(own.controllerId, 'p1');
  assert.equal(own.zone, 'hand');
  assert.equal(JSON.stringify(view).includes('secret-card'), false);
});

test('komenda przejścia priorytetu mutuje stan wyłącznie przez engine', () => {
  const state = game();
  const result = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(result.ok, true);
  assert.equal(state.turn.priorityPlayerId, 'p2');
  assert.equal(result.events[0].type, 'priority_passed');
});

test('komenda spoza priorytetu jest odrzucona maszynowo', () => {
  const result = execute(game(), { type: 'pass_priority', playerId: 'p2' });
  assert.equal(result.ok, false);
  assert.equal(result.events[0].reason, 'not_priority');
});

test('nieznana strefa daje maszynowy błąd zamiast wyjątku', () => {
  const result = execute(game(), { type: 'move_object', playerId: 'p1', objectId: 'o-hand-2', toZone: 'unknown', newObjectId: 'o-x' });
  assert.equal(result.ok, false);
  assert.equal(result.events[0].reason, 'invalid_zone');
});

test('zmiana strefy emituje zdarzenie i zachowuje instancję karty', () => {
  const state = game();
  const result = execute(state, { type: 'move_object', playerId: 'p1', objectId: 'o-hand-2', toZone: 'battlefield', newObjectId: 'o-bf-2' });
  assert.equal(result.ok, true);
  assert.equal(result.events[0].type, 'object_moved');
  assert.equal(result.events[0].object.instanceId, 'i-2');
  assert.equal(state.zones.hand.includes('o-hand-2'), false);
  assert.deepEqual(playerView(state, 'p2').zones.battlefield[0], {
    id: 'o-bf-2', cardId: 'public-card', controllerId: 'p1', zone: 'battlefield', kind: 'card',
    power: null, toughness: null, powerModifier: 0, toughnessModifier: 0,
    tapped: false, summoningSickness: false, damage: 0,
  });
});
