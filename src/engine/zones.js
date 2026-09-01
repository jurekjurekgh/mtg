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

/**
 * Strefa, do której trafia permanent zamiast umrzeć (CR 122.1e).
 * Licznik finality („if it would die, exile it instead") oraz znacznik
 * `exileIfDiesThisTurn` (Agate Assault) przekierowują z cmentarza na wygnanie.
 *
 * Funkcja mieszka w `zones.js` — NAJNIŻSZEJ warstwie grafu importów — bo
 * potrzebują jej zarówno warstwy wyższe (`permanents`, `effects`,
 * `game-state`), jak i niska `attachments` (aura bez gospodarza, CR 704.5m).
 * Trzymanie jej w `permanents.js` zmuszałoby `attachments.js` do importu
 * w górę grafu, czyli do CYKLU — a cykli pilnuje `test/module-graph.test.js`
 * (bundler składa moduły w jeden zasięg, więc cykl łamie build).
 */
export function deathZoneFor(state, object) {
  if (((object?.counters ?? {}).finality ?? 0) > 0) return 'exile';
  // M262: wpisy {id, byCardId} — sprawdzamy id obiektu w naznaczonych.
  if ((state.exileIfDiesThisTurn ?? []).some((entry) => entry.id === object?.id)) return 'exile';
  return 'graveyard';
}

