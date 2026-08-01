import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './objects.js';
import { effectiveToughness } from './permanents.js';
import { detachIllegallyAttachedAuras } from './attachments.js';

/**
 * Centralne state-based actions — jedyne miejsce, które rozstrzyga przegraną
 * z powodu życia <= 0 oraz niszczenie stworów ze śmiertelnymi obrażeniami.
 * Wywoływane po każdej zaakceptowanej komendzie (game-state.js `accepted`)
 * oraz przez API obrażeń; funkcja jest idempotentna i może wykonać więcej
 * niż jedną akcję naraz.
 *
 * Kolejność w jednym przebiegu odzwierciedla zależności (CR 704.3): najpierw
 * śmierći stworów (gospodarz może odejść z bitwiska), potem odłączenie aur
 * bestow, które straciły gospodarza — po odłączeniu aura znów jest stworem
 * i zostaje na bitwisku (CR 702.103b).
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
    if (object.damage < effectiveToughness(object, state)) continue;
    // Finality counter: zamiast do grobu, stwór idzie do exile (CR 122.1b
    // w minimalnym wymiarze — dotyczy śmierci z obrażeń).
    const hasFinality = (object.counters ?? {}).finality > 0;
    const toZone = hasFinality ? 'exile' : 'graveyard';
    const toId = hasFinality ? `exile-${state.objectSequence++}` : `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, object.id, toZone, toId);
    const destroyed = event('creature_destroyed', { fromId: object.id, toId, toZone });
    state.events.push(destroyed); events.push(destroyed);
  }
  // Aura bestow bez legalnego gospodarza odłącza się i znów jest stworem
  // (zostaje na bitwisku — nie trafia do grobu jak zwykła aura, CR 702.103b).
  events.push(...detachIllegallyAttachedAuras(state));
  return events;
}
