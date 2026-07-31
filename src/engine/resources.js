import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './game-state.js';
import { untapControlled } from './permanents.js';

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

export function beginTurn(state, playerId) {
  const player = resetTurnResources(state, playerId);
  const untapped = untapControlled(state, playerId);
  state.events.push(event('turn_started', { playerId, untapped: untapped.map((object) => object.id) }));
  return { player, untapped };
}

export function castPermanent(state, playerId, objectId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  if (!player || !object || object.controllerId !== playerId || object.zone !== 'hand') throw new Error('Nielegalny permanent');
  if (object.kind !== 'creature') throw new Error('Ten obiekt nie jest zagrywalnym creature permanentem');
  if (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase)) throw new Error('Zagranie poza main phase');
  spendMana(state, playerId, object.manaCost ?? 0);
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'battlefield', newId);
  const permanent = Object.freeze({ ...moved, summoningSickness: true });
  state.objects.set(newId, permanent);
  const e = event('permanent_cast', { playerId, fromId: objectId, object: moved, manaCost: object.manaCost ?? 0 });
  state.events.push(e);
  return e;
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
