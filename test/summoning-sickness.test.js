import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { declareAttackers } from '../src/engine/combat.js';
import { untapControlled } from '../src/engine/permanents.js';

test('creature z summoning sickness nie może atakować', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.phase = 'combat'; state.turn.step = 'declare_attackers';
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'C', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  state.objects.set('c', Object.freeze({ ...state.objects.get('c'), summoningSickness: true }));
  assert.throws(() => declareAttackers(state, 'p1', ['c']), /Nielegalny/);
});

test('untap początku tury usuwa summoning sickness kontrolowanych stworów', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'C', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  state.objects.set('c', Object.freeze({ ...state.objects.get('c'), summoningSickness: true }));
  untapControlled(state, 'p1');
  assert.equal(state.objects.get('c').summoningSickness, false);
});
