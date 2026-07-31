import { event } from '../protocol/types.js';
import { assertZone } from './zones.js';

function replaceObject(state, object, patch) {
  const updated = Object.freeze({ ...object, ...patch });
  state.objects.set(object.id, updated);
  return updated;
}

export function tapObject(state, objectId, playerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) throw new Error('Nie można tapować tego obiektu');
  if (object.tapped) throw new Error('Obiekt jest już tapped');
  const updated = replaceObject(state, object, { tapped: true });
  const e = event('object_tapped', { objectId, playerId });
  state.events.push(e);
  return updated;
}

export function untapObject(state, objectId, playerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) throw new Error('Nie można untapować tego obiektu');
  if (!object.tapped) return object;
  const updated = replaceObject(state, object, { tapped: false });
  state.events.push(event('object_untapped', { objectId, playerId }));
  return updated;
}

export function untapControlled(state, playerId) {
  const untapped = [];
  for (const object of state.objects.values()) {
    if (object.zone === 'battlefield' && object.controllerId === playerId && object.tapped) {
      untapped.push(untapObject(state, object.id, playerId));
    }
  }
  return untapped;
}

export function markDamage(state, objectId, amount) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel obrażeń');
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
  const updated = replaceObject(state, object, { damage: object.damage + amount });
  state.events.push(event('damage_marked', { objectId, amount, total: updated.damage }));
  return updated;
}

export function clearMarkedDamage(state) {
  for (const object of state.objects.values()) {
    if (object.damage > 0 && object.zone === 'battlefield') replaceObject(state, object, { damage: 0 });
  }
}
