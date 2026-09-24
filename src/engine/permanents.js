import { event } from '../protocol/types.js';
import { assertZone, deathZoneFor } from './zones.js';
import { addCounter, removeCounter, syncStationKind } from './counters.js';
import { nextTimestamp, timestampOf, attachmentTimestampOf } from './timestamps.js';
import { attachmentGrant, attachmentsAttachedTo, effectiveColors, effectiveProtectionFromColors, effectiveProtectionQualities, isProtectedFromSource, isTargetingBlockedByProtection, sourceHasProtectionQuality } from './attachments.js';
// M110: helpery ochrony przed JAKOŚCIĄ mieszkają w attachments.js (razem
// z ochroną kolorową); permanents.js re-eksportuje je, bo stamtąd biorą je
// combat.js, effects.js i spells.js (i żeby nie robić cyklu importów).
export { effectiveColors, effectiveProtectionQualities, isProtectedFromSource, isTargetingBlockedByProtection, sourceHasProtectionQuality };

/** CR 306: także permanent o kilku typach, ale nie karta zakryta. */
export function isPlaneswalker(object) {
  return Boolean(object && !object.faceDown
    && (object.kind === 'planeswalker' || (object.types ?? []).includes('Planeswalker')));
}

/** Domain: wejście to publiczne permanenty pola bitwy (stan albo PlayerView).
 * CR 305.6 / ruling CON: liczymy odrębne podstawowe PODTYPY, nie supertyp Basic.
 */
export function basicLandTypeCount(battlefield, controllerId) {
  const basics = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
  const found = new Set();
  for (const object of battlefield) {
    if (!object || object.controllerId !== controllerId
        || !(object.kind === 'land' || (object.types ?? []).includes('Land'))) continue;
    for (const subtype of effectiveSubtypes(object)) if (basics.has(subtype)) found.add(subtype);
  }
  return found.size;
}

/** Prewencja licznika shield, wspólna dla pipeline i markDamage. */
export function preventDamageWithShieldCounter(state, objectId, amount) {
  const object = state.objects.get(objectId);
  if (!(amount > 0) || !object || (object.counters?.shield ?? 0) <= 0) return 0;
  removeCounter(state, objectId, 'shield', 1);
  state.events.push(event('shield_consumed', { objectId, cardId: object.cardId, reason: 'damage' }));
  state.events.push(event('damage_prevented', { objectId, cardId: object.cardId, amount, shieldCounter: true }));
  return amount;
}

/** CR120.3c: niezależny skutek obrażeń (także creature/PW), już po prewencji.
 * Nie ma ujemnych liczników — zdejmujemy najwyżej aktualną lojalność. */
export function removeLoyaltyForDamage(state, object, amount) {
  if (!isPlaneswalker(object)) return object;
  const lost = Math.min(amount, object.counters?.loyalty ?? 0);
  return lost > 0 ? removeCounter(state, object.id, 'loyalty', lost) : object;
}

export function replaceObject(state, object, patch) {
  // Ciągłość „for as long as ... remains tapped” (CR611.2b). Stun nie
  // odkręca, więc nie zwiększa wersji. Nowy obiekt po zmianie strefy = nowe ID.
  const untap = object.zone === 'battlefield' && object.tapped && patch.tapped === false;
  const updated = Object.freeze({ ...object, ...patch,
    ...(untap ? { untapVersion: (object.untapVersion ?? 0) + 1 } : {}),
  });
  state.objects.set(object.id, updated);
  return updated;
}

export function tapObject(state, objectId, playerId, events = null) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) throw new Error('Nie można tapować tego obiektu');
  if (object.tapped) throw new Error('Obiekt jest już tapped');
  const updated = replaceObject(state, object, { tapped: true });
  const e = event('object_tapped', { objectId, playerId });
  state.events.push(e);
  // M114/M117 (ta sama klasa co tapnięcie landa za manę i regeneracja):
  // zdarzenie musi trafić TAKŻE do listy zwracanej przez komendę, bo
  // `accepted()` karmi `processTriggers` tą listą, a nie całym `state.events`
  // (Batch 57/B5: atak Annie Flash nie odpalał „whenever becomes tapped").
  // Kolektor jest opcjonalny — ścieżki, które budują własną listę zdarzeń,
  // podają ją jawnie (combat.declareAttackers).
  if (events) events.push(e);
  return updated;
}

/** Czy permanent nie może się odkręcić z powodu aktywnej blokady (np. Lira). */
export function isUntapStepLocked(state, object) {
  // Stała cecha załącznika, nie ETB trigger; tylko krok odkręcania.
  if (attachmentsAttachedTo(state, object.id).some(a => attachmentGrant(a)?.doesntUntap)) return true;
  return (object.untapLockedBy ?? []).some((sourceId) => {
    const source = state.objects.get(sourceId);
    if (!source || source.zone !== 'battlefield') return false;
    const version = object.untapLockVersions?.[sourceId];
    if (version != null && version !== (source.untapVersion ?? 0)) return false;
    // Lira: blokada działa, gdy źródło jest tapnięte.
    if (source.tapped) return true;
    // Aura lock (Spectral Prison): blokada działa zawsze, gdy źródło jest
    // załączoną aurą na polu bitwy (nie wymaga tapped).
    if (source.kind === 'aura' && source.attachedTo) return true;
    return false;
  });
}

/**
 * Czy obiekt jest źródłem aktywnej blokady untap (np. Entrancing Lyre).
 * „You may choose not to untap" — deterministycznie nie odkręcamy obiektu,
 * który blokuje innego, żeby blokada nie wygasła.
 */
function isActiveLockSource(state, objectId) {
  for (const object of state.objects.values()) {
    if (object.zone !== 'battlefield') continue;
    if ((object.untapLockedBy ?? []).includes(objectId)
      && (object.untapLockVersions?.[objectId] == null
        || object.untapLockVersions[objectId] === (state.objects.get(objectId)?.untapVersion ?? 0))) return true;
  }
  return false;
}

/**
 * Odkręcenie permanentu przez EFEKT (czar/zdolność), bez sprawdzania, kto go
 * kontroluje — w odróżnieniu od `untapObject`, które obsługuje krok
 * odkręcania i wymaga zgodności kontrolera.
 *
 * M272 (błąd #18): pięć ścieżek efektów odkręcających mutowało `tapped: false`
 * RĘCZNIE, przez co omijały regułę stun, którą zna `untapObject`:
 *  - CR 122.1d/614.6 — licznik stun ZASTĘPUJE odkręcenie („instead remove a
 *    stun counter"), i to przy odkręceniu z DOWOLNEGO powodu, nie tylko
 *    w kroku odkręcania. Stwór ze stunem wstawał więc z Twiddle/Village
 *    Bell-Ringer za darmo, zachowując licznik;
 *  Blokada „during its controller’s untap step” NIE dotyczy odkręcania
 *  efektem (Oracle Membrane/Prison/Lyre). Stun działa z dowolnego powodu.
 *
 * Zwraca true, gdy permanent FAKTYCZNIE się odkręcił (zdarzenie
 * `object_untapped` wyemitowane) — zdjęcie licznika stun to nie odkręcenie,
 * więc triggery „becomes untapped" nie odpalają (CR 122.1d, ruling WotC).
 */
export function untapByEffect(state, objectId, playerId = null) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || !object.tapped) return false;
  if ((object.counters ?? {}).stun > 0) {
    removeCounter(state, objectId, 'stun', 1);
    return false;
  }
  replaceObject(state, object, { tapped: false });
  state.events.push(event('object_untapped', {
    objectId, playerId: playerId ?? object.controllerId, cardId: object.cardId ?? null,
  }));
  return true;
}

export function untapObject(state, objectId, playerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) throw new Error('Nie można untapować tego obiektu');
  if (!object.tapped) return object;
  if (isUntapStepLocked(state, object)) return object;
  // Stun counters (Lodestone Needle): jeśli permanent ma liczniki stun,
  // zamiast odkręcenia zdejmij jeden licznik stun (CR 122.1b).
  if ((object.counters ?? {}).stun > 0) {
    removeCounter(state, objectId, 'stun', 1);
    return state.objects.get(objectId);
  }
  const updated = replaceObject(state, object, { tapped: false });
  state.events.push(event('object_untapped', { objectId, playerId }));
  return updated;
}

/**
 * CR 302.6: zdejmuje chorobę przywołania z permanentu kontrolowanego na
 * początku untap stepu jego kontrolera. Rozdzielone od samego odkręcania,
 * bo blokady odkręcania (stun, untap-lock) wstrzymują tylko untap.
 */
function clearSummoningSickness(state, object) {
  if (!object.summoningSickness) return object;
  return replaceObject(state, object, { summoningSickness: false });
}

export function untapControlled(state, playerId) {
  const untapped = [];
  for (const object of state.objects.values()) {
    if (object.zone === 'battlefield' && object.controllerId === playerId && (object.tapped || object.summoningSickness || object.dontUntapNextUntapStep)) {
      // M101/B5 (CR 302.6): choroba przywołania zależy WYŁĄCZNIE od ciągłości
      // kontroli („under its controller's control continuously since the start
      // of their most recent turn"), a NIE od tego, czy permanent faktycznie
      // się odkręcił. Każdy permanent kontrolowany na początku tego untap
      // stepu przestaje być „chory" — nawet jeśli zaraz poniżej blokada
      // odkręcania (stun, untap-lock, „doesn't untap next untap step") każe
      // nam pominąć samo odkręcenie. Wcześniej flagę kasowała dopiero gałąź
      // realnego odkręcenia, więc tapnięty stwór pod blokadą zostawał chory
      // w nieskończoność i nigdy nie mógł atakować ani użyć zdolności {T}.
      const cured = clearSummoningSickness(state, object);
      // E8/B2 (wyzwanie wyłapywacza błędów, CR „doesn't untap during its
      // controller's NEXT untap step"): jednorazowa flaga zużywa się NA
      // untap stepie obecnego kontrolera, niezależnie od stanu tapped.
      // Dotąd zjadano ją tylko przy `tapped` (odkręcony w międzyczasie cel
      // nosił flagę wiecznie i pomijał PÓŹNIEJSZY untap step), a porównanie
      // z controllerId zapisanym w chwili efektu gubiło skip po zmianie
      // kontrolera. Blokady odkręcania (stun, untap-lock) obowiązują dalej
      // w kolejnych stepach — tu flaga i tak właśnie schodzi.
      if (cured.dontUntapNextUntapStep) {
        const cleared = replaceObject(state, cured, { dontUntapNextUntapStep: null });
        if (cleared.tapped) continue; // efektywny skip: ten step bez odkręcenia
        continue; // odkręcony — flaga zużyta bez skutku (nie ma czego odkręcać)
      }
      // Zablokowane stworzenie (np. przez Entrancing Lyre) nie odkręca się.
      if (cured.tapped && isUntapStepLocked(state, cured)) continue;
      // „You may choose not to untap" (Entrancing Lyre): obiekt będący
      // źródłem aktywnej blokady nie odkręca się — deterministycznie
      // zawsze wybieramy „nie odkręcaj", żeby blokada nie wygasła.
      if (cured.tapped && isActiveLockSource(state, cured.id)) continue;
      // M101/B3 (CR 122.1b — liczniki stun): „If a permanent with a stun
      // counter on it would become untapped, remove one from it instead."
      // Dotyczy KAŻDEGO odkręcenia, więc także turn-based action kroku
      // odkręcania (CR 502.2) — nie tylko punktowego untapObject. Bez tego
      // Lodestone Needle i tryb „Take 59 Flights of Stairs" nie robiły nic:
      // permanent odkręcał się w swoim untap stepie z nietkniętym licznikiem.
      if (cured.tapped && (cured.counters ?? {}).stun > 0) {
        removeCounter(state, cured.id, 'stun', 1);
        continue;
      }
      if (!cured.tapped) continue; // sam zdjęty summoning sickness — bez zdarzenia untap
      const updated = replaceObject(state, cured, { tapped: false });
      untapped.push(updated);
      state.events.push(event('object_untapped', { objectId: cured.id, playerId }));
    }
  }
  return untapped;
}

/**
 * Efektywne statystyki stwora = baza + modyfikatory ciągłe (pump do cleanup)
 * + liczniki +1/+1 + buffy załączników (aury bestow, czyste aury, equipmenty;
 * CR 613 w minimalnym wymiarze: jedna warstwa efektów „+N/+N i keywordy"
 * z deskryptorów załączników).
 * Stwór zagrany twarzą w dół (morph/megamorph) ma bazę 2/2, dopóki nie
 * zostanie obrócony. `state` potrzebny jest do zliczenia załączników — bez
 * niego funkcja zachowuje dawną sygnaturę (bez buffów); miejsca mechaniczne
 * (combat, SBA, PlayerView, koszty {X}) zawsze przekazują stan.
 */
/** Liczba RÓŻNYCH permanentów z kwalifikującymi się cechami Storied
 * (artefakt, legendary, Saga — jeden permanent liczy się RAZ nawet przy
 * kilku cechach; ruling WotC 2026-06-29). Landy i tokeny też są permanentami. */
function storiedQualifiedCount(state, playerId) {
  const seen = new Set();
  for (const object of state?.objects?.values?.() ?? []) {
    if (object?.zone !== 'battlefield' || object.controllerId !== playerId) continue;
    const qualifies = (object.types ?? []).includes('Artifact')
      || (object.types ?? []).includes('Legendary')
      || (object.subtypes ?? []).includes('Saga');
    if (qualifies) seen.add(object.id);
  }
  return seen.size;
}

