import { createGameObject } from './identity.js';
import { assertZone, ZONES } from './zones.js';
import { command, event } from '../protocol/types.js';
import { initialTurn, nextTurnStep } from './turn.js';
import { assertStateInvariants } from './invariants.js';
import { beginTurn, playLand } from './resources.js';
import { declareAttackers, declareBlockers, resolveCombatDamage } from './combat.js';

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
    turn: initialTurn(ids[0]),
    objects: new Map(),
    zones: Object.fromEntries(ZONES.map((zone) => [zone, []])),
    events: [],
    commands: [],
    status: 'active',
    winnerId: null,
    objectSequence: 0,
  };
}

export function addObject(state, { id, instanceId, cardId, controllerId, zone, kind, power, toughness }) {
  assertZone(zone);
  if (!state.players.some((p) => p.id === controllerId) || state.objects.has(id)) {
    throw new Error('Nieprawidłowy kontroler albo zajęte id obiektu');
  }
  const object = createGameObject({ id, instanceId, cardId, controllerId, zone, kind, power, toughness });
  state.objects.set(id, object);
  state.zones[zone].push(id);
  assertStateInvariants(state);
  return object;
}

function reject(reason) { return { ok: false, events: [event('command_rejected', { reason })] }; }

/** Zmienia życie gracza i wykonuje prostą state-based action przy życiu <= 0. */
export function changeLife(state, playerId, amount) {
  if (!Number.isInteger(amount) || !state.players.some((player) => player.id === playerId)) {
    throw new TypeError('Zmiana życia wymaga gracza i całkowitej wartości');
  }
  const player = state.players.find((entry) => entry.id === playerId);
  const before = player.life;
  player.life += amount;
  const events = [event('life_changed', { playerId, before, after: player.life, amount })];
  if (player.life <= 0 && state.status === 'active') {
    const winner = state.players.find((entry) => entry.id !== playerId);
    state.status = 'finished';
    state.winnerId = winner.id;
    events.push(event('player_lost', { playerId, reason: 'life_zero', winnerId: winner.id }));
  }
  state.events.push(...events);
  return events;
}

/** Wewnętrzny ruch używany przez inicjalizację i komendy engine. */
export function moveObjectDirectly(state, objectId, toZone, newObjectId) {
  const object = state.objects.get(objectId);
  assertZone(toZone);
  if (!object || !newObjectId || state.objects.has(newObjectId)) throw new Error('Nieprawidłowy ruch obiektu');
  state.zones[object.zone] = state.zones[object.zone].filter((id) => id !== object.id);
  state.zones[toZone].push(newObjectId);
  const moved = Object.freeze({ ...object, id: newObjectId, zone: toZone });
  state.objects.delete(object.id); state.objects.set(newObjectId, moved);
  assertStateInvariants(state);
  return moved;
}

/** Zapisuje wyłącznie komendy zaakceptowane przez engine. */
function accepted(state, cmd, result) {
  state.commands.push({ ...cmd });
  return result;
}

