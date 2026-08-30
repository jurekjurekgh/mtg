import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { initializeResources } from '../src/engine/resources.js';

test('akcje gry przechodzą przez execute i logują zaakceptowane komendy', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  initializeResources(state);
  state.turn.phase = 'precombat_main';
  addObject(state, { id: 'land-hand', instanceId: 'i-land', cardId: 'Mountain', controllerId: 'p1', zone: 'hand', kind: 'land' });
  const land = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'land-hand' });
  assert.equal(land.ok, true);
  assert.equal(state.commands.at(-1).type, 'play_land');
  assert.equal(state.zones.battlefield[0], 'land-0');
});

test('nielegalna akcja zwraca błąd protokołu i nie trafia do replayu', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'missing' });
  assert.equal(result.ok, false);
  assert.match(result.events[0].reason, /^illegal_land:/);
  assert.equal(state.commands.length, 0);
});
