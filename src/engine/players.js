import { event } from '../protocol/types.js';

/**
 * Jedyna droga zmiany życia gracza.
 *
 * Funkcja świadomie NIE rozstrzyga przegranej: stan „życie <= 0" obsługują
 * wyłącznie centralne state-based actions (state-based.js), uruchamiane po
 * każdej zaakceptowanej komendzie oraz przez API obrażeń. Dzięki temu reguła
 * „gracz z zerowym życiem przegrywa" istnieje w dokładnie jednym miejscu.
 */
export function changeLife(state, playerId, amount) {
  if (!Number.isInteger(amount) || !state.players.some((player) => player.id === playerId)) {
    throw new TypeError('Zmiana życia wymaga gracza i całkowitej wartości');
  }
  const player = state.players.find((entry) => entry.id === playerId);
  const before = player.life;
  player.life += amount;
  const events = [event('life_changed', { playerId, before, after: player.life, amount })];
  state.events.push(...events);
  return events;
}
