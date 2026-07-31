import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './objects.js';

/**
 * Centralne state-based actions — jedyne miejsce, które rozstrzyga przegraną
 * z powodu życia <= 0 oraz niszczenie stworów ze śmiertelnymi obrażeniami.
 * Wywoływane po każdej zaakceptowanej komendzie (game-state.js `accepted`)
 * oraz przez API obrażeń; funkcja jest idempotentna i może wykonać więcej
 * niż jedną akcję naraz.
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
