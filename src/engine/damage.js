import { changeLife } from './players.js';
import { runStateBasedActions } from './state-based.js';
import { event } from '../protocol/types.js';

/**
 * Zadaje obrażenia graczowi: zdarzenie obrażeń, jedna wspólna zmiana życia,
 * a następnie centralne state-based actions rozstrzygające ewentualną
 * przegraną. Przegrana nie jest kodowana w zmianie życia.
 */
export function dealDamageToPlayer(state, source, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Obrażenia muszą być nieujemną liczbą całkowitą');
  if (!state.players.some((player) => player.id === playerId)) throw new Error('Nieznany cel obrażeń');
  const damageEvent = event('damage_dealt', { source, target: playerId, amount });
  state.events.push(damageEvent);
  const lifeEvents = changeLife(state, playerId, -amount);
  return [damageEvent, ...lifeEvents, ...runStateBasedActions(state)];
}
