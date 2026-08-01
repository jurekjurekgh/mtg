import { event } from '../protocol/types.js';
import { assertZone } from './zones.js';
import { addCounter } from './counters.js';

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
    if (object.zone === 'battlefield' && object.controllerId === playerId && (object.tapped || object.summoningSickness)) {
      const updated = replaceObject(state, object, { tapped: false, summoningSickness: false });
      untapped.push(updated);
      state.events.push(event('object_untapped', { objectId: object.id, playerId }));
    }
  }
  return untapped;
}

/**
 * Efektywne statystyki stwora = baza + modyfikatory ciągłe (pump do cleanup)
 * + liczniki +1/+1. Stwór zagrany twarzą w dół (morph/megamorph) ma bazę 2/2,
 * dopóki nie zostanie obrócony. To syntetyczny uproszczony model continuous
 * effects; właściwy system warstw (CR 613) powstanie, gdy pojawi się
 * go potrzebująca karta.
 */
export function effectivePower(object) {
  if (object.power === null) return null;
  const base = object.faceDown ? 2 : object.power;
  return base + (object.powerModifier ?? 0) + ((object.counters ?? {})['+1/+1'] ?? 0);
}

export function effectiveToughness(object) {
  if (object.toughness === null) return null;
  const base = object.faceDown ? 2 : object.toughness;
  return base + (object.toughnessModifier ?? 0) + ((object.counters ?? {})['+1/+1'] ?? 0);
}

/**
 * Obraca permanent twarzą do góry (morph/megamorph): wraca do bazowych
 * statystyk karty i dostaje ewentualne liczniki (megamorph kładzie +1/+1).
 * Obiekt nie zmienia strefy, więc obrażenia i modyfikatory pozostają.
 */
export function turnFaceUp(state, objectId, counters = {}) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || !object.faceDown) throw new Error('Obrócić twarzą do góry można tylko face-down permanent');
  replaceObject(state, object, { faceDown: false });
  state.events.push(event('object_flipped', { objectId }));
  let updated = state.objects.get(objectId);
  for (const [name, amount] of Object.entries(counters)) {
    updated = addCounter(state, objectId, name, amount);
  }
  return updated;
}

/** Dodaje modyfikatory statystyk (np. efekt pump); zeruje się w cleanup. */
export function modifyStats(state, objectId, { power = 0, toughness = 0 }) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error('Modyfikować można tylko stwora na battlefield');
  if (!Number.isInteger(power) || !Number.isInteger(toughness)) throw new TypeError('Modyfikatory muszą być całkowite');
  const updated = replaceObject(state, object, {
    powerModifier: object.powerModifier + power,
    toughnessModifier: object.toughnessModifier + toughness,
  });
  state.events.push(event('stats_modified', {
    objectId, powerModifier: updated.powerModifier, toughnessModifier: updated.toughnessModifier,
  }));
  return updated;
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

/** Cleanup kończy też modyfikacje „do końca tury". */
export function clearStatModifiers(state) {
  for (const object of state.objects.values()) {
    if ((object.powerModifier !== 0 || object.toughnessModifier !== 0) && object.zone === 'battlefield') {
      replaceObject(state, object, { powerModifier: 0, toughnessModifier: 0 });
    }
  }
}
