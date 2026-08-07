import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';

function toDraw(state) {
  // CR 103.7a: pierwsza tura gry (p1) pomija draw step — przechodzimy do
  // draw stepa TURY 2, żeby dobranie było legalne.
  for (let i = 0; i < 60 && !(state.turn.step === 'draw' && state.turn.activePlayerId === 'p1' && state.turn.number > 1); i += 1) {
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

test('krok draw pozwala dobrać dokładnie jedną kartę', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'library-1', instanceId: 'i-1', cardId: 'Mountain', controllerId: 'p1', zone: 'library' });
  addObject(state, { id: 'library-2', instanceId: 'i-2', cardId: 'Forest', controllerId: 'p1', zone: 'library' });
  toDraw(state);
  assert.equal(execute(state, { type: 'draw_card', playerId: 'p1', objectId: 'library-1' }).ok, true);
  // Ani oferta, ani recznie zbudowana komenda nie pozwala na drugie dobranie.
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'draw_card'), false);
  const second = execute(state, { type: 'draw_card', playerId: 'p1', objectId: 'library-2' });
  assert.equal(second.ok, false);
  assert.equal(second.events[0].reason, 'already_drew');
  assert.equal(state.zones.library.length, 1);
  // Po przejściu kroku i powrocie do draw przy kolejnej turze p1 znacznik znika.
  for (let i = 0; i < 200 && !(state.turn.step === 'draw' && state.turn.activePlayerId === 'p1' && state.turn.number > 3); i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.turn.step, 'draw');
  assert.ok(playerView(state, 'p1').legalCommands.some((c) => c.type === 'draw_card'));
});
