import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { assertStateInvariants } from '../src/engine/invariants.js';

test('poprawny stan przechodzi walidację inwariantów', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'o1', instanceId: 'i1', cardId: 'c1', controllerId: 'p1', zone: 'library' });
  assert.equal(assertStateInvariants(state), true);
});

test('inwariant wykrywa obiekt w dwóch strefach', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'o1', instanceId: 'i1', cardId: 'c1', controllerId: 'p1', zone: 'library' });
  state.zones.hand.push('o1');
  assert.throws(() => assertStateInvariants(state), /więcej niż jednej strefie/);
});

test('inwariant wykrywa osierocony wpis strefy', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.zones.graveyard.push('missing');
  assert.throws(() => assertStateInvariants(state), /nieistniejący obiekt/);
});

test('inwariant wykrywa odwołanie combat do stwora poza battlefield', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.phase = 'combat'; state.turn.step = 'declare_attackers';
  addObject(state, { id: 'a', instanceId: 'ia', cardId: 'A', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  state.combat = { attackingPlayerId: 'p1', attackers: ['a'], blockers: new Map() };
  assert.equal(assertStateInvariants(state), true);
  state.zones.battlefield = [];
  state.zones.hand.push('a');
  state.objects.set('a', Object.freeze({ ...state.objects.get('a'), zone: 'hand' }));
  assert.throws(() => assertStateInvariants(state), /Combat odwołuje się/);
});