/** Czy kontroler źródła kontroluje jakikolwiek permanent z keywordem Storied. */
function controlsStoriedPermanent(state, playerId) {
  for (const object of state?.objects?.values?.() ?? []) {
    if (object?.zone !== 'battlefield' || object.controllerId !== playerId) continue;
    if (effectiveAbilities(object).some((ability) => ability?.storied)) return true;
  }
  return false;
}

/** Storied (CR 702.?? — HOB): „If you control three or more artifacts,
 * legendaries, and/or Sagas, you have an enduring story for the rest of the
 * game." Etykieta jest NA GRACZU i nie może zostać usunięta; nie jest
 * triggerem i nie idzie na stos (ruling WotC). Ustawiamy ją leniwie przy
 * odczycie warunku oraz w runStateBasedActions (jedno źródło prawdy). */
export function hasEnduringStory(state, playerId) {
  const player = state?.players?.find((entry) => entry.id === playerId);
  if (!player) return false;
  if (player.enduringStory) return true;
  if (!controlsStoriedPermanent(state, playerId)) return false;
  if (storiedQualifiedCount(state, playerId) >= 3) {
    player.enduringStory = true;
    return true;
  }
  return false;
}

/**
 * Statyczne zdolności warunkowe (CR 611.3a): deskryptor
 * `{ type: 'static', condition, pump, keywords }` daje buff, dopóki warunek
 * jest spełniony — nie jest to efekt „do końca tury", tylko ciągła własność
 * przeliczana przy każdym odczycie statystyk (Evangel of Synthesis: „as long
 * as you've drawn two or more cards this turn").
 */
function staticConditionHolds(state, object, condition) {
  if (!condition) return true;
  // Crew Captain: „has indestructible as long as it entered this turn".
  // Flaga enteredOnTurn (numer tury wejścia) — NIE summoning sickness:
  // kradzież/zmiana kontroli nakłada SS (CR 302.6) bez wejścia na pole bitwy.
  if (condition.enteredThisTurn) return object.enteredOnTurn === state?.turn?.number;
  // „During your turn" / „during opponents' turns" (Leonin Surveyor — first
  // strike): porównanie aktywnego gracza z KONTROLEREM obiektu (CR 109.5 —
  // „you/your" to kontroler karty). activePlayerIsController=false pokrywa
  // „as long as it's NOT your turn".
  if (condition.activePlayerIsController != null) {
    return (state?.turn?.activePlayerId === object.controllerId) === condition.activePlayerIsController;
  }
  // „As long as you gained life this turn" (Ulna Alley Shopkeep — Infusion):
  // licznik zyskanego życia per gracz (players.changeLife), zerowany z turą.
  if (condition.gainedLifeThisTurn) {
    return ((state?.lifeGainedThisTurn ?? {})[object.controllerId] ?? 0) > 0;
  }
  if (condition.minCardsDrawnThisTurn != null) {
    const drawn = (state?.cardsDrawnThisTurn ?? {})[object.controllerId] ?? 0;
    return drawn >= condition.minCardsDrawnThisTurn;
  }
  if (condition.minLandsControlled != null) {
    const lands = [...(state?.objects?.values?.() ?? [])].filter((candidate) => candidate.zone === 'battlefield'
      && candidate.controllerId === object.controllerId
      && (candidate.kind === 'land' || (candidate.types ?? []).includes('Land'))).length;
    return lands >= condition.minLandsControlled;
  }
  // Esper Stormblade: „As long as you control another multicolored permanent".
  // Multicolored = permanent z co najmniej dwoma kolorami (colors.length >= 2);
  // „another" wyklucza samo źródło.
  if (condition.controlsAnotherMulticolored) {
    return [...(state?.objects?.values?.() ?? [])].some((candidate) => candidate.zone === 'battlefield'
      && candidate.id !== object.id
      && candidate.controllerId === object.controllerId
      && (candidate.colors ?? []).length >= 2);
  }
  // „... as long as it has a +1/+1 counter on it\" (Ainok Artillerist, warunek
  // generyczny na dowolny licznik): źródło musi mieć co najmniej jeden licznik
  // o podanej nazwie (np. { hasCounter: '+1/+1' }).
  if (condition.hasCounter != null) {
    return (object.counters?.[condition.hasCounter] ?? 0) > 0;
  }
  // „As long as there are four or more creature cards in your graveyard\"
  // (Gray Slaad — menace i deathtouch): liczba KART-stworów (nie tokenów)
  // w grobie kontrolera źródła.
  if (condition.minCreatureCardsInGraveyard != null) {
    let count = 0;
    for (const objectId of state.zones.graveyard) {
      const candidate = state.objects.get(objectId);
      if (!candidate || candidate.controllerId !== object.controllerId) continue;
      if (candidate.name != null) continue; // tokeny nie są kartami
      if (candidate.kind === 'creature' || (candidate.types ?? []).includes('Creature')) count += 1;
    }
    return count >= condition.minCreatureCardsInGraveyard;
  }
  // Ramroller: „as long as you control another artifact\" — dowolny inny
  // artefakt kontrolera źródła (także artefaktowy stwór czy equipment);
  // „another\" wyklucza samo źródło.
  if (condition.controlsAnotherArtifact) {
    return [...(state?.objects?.values?.() ?? [])].some((candidate) => candidate.zone === 'battlefield'
      && candidate.id !== object.id
      && candidate.controllerId === object.controllerId
      && (candidate.kind === 'artifact' || (candidate.types ?? []).includes('Artifact')));
  }
  // Gearsmith Prodigy: „as long as you control an artifact" — ten sam predykat
  // co Ramroller, ale BEZ wykluczania samego źródła (CR 611.3a: warunek
  // statyczny liczony przy każdym odczycie charakterystyk). Artefaktem jest
  // wszystko z typem Artifact — także artefaktowy stwór czy pojazd.
  if (condition.controlsArtifact) {
    return [...(state?.objects?.values?.() ?? [])].some((candidate) => candidate.zone === 'battlefield'
      && candidate.controllerId === object.controllerId
      && (candidate.kind === 'artifact' || (candidate.types ?? []).includes('Artifact')));
  }
  // Carapace Forger — Metalcraft (CR 207.2c): trzy lub więcej artefaktów.
  if (condition.minArtifactsControlled != null) {
    const count = [...(state?.objects?.values?.() ?? [])].filter((c) => c.zone === 'battlefield'
      && c.controllerId === object.controllerId
      && (c.kind === 'artifact' || (c.types ?? []).includes('Artifact'))).length;
    return count >= condition.minArtifactsControlled;
  }
  // Batch 53 (Óin the Brave, HOB): „As long as you have an enduring story"
  // — etykieta na graczu (Storied), generyczna (ADR 0002).
  if (condition.enduringStory) {
    return hasEnduringStory(state, object.controllerId);
  }
  // Kabira Vindicator — Level counters (CR 702.87)
  if (condition.minLevel != null || condition.maxLevel != null) {
    const level = object.counters?.level ?? 0;
    if (condition.minLevel != null && level < condition.minLevel) return false;
    if (condition.maxLevel != null && level > condition.maxLevel) return false;
    return true;
  }
  return false;
}

/**
 * ZAMKNIĘTA lista TYPÓW KART (CR 205.2a) — JEDNO źródło dla wszystkich
 * konsumentów (O-2 audytu PR #134, L41/L48: ta sama lista siedziała wcześniej
 * w dwóch plikach jako `DELIRIUM_CARD_TYPES` w `triggers.js` i
 * `ALL_GRAVEYARD_CARD_TYPES` tutaj; 16 elementów, zero różnicy, a od PR #134
 * jedna z nich decydowała o dostępności zdolności — bramka delirium
 * Resurrected Cultist).
 *
 * Konsumenty:
 *   • delirium (CR 207.2c) — `graveyardCardTypeCount` w `triggers.js`
 *     i bramka aktywacji w `abilities.js`;
 *   • „liczba typów kart we wszystkich grobach” (Tarmogoyf — token Disy the
 *     Restless) — `allGraveyardsCardTypeCount` poniżej;
 *   • dozwolone typy kart w warstwie stołu (`render.js`).
 *
 * Nadtypy (Basic, Legendary, Snow, World) NIE są typami kart i nie wchodzą do
 * listy; tokeny w grobie nie są kartami (`name` ustawione) i nie wnoszą typu.
 */
export const CARD_TYPES = Object.freeze([
  'Artifact', 'Battle', 'Conspiracy', 'Creature', 'Dungeon', 'Enchantment',
  'Instant', 'Kindred', 'Land', 'Phenomenon', 'Plane', 'Planeswalker',
  'Scheme', 'Sorcery', 'Tribal', 'Vanguard',
]);

/**
 * Liczba RÓŻNYCH typów kart wśród kart we WSZYSTKICH grobach (Tarmogoyf —
 * token Disy the Restless; wariant graveyardCardTypeCount liczący jednego
 * gracza). Tokeny nie są kartami (name ustawione) i się nie liczą.
 */
export function allGraveyardsCardTypeCount(state) {
  const present = new Set();
  for (const objectId of state.zones.graveyard) {
    const object = state.objects.get(objectId);
    if (!object || object.name != null) continue;
    for (const type of object.types ?? []) {
      if (CARD_TYPES.includes(type)) present.add(type);
    }
  }
  return present.size;
}

/**
 * Emissary Escort: „This creature gets +X/+0, where X is the greatest mana
 * value among other artifacts you control." Największa mana value wśród
 * artefaktów kontrolera źródła, z wyłączeniem samego źródła.
 */
function greatestManaAmongOtherArtifacts(state, object) {
  let max = 0;
  for (const candidate of state.objects.values()) {
    if (candidate.zone !== 'battlefield' || candidate.id === object.id) continue;
    if (candidate.controllerId !== object.controllerId) continue;
    const isArtifact = candidate.kind === 'artifact' || (candidate.types ?? []).includes('Artifact');
    if (!isArtifact) continue;
    max = Math.max(max, candidate.manaCost ?? 0);
  }
  return max;
}

function staticBonuses(state, object) {
  const bonus = { power: 0, toughness: 0, keywords: [], mechanics: [] };
  if (!state || object.zone !== 'battlefield' || object.faceDown) return bonus;
  for (const ability of object.abilities ?? []) {
    if (ability?.type !== 'static') continue;
    // Zdolności hymnowe ze scope (Trostani — „other creatures you control")
    // NIE buffują samego źródła — obsługuje je anthemBonuses na INNYCH obiektach.
    if (ability.scope) continue;
    // W-1 (D4b, CR 613.4a): zdolność definiująca P/T (CDA — Tarmogoyf) NIE
    // jest modyfikatorem warstwy 7c. Działa w warstwie 7a jako BAZA
    // (`characteristicDefiningStat`), więc efekt warstwy 7b („has base power
    // and toughness 4/4” — Voice of the Vermin) ją nadpisuje.
    if (ability.characteristicDefining) continue;
    if (!staticConditionHolds(state, object, ability.condition)) continue;
    // Dynamiczny pump (np. Emissary Escort): `power` bywa markerem zamiast
    // liczbą — wartość liczona z planszy, nie stała w definicji (CR 611.3a).
    let power = ability.pump?.power ?? 0;
    if (power === 'greatest_mana_among_other_artifacts') {
      power = greatestManaAmongOtherArtifacts(state, object);
    }
    // Necrosquito (ONE): „This creature gets +1/+1 for each oil counter on
    // it." — dynamiczny pump liczony z liczników oil obiektu (CR 611.3a).
    if (power === 'oil_counters') {
      power = (object.counters ?? {})['oil'] ?? 0;
    }
    // Tarmogoyf (token Disy the Restless): „power is equal to the number of
    // card types among cards in ALL graveyards, toughness = that number + 1".
    if (power === 'card_types_in_all_graveyards') {
      power = allGraveyardsCardTypeCount(state);
    }
    let toughness = ability.pump?.toughness ?? 0;
    if (toughness === 'card_types_in_all_graveyards_plus_1') {
      toughness = allGraveyardsCardTypeCount(state) + 1;
    }
    if (toughness === 'oil_counters') {
      toughness = (object.counters ?? {})['oil'] ?? 0;
    }
    bonus.power += power;
    bonus.toughness += toughness;
    bonus.keywords.push(...(ability.keywords ?? []));
    // L (zgłoszenie właściciela 2026-09-19b, Óin the Brave): zdolność
    // WARUNKOWA to mechanika NAZWANA na karcie (Storied / enduring story) —
    // niosąc samą różnicę P/T, widok skazywał kafel na gołe „+1/0”, z którego
    // gracz nie odczytał, skąd bonus jest. Kolekcjonujemy WIĘC klucz warunku
    // razem z jego wkładem do P/T (deskryptor, nie nazwa karty — ADR 0002);
    // etykietę mechaniki nadaje warstwa opisu (render.js), bo to słownik
    // prezentacji, nie reguła silnika.
    if (power !== 0 || toughness !== 0) {
      for (const key of Object.keys(ability.condition ?? {})) {
        bonus.mechanics.push({ condition: key, power, toughness });
      }
    }
  }
  return bonus;
}

/**
 * Hymn (Trostani Discordant, CR 604): zdolności statyczne ZE WSKAZANIEM
 * zasięgu (`scope.affects === 'other_creatures_you_control'`) buffują INNE
 * obiekty spełniające predykat — tu: inne stwory kontrolera źródła hymnówki.
 * Liczone przy każdym odczycie statystyk, jak staticBonuses, ale iterujące
 * po permanentach-źródłach, nie po zdolnościach samego obiektu.
 */
