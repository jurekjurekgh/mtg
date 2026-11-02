import assert from 'node:assert/strict';
import { execute } from '../../src/engine/game-state.js';

// Rozstrzygnij wierzchni trigger madness przez rzeczywistą rundę priorytetu.
export function resolveMadnessTrigger(state) {
  assert.equal(state.pendingMadnessCast, null, 'decyzja dopiero po triggerze');
  const top = state.objects.get(state.zones.stack.at(-1));
  assert.equal(top?.triggerEntry?.ability?.trigger?.event, 'madness', 'madness na wierzchu stosu');
  for (let i = 0; i < state.players.length; i++) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.ok(r.ok, JSON.stringify(r));
  }
  assert.ok(state.pendingMadnessCast, 'trigger otworzył decyzję');
}
