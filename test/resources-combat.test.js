import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { addMana, initializeResources, spendMana } from '../src/engine/resources.js';
import { declareAttackers, declareBlockers, resolveCombatDamage } from '../src/engine/combat.js';

function combatState() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.phase = 'combat';
  state.turn.step = 'declare_attackers';
  addObject(state, { id: 'a', instanceId: 'ia', cardId: 'A', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 3, toughness: 2 });
  addObject(state, { id: 'b', instanceId: 'ib', cardId: 'B', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  return state;
}

test('mana ma jawny pool i nie pozwala wydać więcej niż posiadane', () => {
  const state = combatState();
  initializeResources(state);
  addMana(state, 'p1', 3);
  spendMana(state, 'p1', 2);
  assert.equal(state.players[0].mana, 1);
  assert.throws(() => spendMana(state, 'p1', 2), /Niewystarczająca/);
});

test('niezablokowany atak zadaje obrażenia graczowi', () => {
  const state = combatState();
  declareAttackers(state, 'p1', ['a']);
  state.turn.step = 'declare_blockers';
  declareBlockers(state, 'p2', {});
  const events = resolveCombatDamage(state, 'p2');
  assert.equal(events.some((event) => event.type === 'damage_dealt' && event.target === 'p2'), true);
  assert.equal(state.players[1].life, 17);
});

test('obrońca może zablokować atakującego', () => {
  const state = combatState();
  declareAttackers(state, 'p1', ['a']);
  state.turn.step = 'declare_blockers';
  declareBlockers(state, 'p2', { a: ['b'] });
  resolveCombatDamage(state, 'p2');
  assert.equal(state.players[1].life, 20);
});