function anthemBonuses(state, object) {
  const bonus = { power: 0, toughness: 0, keywords: [], keywordEntries: [] };
  // W-3 (D4b, CR 708.2): zakryty permanent to 2/2 STWÓR — cudzy hymn („other
  // creatures you control get +1/+1”) działa na niego jak na każdy inny stwór.
  // Zakrycie tłumi tylko JEGO WŁASNE zdolności (staticBonuses), nie efekty
  // z zewnątrz. Hymn z zasięgiem na podtyp i tak go omija (brak podtypów).
  if (!state || object.zone !== 'battlefield') return bonus;
  if (object.kind !== 'creature') return bonus;
  for (const source of state.objects.values()) {
    // CR 708.2a: zakryte ŹRÓDŁO nie ma zdolności — nie daje hymnu.
    if (source.zone !== 'battlefield' || source.faceDown) continue;
    for (const ability of source.abilities ?? []) {
      if (ability?.type !== 'static' || !ability.scope) continue;
      // Altar of the Goyf: „Lhurgoyf creatures you control have trample." —
      // scope na PODTYP (affects 'creatures_with_subtype', scope.subtype).
      const subtypeScope = ability.scope.affects === 'creatures_with_subtype';
      const creatureAffects = ability.scope.affects === 'other_creatures_you_control'
        || ability.scope.affects === 'all_creatures_you_control';
      if (!creatureAffects && !subtypeScope) continue;
      if (subtypeScope && !hasCreatureType(object, ability.scope.subtype, state)) continue;
      // 'other_creatures_you_control' excludes the source itself; 'all_creatures_you_control' includes it.
      if (ability.scope.affects === 'other_creatures_you_control' && source.id === object.id) continue;
      if (source.controllerId !== object.controllerId) continue;
      if (!staticConditionHolds(state, source, ability.condition)) continue;
      bonus.power += ability.pump?.power ?? 0;
      bonus.toughness += ability.pump?.toughness ?? 0;
      bonus.keywords.push(...(ability.keywords ?? []));
      // D4b (CR 613.7a): efekt statyczny ma znacznik obiektu-źródła.
      for (const keyword of ability.keywords ?? []) bonus.keywordEntries.push({ keyword, ts: timestampOf(source) });
    }
  }
  return bonus;
}

/**
 * Ograniczenia nakładane przez załączniki (aury/equipment) na gospodarza
 * (Hobble: „Enchanted creature can't attack. Enchanted creature can't block
 * if it's black."). Deskryptor `cantAttack` (bool) blokuje deklarację ataku;
 * `cantBlock` — bool (zawsze) albo warunek { hostHasColor } oceniany przy
 * odczycie względem kolorów gospodarza. Liczone przy każdym odczycie —
 * odłączenie aury znosi ograniczenie natychmiast (bez cleanupu).
 */
/**
 * Czy stwór ma zakaz blokowania (CR 509.1a) — JEDNO miejsce prawdy dla
 * wszystkich ścieżek (enumeracja ofert, walidacja komendy, widok, boty).
 *
 * Dwa różne źródła zakazu, wcześniej sklejone w jednym polu `cantBlock`
 * (klasa L14 — jedna instrukcja, dwie zasady):
 *  - `cantBlockPrinted` — cecha WYDRUKOWANA na obiekcie („This token can't
 *    block\" — Phyrexian Mite, Goblin Construct); trwała, cleanup jej nie
 *    zdejmuje;
 *  - `cantBlock` — efekt „can't block this turn\" (Panic Spellbomb);
 *    wygasa w cleanup (CR 514.2).
 * Ograniczenia z załączników liczy attachmentRestrictions (read-time).
 */
/**
 * Ograniczenie TUREWCZE zakazu blokowania (CR 611.2 — efekt ciągły):
 * „Nonartifact creatures can't block this turn" (Ruthless Invasion). Ograniczenie
 * żyje na obiekcie tury (NOWA tura = nowy state.turn = wygaśnięcie naturalne,
 * CR 514.2) i jest czytane READ-TIME — obejmuje także stwory wchodzące na
 * pole bitwy POZCIEJ w tej samej turze (M200/L: stara implementacja
 * zamrażała zbiór przy rozstrzygnięciu — odchyłka od Oracle).
 */
export function turnCantBlockRestricts(state, object) {
  const restrictions = state?.turn?.cantBlockRestrictions;
  if (!Array.isArray(restrictions) || restrictions.length === 0 || !object) return false;
  return restrictions.some((r) => !(r.exceptTypes ?? []).some((t) => (object.types ?? []).includes(t)));
}

export function creatureCantBlock(object, state = null) {
  return Boolean(object?.cantBlockPrinted || object?.cantBlock || turnCantBlockRestricts(state, object));
}

export function attachmentRestrictions(state, object) {
  const restrictions = { cantAttack: false, cantBlock: false };
  if (!state || object.zone !== 'battlefield' || object.kind !== 'creature') return restrictions;
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    const descriptor = attachment.aura ?? attachment.equipment ?? null;
    if (!descriptor) continue;
    // Warunek podtypu gospodarza (Bonds of Faith: „Otherwise, it can't attack
    // or block" = zakaz, gdy NIE jest Humanem). Odczytywany NA BIEŻĄCO —
    // zmiana podtypu zmienia restrykcję bez żadnego cleanupu (ruling ISD:
    // utrata bycia Humanem po deklaracji ataku nie usuwa z walki, ale
    // zdejmuje +2/+2 — czyli wszystko liczy się przy odczycie).
    const subtypeConditionHolds = (cond) => {
      if (!cond) return false;
      if (cond.hostHasSubtype && hasCreatureType(object, cond.hostHasSubtype, state)) return true;
      if (cond.hostLacksSubtype && !hasCreatureType(object, cond.hostLacksSubtype, state)) return true;
      if (cond.hostHasColor && (object.colors ?? []).includes(cond.hostHasColor)) return true;
      return false;
    };
    if (descriptor.cantAttack === true) restrictions.cantAttack = true;
    else if (descriptor.cantAttack && typeof descriptor.cantAttack === 'object'
      && subtypeConditionHolds(descriptor.cantAttack)) restrictions.cantAttack = true;
    // Batch 23: Vow of Wildness — "can't attack you or planeswalkers you control"
    // W 1v1: jeśli aura zaczarowuje stwora przeciwnika, ten stwór nie może
    // atakować kontrolera aury (you). Sprawdzamy: aura controller != creature
    // controller → cantAttack.
    if (descriptor.cantAttackYou) {
      if (attachment.controllerId !== object.controllerId) {
        // W 1v1 jedyny legalny atak to na kontrolera aury, więc blokujemy.
        // W multiplayer wystarczyłoby sprawdzać defendingPlayer, ale w naszym
        // silniku 1v1 ataki są zawsze na przeciwnika, więc nie ma wyboru.
        restrictions.cantAttack = true;
      }
    }
    const cantBlock = descriptor.cantBlock;
    if (cantBlock === true) {
      restrictions.cantBlock = true;
    } else if (cantBlock && typeof cantBlock === 'object') {
      // Wspólny ewaluator warunków podtypu/koloru (hostHasColor z Hobble'a,
      // hostHasSubtype/hostLacksSubtype z Bonds of Faith) — jedno miejsce.
      if (subtypeConditionHolds(cantBlock)) restrictions.cantBlock = true;
    }
  }
  return restrictions;
}

function attachmentBonuses(state, object) {
  if (!state || object.zone !== 'battlefield' || object.kind !== 'creature') return { power: 0, toughness: 0, keywords: [], keywordEntries: [] };
  const bonus = { power: 0, toughness: 0, keywords: [], keywordEntries: [] };
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    const grant = attachmentGrant(attachment);
    // D4b (CR 613.7e): efekty załącznika mają znacznik PRZYPIĘCIA.
    const ts = attachmentTimestampOf(attachment);
    bonus.power += grant.power;
    bonus.toughness += grant.toughness;
    bonus.keywords.push(...grant.keywords);
    for (const keyword of grant.keywords) bonus.keywordEntries.push({ keyword, ts });

    // Conditional keywords (Hunter's Blowgun): different keywords granted
    // based on whose turn it is (evaluated at read time with game state).
    // CR 109.5: „you"/„your" w tekście karty odnoszą się do KONTROLERA TEJ
    // KARTY — dla załącznika to `attachment.controllerId`, a NIE kontroler
    // nosiciela. Przy rozdzielonych kontrolach (np. Awaken the Sleeper
    // przejmuje stwora, a Equipment zostaje u poprzedniego kontrolera)
    // „during your turn" = tura kontrolera Blowguna (M214, znalezisko #3).
    // Warunkowy pump (Bonds of Faith): warunek liczy się względem GOSPODARZA
    // („as long as it's a Human"), nie kontrolera aury (inaczej niż
    // conditionalKeywords z „during your turn").
    for (const cp of (grant.conditionalPump ?? [])) {
      const cond = cp.condition ?? {};
      const active = (cond.hostHasSubtype && hasCreatureType(object, cond.hostHasSubtype, state))
        || (cond.hostLacksSubtype && !hasCreatureType(object, cond.hostLacksSubtype, state));
      if (active) {
        bonus.power += cp.pump?.power ?? 0;
        bonus.toughness += cp.pump?.toughness ?? 0;
      }
    }
    for (const ck of (grant.conditionalKeywords ?? [])) {
      const cond = ck.condition ?? {};
      let active = false;
      if (cond.activePlayerIsController === true) {
        active = state.turn.activePlayerId === attachment.controllerId;
      } else if (cond.activePlayerIsController === false) {
        active = state.turn.activePlayerId !== attachment.controllerId;
      } else if (cond.controlsNoOtherCreatures === true) {
        // M174/D (Predator's Gambit): „as long as its controller controls
        // no other creatures" — poza samym nosicielem.
        active = ![...state.objects.values()].some((other) => other.zone === 'battlefield'
          && other.controllerId === object.controllerId
          && other.kind === 'creature' && other.id !== object.id);
      }
      if (active) {
        bonus.keywords.push(...ck.keywords);
        for (const keyword of ck.keywords) bonus.keywordEntries.push({ keyword, ts });
      }
    }
  }
  return bonus;
}

/**
 * Wpływ liczników na statystyki (CR 122.1c/613.4c): +1/+1 podnosi obie
 * wartości, -1/-1 obniża. Liczniki -1/-1 weszły z persist (Puppeteer Clique).
 */
function counterDelta(object) {
  const counters = object.counters ?? {};
  // Audyt PR #41 (B5): sam licznik oil NIE daje +1/+1 — daje go dopiero
  // zdolność Necrosquito („This creature gets +1/+1 for each oil counter on
  // it.", statyczny pump oil_counters w staticBonuses). Generyczne dodawanie
  // oil do P/T każdego obiektu byłoby nadmierną generalizacją (CR 122.1c —
  // liczniki P/T to tylko +1/+1 i -1/-1).
  return (counters['+1/+1'] ?? 0) - (counters['-1/-1'] ?? 0);
}

/** Ciągłe buffy „do końca tury" (CR 611.2c — patrz state.untilEndOfTurnBuffs):
 *  czytane przy każdym odczycie statystyk — obejmują też obiekty, które
 *  weszły na pole bitwy PO rozstrzygnięciu efektu (Hysterical Blindness,
 *  Turn the Tide, Angel of the Dawn, Your Temple). */
function untilEndOfTurnBonuses(state, object) {
  if (!state || !object || object.zone !== 'battlefield' || object.kind !== 'creature') {
    return { power: 0, toughness: 0, keywords: [], keywordEntries: [] };
  }
  const out = { power: 0, toughness: 0, keywords: [], keywordEntries: [] };
  for (const buff of state.untilEndOfTurnBuffs ?? []) {
    // Buff TYLKO jednego obiektu (Altar of the Goyf — atakujący samotnie):
    // buff.objectId ogranicza do wskazanego obiektu; inaczej buff grupowy.
    if (buff.objectId != null && buff.objectId !== object.id) continue;
    // CR 611.2c (M101/B2): buff grupowy niesie ZAMROŻONĄ przy rozstrzygnięciu
    // listę objectIds — permanent, który wszedł na pole bitwy później, nie jest
    // nim objęty (przedtem liczyła się tylko bieżąca kontrola, więc świeży
    // stwór „łapał" Angel of the Dawn czy Hysterical Blindness).
    if (Array.isArray(buff.objectIds) && !buff.objectIds.includes(object.id)) continue;
    // CR 611.2c (M269): zbiór dotkniętych obiektów jest ustalany RAZ, przy
    // rozstrzygnięciu, i nie zmienia się do końca tury. Późniejsza zmiana
    // KONTROLI nie zdejmuje buffa — efekt dotyczy konkretnych obiektów, a nie
    // „tego, co kontrolujesz teraz". Dotąd filtr po bieżącym kontrolerze
    // odbierał bonus stworowi przejętemu efektem „gain control until end of
    // turn" (Spreading Insurrection, Puppeteer Clique): p1 buffował swoje
    // stwory, p2 kradł jednego z nich i stwór natychmiast tracił +X/+X —
    // a przy buffie ujemnym (Hysterical Blindness −4/−0) kradzież wręcz
    // LECZYŁA osłabienie. Wpis ze zbiorem obiektów (objectId/objectIds) jest
    // samowystarczalny: przynależność rozstrzyga zbiór, nie kontrola.
    const hasFrozenScope = buff.objectId != null || Array.isArray(buff.objectIds);
    const applies = hasFrozenScope || (buff.opponent
      ? object.controllerId !== buff.controllerId
      : object.controllerId === buff.controllerId);
    if (!applies) continue;
    out.power += buff.power ?? 0;
    out.toughness += buff.toughness ?? 0;
    out.keywords.push(...(buff.keywords ?? []));
    // D4b (CR 613.7b): znacznik efektu z chwili rozstrzygnięcia.
    for (const keyword of buff.keywords ?? []) out.keywordEntries.push({ keyword, ts: buff.ts ?? 0 });
  }
  return out;
}

