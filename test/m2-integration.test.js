
/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  const all = [];
  let rounds = 0;
  while (state.zones.stack.length > 0 && rounds < 8) {
    const first = state.turn.priorityPlayerId;
    const other = state.players.find((p) => p.id !== first).id;
    const r1 = execute(state, { type: 'pass_priority', playerId: first });
    assert.ok(r1.ok, r1.events[0]?.reason);
    all.push(...r1.events);
    if (state.zones.stack.length === 0) break;
    const r2 = execute(state, { type: 'pass_priority', playerId: other });
    assert.ok(r2.ok, r2.events[0]?.reason);
    all.push(...r2.events);
    rounds += 1;
  }
  return all;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { initializeResources } from '../src/engine/resources.js';

test('M2: land produkuje manę, a mana pozwala zagrać creatura', () => {
  const state = createGameState({ seed: 2, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.turn.phase = 'precombat_main';
  addObject(state, { id: 'land', instanceId: 'il', cardId: 'Mountain', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  addObject(state, { id: 'creature', instanceId: 'ic', cardId: 'Bear', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 1 });
  assert.equal(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'land' }).ok, true);
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'creature' });
  assert.equal(rCast.ok, true);
  resolveStack(state); // T1: czar stwora rozstrzyga się po rundzie passów
  assert.equal(state.players[0].mana, 0);
  const bear = [...state.objects.values()].find((o) => o.cardId === 'Bear' && o.zone === 'battlefield');
  assert.equal(bear.summoningSickness, true);
});
