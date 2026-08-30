import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { initializeResources, addMana } from '../src/engine/resources.js';

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Przy pustym stosie nic nie robi; zatrzymuje się na decyzji blokującej.
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}



test('gracz może zagrać creature permanent za koszt many', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  initializeResources(state); addMana(state, 'p1', 3);
  state.turn.phase = 'precombat_main';
  addObject(state, { id: 'c-hand', instanceId: 'i', cardId: 'Creature', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2 });
  assert.equal(playerView(state, 'p1').legalCommands.some((cmd) => cmd.type === 'cast_permanent'), true);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c-hand' });
  assert.equal(result.ok, true);
  // T1: czar stwora idzie na STOS — rozstrzyga się po rundzie passów.
  assert.equal(state.zones.stack.length, 1);
  resolveStack(state);
  assert.equal(state.players[0].mana, 1);
  assert.equal(state.objects.get(state.zones.battlefield[0]).cardId, 'Creature');
});

test('engine odrzuca zagranie permanenta bez many', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  initializeResources(state); state.turn.phase = 'precombat_main';
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'C', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 1, toughness: 1, manaCost: 1 });
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c' });
  resolveStack(state);

  assert.equal(result.ok, false);
  assert.match(result.events[0].reason, /^illegal_cast:/);
});