/**
 * W-1 (D4b, CR 613.4a): wartość P/T z zdolności definiującej cechę (CDA,
 * CR 604.3) — deskryptor statyczny z `characteristicDefining: true` i pumpem
 * liczonym z planszy (Tarmogoyf: „power is equal to the number of card types
 * among cards in all graveyards and its toughness is equal to that number
 * plus 1”). `null` = obiekt nie ma CDA dla tej cechy.
 */
function characteristicDefiningStat(state, object, stat) {
  if (!state || object.zone !== 'battlefield') return null;
  for (const ability of object.abilities ?? []) {
    if (ability?.type !== 'static' || !ability.characteristicDefining) continue;
    const marker = ability.pump?.[stat];
    if (marker === 'card_types_in_all_graveyards') return allGraveyardsCardTypeCount(state);
    if (marker === 'card_types_in_all_graveyards_plus_1') return allGraveyardsCardTypeCount(state) + 1;
    if (Number.isInteger(marker)) return marker;
  }
  return null;
}

/**
 * D4b — BAZOWE P/T po warstwach 1b, 7a i 7b (CR 613.2b, 613.4a, 613.4b).
 *
 * CR 613.4b (CR 2026-09-25, dosłownie): „Layer 7b: Effects that set power
 * and/or toughness to a specific number or value are applied. Effects that
 * refer to the base power and/or toughness of a creature apply in this
 * layer.” W obrębie podwarstwy — znaczniki czasu (CR 613.7).
 *
 *  - 7b: `tempBasePT` (set_base_pt — Voice of the Vermin, Jolrael) i warstwa
 *    animacji z ustawionym P/T (Silvanus's Invoker 8/8, Skilled Animator 5/5)
 *    — wygrywa PÓŹNIEJSZY znacznik (W-5; dotąd `tempBasePT` wygrywało zawsze).
 *    Crew NIE ustawia P/T (CR 702.122a: „This permanent becomes an artifact
 *    creature until end of turn.”) — warstwa bez `power` nie konkuruje (W-6).
 *  - 7a: CDA (Tarmogoyf) — nadpisywana przez każdy efekt 7b (W-1).
 *  - 1b: zakryty permanent to 2/2 jako WARTOŚCI KOPIOWALNE (CR 708.2: „Any
 *    listed characteristics are the copiable values of that object’s
 *    characteristics.”) — późniejsze warstwy, w tym 7b, działają na niego
 *    normalnie (W-2; dotąd zakrycie wygrywało z efektem „base 4/4”).
 */
function layeredBaseStat(object, stat) {
  const temp = object.tempBasePT ?? null;
  const layer = object.originalBeforeAnimation ? animationLayerOf(object) : null;
  const animationSets = layer != null && layer[stat] != null;
  if (temp && (!animationSets || (temp.ts ?? 0) >= (layer.ptTs ?? 0))) return temp[stat];
  if (animationSets) return layer[stat];
  return null;
}

function baseStat(object, state, stat) {
  const set = layeredBaseStat(object, stat);
  if (set != null) return set;
  if (object.faceDown) return 2;
  const cda = characteristicDefiningStat(state, object, stat);
  if (cda != null) return cda;
  return object[stat];
}

export function effectivePower(object, state = null) {
  if (object.power === null && !object.faceDown) return null;
  const base = baseStat(object, state, 'power');
  return base + (object.powerModifier ?? 0) + counterDelta(object)
    + attachmentBonuses(state, object).power + staticBonuses(state, object).power
    + anthemBonuses(state, object).power
    + untilEndOfTurnBonuses(state, object).power;
}

/**
 * M188/A (uwaga właściciela): bonus P/T pochodzący z efektów CIĄGŁYCH,
 * których nie widać w polach obiektu — statyki warunkowe (CR 611.3a, Evangel
 * of Synthesis: „as long as you've drawn two or more cards"), załączniki,
 * anthemy i buffy „do końca tury". Kafel pokazuje go jako badge.
 *
 * Świadomie POMIJAMY `powerModifier`/`toughnessModifier` i liczniki +1/+1:
 * mają na kaflu własne badge („+2/+2", „2x +1/+1"), więc wliczenie ich tutaj
 * pokazałoby graczowi ten sam bonus dwa razy. Klasa M175/A3 — badge liczony
 * jako różnica po stronie renderu zawsze wychodził zerowy, bo widok wysyła
 * wartości EFEKTYWNE; różnicę musi policzyć warstwa, która zna składniki.
 */
export function grantedStatBonus(object, state = null) {
  if (!object || object.power === null) return { power: 0, toughness: 0, mechanics: [] };
  const attachment = attachmentBonuses(state, object);
  const statics = staticBonuses(state, object);
  const anthem = anthemBonuses(state, object);
  const untilEot = untilEndOfTurnBonuses(state, object);
  return {
    power: attachment.power + statics.power + anthem.power + untilEot.power,
    toughness: attachment.toughness + statics.toughness + anthem.toughness + untilEot.toughness,
    // L: źródła NAZWANYCH mechanik spośród statyk własnych obiektu (Óin).
    // Anthemy/załączniki nie mają jeszcze mechanik warunkowych w katalogu —
    // gdy taki się pojawi, dokłada tu swoje wpisy ten sam wzorzec.
    mechanics: statics.mechanics,
  };
}

export function effectiveToughness(object, state = null) {
  if (object.toughness === null && !object.faceDown) return null;
  const base = baseStat(object, state, 'toughness');
  return base + (object.toughnessModifier ?? 0) + counterDelta(object)
    + attachmentBonuses(state, object).toughness + staticBonuses(state, object).toughness
    + anthemBonuses(state, object).toughness
    + untilEndOfTurnBonuses(state, object).toughness;
}

/**
 * Batch 58/B7 (Gond Gate; Oracle „Gates you control enter untapped"): czy
 * wchodzący permanent ma wchodzić ODKRĘCONY mimo własnego „enters tapped".
 * Reguła czytana z DESKRYPTORA zdolności statycznej kontrolera pola bitwy
 * (`entersUntapped: { subtype }`, ADR 0002) — nie z nazwy karty, więc każdy
 * przyszły statyk tego kształtu („Gates/… you control enter untapped") działa
 * bez zmian w rdzeniu. To efekt ZASTĘPCZY wejścia (CR 614.1d): dotyczy
 * wszystkich ścieżek kładzenia permanentu (land drop, efekt, reanimacja).
 *
 * `enteringId` wyklucza sam wchodzący obiekt z grona źródeł (statyk na
 * wchodzącej Bramie nie „widzi" jeszcze siebie na polu bitwy).
 *
 * KARTY SPOZA KATALOGU (O-4 audytu PR #134, CR 616.1): własne „enters tapped"
 * i „… enter untapped" to DWA efekty zastępcze tego samego wejścia, więc
 * kolejność (a tym samym wynik) wybiera kontroler wchodzącego permanentu.
 * Silnik stosuje „odkręcony" bez pytania, bo w katalogu (stan 2026-09-24)
 * nie ma karty, dla której tapnięte wejście czegokolwiek daje (Chronic
 * Flooding liczy „becomes tapped", czego wejście tapnięte nie wyzwala;
 * Frontline War-Rager/Cautious Survivor liczą tapnięte STWORY, a Bramy nimi
 * nie są, chyba że zostaną ożywione — a wtedy odkręcona Brama tapnięta za
 * manę osiąga ten sam stan, zyskując manę) — wybór „tapnięty" jest więc
 * zawsze zdominowany i nie zmienia gry.
 * Gdy do katalogu wejdzie karta nagradzająca tapnięty ląd/Bramę (np. „as long
 * as you control a tapped land", „whenever a land enters tapped"): zamienić
 * ten override na decyzję kontrolera (`pendingReplacementChoice`, CR 616.1)
 * we wszystkich ścieżkach wejścia (`entersTappedNow`).
 */
export function entersUntappedOverride(state, object, { enteringId = null } = {}) {
  if (!state || !object) return false;
  for (const id of state.zones.battlefield) {
    if (enteringId != null && id === enteringId) continue;
    const source = state.objects.get(id);
    if (!source || source.zone !== 'battlefield' || source.controllerId !== object.controllerId) continue;
    for (const ability of effectiveAbilities(source)) {
      if (ability?.type !== 'static' || !ability.entersUntapped) continue;
      const subtype = ability.entersUntapped.subtype;
      if (!subtype) continue;
      if (effectiveSubtypes(object).includes(subtype)) return true;
    }
  }
  return false;
}

/**
 * O-1 (audyt PR #134, klasa L101 — jedna decyzja dla wszystkich ścieżek
 * wejścia): czy obiekt wchodzący na pole bitwy wchodzi TAPNIĘTY z
 * wydrukowanego „enters tapped”.
 *
 * Helper składa trzy rzeczy, które wcześniej każda ścieżka układała sobie sama
 * (a dwie ścieżki KOPII nie miały trzeciej wcale):
 *   • CR 614.1d/614.12 — bezwarunkowe „enters tapped” to efekt zastępczy
 *     wejścia (także reanimacji i wejścia z biblioteki), nie trigger;
 *   • warunkowe „enters tapped unless …” rozstrzyga `playLand` (CR 614.1c) —
 *     tu zwracamy false, żeby ścieżka ruchu nie tapnęła landa z warunkiem
 *     spełnionym;
 *   • statyk kontrolera „permanenty o podtypie X wchodzą odkręcone”
 *     (Batch 58/B7, Gond Gate: „Gates you control enter untapped”) znosi
 *     tapnięcie — `entersUntappedOverride`.
 *
 * `characteristics` to dowolny nośnik cech wejścia: żywy obiekt (zwykłe
 * ścieżki ruchu) albo KOPIOWALNE cechy oryginału z kontrolerem kopii (CR
 * 707.2 — ścieżki kopii, gdzie obiektu jeszcze nie ma albo jest przepisywany
 * w miejscu). `enteringId` wyklucza sam wchodzący obiekt z liczenia „other …”.
 */
export function entersTappedNow(state, characteristics, { enteringId = null } = {}) {
  if (!state || !characteristics) return false;
  if (!characteristics.entersTapped) return false;
  if (characteristics.entersTappedCondition) return false;
  if (characteristics.faceDown) return false;
  return !entersUntappedOverride(state, characteristics, { enteringId });
}

/**
 * Efektywne zdolności obiektu = własne + nadane „do końca tury"
 * (abilityGrants — np. Fake Your Own Death nadaje stworowi trigger dies).
 * Triggery i legalne aktywacje czytają zawsze tę listę, nie object.abilities.
 */
export function effectiveAbilities(object) {
  const grants = object?.abilityGrants ?? [];
  if (grants.length === 0) return object?.abilities ?? [];
  return [...(object.abilities ?? []), ...grants];
}

/**
 * Batch 47 (Enduring Sliver, CR 604): zdolności AKTYWOWANE nadane obiektowi
 * przez cudzą zdolność statyczną — „Other Sliver creatures you control have
 * outlast {2}". Efekt jest CIĄGŁY, więc liczymy go przy każdym odczycie
 * (jak anthemBonuses), a nie zapisujemy na obiekcie: zniknięcie lorda ma
 * natychmiast odbierać zdolność, bez sprzątania stanu.
 *
 * Zwracana lista jest doklejana na KOŃCU zdolności własnych, więc indeksy
 * zdolności wydrukowanych nie zmieniają się (komendy niosą abilityIndex).
 */
export function grantedActivatedAbilities(state, object) {
  // W-3 (D4b, CR 708.2): zakrycie tłumi WŁASNE zdolności, nie nadane z
  // zewnątrz — zakryty stwór bez podtypów i tak nie spełnia zasięgu „Sliver”.
  if (!state || object?.zone !== 'battlefield') return [];
  if (object.kind !== 'creature') return [];
  const out = [];
  for (const source of state.objects.values()) {
    if (source.zone !== 'battlefield' || source.controllerId !== object.controllerId) continue;
    for (const ability of source.abilities ?? []) {
      if (ability?.type !== 'static' || !ability.scope?.grantsAbilities?.length) continue;
      const scope = ability.scope;
      if (scope.subtype && !hasCreatureType(object, scope.subtype, state)) continue;
      // „OTHER Sliver creatures" — źródło nie nadaje zdolności samemu sobie
      // (ma ją wydrukowaną, inaczej pokazalibyśmy ofertę dwa razy).
      if (scope.excludeSelf !== false && source.id === object.id) continue;
      if (!staticConditionHolds(state, source, ability.condition)) continue;
      out.push(...scope.grantsAbilities);
    }
  }
  return out;
}

/**
 * Zdolności, które obiekt MOŻE aktywować: wydrukowane + nadane grantem
 * jednorazowym + nadane cudzą statyką. Jedno źródło prawdy dla oferty
 * (legalActivatedAbilities) i walidacji (activateAbility) — rozjazd tych
 * dwóch list to klasa L48 (oferta pokazuje ruch, którego silnik nie przyjmie).
 */
export function activatableAbilities(state, object) {
  const own = effectiveAbilities(object);
  const granted = grantedActivatedAbilities(state, object);
  return granted.length === 0 ? own : [...own, ...granted];
}

