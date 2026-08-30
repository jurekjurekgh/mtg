import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';

test('cleanup automatycznie czyści oznaczone obrażenia', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'C', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 3 });
  const object = state.objects.get('c');
  state.objects.set('c', Object.freeze({ ...object, damage: 2 }));
  state.turn.phase = 'ending'; state.turn.step = 'end'; state.turn.stepIndex = 10; state.turn.passes = 0; state.turn.priorityPlayerId = 'p1';
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'cleanup');
  assert.equal(state.objects.get('c').damage, 0);
});

test('PlayerView podaje legalny play_land w main phase', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  state.players[0].landPlays = 1;
  state.turn.phase = 'precombat_main';
  addObject(state, { id: 'l', instanceId: 'i', cardId: 'L', controllerId: 'p1', zone: 'hand', kind: 'land' });
  assert.equal(playerView(state, 'p1').legalCommands.some((cmd) => cmd.type === 'play_land' && cmd.objectId === 'l'), true);
});
