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
 * Strefa, do której trafia permanent zamiast umrzeć (CR 122.1h).
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
  // Batch 59 (Kumano's Blessing): efekt zastępczy AURY należącej do gracza —
  // „If a creature dealt damage by enchanted creature this turn would die,
  // exile it instead." Wykładnię timingu (kiedy czytać warunek) opisuje
  // `exiledByEnchantedDamage` niżej.
  if (exiledByEnchantedDamage(state, object)) return 'exile';
  return 'graveyard';
}

/**
 * Batch 59 (Kumano's Blessing): czy permanent umiera jako ofiara obrażeń
 * zadanych w tej turze przez stwora, który JEST zaczarowany aurą z
 * deskryptorem `exileIfDiesFromEnchantedDamage`? Zwraca `cardId` aury
 * (odznaka `meta.exiledBy` — M262) albo `null`, gdy warunek nie zachodzi.
 *
 * Warunek sprawdzamy w CHWILI śmierci (CR 616.1), a nie przy zadawaniu
 * obrażeń: „enchanted creature" to stwór, który jest zaczarowany TERAZ
 * (rulingowa wykładnia efektów typu „dealt damage by … this turn" — inne
 * sformułowanie tego samego wzorca co CR 608.2b dla celów). Dlatego engine
 * pamięta PARY {ofiara, źródło} z tej tury (`damageSourcesThisTurn`,
 * czyszczone w cleanup), a nie sam fakt „ten stwór oberwał": aura dołożona
 * PO zadaniu obrażeń nadal wygania ofiarę, a aura odczepiona od stwora
 * (albo zdjęta razem z nim z pola bitwy) przestaje działać.
 *
 * Funkcja mieszka w `zones.js` (najniższa warstwa grafu importów — jak
 * `deathZoneFor`) i czyta wyłącznie dane obiektów: żadnego importu
 * `attachments.js`, żadnego cyklu (`test/module-graph.test.js`).
 */
export function exiledByEnchantedDamage(state, object) {
  // „If a CREATURE …": permanent niebędący stworem nie kwalifikuje się.
  if (!object?.id || object.kind !== 'creature') return null;
  const dealers = new Set((state.damageSourcesThisTurn ?? [])
    .filter((entry) => entry?.objectId === object.id)
    .map((entry) => entry.sourceId));
  if (dealers.size === 0) return null;
  for (const dealerId of dealers) {
    const dealer = state.objects.get(dealerId);
    if (!dealer || dealer.zone !== 'battlefield' || dealer.kind !== 'creature') continue;
    for (const battlefieldId of state.zones.battlefield) {
      const attachment = state.objects.get(battlefieldId);
      if (!attachment || attachment.zone !== 'battlefield' || attachment.attachedTo !== dealerId) continue;
      if (attachment.aura?.exileIfDiesFromEnchantedDamage) return attachment.cardId ?? 'effect';
    }
  }
  return null;
}

/**
 * Strefa, do której czar schodzi ze stosu — po rozstrzygnięciu, fizzlu
 * (CR 608.2b) albo skontrowaniu (CR 701.6a).
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
 * `adventure` (CR 715.3), `flashedBack` (CR 702.34a) i `reboundCast`
 * (CR 702.88) dotyczą wyłącznie pełnej ścieżki rozstrzygnięcia — przekazuje
 * je caller.
 */
export function spellExitZone(object, { adventure = false, flashedBack = false, reboundCast = false } = {}) {
  return (adventure || flashedBack || reboundCast || object?.exileInsteadOfGraveyard)
    ? 'exile'
    : 'graveyard';
}

/**
 * Batch 59 (Scavenging Harpy): predykat celu „card from an opponent's
 * graveyard" — dowolna KARTA (nie token: obiekty kart mają `name: null`,
 * tokeny noszą nazwę — wzorzec Puppeteer Clique, CR 108.2b) w grobie gracza
 * innego niż wskazany kontroler.
 *
 * JEDNO źródło reguły dla OFERTY i WALIDACJI (L41/M82: oferta nie może
 * proponować celu, który walidacja odrzuca) — czytają je `spells.js`
 * (walidacja + enumeracja celów czarów i zdolności aktywowanych) oraz
 * `triggers.js` (ETB Harpy). Mieszka w `zones.js` z tego samego powodu co
 * `spellExitZone`: to najniższa warstwa grafu importów, więc nie tworzy cyklu
 * (pilnuje tego `test/module-graph.test.js`).
 */
export function isCardInOpponentGraveyard(object, controllerId) {
  return Boolean(object)
    && object.zone === 'graveyard'
    && object.name == null
    && object.controllerId !== controllerId;
}