/**
 * Efektywne podtypy = własne + tymczasowa zmiana typu (Unstable Frontier:
 * „target land you control becomes the basic land type of your choice until
 * end of turn" — CR 205.1a/305.7: nowy typ ZASTĘPUJE dotychczasowe typy
 * podstawowe landa).
 */
export function effectiveSubtypes(object) {
  // CR 708.2a: permanent zakryty (morph/cloak) jest bezimiennym stworem 2/2
  // BEZ podtypów — podtypy karty pod spodem są zakryte, tak samo jak keywordy
  // (effectiveKeywords) i kolory (effectiveColors). Bez tego zakryty stwór
  // dawał się trafić efektem „target [podtyp]” i wpadał w tribalne bonusy.
  if (object?.faceDown) return [];
  const grant = object?.typeGrant;
  if (!grant) return object?.subtypes ?? [];
  const basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  const kept = (object.subtypes ?? []).filter((subtype) => !basics.includes(subtype));
  return [...kept, ...grant.subtypes];
}

/** Podtypy nadane gospodarzowi przez załączniki (np. Warrior's Sword: „is a
 *  Warrior in addition to its other types"). Wymaga stanu (read-time). */
export function attachmentSubtypes(state, object) {
  if (!state || object.zone !== 'battlefield' || object.kind !== 'creature') return [];
  // W-7 (D4b, warstwa 4 — CR 613.1d w kolejności znaczników 613.7). CR 205.1a:
  // „when an effect sets one or more of an object's subtypes, the new
  // subtype(s) replaces any existing subtypes from the appropriate set”. Efekt
  // nadpisujący typy stworów (Wishful Merfolk „becomes a Human”) zastępuje
  // także typy dodane WCZEŚNIEJ przez załącznik (Warrior's Sword); załącznik
  // przypięty PÓŹNIEJ (613.7e) dodaje swój typ na wierzch nadpisania.
  const overrideTs = object.subtypeOverrideTs ?? null;
  const out = [];
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    if (overrideTs != null && attachmentTimestampOf(attachment) < overrideTs) continue;
    const grant = attachmentGrant(attachment);
    out.push(...(grant.subtypes ?? []));
  }
  return out;
}

/**
 * Czy obiekt MA dany TYP STWORÓW — jedyne miejsce w silniku, które zna
 * changelinga (L41: jedna reguła, jedno miejsce).
 *
 * CR 702.73a: „Changeling is a characteristic-defining ability. 'Changeling'
 * means 'This object is every creature type.' This ability works everywhere,
 * even outside the game. See rule 604.3."
 * Lorwyn Rules Primer (2007-08-23): „Because a card with changeling is every
 * creature type, it will be affected by any spell or ability that affects any
 * creature type, regardless of what that creature type is. And because
 * changeling is a characteristic-defining ability, this is true in all zones.
 * For example, if a card tells you to reveal a Merfolk card from your hand,
 * return a Goblin card from your graveyard to your hand, or gain control of a
 * Goat, you can perform these actions on a card with changeling."
 *
 * Dlatego KAżDE porównanie typu stworów (cel „non-Mount", statyka plemienna,
 * „can't be blocked by Vampires or Zombies", rabat „następny czar Olbrzyma",
 * szukanie w bibliotece/grobie/ręce, amass) idzie przez ten predykat, a nie
 * przez surowe `object.subtypes`. Podtypy czytane efektywnie: permanent
 * zakryty (morph/cloak) nie ma żadnych typów (CR 708.2a), więc i jego
 * changeling jest zakryty. Typy NIESTWOROWE (Gate, Town, Food, Saga, typy
 * podstawowe lądów) tędy NIE przechodzą — changeling ich nie nadaje.
 */
export function hasCreatureType(object, subtype, state = null) {
  if (!object || !subtype) return false;
  const subtypes = state ? effectiveSubtypesOnBattlefield(state, object) : effectiveSubtypes(object);
  if (subtypes.includes(subtype)) return true;
  // Changeling czytamy BEZ `effectiveKeywords`: tamten resolver wchodzi w
  // warstwę nadawania zdolności (grantedAbilities → scope.subtype → znowu ten
  // predykat) i zapętlałby się. Wystarczą keywordy drukowane plus nadane
  // „do końca tury" (keywordGrants); nadanie changelinga z załącznika/statyki
  // w katalogu nie występuje, a CR 702.73a opisuje changeling jako CDA samej
  // karty. Zakryty permanent (morph/cloak, CR 708.2a) nie ma żadnych typów
  // ani keywordów karty pod spodem — więc i jego changeling jest zakryty.
  if (object.faceDown) return false;
  return (object.keywords ?? []).includes('changeling')
    || (object.keywordGrants ?? []).includes('changeling');
}

/**
 * Czy obiekt pasuje do kwalifikatora PODTYPÓW (szukanie w bibliotece: „Plains
 * card", typecycling, channel). JEDNO miejsce tej reguły (L41) — wcześniej
 * każda ścieżka miała własną kopię, a `librarySearchMatches` używała do
 * podtypów `hasCreatureType`.
 *
 * CR 702.73a: changeling czyni obiekt KAŻDYM TYPEM STWORÓW — nie każdym
 * podtypem. Dlatego:
 *  - `subtypes` to ZWYKŁE podtypy z linii typów (lądy: Plains/Mountain/Swamp,
 *    artefakty: Equipment, enchantmenty: Saga/Aura) — bez changelinga;
 *  - `creatureTypes` to typy STWORÓW — tu (i tylko tu) changeling pasuje.
 *
 * M385 (znalezisko srebrnej odznaki): changeling w bibliotece był kandydatem
 * na „Plains card" Kor Cartographera (i „Mountain card" Call the Mountain
 * Chocobo) właśnie przez `hasCreatureType` użyte dla podtypu lądu.
 */
export function matchesSubtypeQualifier(object, qualifier) {
  const subtypes = qualifier?.subtypes ?? [];
  const creatureTypes = qualifier?.creatureTypes ?? [];
  const subtypeOk = subtypes.length === 0
    || subtypes.some((subtype) => effectiveSubtypes(object).includes(subtype));
  const creatureOk = creatureTypes.length === 0
    || creatureTypes.some((subtype) => hasCreatureType(object, subtype));
  return subtypeOk && creatureOk;
}

/** Efektywne podtypy stwora na polu bitwy — własne + granty załączników. */
export function effectiveSubtypesOnBattlefield(state, object) {
  // B4 (audyt PR #113, F7): część „własna" idzie przez `effectiveSubtypes`,
  // a nie przez surowe `object.subtypes`. Były tu DWIE implementacje tej samej
  // reguły (L41/L14) i rozjechały się po cichu: `effectiveSubtypes` honoruje
  // zakrycie (CR 708.2a) i `typeGrant` — tymczasową zmianę podstawowego typu
  // lądu (Unstable Frontier, `grantBasicLandTypeUntilEndOfTurn`) — a ta funkcja
  // czytała podtypy DRUKOWANE, więc `hasCreatureType(..., state)` odpowiadała
  // starym typem lądu (CR 305.7: nadanie podstawowego typu zabiera stare typy
  // lądu; CR 613.1d: warstwa typów działa dla każdego czytającego). Znalezione
  // testem rodzinnym B4/6 — przed nim zero testów dotykało tego predykatu.
  // Granty z załączników zostają (CR 122.1b/613 — efekty zewnętrzne działają).
  const own = effectiveSubtypes(object);
  const granted = attachmentSubtypes(state, object);
  return [...new Set([...own, ...granted])];
}

/**
 * Efektywne keywordy obiektu = własne + tymczasowe „do końca tury"
 * (keywordGrants — np. backup, CR 702.165a) + nadane przez załączniki.
 */
/**
 * M258/F3 — WARD (CR 702.21): kwota dopłaty dla przeciwnika celującego.
 * Zwraca null, gdy obiekt nie ma warda (keyword czytany EFEKTYWNIE —
 * granty/utrata), inaczej kwotę many z pola `ward`; domyślnie 2, bo
 * jedyne źródło w katalogu to zakryte permanenty (cloak/disguise,
 * CR 701.58a: „2/2 creature with ward {2}").
 */
export function wardAmountOf(object, state = null) {
  if (!object) return null;
  if (!effectiveKeywords(object, state).includes('ward')) return null;
  return object.ward ?? 2;
}

export function effectiveKeywords(object, state = null) {
  // D4b / warstwa 6 (CR 613.1f): „Ability-adding effects, keyword counters,
  // ability-removing effects, and effects that say an object can’t have an
  // ability are applied.” W obrębie warstwy — znaczniki czasu (CR 613.7).
  // CR 613.9 (przykład, dosłownie): „Two effects are affecting the same
  // creature: one from an Aura that says ‘Enchanted creature has flying’ and
  // one from an Aura that says ‘Enchanted creature loses flying.’ […] Applying
  // them in timestamp order means the one that was generated last ‘wins.’”
  //
  // Wpisy: `base` (wydrukowane keywordy albo cechy zakrycia — nie efekt, każda
  // utrata je zdejmuje) i nadania ze znacznikiem `ts`. Keyword jest obecny,
  // gdy nie dotyczy go żadna utrata, albo gdy któreś nadanie jest PÓŹNIEJSZE od
  // ostatniej utraty (W-4 — dotąd utrata wygrywała zawsze, wbrew 613.9).
  const objectTs = timestampOf(object);
  const entries = [];
  const grant = (keyword, ts) => entries.push({ keyword, ts, base: false });
  const counterGrant = (name) => {
    if ((object.counters ?? {})[name] > 0) grant(name, object.counterTs?.[name] ?? objectTs);
  };
  const external = () => {
    // Efekty z zewnątrz — działają także na zakryty permanent (W-3, CR 708.2:
    // zakrycie ustala WARTOŚCI KOPIOWALNE 2/2, późniejsze warstwy działają;
    // CR 708.8: „Any effects that have been applied to the face-down permanent
    // still apply to the face-up permanent.”).
    for (const keyword of object.keywordGrants ?? []) grant(keyword, object.keywordGrantTs?.[keyword] ?? objectTs);
    for (const entry of attachmentBonuses(state, object).keywordEntries) grant(entry.keyword, entry.ts);
  };
  if (object.faceDown) {
    // CR 708.2a — zakryty permanent nie ma WŁASNYCH keywordów ani zdolności
    // (drukowane są schowane; turnFaceUp je przywraca). Liczniki keywordów
    // (CR 122.1b — Veiled Ascension) i efekty z zewnątrz działają.
    counterGrant('flying');
    counterGrant('deathtouch');
    counterGrant('lifelink');
    // M258/F3 (CR 701.58a + 702.21): ward {2} cloaka/disguise jest częścią
    // definicji zakrycia (warstwa 1b), nie drukowanym keywordem karty.
    if (object.ward != null) entries.push({ keyword: 'ward', ts: 0, base: true });
    external();
  } else {
    for (const keyword of object.keywords ?? []) entries.push({ keyword, ts: 0, base: true });
    external();
    // Statyki własne (CR 613.7a — znacznik obiektu).
    for (const keyword of staticBonuses(state, object).keywords) grant(keyword, objectTs);
  }
  for (const entry of anthemBonuses(state, object).keywordEntries) grant(entry.keyword, entry.ts);
  for (const entry of untilEndOfTurnBonuses(state, object).keywordEntries) grant(entry.keyword, entry.ts);
  // Hexproof „do twojej następnej tury" (Throne of the Dead Three): trwa przez
  // turę przeciwnika i gaśnie z początkiem następnej tury kontrolera — to NIE
  // grant czyszczony w cleanup, tylko licznik tur.
  if (object.hexproofUntilTurn != null && state && state.turn.number < object.hexproofUntilTurn) {
    grant('hexproof', objectTs);
  }
  if (!object.faceDown) {
    // Liczniki deathtouch (Kappa Tech-Wrecker), lifelink (Unbreakable Bond),
    // flying (Veiled Ascension) — CR 122.1b; znacznik licznika (CR 613.7c).
    counterGrant('deathtouch');
    counterGrant('lifelink');
    counterGrant('flying');
    // Station (EOE Spacecraft, Wedgelight Rammer): po osiągnięciu progu
    // liczników charge obiekt jest stworem i ma keywordy z deskryptora
    // („9+ | Flying, first strike\"). Własna zdolność — znacznik obiektu.
    if (object.station && (object.counters?.charge ?? 0) >= object.station.threshold) {
      for (const keyword of object.station.keywords ?? []) grant(keyword, objectTs);
    }
  }
  // Utraty: „Enchanted creature loses flying\" (Grounded — znacznik przypięcia,
  // CR 613.7e) i własna utrata „do końca tury\" (Wishful Merfolk — znacznik
  // rozstrzygnięcia, CR 613.7b).
  const lastLoss = new Map();
  const lose = (keyword, ts) => lastLoss.set(keyword, Math.max(lastLoss.get(keyword) ?? -Infinity, ts));
  if (state && object.zone === 'battlefield') {
    for (const keyword of object.lostKeywordsUntilEOT ?? []) lose(keyword, object.lostKeywordTs?.[keyword] ?? 0);
    for (const attachment of attachmentsAttachedTo(state, object.id)) {
      const descriptor = attachment.aura ?? attachment.equipment ?? null;
      for (const keyword of descriptor?.losesKeywords ?? []) lose(keyword, attachmentTimestampOf(attachment));
    }
  }
  const out = [];
  for (const entry of entries) {
    if (out.includes(entry.keyword)) continue;
    const loss = lastLoss.get(entry.keyword);
    if (loss == null) {
      out.push(entry.keyword);
      continue;
    }
    // Obecny tylko, gdy istnieje nadanie późniejsze niż ostatnia utrata.
    if (entries.some((e) => e.keyword === entry.keyword && !e.base && e.ts > loss)) out.push(entry.keyword);
  }
  return out;
}

