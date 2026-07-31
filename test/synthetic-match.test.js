import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { initializeResources } from '../src/engine/resources.js';

test('syntetyczna partia przechodzi od permanenta do combat przez protokół', () => {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.turn.phase = 'combat'; state.turn.step = 'declare_attackers'; state.turn.priorityPlayerId = 'p1';
  addObject(state, { id: 'attacker', instanceId: 'ia', cardId: 'A', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 3, toughness: 2 });
  addObject(state, { id: 'blocker', instanceId: 'ib', cardId: 'B', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['attacker'] }).ok, true);
  assert.equal(state.turn.step, 'declare_blockers');
  assert.equal(state.turn.priorityPlayerId, 'p2');
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { attacker: ['blocker'] } }).ok, true);
  assert.equal(state.turn.step, 'combat_damage');
  assert.equal(state.turn.priorityPlayerId, 'p1');
  const damage = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(damage.ok, true);
  assert.equal(state.zones.graveyard.length, 1);
  assert.equal(state.zones.battlefield.length, 1);
  assert.equal(state.players[1].life, 20);
});
