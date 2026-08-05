import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './objects.js';
import { effectiveKeywords, effectiveToughness } from './permanents.js';
import { removeIllegalAttachments } from './attachments.js';

/**
 * Centralne state-based actions — jedyne miejsce, które rozstrzyga przegraną
 * z powodu życia <= 0 oraz niszczenie stworów ze śmiertelnymi obrażeniami.
 * Wywoływane po każdej zaakceptowanej komendzie (game-state.js `accepted`)
 * oraz przez API obrażeń; funkcja jest idempotentna i może wykonać więcej
 * niż jedną akcję naraz.
 *
 * Kolejność w jednym przebiegu odzwierciedla zależności (CR 704.3): najpierw
 * śmierći stworów (gospodarz może odejść z bitwiska), potem rozłączenie
 * załączników, które straciły legalnego gospodarza — bestow znów jest stworem
 * i zostaje (CR 702.103b), equipment zostaje odłączony (CR 704.5n), a czysta
 * aura trafia do grobu (CR 704.5m).
 */
export function runStateBasedActions(state) {
  const events = [];
  for (const player of state.players) {
    const isZeroLife = player.life <= 0;
    const isPoisoned = (player.poison ?? 0) >= 10;
    if ((isZeroLife || isPoisoned) && state.status === 'active') {
      const winner = state.players.find((entry) => entry.id !== player.id);
      state.status = 'finished';
      state.winnerId = winner.id;
      const reason = isPoisoned ? 'poison_ten' : 'life_zero';
      const lost = event('player_lost', { playerId: player.id, reason, winnerId: winner.id });
      state.events.push(lost); events.push(lost);
    }
  }
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield' || object.kind !== 'creature' || object.toughness === null) continue;
    const toughness = effectiveToughness(object, state);
    // CR 704.5f: stwór o wytrzymałości <= 0 idzie do grobu (indestructible nie chroni).
    const killedByZeroToughness = toughness <= 0;
    const isIndestructible = effectiveKeywords(object, state).includes('indestructible');
    // Deathtouch (CR 702.4): obrażenia od stwora z deathtouch niszczą
    // cel niezależnie od wytrzymałości (wystarczy 1 obrażenie).
    const killedByDamage = !isIndestructible && object.damage >= toughness;
    const killedByDeathtouch = !isIndestructible && object.damagedByDeathtouch && object.damage > 0;
    if (!killedByZeroToughness && !killedByDamage && !killedByDeathtouch) continue;
    // Finality counter: zamiast do grobu, stwór idzie do exile (CR 122.1b
    // w minimalnym wymiarze — dotyczy śmierci z obrażeń).
    const hasFinality = (object.counters ?? {}).finality > 0;
    const toZone = hasFinality ? 'exile' : 'graveyard';
    const toId = hasFinality ? `exile-${state.objectSequence++}` : `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, object.id, toZone, toId);
    const destroyed = event('creature_destroyed', { fromId: object.id, toId, toZone });
    state.events.push(destroyed); events.push(destroyed);
  }
  // Załączniki bez legalnego gospodarza rozłączają się zgodnie z polityką
  // rodziny (bestow→stwór na bitwisku, equipment→odłączony artefakt,
  // czysta aura→grób — CR 704.5m/n).
  events.push(...removeIllegalAttachments(state));
  return events;
}