/**
 * Protection from colors (CR 702.16): zwraca listę kolorów, przed którymi
 * obiekt jest chroniony — z pól obiektu (protectionFromColors) i z
 * załączników (aura z chosenColor). Nie modyfikuje zamrożonego obiektu.
 */
/**
 * Obraca permanent twarzą do góry (morph/megamorph): wraca do bazowych
 * statystyk karty i dostaje ewentualne liczniki (megamorph kładzie +1/+1).
 * Obiekt nie zmienia strefy, więc obrażenia i modyfikatory pozostają.
 */
export function turnFaceUp(state, objectId, counters = {}) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || !object.faceDown) throw new Error('Obrócić twarzą do góry można tylko face-down permanent');
  replaceObject(state, object, {
    faceDown: false,
    // D4b (CR 613.7f): „A permanent receives a new timestamp each time it
    // turns face up or face down.”
    timestamp: nextTimestamp(state),
    // Przywrócenie oryginalnych zdolności karty po obrocie (Batch 24 —
    // Willbender; face-down cast ukrył je pod flip-ability — patrz
    // resources.castPermanent). CR 702.37e: obrót „odkrywa" kartę wraz
    // z jej zdolnościami.
    ...(Array.isArray(object.originalAbilities)
      ? { abilities: [...object.originalAbilities], originalAbilities: undefined }
      : {}),
    // M101/B4 (CR 708.2/708.6): obrót twarzą do góry przywraca WSZYSTKIE
    // cechy karty schowane przy zagraniu zakrytym — nazwę, kolory, podtypy,
    // typy, keywordy i koszt many (samo zdjęcie flagi faceDown by ich nie
    // wróciło, bo zakryty obiekt nosi wartości „pustego" 2/2).
    ...(object.faceDownOriginal
      ? {
        colors: [...(object.faceDownOriginal.colors ?? [])],
        subtypes: [...(object.faceDownOriginal.subtypes ?? [])],
        types: [...(object.faceDownOriginal.types ?? [])],
        keywords: [...(object.faceDownOriginal.keywords ?? [])],
        manaCost: object.faceDownOriginal.manaCost ?? 0,
        cardName: object.faceDownOriginal.cardName ?? null,
        // M333: ward wraca z migawki dla KAŻDEGO zakrycia, nie tylko cloaka —
        // punkt tworzący (morph/manifest) chowa drukowany ward, bo face-down
        // permanent nie ma zdolności (CR 708.2a), a `wardAmountOf` czyta go
        // przez `object.ward != null` w gałęzi face-down (permanents.js 749).
        // Wcześniejsze czyszczenie leżało w gałęzi cloak, więc zmanifestowany
        // lub zmorphowany stwór z drukowanym wardem ZACHOWYWAŁ ward pod
        // zakryciem (uśpione: dziś 0 kart w katalogu ma drukowany ward — F4
        // w audycie PR #102 opisał to samo złą stronę przy cloaku).
        ward: object.faceDownOriginal.ward ?? null,
        // M321: uncover przywraca też P/T karty (CR 701.58b — „turn it face
        // up"; odkryty cloak zostawał 2/2, bo cloak nadpisuje power/toughness
        // na staty zakrycia). Morfy, których faceDownOriginal nie niesie P/T,
        // zostają przy obecnym zachowaniu (fallback na obiekt).
        power: object.faceDownOriginal.power ?? object.power,
        toughness: object.faceDownOriginal.toughness ?? object.toughness,
        faceDownOriginal: undefined,
      }
      : {}),
    // M322 (audyt PR #102, F9/F4) + M333: koniec zakrycia sprząta ŚLADY
    // MECHANIKI w punkcie zbierającym, nie u wołającego. Do tej pory kasowaniem
    // `ward`/`cloakReady`/`cloakTurnUpCost`/`copyNumber` zajmował się handler
    // komendy `turn_cloak_face_up`, więc obrót inną procedurą tej samej karty
    // (CR 701.58c: koszt morpha) zostawiał ward {2} na face-up permanencie —
    // pole `ward` idzie do PlayerView i do odznaki kafla, więc stwór „miał"
    // ward już po odsłonięciu. Tak samo manifest: flagi zdjęte tu, a nie w
    // handlerze `turn_manifest_face_up` (L41 — jedno źródło dla obu dróg).
    // M333: `faceDownCause: null` jest BEZWARUNKOWE — od czasu, gdy przyczynę
    // piszą też manifest i morph (701.40a, 702.37c), zdjęcie jej wyłącznie w
    // gałęzi cloaka zostawiało face-up permanentowi „Manifest": dziś nic nie
    // renderuje etykiety przy faceDown: false, ale to stan, który kłamie
    // (i który przeżyłby kolejne zakrycie, gdyby jakiś efekt nie nadpisał
    // pola). Zmierzono testem M333/D (RED przed naprawą).
    faceDownCause: null,
    ...(object.cloakReady === true || object.cloakTurnUpCost != null
      ? {
        cloakReady: false,
        cloakTurnUpCost: null,
        copyNumber: null,
      }
      : {}),
    ...(object.manifestReady === true
      ? { manifestReady: false, manifestTurnUpCost: null }
      : {}),
  });
  state.events.push(event('object_flipped', { objectId }));
  // Batch 24 (Willbender): „When this creature is turned face up" — osobny
  // event dla triggerów reakcji na obrót (object_flipped jest ogólny).
  state.events.push(event('turned_face_up', { objectId, cardId: object.cardId }));
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
    // M99 + uwaga B (właściciel 2026-09-19b): modyfikatory `modifyStats` żyją
    // DO KOŃCA TURY (cleanup je zeruje — patrz nagłówek funkcji), więc niosą
    // `untilEndOfTurn`, tak jak każdy inny buff do końca tury (set_base_pt_*,
    // mass buffy). Bez tej flagi bramka `isBotMoveNoise` (session.js) widziała
    // tylko „P/T przelicza się przy każdym zdarzeniu” i WYCINAŁA skutek z modala
    // „Rozgrywka”: gracz rzucał własny pump (You're Not Alone), widział „czar
    // zostaje rozstrzygnięty”, a o +4/+4 dowiadywał się wyłącznie z kafla —
    // dokładnie ta sama asymetria log↔modal, którą M99 naprawił dla czarów bota.
    untilEndOfTurn: true,
  }));
  return updated;
}

/**
 * Prewencja obrażeń „prevent all damage that would be dealt to ... this turn\"
 * (Ethersworn Shieldmage): wpisy w state.preventDamageThisTurn opisują filtr
 * celu generycznie ({ typesInclude, isCreature }); czyszczone w cleanup.
 * Zwraca true, gdy AKtywna prewencja skasowałaby obrażenia dla obiektu.
 */
export function isDamagePrevented(state, object) {
  if (!object || object.zone !== 'battlefield') return false;
  for (const filter of state.preventDamageThisTurn ?? []) {
    const typesOk = (filter.typesInclude ?? []).every((type) => (object.types ?? []).includes(type));
    const kindOk = !filter.isCreature || object.kind === 'creature' || (object.types ?? []).includes('Creature');
    if (typesOk && kindOk) return true;
  }
  return false;
}

/**
 * Tarcze prewencji „prevent the next N damage that would be dealt to any
 * target this turn" (Withstand, CR 615 w minimalnym wymiarze): wpisy w
 * state.damageShields to { targetId, remaining } — cel to gracz albo obiekt.
 * Każde zadanie obrażeń celowi najpierw zużywa tarczę (kolejność wpisów),
 * a zdarzenie damage_prevented trafia do strumienia. Zwraca liczbę
 * zapobiegniętych obrażeń (0, gdy tarczy brak). Czyste w cleanup.
 */
export function preventDamageTo(state, targetId, amount) {
  const shields = state.damageShields ?? [];
  if (shields.length === 0 || !Number.isInteger(amount) || amount <= 0) return 0;
  let prevented = 0;
  const remaining = [];
  for (const shield of shields) {
    if (prevented >= amount) {
      remaining.push(shield);
      continue;
    }
    if (shield.targetId !== targetId) {
      remaining.push(shield);
      continue;
    }
    const take = Math.min(shield.remaining, amount - prevented);
    prevented += take;
    if (shield.remaining > take) remaining.push({ ...shield, remaining: shield.remaining - take });
    if (take > 0) {
      state.events.push(event('damage_prevented', { target: targetId, amount: take, cardId: shield.sourceCardId ?? null, shield: true }));
    }
  }
  state.damageShields = remaining;
  return prevented;
}

/**
 * Czy obrażenia od źródła o danym kolorze są zapobiegane przez protection
 * celu (CR 702.16e — DEBT: D = damage prevention). Sprawdzamy kolory źródła
 * vs protection celu. Nie modyfikujemy zamrożonego obiektu.
 */
export function isDamagePreventedByProtection(state, target, source) {
  if (!target || !source || target.zone !== 'battlefield') return false;
  // M109 (Spare from Evil): protection od JAKOŚCI innej niż kolor
  // („protection from non-Human creatures”) — CR 702.16a.
  if (isProtectedFromSource(state, target, source)) return true;
  const protColors = effectiveProtectionFromColors(state, target);
  if (protColors.length === 0) return false;
  const sourceColors = effectiveColors(source);
  return sourceColors.some(c => protColors.includes(c));
}

export function markDealtDamageThisTurn(state, objectId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') return object;
  if (object.damagedThisTurn) return object;
  return replaceObject(state, object, { damagedThisTurn: true });
}

export function markDamage(state, objectId, amount, sourceId = null) {
  let object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel obrażeń');
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
  // Prewencja (CR 614): filtr „prevent all damage" — zamiast zaznaczyć
  // obrażenia emitujemy fakt ich skasowania.
  if (amount > 0 && isDamagePrevented(state, object)) {
    const prevented = event('damage_prevented', { objectId, amount, cardId: object.cardId });
    state.events.push(prevented);
    return object;
  }
  // Protection (CR 702.16e): obrażenia od źródła chronionego koloru
  // są zapobiegane.
  if (amount > 0 && sourceId) {
    const source = state.objects.get(sourceId);
    if (source && isDamagePreventedByProtection(state, object, source)) {
      const prevented = event('damage_prevented', { objectId, amount, cardId: object.cardId, protection: true });
      state.events.push(prevented);
      return object;
    }
  }
  // Ta sama prewencja także dla bezpośredniego API markDamage.
  if (preventDamageWithShieldCounter(state, objectId, amount) > 0) return state.objects.get(objectId);
  object = removeLoyaltyForDamage(state, object, amount);
  if (isPlaneswalker(object) && object.kind !== 'creature') {
    return replaceObject(state, object, { damagedThisTurn: amount > 0 || object.damagedThisTurn });
  }
  const updated = replaceObject(state, object, { damage: object.damage + amount, damagedThisTurn: true });
  state.events.push(event('damage_marked', { objectId, amount, total: updated.damage }));
  return updated;
}

export function clearMarkedDamage(state) {
  for (const object of state.objects.values()) {
    if ((object.damage > 0 || object.damagedByDeathtouch) && object.zone === 'battlefield') {
      replaceObject(state, object, { damage: 0, damagedByDeathtouch: false });
    }
  }
}

