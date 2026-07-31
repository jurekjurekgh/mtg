import { createGameObject } from './identity.js';
import { assertZone, ZONES } from './zones.js';
import { command, event } from '../protocol/types.js';

/**
 * Minimalny autorytatywny stan gry. Stan jest przechowywany wyłącznie tutaj;
 * widoki i kontrolery dostają kopie projekcji.
 */
export function createGameState({ seed, players }) {
  if (!Number.isInteger(seed) || !Array.isArray(players) || players.length < 2) {
    throw new TypeError('Gra wymaga całkowitego seeda i co najmniej dwóch graczy');
  }
  const ids = players.map((p) => p.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new TypeError('Gracze muszą mieć unikalne id');
  return {
    seed,
    players: players.map((p) => ({ id: p.id, name: p.name ?? p.id, life: 20 })),
    turn: { number: 1, activePlayerId: ids[0], priorityPlayerId: ids[0] },
    objects: new Map(),
    zones: Object.fromEntries(ZONES.map((zone) => [zone, []])),
    events: [],
  };
}

export function addObject(state, { id, instanceId, cardId, controllerId, zone }) {
  assertZone(zone);
  if (!state.players.some((p) => p.id === controllerId) || state.objects.has(id)) {
    throw new Error('Nieprawidłowy kontroler albo zajęte id obiektu');
  }
  const object = createGameObject({ id, instanceId, cardId, controllerId, zone });
  state.objects.set(id, object);
  state.zones[zone].push(id);
  return object;
}

function reject(reason) { return { ok: false, events: [event('command_rejected', { reason })] }; }

/** Wykonuje komendę po walidacji i zwraca zdarzenia; tylko ta funkcja mutuje stan. */
export function execute(state, input) {
  let cmd;
  try { cmd = command(input.type, input.playerId, input); } catch { return reject('invalid_command'); }
  if (cmd.playerId !== state.turn.priorityPlayerId) return reject('not_priority');

  if (cmd.type === 'pass_priority') {
    const current = state.players.findIndex((p) => p.id === state.turn.priorityPlayerId);
    const next = state.players[(current + 1) % state.players.length].id;
    state.turn.priorityPlayerId = next;
    const e = event('priority_passed', { playerId: cmd.playerId, nextPlayerId: next });
    state.events.push(e);
    return { ok: true, events: [e] };
  }

  if (cmd.type === 'move_object') {
    const object = state.objects.get(cmd.objectId);
    if (!object || object.controllerId !== cmd.playerId || !state.zones[object.zone].includes(object.id)) return reject('illegal_move');
    assertZone(cmd.toZone);
    const newId = cmd.newObjectId;
    if (!newId || state.objects.has(newId)) return reject('invalid_object_id');
    state.zones[object.zone] = state.zones[object.zone].filter((id) => id !== object.id);
    state.zones[cmd.toZone].push(newId);
    const moved = Object.freeze({ ...object, id: newId, zone: cmd.toZone });
    state.objects.delete(object.id); state.objects.set(newId, moved);
    const e = event('object_moved', { fromId: object.id, object: moved, fromZone: object.zone, toZone: cmd.toZone });
    state.events.push(e);
    return { ok: true, events: [e] };
  }
  return reject('unsupported_command');
}

/** Projektuje wyłącznie informacje dostępne danemu graczowi. */
export function playerView(state, playerId) {
  if (!state.players.some((p) => p.id === playerId)) throw new Error('Nieznany gracz');
  const zones = {};
  for (const [zone, ids] of Object.entries(state.zones)) {
    zones[zone] = ids.map((id) => {
      const object = state.objects.get(id);
      if (zone === 'hand' && object.controllerId !== playerId) return { id, hidden: true };
      return { id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone };
    });
  }
  return Object.freeze({ playerId, turn: { ...state.turn }, zones, legalCommands: [command('pass_priority', playerId)] });
}
