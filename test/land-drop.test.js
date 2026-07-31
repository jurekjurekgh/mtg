import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { initializeResources, playLand, resetTurnResources } from '../src/engine/resources.js';

test('gracz może zagrać jeden land w main phase', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.turn.phase = 'precombat_main';
  addObject(state, { id: 'l1', instanceId: 'i1', cardId: 'Mountain', controllerId: 'p1', zone: 'hand', kind: 'land' });
  const result = playLand(state, 'p1', 'l1');
  assert.equal(result.type, 'land_played');
  assert.equal(state.zones.battlefield.length, 1);
  assert.equal(state.players[0].landPlays, 0);
  assert.throws(() => playLand(state, 'p1', 'land-0'), /Nielegalny|Wykorzystano/);
});

test('reset początku tury odnawia land drop i czyści manę', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.players[0].mana = 3;
  state.players[0].landPlays = 0;
  resetTurnResources(state, 'p1');
  assert.deepEqual({ mana: state.players[0].mana, landPlays: state.players[0].landPlays }, { mana: 0, landPlays: 1 });
});