/** Cleanup kończy też modyfikacje „do końca tury" i tymczasowe keywordy. */
export function clearStatModifiers(state) {
  // Ciągłe buffy „do końca tury" (CR 611.2c) — czyścimy razem z resztą.
  state.untilEndOfTurnBuffs = [];
  // M109: ochrona „do końca tury" (Spare from Evil) kończy się w cleanup.
  state.untilEndOfTurnProtections = [];
  // Zgłoszenie właściciela B1: opóźnione zdolności „this turn" (rozdział III
  // Sagi) wygasają razem z resztą efektów do końca tury.
  state.turnAbilityGrants = [];
  // Batch 48 (Cherished Hatchling): flash nadany podtypowi „this turn".
  state.subtypeFlashThisTurn = [];
  for (const object of state.objects.values()) {
    if (object.zone !== 'battlefield') continue;
    // M158/Batch 39 (Wishful Merfolk): nadpisanie podtypów i utrata
    // keywordów DO KOŃCA TURY — cleanup przywraca oryginalne podtypy
    // (wzorzec originalBeforeAnimation) i zdejmuje utraty.
    if (object.subtypesBeforeOverride || (object.lostKeywordsUntilEOT ?? []).length > 0) {
      replaceObject(state, object, {
        ...(object.subtypesBeforeOverride
          ? { subtypes: object.subtypesBeforeOverride, subtypesBeforeOverride: null, subtypeOverrideTs: null }
          : {}),
        lostKeywordsUntilEOT: Object.freeze([]), lostKeywordTs: null,
      });
    }
    // W-8 (Krotiq Nestguard): „can attack THIS TURN as though it didn't have
    // defender” — flaga reguły ataku wygasa w cleanup.
    if (object.attacksAsThoughNoDefenderUntilEOT) {
      replaceObject(state, state.objects.get(object.id), { attacksAsThoughNoDefenderUntilEOT: false });
    }
    const animated = state.objects.get(object.id);
    const animationEffects = animationEffectsOf(animated);
    if (animated.originalBeforeAnimation && animationEffects) {
      // W-10 (Etap F/5, CR 611.2 + 514.2): cleanup kończy WYŁĄCZNIE efekty
      // „until end of turn”; animacja z linkiem (Skilled Animator) trwa do
      // odejścia źródła, a zakończone efekty znikają z przeliczonej warstwy
      // (np. P/T ustawione do końca tury nad trwającą animacją 5/5).
      const lasting = animationEffects.filter((effect) => effect.linkedSourceId != null);
      if (lasting.length !== animationEffects.length) {
        replaceObject(state, animated, { ...animationFieldsAfter(animated, lasting), crewed: false });
        syncStationKind(state, object.id);
      }
    } else if (animated.originalBeforeAnimation) {
      // Obiekt sprzed W-10 (warstwa bez listy efektów — np. zbudowany w teście).
      // M157/C (uwaga właściciela, Skilled Animator): animacja LINKED („for as
      // long as this creature remains on the battlefield") NIE kończy się
      // w cleanup — trwa do odejścia ŹRÓDŁA z pola bitwy (cofnięcie w
      // moveObjectDirectly na podstawie state.linkedAnimations). Cleanup
      // kończy wyłącznie animacje „until end of turn".
      const hasLiveLink = (state.linkedAnimations ?? [])
        .some((entry) => entry.targetId === object.id);
      if (!hasLiveLink) {
        replaceObject(state, animated, {
          kind: animated.originalBeforeAnimation.kind,
          types: animated.originalBeforeAnimation.types,
          subtypes: animated.originalBeforeAnimation.subtypes,
          power: animated.originalBeforeAnimation.power,
          toughness: animated.originalBeforeAnimation.toughness,
          originalBeforeAnimation: null,
          // A4: koniec animacji = koniec „obsadzenia" (znacznik z crew).
          crewed: false,
        });
        // M141/A (station + animacja): po przywróceniu cech pierwotnych
        // natychmiast synchronizujemy rodzaj wg liczników (CR 205.1).
        syncStationKind(state, object.id);
      }
    }
    // A4: strażnik inwariantu „crewed ⟹ trwa animacja" — znacznik stawia
    // wyłącznie rozstrzygnięcie crew (efekt animuje), ale gdyby przyszła
    // karta crew miała inny efekt, flaga nie może przeżyć tury.
    // W-10: efekt crew („until end of turn”) kończy się w KAŻDYM cleanupie,
    // także gdy animacja z linkiem trwa dalej.
    const afterAnim = state.objects.get(object.id);
    if (afterAnim.crewed) {
      replaceObject(state, afterAnim, { crewed: false });
    }
    const current = state.objects.get(object.id);
    if (current.saddled || current.tempBasePT || current.damagedThisTurn) {
      replaceObject(state, current, { saddled: false, tempBasePT: null, damagedThisTurn: false, abilityResolvedThisTurn: 0 });
    }
    const dirty = current.powerModifier !== 0 || current.toughnessModifier !== 0
      || (current.keywordGrants ?? []).length > 0
      || (current.abilityGrants ?? []).length > 0
      || current.typeGrant != null
      // Wydrukowane „can't block\" (token) nie jest brudem do sprzątnięcia —
      // bez tego wyłączenia cleanup przepisywałby token w każdej turze.
      // Granty z TERMINEM tury (`cantBeBlockedUntilTurn` — M407,
      // `hexproofUntilTurn`) celowo poza tą bramką: wygasają read-time
      // (`state.turn.number < termin`), więc obiekt nie jest „brudny”.
      || (current.cantBlock === true && current.cantBlockPrinted !== true);
    if (dirty) {
      replaceObject(state, current, {
        powerModifier: 0, toughnessModifier: 0, keywordGrants: [], keywordGrantTs: null,
        abilityGrants: [], typeGrant: null,
        // „Can't block this turn\" (Panic Spellbomb) — cleanup zdejmuje
        // EFEKT (CR 514.2). Cecha WYDRUKOWANA („This token can't block\" —
        // Phyrexian Mite, Goblin Construct) jest trwała: znacznik
        // `cantBlockPrinted` przeżywa cleanup, a `cantBlock` pozostaje z nim
        // zgodne, żeby każdy odczyt (widok, boty, walka) widział ten sam stan.
        cantBlock: Boolean(current.cantBlockPrinted),
        saddled: false, tempBasePT: null, damagedThisTurn: false, abilityResolvedThisTurn: 0,
      });
    }
  }
}

/**
 * M381 (CR 702.8 + L41): pozwolenie na rzut „jakby permanent miał flash" —
 * wydrukowany keyword ALBO grant na turę z `state.subtypeFlashThisTurn`
 * (Cherished Hatchling: „you may cast Dinosaur spells this turn as though
 * they had flash"). Zwraca SAM grant (albo null), bo grant niesie też
 * `grantedAbility` doklejaną do rzuconego czaru.
 *
 * Jedno źródło prawdy dla OFERTY (game-state.playerView) i WALIDACJI
 * (resources.castPermanent) — jak przy restrykcjach bloku (M380). Przed M381
 * oferta znała grant, a walidacja patrzyła wyłącznie na wydrukowany keyword,
 * więc opublikowana komenda `cast_permanent` była odrzucana
 * („Zagranie poza main phase") — bot rzucający ofertę wywalał symulację.
 */
export function grantedFlashGrant(state, playerId, object) {
  if (!state || !object || !playerId) return null;
  return (state.subtypeFlashThisTurn ?? []).find((grant) => grant.controllerId === playerId
    && hasCreatureType(object, grant.subtype, state)) ?? null;
}

/** Czy obiekt wolno rzucać tak, jakby miał flash (wydruk albo grant tury). */
export function hasFlashPermission(state, playerId, object) {
  if ((object?.keywords ?? []).includes('flash')) return true;
  return grantedFlashGrant(state, playerId, object) != null;
}

/**
 * Nadaje stworowi zdolności „do końca tury" (Fake Your Own Death: trigger
 * „when this creature dies…"). Deskryptory są generyczne (createAbility),
 * a czyszczenie idzie tą samą ścieżką co pump i keywordy — cleanup.
 */
export function grantAbilitiesUntilEndOfTurn(state, objectId, abilities) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error('Zdolności do końca tury można nadawać tylko stworowi na polu bitwy');
  if (!Array.isArray(abilities) || abilities.length === 0) throw new TypeError('Lista nadawanych zdolności nie może być pusta');
  const grants = [...(object.abilityGrants ?? []), ...abilities.map((ability) => Object.freeze({ ...ability }))];
  return replaceObject(state, object, { abilityGrants: Object.freeze(grants) });
}

/**
 * Tymczasowa zmiana typu podstawowego landa (Unstable Frontier) — do końca
 * tury; czyszczona w cleanup razem z pozostałymi grantami.
 */
export function grantBasicLandTypeUntilEndOfTurn(state, objectId, subtype) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || !((object.types ?? []).includes('Land') || object.kind === 'land')) {
    throw new Error('Typ podstawowy można nadać tylko landowi na polu bitwy');
  }
  if (typeof subtype !== 'string' || !subtype) throw new TypeError('Typ podstawowy musi być napisem');
  const updated = replaceObject(state, object, { typeGrant: Object.freeze({ subtypes: Object.freeze([subtype]) }) });
  state.events.push(event('land_type_changed', { objectId, cardId: object.cardId, subtype, untilEndOfTurn: true }));
  return updated;
}

/**
 * Goad (CR 701.38): do końca tury stwór musi atakować w każdym combacie,
 * jeśli tylko może (loch Undercity — pokój Arena). Znacznik zdejmuje cleanup
 * (clearStatModifiers). Zwraca obiekt po zmianie.
 */
export function goadUntilNextTurn(state, objectId, sourceControllerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') {
    throw new Error('Goadować można tylko stwora na polu bitwy');
  }
  if (object.goaded) return object;
  // CR 701.38c: goad trwa do początku NASTĘPNEJ tury gracza, który goadował —
  // w 1v1 (tury naprzemienne) to turn.number + 2. Wcześniej goad wygasał
  // w cleanup TEJ SAMEJ tury („until end of turn") — zaczarowany stwór nie
  // musiał atakować w turze przeciwnika, co łamało całą mechanikę goadu
  // (pokoje lochu Forge/Arena). Wygaszenie na starcie tury: game-state.js.
  const updated = replaceObject(state, object, { goaded: true, goadedUntilTurn: state.turn.number + 2 });
  state.events.push(event('object_goaded', { objectId, cardId: object.cardId, byPlayerId: sourceControllerId }));
  return updated;
}

/**
 * Nadaje stworowi keywordy „do końca tury" (np. backup, CR 702.165a) —
 * czyszczone w cleanup przez clearStatModifiers. Zwraca obiekt po zmianie.
 */
/**
 * M177/A (Agate Assault, CR 614.6): strefa śmierci permanentu — licznik
 * finality (CR 122.1b) ALBO znacznik „if it would die this turn, exile it
 * instead” (`state.exileIfDiesThisTurn`, czyszczony w cleanup) kierują
 * obiekt do exile zamiast do grobu. Jedno źródło prawdy dla WSZYSTKICH
 * ścieżek śmierci (SBA, destroy, sacrifice, legend rule).
 */
/**
 * M177/E (Azorius Justiciar, CR 701.29): detain — „until your next turn,
 * that permanent can't attack or block and its activated abilities can't be
 * activated”. Wygasa na POCZĄTKU następnej tury gracza, który detainował
 * (wzorzec goadedUntilTurn — wygaszenie w game-state przy starcie tury).
 */
export function detainUntilYourNextTurn(state, objectId, detainerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') return object;
  // W 1v1: jeśli trwa tura detainera → jego następna to number+2;
  // w cudzej turze → najbliższa jego tura to number+1.
  const until = state.turn.activePlayerId === detainerId ? state.turn.number + 2 : state.turn.number + 1;
  const updated = replaceObject(state, object, { detained: true, detainedUntilTurn: until });
  state.events.push(event('object_detained', { objectId, cardId: object.cardId, byPlayerId: detainerId }));
  return updated;
}

// M271: definicja przeniesiona do `zones.js` (najniższa warstwa grafu), żeby
// mogła z niej korzystać także `attachments.js` bez tworzenia cyklu importów.
// Re-eksport zachowuje dotychczasową ścieżkę importu dla reszty silnika.
export { deathZoneFor };

export function grantKeywordsUntilEndOfTurn(state, objectId, keywords, options = {}) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error('Tymczasowe keywordy można nadawać tylko stworowi na polu bitwy');
  if (!Array.isArray(keywords) || keywords.some((k) => typeof k !== 'string' || !k)) throw new TypeError('Keywordy muszą być niepustymi napisami');
  const grants = [...new Set([...(object.keywordGrants ?? []), ...keywords])];
  // D4b (CR 613.7b): nadanie dostaje znacznik czasu — w warstwie 6 wygrywa
  // z utratą keywordu tylko wtedy, gdy jest PÓŹNIEJSZE (CR 613.9, W-4).
  const ts = nextTimestamp(state);
  const keywordGrantTs = Object.freeze({
    ...(object.keywordGrantTs ?? {}), ...Object.fromEntries(keywords.map((keyword) => [keyword, ts])),
  });
  const updated = replaceObject(state, object, { keywordGrants: grants, keywordGrantTs });
  state.events.push(event('keyword_granted', {
    objectId, cardId: object.cardId, keywords: [...keywords], untilEndOfTurn: true,
    // M96: backup opisuje nadane keywordy własnym zdarzeniem
    // (backup_resolved) — znacznik pozwala UI uniknąć dubletu w logu,
    // nie wyciszając przy tym WSZYSTKICH nadań (np. haste).
    ...(options.viaBackup ? { viaBackup: true } : {}),
  }));
  return updated;
}

/**
 * Pola obiektu opisujące „czym permanent jest” po TRANSFORMACJI
 * (transform / craft / daybound→nightbound).
 *
 * CRAFT: permanent jest WYGNANY i wraca, a zmiana strefy tworzy nowy obiekt
 * (CR 400.7), więc nadane charakterystyki wygasają i nowa strona wchodzi
 * z własnymi cechami (CR 712.8/712.8e). Tu reset jest zgodny z CR. Bez niego
 * ożywiony artefakt po crafcie zostawał `kind='creature'` z
 * `power/toughness = null` z drugiej strony: stwór bez liczbowego P/T (łamie
 * CR 208.1), którego SBA nie potrafiły zabić (CR 704.5f porównuje `null <= 0`,
 * czyli `false` — permanent był nieśmiertelny).
 *
 * Wołający: craft (`resolveCraftExileOutcome`), powrót z wygnania
 * przemienioną stroną (`effects.js`) i wejście nocną stroną (daybound,
 * `spells.js` — obiekt dopiero wszedł, nic na niego jeszcze nie działa).
 * WSZYSTKIE trzy dotyczą NOWEGO obiektu, więc reset jest zgodny z CR.
 *
 * Transform W MIEJSCU (efekt `transform`, `effects.js`) tego helpera NIE
 * używa: CR 712.18 — „When a double-faced permanent transforms or converts, it
 * doesn’t become a new object. Any effects that applied to that permanent will
 * continue to apply to it.” Tamta ścieżka przenosi trwające efekty
 * (modyfikatory, granty, animację — `transformInPlaceFields` niżej).
 * O-6 audytu PR #134: poprzednia wersja tego komentarza twierdziła, że
 * transform w miejscu przechodzi przez ten reset — nie przechodził; realny
 * błąd siedział w samej ścieżce `transform` (patrz `transformInPlaceFields`).
 *
 * `back` to deskryptor drugiej strony (obiekt `transformTo`). Zwracany jest
 * zestaw pól do rozłożenia w nowym obiekcie.
 */
