import { changeLife } from './game-state.js';
import { event } from '../protocol/types.js';

/**
 * Zadaje obrażenia graczowi. Obrażenia są osobnym zdarzeniem, a zmiana życia
 * korzysta z jednego wspólnego API i uruchamia state-based actions.
 */
export function dealDamageToPlayer(state, source, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Obrażenia muszą być nieujemną liczbą całkowitą');
  if (!state.players.some((player) => player.id === playerId)) throw new Error('Nieznany cel obrażeń');
  const damageEvent = event('damage_dealt', { source, target: playerId, amount });
  state.events.push(damageEvent);
  const lifeEvents = changeLife(state, playerId, -amount);
  return [damageEvent, ...lifeEvents];
}
