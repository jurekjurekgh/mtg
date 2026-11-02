import assert from 'node:assert/strict';
import { execute, playerView } from '../../src/engine/game-state.js';

// Rozstrzygnij wierzchni trigger madness przez rzeczywistą rundę priorytetu.
export function resolveMadnessTrigger(state) {
  // W starszych testach zachowujemy zastaną kolejność stosu, wybierając
  // kolejno jego najwyższy jeszcze nieuporządkowany trigger.
  while (state.pendingTriggerOrder) {
    const options = playerView(state, state.turn.priorityPlayerId).legalCommands
      .filter(c => c.type === 'resolve_trigger_order');
    const pick = [...state.zones.stack].reverse().map(id => options.find(c => c.stackEntryId === id)).find(Boolean);
    assert.ok(pick, 'wybór kolejności triggerów');
    assert.ok(execute(state, pick).ok);
  }
  assert.equal(state.pendingMadnessCast, null, 'decyzja dopiero po triggerze');
  const top = state.objects.get(state.zones.stack.at(-1));
  assert.equal(top?.triggerEntry?.ability?.trigger?.event, 'madness', 'madness na wierzchu stosu');
  for (let i = 0; i < state.players.length; i++) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.ok(r.ok, JSON.stringify(r));
  }
  assert.ok(state.pendingMadnessCast, 'trigger otworzył decyzję');
}