export function transformedCharacteristics(back, previous = null) {
  const kind = back.kind ?? (((back.types ?? []).includes('Creature')) ? 'creature' : previous?.kind);
  return {
    cardId: back.cardId,
    cardName: back.cardName ?? previous?.cardName ?? null,
    power: back.power ?? null,
    toughness: back.toughness ?? null,
    abilities: back.abilities ?? [],
    keywords: back.keywords ?? [],
    subtypes: back.subtypes ?? [],
    types: back.types ?? [],
    ...(kind ? { kind } : {}),
    // Nowa strona nie dziedziczy trwającej animacji ani jej zapisu cofnięcia:
    // efekt „until end of turn” przestaje dotyczyć tej charakterystyki.
    // A4: znacznik crew też nie przechodzi (to była animacja starej strony).
    originalBeforeAnimation: null,
    crewed: false,
  };
}

/**
 * O-6 (audyt PR #134, CR 712.18 + 613): opis TRWAJĄCEJ animacji obiektu jako
 * „warstwy” nakładanej na wydrukowane cechy — typy/podtypy dodane (albo
 * zastąpione przy `retainTypes: false`) i ustawione bazowe P/T (warstwa 7b).
 * Animacje zapisują ją w `originalBeforeAnimation.layer`; dla zapisów bez
 * warstwy (fixtures, stan sprzed tej zmiany) wyprowadzamy ją z różnicy
 * między stanem bieżącym a zapisem cofnięcia. `null` = obiekt nie jest
 * animowany.
 */
export function animationLayerOf(object) {
  const original = object?.originalBeforeAnimation;
  if (!original) return null;
  if (original.layer) return original.layer;
  const current = { types: object.types ?? [], subtypes: object.subtypes ?? [] };
  const retainTypes = (original.types ?? []).every((type) => current.types.includes(type));
  return {
    power: object.power ?? null,
    toughness: object.toughness ?? null,
    ptTs: 0,
    typesAdd: retainTypes ? current.types.filter((t) => !(original.types ?? []).includes(t)) : [...current.types],
    subtypesAdd: retainTypes ? current.subtypes.filter((t) => !(original.subtypes ?? []).includes(t)) : [...current.subtypes],
    retainTypes,
  };
}

/**
 * Łączy warstwę nowej animacji z trwającą (późniejszy znacznik czasu wygrywa
 * P/T — CR 613.7). `ts` to znacznik NOWEGO efektu (CR 613.7b).
 *
 * W-6 (D4b): animacja BEZ P/T (crew — CR 702.122a: „This permanent becomes an
 * artifact creature until end of turn.”) nie jest efektem warstwy 7b, więc
 * zachowuje P/T i znacznik `ptTs` poprzedniej warstwy (Skilled Animator 5/5
 * trwa po crew), a bez poprzedniej — `power: null` (wydrukowane P/T pojazdu).
 */
export function mergedAnimationLayer(object, { power, toughness, typesAdd = [], subtypesAdd = [], retainTypes = true, ts = 0, linkedSourceId = null }) {
  const previous = animationLayerOf(object);
  // W-10/W-11 (Etap F/5, CR 611.2 + 613.7): każda animacja jest OSOBNYM
  // efektem z własnym czasem trwania — „until end of turn” (crew, Silvanus's
  // Invoker) albo „for as long as [źródło] remains on the battlefield”
  // (Skilled Animator). Scalona warstwa służy odczytowi; lista `effects`
  // pozwala zakończyć JEDEN efekt i przeliczyć resztę (`animationFieldsAfter`).
  // Dawniej koniec dowolnej animacji cofał wszystkie naraz.
  const previousEffects = previous?.effects
    ?? (previous ? [{ ...legacyAnimationEffect(previous) }] : []);
  const record = Object.freeze({
    ts, power: power ?? null, toughness: toughness ?? null,
    typesAdd: [...typesAdd], subtypesAdd: [...subtypesAdd], retainTypes,
    ...(linkedSourceId != null ? { linkedSourceId } : {}),
  });
  return { ...mergeAnimationLayer(previous, { power, toughness, typesAdd, subtypesAdd, retainTypes, ts }), effects: [...previousEffects, record] };
}

/** Warstwa bez listy efektów (obiekt sprzed W-10) jako jeden efekt „do końca tury”. */
function legacyAnimationEffect(layer) {
  return {
    ts: layer.ptTs ?? 0, power: layer.power ?? null, toughness: layer.toughness ?? null,
    typesAdd: [...(layer.typesAdd ?? [])], subtypesAdd: [...(layer.subtypesAdd ?? [])],
    retainTypes: layer.retainTypes !== false,
  };
}

/**
 * Scala dwie warstwy animacji: późniejszy znacznik wygrywa P/T (CR 613.7b),
 * typy/podtypy się sumują, a efekt „przestaje mieć inne typy” (retainTypes
 * false) zeruje wcześniejsze dodatki.
 */
function mergeAnimationLayer(previous, { power, toughness, typesAdd = [], subtypesAdd = [], retainTypes = true, ts = 0 }) {
  const setsPT = power != null || toughness != null;
  const pt = setsPT
    ? { power: power ?? null, toughness: toughness ?? null, ptTs: ts }
    : { power: previous?.power ?? null, toughness: previous?.toughness ?? null, ptTs: previous?.ptTs ?? null };
  if (!previous || !retainTypes) {
    return { ...pt, typesAdd: [...typesAdd], subtypesAdd: [...subtypesAdd], retainTypes };
  }
  return {
    ...pt,
    typesAdd: [...new Set([...previous.typesAdd, ...typesAdd])],
    subtypesAdd: [...new Set([...previous.subtypesAdd, ...subtypesAdd])],
    retainTypes: previous.retainTypes,
  };
}

/**
 * W-10/W-11: pola obiektu po zakończeniu części animacji — `remaining` to
 * efekty, które TRWAJĄ (w kolejności znaczników, CR 613.7). Brak efektów =
 * pełny powrót do cech sprzed animacji. Nadpisanie podtypów (warstwa 4 —
 * Wishful Merfolk) trwa: obiekt zachowuje podtypy-cel, a zapis przywrócenia
 * dostaje podtypy po animacji (jak `transformInPlaceFields`).
 */
export function animationFieldsAfter(object, remaining) {
  const record = object?.originalBeforeAnimation;
  if (!record) return {};
  const { layer: _layer, ...base } = record;
  if (!remaining || remaining.length === 0) {
    return {
      kind: base.kind, types: base.types,
      ...(object.subtypesBeforeOverride ? { subtypesBeforeOverride: base.subtypes } : { subtypes: base.subtypes }),
      power: base.power, toughness: base.toughness,
      originalBeforeAnimation: null,
    };
  }
  const ordered = [...remaining].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  let layer = null;
  for (const effect of ordered) layer = mergeAnimationLayer(layer, effect);
  layer = { ...layer, effects: ordered };
  const visible = withAnimationLayer(base, layer);
  return {
    kind: visible.kind, types: visible.types,
    ...(object.subtypesBeforeOverride ? { subtypesBeforeOverride: visible.subtypes } : { subtypes: visible.subtypes }),
    power: visible.power, toughness: visible.toughness,
    originalBeforeAnimation: Object.freeze({ ...base, layer }),
  };
}

/** Lista efektów animacji obiektu albo `null` (obiekt sprzed W-10 / bez animacji). */
export function animationEffectsOf(object) {
  return object?.originalBeforeAnimation?.layer?.effects ?? null;
}

/** Nakłada warstwę animacji na wydrukowane cechy strony. */
function withAnimationLayer(base, layer) {
  const types = layer.retainTypes ? [...new Set([...(base.types ?? []), ...layer.typesAdd])] : [...layer.typesAdd];
  const subtypes = layer.retainTypes ? [...new Set([...(base.subtypes ?? []), ...layer.subtypesAdd])] : [...layer.subtypesAdd];
  return {
    kind: types.includes('Creature') ? 'creature' : base.kind,
    types, subtypes,
    // W-6: warstwa bez P/T (crew) zostawia wydrukowane P/T strony.
    power: layer.power ?? base.power, toughness: layer.toughness ?? base.toughness,
  };
}

/**
 * O-6 (audyt PR #134): pola obiektu po transformie W MIEJSCU (CR 712.18 —
 * ten sam obiekt, trwające efekty działają dalej).
 *
 * Przed poprawką efekt `transform` rozkładał cechy drugiej strony na obiekt
 * wprost i zostawiał zapis cofnięcia animacji STAREJ strony, a do
 * `transformTo` zapisywał cechy ANIMOWANE. Skutek (sonda na Ballista
 * Watcher ożywionym do 5/5 artefaktu): po transformie animacja znikała
 * (Artifact ginął), cleanup nakładał na Ballista WIELDER wydrukowane cechy
 * PRZEDNIEJ strony (4/3 Human Soldier Werewolf — chimera), a powrotny
 * transform dawał Ballista Watcher trwale 5/5 artefakt.
 *
 * Teraz: (1) opuszczana strona zapisuje się w `transformTo` WYDRUKOWANYMI
 * cechami (zapis cofnięcia animacji / nadpisania podtypów), (2) nowa strona
 * dostaje wydrukowane cechy drugiej strony, (3) trwająca animacja jest
 * nakładana na nie ponownie, a zapis cofnięcia wskazuje cechy NOWEJ strony,
 * (4) nadpisanie podtypów „do końca tury” (Wishful Merfolk) trwa, a jego
 * zapis cofnięcia też wskazuje nową stronę. Modyfikatory P/T, liczniki i
 * granty keywordów/zdolności zostają na obiekcie bez zmian (spread wyżej).
 *
 * Zwraca `{ fields, leavingFace }`: `fields` do rozłożenia na obiekcie,
 * `leavingFace` — wydrukowane kind/types/subtypes/P/T opuszczanej strony.
 */
export function transformInPlaceFields(object, back) {
  const original = object.originalBeforeAnimation ?? null;
  const layer = animationLayerOf(object);
  const leavingFace = {
    kind: original ? original.kind : object.kind,
    types: [...((original ? original.types : object.types) ?? [])],
    subtypes: [...((object.subtypesBeforeOverride ?? (original ? original.subtypes : object.subtypes)) ?? [])],
    power: original ? original.power : object.power,
    toughness: original ? original.toughness : object.toughness,
  };
  const printedBack = {
    kind: back.kind ?? (((back.types ?? []).includes('Creature')) ? 'creature' : leavingFace.kind),
    types: [...(back.types ?? leavingFace.types)],
    subtypes: [...(back.subtypes ?? [])],
    power: back.power ?? null,
    toughness: back.toughness ?? null,
  };
  const visible = layer ? withAnimationLayer(printedBack, layer) : printedBack;
  const fields = {
    ...visible,
    originalBeforeAnimation: layer ? Object.freeze({ ...printedBack, layer }) : null,
  };
  if (object.subtypesBeforeOverride) {
    // Nadpisanie podtypów trwa (712.18) — obiekt zachowuje podtypy-cel,
    // a cleanup przywróci podtypy NOWEJ strony.
    fields.subtypesBeforeOverride = [...visible.subtypes];
    fields.subtypes = [...(object.subtypes ?? [])];
  }
  return { fields, leavingFace };
}

/**
 * Animuje permanent do końca tury (Silvanus's Invoker: land staje się
 * stworzeniem 8/8 z trample i haste, wciąż będąc landem).
 */
export function animatePermanentUntilEndOfTurn(state, objectId, { power, toughness, typesAdd = [], subtypesAdd = [], keywordsAdd = [], retainTypes = true }) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') return object;
  const originalBeforeAnimation = object.originalBeforeAnimation || {
    kind: object.kind,
    types: [...(object.types ?? [])],
    subtypes: [...(object.subtypes ?? [])],
    power: object.power,
    toughness: object.toughness,
  };
  const types = retainTypes ? [...new Set([...(object.types ?? []), ...typesAdd])] : [...typesAdd];
  const subtypes = retainTypes ? [...new Set([...(object.subtypes ?? []), ...subtypesAdd])] : [...subtypesAdd];
  const kind = types.includes('Creature') ? 'creature' : object.kind;
  // O-6 (CR 712.18): zapis cofnięcia niesie też WARSTWĘ animacji, żeby
  // transform w miejscu umiał nałożyć ją na drugą stronę (`transformInPlaceFields`).
  const layer = mergedAnimationLayer(object, { power, toughness, typesAdd, subtypesAdd, retainTypes, ts: nextTimestamp(state) });
  const updated = replaceObject(state, object, {
    kind,
    types,
    subtypes,
    // W-6 (D4b): pole power/toughness obiektu = P/T warstwy animacji, a gdy
    // żadna animacja nie ustawia P/T (crew) — wydrukowane P/T.
    power: layer.power ?? originalBeforeAnimation.power,
    toughness: layer.toughness ?? originalBeforeAnimation.toughness,
    originalBeforeAnimation: Object.freeze({ ...originalBeforeAnimation, layer }),
  });
  if (keywordsAdd.length > 0) {
    grantKeywordsUntilEndOfTurn(state, objectId, keywordsAdd);
  }
  state.events.push(event('permanent_animated', {
    objectId,
    cardId: object.cardId,
    power: updated.power,
    toughness: updated.toughness,
    types,
    subtypes,
    untilEndOfTurn: true,
  }));
  return updated;
}

/** CR510 / Treefolk Umbra: miara przydziału, nigdy zmiana prawdziwego power. */
export function combatDamageByToughness(state, object) {
  return attachmentsAttachedTo(state, object.id).some(a => attachmentGrant(a)?.combatDamageByToughness);
}
export function combatDamageAmount(object, state) {
  return Math.max(0, combatDamageByToughness(state,object) ? effectiveToughness(object,state) : effectivePower(object,state));
}
