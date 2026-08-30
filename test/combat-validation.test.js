import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { declareAttackers, declareBlockers } from '../src/engine/combat.js';

test('jeden blocker nie może blokować dwóch atakujących', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'combat'; state.turn.step = 'declare_attackers';
  for (const id of ['a1', 'a2']) addObject(state, { id, instanceId: id, cardId: id, controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  addObject(state, { id: 'b1', instanceId: 'b1', cardId: 'b1', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  declareAttackers(state, 'p1', ['a1', 'a2']);
  state.turn.step = 'declare_blockers';
  assert.throws(() => declareBlockers(state, 'p2', { a1: ['b1'], a2: ['b1'] }), /użyty więcej niż raz/);
});
