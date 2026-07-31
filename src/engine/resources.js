import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './game-state.js';

export function initializeResources(state) {
  for (const player of state.players) {
    player.mana = 0;
    player.landPlays = 1;
  }
  return state;
}

export function addMana(state, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Mana musi być nieujemną liczbą całkowitą');
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  player.mana += amount;
  const e = event('mana_changed', { playerId, amount, total: player.mana });
  state.events.push(e);
  return e;
}

export function spendMana(state, playerId, amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Koszt many musi być nieujemną liczbą całkowitą');
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || (player.mana ?? 0) < amount) throw new Error('Niewystarczająca mana');
  player.mana -= amount;
  const e = event('mana_changed', { playerId, amount: -amount, total: player.mana });
  state.events.push(e);
  return e;
}

export function resetTurnResources(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  player.mana = 0;
  player.landPlays = 1;
  return player;
}

export function playLand(state, playerId, objectId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  if (!player || !object || object.controllerId !== playerId || object.zone !== 'hand') throw new Error('Nielegalny land drop');
  if (object.kind !== 'land') throw new Error('Obiekt nie jest landem');
  if (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase)) {
    throw new Error('Land drop poza main phase');
  }
  if (player.landPlays <= 0) throw new Error('Wykorzystano land drop w tej turze');
  const newId = `land-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'battlefield', newId);
  player.landPlays -= 1;
  const e = event('land_played', { playerId, fromId: objectId, object: moved });
  state.events.push(e);
  return e;
}
