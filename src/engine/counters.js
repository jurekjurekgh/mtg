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

/**
 * Station (EOE Spacecraft, CR: „It's an artifact creature at 9+\"): obiekt
 * ze wskaźnikiem station jest stworem dokładnie wtedy, gdy liczba liczników
 * charge osiąga próg. Po każdej zmianie liczników synchronizujemy `kind`
 * („creature\" ↔ „artifact\") — przejście przez próg emituje zdarzenie
 * station_status_changed, żeby log i view pokazywały zmianę typu.
 */
function syncStationKind(state, objectId) {
  const object = state.objects.get(objectId);
  if (!object?.station || object.zone !== 'battlefield') return object;
  const active = (object.counters?.charge ?? 0) >= object.station.threshold;
  const expectedKind = active ? 'creature' : 'artifact';
  // M103/C3 (zgłoszenie właściciela): typy muszą iść w parze z kind
  // (CR 205.1 — permanent nad progiem to Artifact Creature, nie sam Artifact
  // z kind='creature'). Kafel pokazywał „Artifact — Spacecraft", a każda
  // ścieżka sprawdzająca `types.includes('Creature')` nie widziała stwora.
  // Bazowe typy zapamiętujemy przy pierwszej synchronizacji, żeby zejście
  // pod próg cofało DOKŁADNIE to, co dodała station (drukowany typ Creature
  // zostałby nietknięty).
  const baseTypes = object.stationBaseTypes ?? [...(object.types ?? [])];
  const expectedTypes = (active && !baseTypes.includes('Creature'))
    ? [...baseTypes, 'Creature']
    : baseTypes;
  const kindChanged = object.kind !== expectedKind;
  const typesChanged = JSON.stringify(object.types ?? []) !== JSON.stringify(expectedTypes);
  if (!kindChanged && !typesChanged) return object;
  const updated = Object.freeze({ ...object, kind: expectedKind, types: expectedTypes, stationBaseTypes: baseTypes });
  state.objects.set(objectId, updated);
  state.events.push(event('station_status_changed', {
    objectId, cardId: object.cardId, becameCreature: active,
    chargeCounters: object.counters?.charge ?? 0, threshold: object.station.threshold,
  }));
  return updated;
}

export function addCounter(state, objectId, counterName, amount = 1) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') throw new Error('Liczniki można kłaść tylko na permanentach na bitwisku');
  if (!counterName || !Number.isInteger(amount) || amount < 0) throw new RangeError('Licznik wymaga nazwy i nieujemnej liczby całkowitej');
  // 0 licznikow = brak efektu (no-op), symetrycznie z 0 obrazen w markDamage.
  // Zabezpiecza m.in. infect o efektywnej mocy 0 (np. token -4/-0 od Hysterical
  // Blindness) - 0 obrazen nie klodzi licznika -1/-1 (CR 510.1).
  if (amount === 0) return object;
  const counters = { ...(object.counters ?? {}) };
  counters[counterName] = (counters[counterName] ?? 0) + amount;
  const updated = Object.freeze({ ...object, counters });
  state.objects.set(objectId, updated);
  const e = event('counter_added', { objectId, counter: counterName, amount, total: counters[counterName] });
  state.events.push(e);
  return syncStationKind(state, objectId);
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
  return syncStationKind(state, objectId);
}
