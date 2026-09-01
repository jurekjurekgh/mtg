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

/**
 * Strefa, do której czar schodzi ze stosu — po rozstrzygnięciu, fizzlu
 * (CR 608.2b) albo skontrowaniu (CR 701.5a).
 *
 * M271 (błędy #14 i #15): regułę liczyło RÓWNOLEGLE osiem miejsc w
 * `spells.js` i `effects.js`; część gubiła `exileInsteadOfGraveyard`
 * (Halo Forager, CR 118.9: „If that spell would be put into a graveyard this
 * turn, exile it instead"), więc czar rzucony z grobu wracał do grobu i dawał
 * się rzucić ponownie.
 *
 * Mieszka w `zones.js` — najniższej warstwie grafu importów — bo potrzebują
 * jej zarówno `spells.js`, jak i `effects.js` (a `spells` importuje
 * `effects`, więc helper w `spells` oznaczałby CYKL; pilnuje tego
 * `test/module-graph.test.js`).
 *
 * `adventure` (CR 715.3), `flashedBack` (CR 702.34b) i `reboundCast`
 * (CR 702.97) dotyczą wyłącznie pełnej ścieżki rozstrzygnięcia — przekazuje
 * je caller.
 */
export function spellExitZone(object, { adventure = false, flashedBack = false, reboundCast = false } = {}) {
  return (adventure || flashedBack || reboundCast || object?.exileInsteadOfGraveyard)
    ? 'exile'
    : 'graveyard';
}

