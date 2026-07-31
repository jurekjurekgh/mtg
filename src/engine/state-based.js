import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './game-state.js';

/**
 * Wspólne state-based actions. Wywołuje się je po rozstrzygnięciu efektu,
 * combat lub zmianie życia; funkcja może wykonać więcej niż jedną akcję.
 */
export function runStateBasedActions(state) {
  const events = [];
  for (const player of state.players) {
    if (player.life <= 0 && state.status === 'active') {
      const winner = state.players.find((entry) => entry.id !== player.id);
      state.status = 'finished';
      state.winnerId = winner.id;
      const lost = event('player_lost', { playerId: player.id, reason: 'life_zero', winnerId: winner.id });
      state.events.push(lost); events.push(lost);
    }
  }
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield' || object.kind !== 'creature' || object.toughness === null) continue;
    if (object.damage < object.toughness) continue;
    const graveId = `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, object.id, 'graveyard', graveId);
    const destroyed = event('creature_destroyed', { fromId: object.id, toId: graveId });
    state.events.push(destroyed); events.push(destroyed);
  }
  return events;
}
