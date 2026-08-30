import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { tapObject, untapControlled } from '../src/engine/permanents.js';
import { declareAttackers, declareBlockers, resolveCombatDamage } from '../src/engine/combat.js';

function stateWithCreatures() {
  const state = createGameState({ seed: 2, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'combat'; state.turn.step = 'declare_attackers';
  addObject(state, { id: 'a', instanceId: 'ia', cardId: 'A', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 3, toughness: 2 });
  addObject(state, { id: 'b', instanceId: 'ib', cardId: 'B', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  return state;
}

test('permanent można tapować i odtapować tylko przez engine API', () => {
  const state = stateWithCreatures();
  tapObject(state, 'a', 'p1');
  assert.equal(state.objects.get('a').tapped, true);
  assert.throws(() => tapObject(state, 'a', 'p1'), /już tapped/);
  untapControlled(state, 'p1');
  assert.equal(state.objects.get('a').tapped, false);
});

test('combat oznacza obrażenia stworzeń i przenosi śmiertelne do graveyard', () => {
  const state = stateWithCreatures();
  declareAttackers(state, 'p1', ['a']);
  state.turn.step = 'declare_blockers';
  declareBlockers(state, 'p2', { a: ['b'] });
  const events = resolveCombatDamage(state, 'p2');
  assert.equal(events.some((event) => event.type === 'creature_destroyed'), true);
  assert.equal(state.zones.graveyard.length, 2);
  assert.equal(state.zones.battlefield.length, 0);
});
