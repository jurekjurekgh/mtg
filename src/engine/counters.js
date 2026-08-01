import { event } from '../protocol/types.js';

/**
 * Liczniki na permanentach (CR 122) — minimalny wspólny framework.
 *
 * Licznik ma nazwę (np. '+1/+1', 'deathtouch') i ilość. Obecnie statystyki
 * uwzględniają wyłącznie liczniki '+1/+1' (effectivePower/effectiveToughness
 * w permanents.js); pozostałe liczniki istnieją jako znaczniki, które mogą
 * zdejmować efekty (np. deathtouch u Kappa Tech-Wrecker). Liczniki znikają
 * przy zmianie strefy — pilnuje tego moveObjectDirectly (CR 122.2/400.7).
 */

export function countersOf(object) {
  return object.counters ?? {};
}

export function hasCounter(object, counterName, amount = 1) {
  return (object.counters ?? {})[counterName] >= amount;
}

export function addCounter(state, objectId, counterName, amount = 1) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') throw new Error('Liczniki można kłaść tylko na permanentach na bitwisku');
  if (!counterName || !Number.isInteger(amount) || amount < 1) throw new RangeError('Licznik wymaga nazwy i dodatniej całkowitej ilości');
  const counters = { ...(object.counters ?? {}) };
  counters[counterName] = (counters[counterName] ?? 0) + amount;
  const updated = Object.freeze({ ...object, counters });
  state.objects.set(objectId, updated);
  const e = event('counter_added', { objectId, counter: counterName, amount, total: counters[counterName] });
  state.events.push(e);
  return updated;
}

export function removeCounter(state, objectId, counterName, amount = 1) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') throw new Error('Liczniki można zdejmować tylko z permanentów na bitwisku');
  if (!counterName || !Number.isInteger(amount) || amount < 1) throw new RangeError('Licznik wymaga nazwy i dodatniej całkowitej ilości');
  const counters = { ...(object.counters ?? {}) };
  const current = counters[counterName] ?? 0;
  if (current < amount) throw new Error(`Za mało liczników ${counterName}`);
  counters[counterName] = current - amount;
  if (counters[counterName] === 0) delete counters[counterName];
  const updated = Object.freeze({ ...object, counters });
  state.objects.set(objectId, updated);
  const e = event('counter_removed', { objectId, counter: counterName, amount, total: counters[counterName] ?? 0 });
  state.events.push(e);
  return updated;
}