/** Wykonuje komendę po walidacji i zwraca zdarzenia; tylko ta funkcja mutuje stan. */
export function execute(state, input) {
  let cmd;
  try { cmd = command(input.type, input.playerId, input); } catch { return reject('invalid_command'); }
  if (state.status !== 'active') return reject('game_over');
  if (cmd.type === 'concede') {
    const winner = state.players.find((p) => p.id !== cmd.playerId);
    state.status = 'finished';
    state.winnerId = winner.id;
    const e = event('player_conceded', { playerId: cmd.playerId, winnerId: winner.id });
    state.events.push(e);
    return accepted(state, cmd, { ok: true, events: [e] });
  }
  if (cmd.playerId !== state.turn.priorityPlayerId) return reject('not_priority');

  if (cmd.type === 'pass_priority') {
    const current = state.players.findIndex((p) => p.id === state.turn.priorityPlayerId);
    const next = state.players[(current + 1) % state.players.length].id;
    state.turn.passes += 1;
    const events = [event('priority_passed', { playerId: cmd.playerId, nextPlayerId: next })];
    if (state.turn.passes >= state.players.length) {
      const previousTurnNumber = state.turn.number;
      state.turn = nextTurnStep(state.turn, state.players);
      events.push(event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step }));
      if (state.turn.number !== previousTurnNumber) beginTurn(state, state.turn.activePlayerId);
    } else {
      state.turn.priorityPlayerId = next;
    }
    state.events.push(...events);
    return accepted(state, cmd, { ok: true, events });
  }

  if (cmd.type === 'play_land') {
    try {
      const e = playLand(state, cmd.playerId, cmd.objectId);
      return accepted(state, cmd, { ok: true, events: [e] });
    } catch (error) {
      return reject(`illegal_land:${error.message}`);
    }
  }

  if (cmd.type === 'declare_attackers') {
    try {
      const e = declareAttackers(state, cmd.playerId, cmd.attackerIds);
      return accepted(state, cmd, { ok: true, events: [e] });
    } catch (error) {
      return reject(`illegal_attackers:${error.message}`);
    }
  }

  if (cmd.type === 'declare_blockers') {
    try {
      const e = declareBlockers(state, cmd.playerId, cmd.assignments ?? {});
      return accepted(state, cmd, { ok: true, events: [e] });
    } catch (error) {
      return reject(`illegal_blockers:${error.message}`);
    }
  }

  if (cmd.type === 'resolve_combat') {
    try {
      const e = resolveCombatDamage(state, cmd.defendingPlayerId);
      return accepted(state, cmd, { ok: true, events: e });
    } catch (error) {
      return reject(`illegal_combat:${error.message}`);
    }
  }

  if (cmd.type === 'draw_card') {
    if (state.turn.step !== 'draw' || state.turn.activePlayerId !== cmd.playerId) return reject('wrong_timing');
    const object = state.objects.get(cmd.objectId);
    if (!object) {
      if (state.zones.library.every((id) => state.objects.get(id)?.controllerId !== cmd.playerId)) {
        const winner = state.players.find((p) => p.id !== cmd.playerId);
        state.status = 'finished';
        state.winnerId = winner.id;
        const e = event('player_lost', { playerId: cmd.playerId, reason: 'empty_library', winnerId: winner.id });
        state.events.push(e);
        return accepted(state, cmd, { ok: true, events: [e] });
      }
      return reject('invalid_draw');
    }
    if (object.controllerId !== cmd.playerId || object.zone !== 'library') return reject('invalid_draw');
    const newObjectId = `drawn-${state.objectSequence++}`;
    state.zones.library = state.zones.library.filter((id) => id !== object.id);
    state.zones.hand.push(newObjectId);
    const drawn = Object.freeze({ ...object, id: newObjectId, zone: 'hand' });
    state.objects.delete(object.id); state.objects.set(drawn.id, drawn);
    const e = event('card_drawn', { playerId: cmd.playerId, fromId: object.id, object: drawn });
    state.events.push(e);
    return accepted(state, cmd, { ok: true, events: [e] });
  }

  if (cmd.type === 'move_object') {
    const object = state.objects.get(cmd.objectId);
    if (!object || object.controllerId !== cmd.playerId || !state.zones[object.zone].includes(object.id)) return reject('illegal_move');
    try { assertZone(cmd.toZone); } catch { return reject('invalid_zone'); }
    const newId = cmd.newObjectId;
    if (!newId || state.objects.has(newId)) return reject('invalid_object_id');
    state.zones[object.zone] = state.zones[object.zone].filter((id) => id !== object.id);
    state.zones[cmd.toZone].push(newId);
    const moved = Object.freeze({ ...object, id: newId, zone: cmd.toZone });
    state.objects.delete(object.id); state.objects.set(newId, moved);
    const e = event('object_moved', { fromId: object.id, object: moved, fromZone: object.zone, toZone: cmd.toZone });
    state.events.push(e);
    return accepted(state, cmd, { ok: true, events: [e] });
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
      if (['hand', 'library'].includes(zone) && object.controllerId !== playerId) return { id, hidden: true };
      if (zone === 'library') return { id: object.id, hidden: true };
      return { id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone };
    });
  }
  const legalCommands = state.status === 'active'
    ? [command('pass_priority', playerId), command('concede', playerId)]
    : [];
  if (state.status === 'active' && state.turn.step === 'draw' && state.turn.activePlayerId === playerId) {
    const top = state.zones.library.find((id) => state.objects.get(id)?.controllerId === playerId);
    legalCommands.unshift(command('draw_card', playerId, top ? { objectId: top } : {}));
  }
  const players = state.players.map(({ id, name, life }) => ({ id, name, life }));
  return Object.freeze({ playerId, status: state.status, winnerId: state.winnerId, players, turn: { ...state.turn }, zones, legalCommands });
}
