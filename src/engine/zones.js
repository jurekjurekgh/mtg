/** Strefy gry jako jawny, zamknięty zbiór wartości. */
export const ZONES = Object.freeze([
  'library', 'hand', 'battlefield', 'graveyard', 'exile', 'stack',
]);

const zoneSet = new Set(ZONES);

export function assertZone(zone) {
  if (!zoneSet.has(zone)) throw new RangeError(`Nieznana strefa: ${zone}`);
  return zone;
}

/**
 * Przenosi obiekt między strefami bez mutowania wejścia.
 * Caller dostarcza nowe id obiektu — engine będzie później jedynym miejscem,
 * które generuje te identyfikatory.
 */
export function moveToZone(object, zone, newObjectId) {
  assertZone(zone);
  if (!newObjectId) throw new TypeError('Zmiana strefy wymaga nowego id obiektu');
  if (!object || object.zone === undefined) throw new TypeError('Nieprawidłowy obiekt gry');
  if (object.zone === zone) return object;
  return Object.freeze({ ...object, id: newObjectId, zone });
}
