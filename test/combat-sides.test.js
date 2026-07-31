import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { declareAttackers, declareBlockers } from '../src/engine/combat.js';

function state() {
  const value = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  value.turn.phase = 'combat'; value.turn.step = 'declare_attackers';
  for (const [id, controllerId] of [['a1', 'p1'], ['a2', 'p1'], ['b1', 'p2']]) {
    addObject(value, { id, instanceId: id, cardId: id, controllerId, zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  }
  return value;
}

test('tylko aktywny gracz deklaruje atakujących', () => {
  assert.throws(() => declareAttackers(state(), 'p2', ['a1']), /Nieaktywny/);
});

test('atakujący nie może wystąpić dwa razy', () => {
  assert.throws(() => declareAttackers(state(), 'p1', ['a1', 'a1']), /więcej niż raz/);
});

test('atakujący nie deklaruje blokujących', () => {
  const value = state();
  declareAttackers(value, 'p1', ['a1']);
  value.turn.step = 'declare_blockers';
  assert.throws(() => declareBlockers(value, 'p1', {}), /nie deklaruje blokujących/);
});
