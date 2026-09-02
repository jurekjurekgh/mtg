import { event } from '../protocol/types.js';
import { singleTargetOfStackEntry } from './objects.js';
import {
  applyEffect, applyEnterCounters, creaturesNotControlledByOwner, creaturesYouControl, faceDownCreaturesYouControl,
  landCreaturesYouControl, libraryCardsOf, millTargetPlayerId, otherCreaturesYouControl,
  counterStackObject,
} from './effects.js';
import { addCounter, hasCounter } from './counters.js';
import { deathZoneFor } from './zones.js';
import { changeLife, setPlayerSpeed } from './players.js';
import { effectiveAbilities, effectiveKeywords, effectivePower, wardAmountOf } from './permanents.js';
import { moveObjectDirectly } from './objects.js';
import { tapLandForMana, canPayColoredCost, spendMana, producibleMana } from './resources.js';

/**
 * Minimalny framework zdolności triggerowanych (CR 603).
 *
 * Uruchamiany po każdej zaakceptowanej komendzie (game-state.js `accepted`):
 * skanuje zdarzenia wygenerowane przez tę komendę (łącznie z centralnymi
 * state-based actions) i odpala triggery pasujących źródeł. Efekty triggerów
 * rozstrzygają się od razu — bez własnego okna priorytetu (uproszczenie:
 * obecne karty nie potrzebują interakcji na stosie w oknie triggera).
 *
 * Obsługiwane zdarzenia triggerów:
 * - `dies` — obiekt opuszcza battlefield do graveyard (np. Highland Game);
 * - `combat_damage_to_player` — stwór zadaje obrażenia combat graczowi
 *   (Kappa Tech-Wrecker); `requiresTarget` daje deterministyczną wersję
 *   opcjonalnego „you may" (gdy celu brak, opcja jest odrzucona);
 * - `enter_battlefield` — permanent wchodzi na pole bitwy (Zoraline; także landy:
 *   Rupture Spire z obowiązkową płatnością „sacrifice it unless you pay {1}",
 *   deskryptor `payMana` + `sacrificeIfUnpaid` — patrz firePayOrSacrifice);
 * - `attacks` — stwór zostaje zadeklarowany jako atakujący (Zoraline);
 * - `bat_attacks` — „whenever a Bat you control attacks" (tribał Zoraline);
 * - `upkeep` — początek kroku upkeep z warunkiem na liczbę czarów
 *   w poprzedniej turze (transform wilkołaków).
 *
 * Opcjonalny koszt triggera: `payMana` / `payLife` w deskryptorze — trigger
 * odpala się tylko, gdy kontroler może zapłacić (deterministyczne „you may").
 */

/**
 * Typy KART (delirium, CR 702.34): liczba różnych typów kart wśród kart
 * w grobie gracza. Nadtypy (Basic, Legendary…) się nie liczą — filtrujemy
 * do zamkniętej listy typów kart. Tokeny w grobie nie są kartami (name
 * ustawione) i nie wnoszą typu.
 */
const DELIRIUM_CARD_TYPES = Object.freeze([
  'Artifact', 'Battle', 'Conspiracy', 'Creature', 'Dungeon', 'Enchantment',
  'Instant', 'Kindred', 'Land', 'Phenomenon', 'Plane', 'Planeswalker',
  'Scheme', 'Sorcery', 'Tribal', 'Vanguard',
]);

/**
 * Speed (Batch 24, Glitch Ghost Surveyor — „Start your engines!"): wzrasta
 * RAZ na turę aktywnego gracza, gdy przeciwnik traci życie (combat lub
 * niecombat damage), do maksimum 4. Samo „start" robi efekt start_engines
 * (ETB źródła); speed jest cechą gracza i trwa po odejściu źródła.
 */
function bumpSpeedIfOpponentDamaged(state, source) {
  const controllerId = source?.controllerId;
  if (!controllerId) return;
  const player = state.players.find((p) => p.id === controllerId);
  if (!player || (player.speed ?? 0) <= 0) return;
  if (state.turn.activePlayerId !== controllerId) return; // tylko własna tura
  if (state.speedIncreasedThisTurn?.[controllerId]) return; // raz na turę
  if ((player.speed ?? 0) >= 4) return; // max speed
  // Zapis wyłącznie przez choke point `setPlayerSpeed` (players.js) — ten sam,
  // który stosuje akcję stanową „Start your engines!” (state-based.js). Bramka
  // „czy wolno wzrosnąć” zostaje tutaj (to warunek triggera), mutacja nie.
  state.events.push(...setPlayerSpeed(state, controllerId, (player.speed ?? 0) + 1));
  state.speedIncreasedThisTurn = { ...(state.speedIncreasedThisTurn ?? {}), [controllerId]: true };
}

/**
 * Liczba różnych typów kart obecnych w grobie gracza (delirium: próg 4).
 */
export function graveyardCardTypeCount(state, playerId) {
  const present = new Set();
  for (const objectId of state.zones.graveyard) {
    const object = state.objects.get(objectId);
    if (!object || object.controllerId !== playerId || object.name != null) continue;
    for (const type of object.types ?? []) {
      if (DELIRIUM_CARD_TYPES.includes(type)) present.add(type);
    }
  }
  return present.size;
}

function toEffectList(ability) {
  return Array.isArray(ability?.effect) ? ability.effect : [ability?.effect].filter(Boolean);
}

function isPlayerId(state, id) {
  return state.players.some((p) => p.id === id);
}

/** Czy warunek triggera (np. „no spells were cast last turn") jest spełniony. */
function conditionHolds(trigger, state, sourceObject = null, eventData = {}) {
  const condition = trigger?.condition ?? {};
  if (condition.noSpellsLastTurn) return state.lastTurnSpellsCast === 0;
  // M158/Batch 39 (Exterminator Magmarch): warunki multiplayer („if ANOTHER
  // opponent ...") są w 1v1 martwe z definicji formatu (jest dokładnie jeden
  // przeciwnik) — jak brak strefy dowodzenia (ADR 0022: fakt formatu).
  if (condition.anotherOpponentExists) return state.players.length > 2;
  if (condition.minSpellsLastTurn != null) return state.lastTurnSpellsCast >= condition.minSpellsLastTurn;
  // „Whenever a player casts a WHITE spell" (Angel's Feather): trigger
  // `player_casts_spell` z warunkiem na kolorze rzucanego czaru — kolory
  // niosie samo zdarzenie (publiczne dane karty, ADR 0002).
  if (Array.isArray(condition.spellColorsInclude)) {
    return (eventData.colors ?? []).some((color) => condition.spellColorsInclude.includes(color));
  }
  // „Whenever you cast a COLORLESS spell" (Molten Nursery, Devoid): kolory
  // rzucanego czaru są puste (Devoid i artefakty są bezbarwne).
  if (condition.spellIsColorless) {
    return (eventData.colors ?? []).length === 0;
  }
  // Batch 51 (Kulrath Mystic): „Whenever you cast a spell with MANA VALUE 4
  // or greater" (CR 202.3 — mana value to koszt many wydrukowany na karcie).
  // Źródłem wartości jest obiekt czaru na stosie (`eventData.object.manaCost`),
  // nie `eventData.manaCost`: przy permanentach to drugie pole niesie MANĘ
  // WYDANĄ (po rabatch i kickerze), a nie mana value — trigger reagowałby na
  // taniego stwora rzuconego za {4} dzięki zniżce.
  if (condition.spellManaValueAtLeast != null) {
    const manaValue = eventData.manaValue ?? eventData.object?.manaCost ?? null;
    if (manaValue == null) return false;
    return manaValue >= condition.spellManaValueAtLeast;
  }
  // „If you descended this turn" (Canonized in Blood, CR 603.4 — intervening
  // if): permanent card wpadł do grobu kontrolera w bieżącej turze.
  if (condition.descendedThisTurn) {
    return Boolean((state.descendedThisTurn ?? {})[sourceObject?.controllerId]);
  }
  // „if you control a creature with a counter on it" (CR 603.4 — intervening
  // if; Delta Bloodflies). Warunek sprawdzany jest przy odpaleniu triggera.
  if (condition.controlsCreatureWithCounter) {
    const controllerId = sourceObject?.controllerId;
    return [...state.objects.values()].some((object) => object.zone === 'battlefield'
      && object.controllerId === controllerId && object.kind === 'creature'
      && Object.values(object.counters ?? {}).some((count) => count > 0));
  }
  // Persist (CR 702.79): wraca tylko stwór, który NIE miał liczników -1/-1
  // w chwili śmierci — LKI z formerCounters (liczniki znikają przy zmianie
  // strefy, więc bieżący obiekt w grobie ich już nie ma).
  if (condition.noMinusCountersWhenDied) {
    return ((sourceObject?.formerCounters ?? {})['-1/-1'] ?? 0) === 0;
  }
  // „When this land enters untapped" (Batch 24: Mystic Sanctuary) — warunek
  // na STANIE WEJŚCIA (eventData.enteredTapped z tryFire enter_battlefield).
  if (condition.enteredUntapped) {
    return eventData.enteredTapped === false;
  }
  // „At the beginning of ENCHANTED player's upkeep" (Curse of the Pierced
  // Heart): trigger odpala się tylko w upkeep gracza zaczarowanego przez
  // źródło — nie kontrolera (karta „Enchant player").
  if (condition.enchantedPlayerUpkeep) {
    return Boolean(sourceObject && sourceObject.enchantedPlayerId === state.turn.activePlayerId);
  }
  // Batch 23: Feedback — „At the beginning of the upkeep of enchanted
  // enchantment's controller" — aura zaczarowuje enchantment; odpala się
  // w upkeep kontrolera tego zaczarowanego enchantmentu.
  if (condition.enchantedPermanentControllerUpkeep) {
    if (!sourceObject || !sourceObject.attachedTo) return false;
    const enchanted = state.objects.get(sourceObject.attachedTo);
    if (!enchanted || enchanted.zone !== 'battlefield') return false;
    return enchanted.controllerId === state.turn.activePlayerId;
  }
  // Delirium (CR 702.34, Fear of Burning Alive — intervening if):
  // warunek spełniony, gdy w grobie kontrolera źródła są co najmniej
  // cztery typy kart (licznik graveyardCardTypeCount).
  if (condition.delirium) {
    return graveyardCardTypeCount(state, sourceObject?.controllerId) >= 4;
  }
  // „If you cast it\" (Geological Appraiser): trigger ETB odpala się
  // tylko, gdy permanent został zagrany z ręki (wasCast), a nie wszedł
  // na pole bitwy inną drogą (reanimacja, token, itp.).
  if (condition.ifCast) {
    return Boolean(sourceObject?.wasCast);
  }
  // „If it was kicked\" (Kor Sanctifiers, CR 702.33): trigger odpala się
  // tylko, gdy rzut opłacił dodatkowy koszt kickera (flaga na permanencie).
  if (condition.wasKicked) {
    return Boolean(sourceObject?.wasKicked);
  }
  // M67 (Homicidal Brute — tył Civilized Scholar): „At the beginning of your
  // end step, if this creature DIDN'T ATTACK this turn, tap this creature,
  // then transform it." — flaga attackedThisTurn na atakujących (declareAttackers),
  // czyszczona w cleanup; sprawdzana przy rozstrzyganiu triggera (intervening if).
  if (condition.saddled) {
    return Boolean(sourceObject?.saddled);
  }
  if (condition.didntAttackThisTurn) {
    return !(sourceObject?.attackedThisTurn === true);
  }
  // M67 (Guildsworn Prowler): „When this creature dies, if it WASN'T BLOCKING,
  // draw a card." — LKI z chwili śmierci: event niesie wasBlocking (flaga
  // isBlockingThisCombat na blokerze z declareBlockers, przetrwała zmianę
  // strefy). Trigger na stosie czyta z EXTRA, nie z żywego obiektu.
  if (condition.notBlocking) {
    return eventData.wasBlocking !== true;
  }
  // Creakwood Safewright (ECL): „…if there is an Elf card in your graveyard
  // and this creature has a -1/-1 counter on it…" — intervening-if (CR 603.4)
  // z DWÓCH deskryptorów; oba są danymi (podtyp, nazwa licznika), nie kodem
  // karto-specyficznym (ADR 0002).
  if (condition.subtypeCardInYourGraveyard) {
    const ownerId = sourceObject?.controllerId;
    const wanted = condition.subtypeCardInYourGraveyard;
    const found = (state.zones.graveyard ?? []).some((id) => {
      const card = state.objects.get(id);
      if (!card || card.zone !== 'graveyard') return false;
      if (card.ownerId !== ownerId && card.controllerId !== ownerId) return false;
      return (card.subtypes ?? []).includes(wanted);
    });
    if (!found) return false;
  }
  if (condition.selfHasCounter) {
    const live = state.objects.get(sourceObject?.id);
    if (!hasCounter(live ?? sourceObject, condition.selfHasCounter)) return false;
  }
  // Frontline War-Rager (EOE): „At the beginning of your end step, if you
  // control two or more tapped creatures, put a +1/+1 counter on this
  // creature." Intervening if — liczba zatapniętych stworów kontrolera źródła.
  if (condition.minTappedCreaturesControlled != null) {
    let tapped = 0;
    for (const object of state.objects.values()) {
      if (object.zone !== 'battlefield' || object.kind !== 'creature') continue;
      if (object.controllerId !== sourceObject?.controllerId) continue;
      if (object.tapped) tapped += 1;
    }
    return tapped >= condition.minTappedCreaturesControlled;
  }
  // Batch 48 (Stampeding Elk Herd, DTK): FORMIDABLE (CR 702.103) —
  // „if creatures you control have total power 8 or greater". Intervening-if
  // (CR 603.4) sprawdzany PRZY ODPALENIU i ponownie przy rozstrzyganiu.
  // Liczymy moc EFEKTYWNA (bufy, liczniki), nie wydrukowana.
  if (condition.minTotalPowerYouControl != null) {
    let total = 0;
    for (const object of state.objects.values()) {
      if (object.zone !== 'battlefield' || object.kind !== 'creature') continue;
      if (object.controllerId !== sourceObject?.controllerId) continue;
      total += effectivePower(object, state) ?? 0;
    }
    return total >= condition.minTotalPowerYouControl;
  }
  return true;
}

/** Czy kontroler triggera może opłacić opcjonalny koszt (mana / życie). */
function canPayTrigger(state, controllerId, trigger) {
  const player = state.players.find((p) => p.id === controllerId);
  if (!player) return false;
  // Opcjonalna płatność many (Panic Spellbomb {R}, Zoraline {W}{B}) liczy
  // manę PRODUKOWALNĄ (pula + nietapnięte źródła) — sama pula pomijała
  // gracza z nietapniętym landem, choć w MtG można go zatapnąć (bug złotej
  // odznaki; płatność resolve_optional_pay_choice i tak używa spendMana,
  // który auto-tapuje landy — check był niespójny z płatnością).
  if ((trigger?.payMana ?? 0) > producibleMana(state, controllerId)) return false;
  // Kolorowe pipy opcjonalnej płatności (Panic Spellbomb — „you may pay {R}"):
  // muszą być pokryte kolorową pulą/nietapniętymi źródłami, jak koszty czarów.
  const payReqs = (trigger?.payColors ?? []).map((color) => [color]);
  if (payReqs.length > 0 && !canPayColoredCost(state, controllerId, payReqs)) return false;
  // Płatność życia może zejść do 0, ale nie poniżej (CR 118.4).
  if ((trigger?.payLife ?? 0) > player.life) return false;
  return true;
}

/** Wartość celu do deterministycznej preferencji (najsilniejszy pierwszy). */
function targetValue(object) {
  if (!object) return 0;
  return object.kind === 'creature'
    ? (object.power ?? 0) * 2 + (object.toughness ?? 0)
    : (object.manaCost ?? 0);
}

/**
 * Legalni KANDYDACI na cel triggera (Temat 2 — CR 603/115.1b): zamiast
 * deterministycznego wyboru (findTriggerTarget) kontroler triggera wybiera
 * cel blokującą decyzją resolve_trigger_target. Kolejność listy = polityka
 * deterministyczna sprzed Tematu 2 (pierwszy kandydat = dawny wybór), więc
 * proste boty (pierwsza oferta) zachowują zachowanie.
 */
export function triggerTargetCandidates(state, spec, sourceObject, extra = {}) {
  if (!spec) return [];
  // Hexproof (CR 702.11): zdolności triggerowane też są zdolnościami — cel
  // będący permanentem przeciwnika z hexproof nie jest legalny.
  const hexproofBlocked = (object) => object && object.zone === 'battlefield'
    && object.controllerId !== sourceObject.controllerId
    && (effectiveKeywords(object, state).includes('hexproof'));
  const isArtifactOrEnchantment = (object) => (object.types ?? []).includes('Artifact')
    || (object.types ?? []).includes('Enchantment')
    || object.kind === 'artifact'
    || object.kind === 'enchantment';
  const isLand = (object) => object.kind === 'land' || (object.types ?? []).includes('Land');
  if (spec.type === 'any_target') {
    // „Any target": przeciwnik źródła (preferencja), potem stwory w kolejności
    // pola bitwy, na końcu kontroler — porządek dawnej polityki.
    // Batch 45 (Pain for All): „any OTHER target" — excludeAttachedHost
    // wyklucza GOSPODARZA aury-źródła z kandydatów.
    const excludedHostId = spec.excludeAttachedHost ? (sourceObject.attachedTo ?? null) : null;
    const players = state.players.map((p) => p.id);
    const opponentId = state.players.find((p) => p.id !== sourceObject.controllerId)?.id ?? null;
    const creatures = state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (excludedHostId != null && objectId === excludedHostId) return false;
      return object?.zone === 'battlefield' && object.kind === 'creature' && !hexproofBlocked(object);
    });
    const out = [];
    if (opponentId) out.push(opponentId);
    out.push(...creatures);
    out.push(...players.filter((id) => id !== opponentId));
    return out;
  }
  if (spec.type === 'artifact_or_enchantment' && spec.controlledBy === 'damaged_player') {
    const damagedPlayerId = extra.damagedPlayerId;
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.controllerId === damagedPlayerId && isArtifactOrEnchantment(object)
        && !hexproofBlocked(object);
    });
  }
  if (spec.type === 'player') {
    const players = state.players.map((p) => p.id);
    if (spec.prefer === 'opponent') {
      const opponentId = state.players.find((p) => p.id !== sourceObject.controllerId)?.id ?? null;
      return opponentId ? [opponentId, ...players.filter((id) => id !== opponentId)] : players;
    }
    return players;
  }
  if (spec.type === 'opponent') {
    const opponentId = state.players.find((p) => p.id !== sourceObject.controllerId)?.id ?? null;
    return opponentId ? [opponentId] : [];
  }
  if (spec.type === 'creature_card_in_opponent_graveyard') {
    // Puppeteer Clique: karty-stwory z grobu PRZECIWNIKA — najsilniejszy
    // pierwszy (remis: kolejność grobu). Tokeny NIE są kartami (CR 108.2b) —
    // nie mogą być celem „creature card from a graveyard" (root cause:
    // poległy w walce token był kandydatem, a jego usunięcie w accepted
    // osieracało zakolejkowaną decyzję celu).
    return state.zones.graveyard
      .filter((objectId) => {
        const object = state.objects.get(objectId);
        return object && object.name == null && object.kind === 'creature'
          && object.controllerId !== sourceObject.controllerId;
      })
      .sort((a, b) => targetValue(state.objects.get(b)) - targetValue(state.objects.get(a)));
  }
  if (spec.type === 'instant_or_sorcery_card_in_graveyard' && spec.controlledBy === 'controller') {
    // Batch 24 (Mystic Sanctuary): „you may put target instant or sorcery
    // card from your graveyard on top of your library" — karty własnego
    // grobu o typach Instant/Sorcery.
    return state.zones.graveyard.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.controllerId !== sourceObject.controllerId) return false;
      if (object.name != null) return false; // tokeny nie są kartami
      const types = object.types ?? [];
      return types.includes('Instant') || types.includes('Sorcery');
    });
  }
  if (spec.type === 'land_card_in_graveyard') {
    // Circle of the Land Druid (CLB): „return target land card from your
    // graveyard to your hand" — KARTY-lądy z grobu kontrolera (token nie jest
    // kartą, CR 108.2b).
    return state.zones.graveyard.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.controllerId !== sourceObject.controllerId) return false;
      if (object.name != null) return false;
      return object.kind === 'land' || (object.types ?? []).includes('Land');
    });
  }
  if (spec.type === 'permanent_card_in_graveyard' && spec.controlledBy === 'controller') {
    return state.zones.graveyard.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.controllerId !== sourceObject.controllerId) return false;
      if (object.name != null) return false; // tokeny nie są kartami (CR 108.2b)
      if (object.kind === 'land' || object.kind === 'spell') return false;
      return (object.manaCost ?? 0) <= (spec.maxManaValue ?? Number.POSITIVE_INFINITY);
    });
  }
  if (spec.type === 'spell_with_single_target_on_stack') {
    // Willbender: „target spell or ability with a single target" (CR 115.7).
    // M110: od kiedy zdolności aktywowane i triggerowane czekają na stosie,
    // Oracle da się spełnić w całości — kandydatem jest KAŻDY wpis stosu
    // z dokładnie jednym celem: czar (chosenTargets), zdolność aktywowana
    // (activatedEntry.targets) i triggerowana (triggerEntry.targets).
    return state.zones.stack.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'stack') return false;
      return singleTargetOfStackEntry(object) != null;
    });
  }
  if (spec.type === 'creature_you_control') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature'
        || object.controllerId !== sourceObject.controllerId) return false;
      // M158/Batch 39 (Breaching Hippocamp): „ANOTHER target creature you
      // control" — `notSelf` wyklucza źródło (jak w gałęzi 'creature').
      if (spec.notSelf && object.id === sourceObject.id) return false;
      // M154 (Batch 38, Talion's Messenger): cel może być zawężony do podtypu
      // („target Faerie you control") — dane, nie warunek na nazwę karty.
      if (spec.subtype && !(object.subtypes ?? []).includes(spec.subtype)) return false;
      return true;
    });
  }
  if (spec.type === 'ally_creature_on_battlefield') {
    // Jwari Shapeshifter: „You may have this creature enter as a copy of any
    // Ally creature on the battlefield." — stwory-Ally na polu bitwy (obu graczy).
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature'
        && (object.subtypes ?? []).includes('Ally');
    });
  }
  if (spec.type === 'creature_opponent_damaged_this_turn') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature'
        && object.controllerId !== sourceObject.controllerId
        && object.damagedThisTurn
        && !hexproofBlocked(object);
    });
  }
  if (spec.type === 'creature_opponent_controls') {
    // Warmaker Gunship (EOE): „target creature an opponent controls" — stwory
    // PRZECIWNIKA kontrolera źródła (nie własne), bez hexproof.
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature'
        && object.controllerId !== sourceObject.controllerId
        && !hexproofBlocked(object);
    });
  }
  // M154 (Batch 38, Lotusguard Disciple): cel „creature or Vehicle" —
  // stwór LUB Vehicle (artefakt z podtypem Vehicle) na polu bitwy, bez hexproof.
  if (spec.type === 'creature_or_vehicle') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield') return false;
      const isVehicle = (object.subtypes ?? []).includes('Vehicle');
      if (object.kind !== 'creature' && !isVehicle) return false;
      return !hexproofBlocked(object);
    });
  }
  if (spec.type === 'creature') {
    // „Target creature" (Forge Devil, Reclusive Artificer, Cloudbound Moogle,
    // Goblin Battle Jester, Battle-Rattle Shaman...): stwory na polu bitwy bez
    // hexproof, kolejność pola bitwy. ŹRÓDŁO też może być celem (karty bez
    // „other/another" — CR 115.1). Tylko `spec.notSelf` (Faceless Butcher —
    // „another target creature") wyklucza źródło.
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
      if (spec.notSelf && object.id === sourceObject.id) return false;
      // Batch 46 (Bone Shredder): „destroy target nonartifact, nonblack
      // creature" — filtry wykluczające po typie i kolorze. Deskryptorowo
      // (ADR 0002); ta sama lista napędza ofertę i walidację (L48).
      if (spec.notArtifact && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'))) return false;
      if (Array.isArray(spec.notColors) && spec.notColors.some((color) => (object.colors ?? []).includes(color))) return false;
      if (hexproofBlocked(object)) return false;
      return true;
    });
  }
  if (spec.type === 'artifact_or_enchantment' && !spec.controlledBy) {
    // Kor Sanctifiers: artefakty/enchantmenty (linia typów), nie źródło.
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.id !== sourceObject.id && isArtifactOrEnchantment(object)
        && !hexproofBlocked(object);
    });
  }
  if (spec.type === 'artifact_you_control') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield'
        && object.controllerId === sourceObject.controllerId
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'))
        && object.id !== sourceObject.id;
    });
  }
  // M166/B (Cacophodon — Enrage): „untap target permanent" — dowolny
  // permanent na polu bitwy (również ląd i samo źródło), bez hexproof,
  // najcenniejszy pierwszy (determinizm).
  if (spec.type === 'permanent') {
    return state.zones.battlefield
      .filter((objectId) => {
        const object = state.objects.get(objectId);
        // Nanoform Sentinel: „untap ANOTHER target permanent\" — `notSelf`
        // wyklucza źródło (CR 115.2 — „another\").
        if (spec.notSelf && objectId === sourceObject.id) return false;
        // Batch 51 (Invasive Species): „return ANOTHER permanent YOU CONTROL"
        // — `controlledBy: 'controller'` zawęża zbiór do permanentów
        // kontrolera ŹRÓDŁA (CR 115.2 + „you control"). Bez tego trigger
        // oferowałby na własne wejście permanent przeciwnika, a po wybraniu
        // go gracz oddawałby cudzy stwór zamiast swojego.
        if (spec.controlledBy === 'controller' && object?.controllerId !== sourceObject.controllerId) return false;
        return object && object.zone === 'battlefield' && !hexproofBlocked(object);
      })
      .sort((a, b) => targetValue(state.objects.get(b)) - targetValue(state.objects.get(a)));
  }
  if (spec.type === 'artifact_or_creature') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield'
        && (object.kind === 'creature' || object.kind === 'artifact')
        && object.id !== sourceObject.id && !hexproofBlocked(object);
    });
  }
  if (spec.type === 'other_nonland_permanent') {
    // Jill: „up to one other target nonland permanent" — dowolny nie-land
    // inny niż źródło, OBU graczy (własne i przeciwnika), bez hexproof;
    // najsilniejszy pierwszy. Spójne z generycznym 'nonland_permanent'.
    return state.zones.battlefield
      .filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.id === sourceObject.id) return false;
        if (hexproofBlocked(object)) return false;
        if (isLand(object)) return false;
        return true;
      })
      .sort((a, b) => targetValue(state.objects.get(b)) - targetValue(state.objects.get(a)));
  }
  if (spec.type === 'creature_defending_player_controls') {
    // Greatsword of Tyr: „tap up to one target creature defending player
    // controls" — stwory gracza broniącego (extra.defendingPlayerId),
    // najsilniejszy pierwszy (dawna polityka).
    const defendingPlayerId = extra.defendingPlayerId;
    return state.zones.battlefield
      .filter((objectId) => {
        const object = state.objects.get(objectId);
        return object && object.zone === 'battlefield' && object.kind === 'creature'
          && object.controllerId === defendingPlayerId && !hexproofBlocked(object);
      })
      .sort((a, b) => targetValue(state.objects.get(b)) - targetValue(state.objects.get(a)));
  }
  // Batch 22: Selesnya Charm tryb 2 — stwór z mocą ≥ N (domyślnie 5).
  if (spec.type === 'creature_with_power_at_least') {
    const min = spec.min ?? 5;
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
      if (hexproofBlocked(object)) return false;
      return (effectivePower(object, state) ?? 0) >= min;
    });
  }
  // Batch 22: Thistledown Players — dowolny NIE-land na polu bitwy
  // (stwór, artefakt, enchantment). Źródło triggera nie jest celem
  // własnym (żeby ETB Thistledown nie odpalał na siebie).
  if (spec.type === 'nonland_permanent') {
    // „Target nonland permanent an opponent controls\" (Static Net) — domyślnie
    // dowolny nie-ląd inny niż źródło; `opponentControls` zawęża do PRZECIWNIKA
    // kontrolera źródła (spójne z creature_opponent_controls).
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield') return false;
      if (object.id === sourceObject.id) return false;
      if (hexproofBlocked(object)) return false;
      if (spec.opponentControls && object.controllerId === sourceObject.controllerId) return false;
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      return !isLand;
    });
  }
  // Batch 22: Wormfang Newt — land you control (T2: cel wybiera
  // kontroler, exclude źródła). Lustro legalTargetCandidates ze
  // spells.js (które obsługuje ten sam specyfikacja w czarach).
  if (spec.type === 'land_you_control') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield'
        && object.controllerId === sourceObject.controllerId
        && (object.kind === 'land' || (object.types ?? []).includes('Land'))
        && object.id !== sourceObject.id;
    });
  }
  return [];
}

/**
 * Zdolności działające przy śmierci: własne + nadane „do końca tury" przed
 * zmianą strefy (LKI, CR 603.10 — np. trigger z Fake Your Own Death).
 */
function abilitiesOnDeath(object) {
  return [...effectiveAbilities(object), ...(object.formerAbilityGrants ?? [])];
}

/** Czy któryś efekt wymaga zdjęcia licznika ze źródła (warunek odpalenia). */
function requiresCounter(ability, counterName) {
  return toEffectList(ability).some((effect) => effect.type === 'remove_counter' && effect.counter === counterName);
}

/**
 * Kolejkuje rozdział Sagi (CR 714.3) — Temat 2 dla Sag: rozdziały z
 * `requiresTarget` na którymkolwiek efekcie (Mesmerize Shiva I/II) wymagają
 * wyboru celu przez kontrolera Sagi. Kolejka przebiega tak, jak inne
 * decyzje celu triggera (Temat 2: `pendingTriggerTargets` z `resolve_trigger_target`).
 * Po wybraniu celu komenda `resolve_trigger_target` kolejkuje rozdział na
 * stos (T6) z `payload.targets` — `resolveTriggerEntry` w ścieżce
 * `sagaChapter` odczytuje `payload.targets` i przekazuje do `fireSagaChapter`.
 *
 * Rozdziały BEZ `requiresTarget` (np. Cold Snap III: tap_all_lands_opponents_control
 * + exile_return_transformed) idą od razu na stos jak dotąd.
 *
 * Kolejność kandydatów celu: pierwszy kandydat = dawny determinizm
 * (najsilniejszy własny stwór) — proste boty biorą pierwszą ofertę i
 * zachowują dotychczasowe zachowanie.
 */
function queueSagaChapter(state, sagaObject, chapterNumber, events) {
  const chapters = sagaObject.saga?.chapters ?? [];
  const effects = chapters[chapterNumber - 1] ?? [];
  // Znajdź pierwszy efekt z `requiresTarget` w rozdziale (dla Mesmerize I/II
  // jeden efekt; przyszłe rozdziały z wieloma celami wymagałyby pętli po
  // każdym efekcie). Boty biorą pierwszą ofertę, więc kandydaci
  // `creature_you_control` (najsilniejszy pierwszy) są wstecznie zgodne.
  const targetEffectIndex = effects.findIndex((e) => e.requiresTarget);
  if (targetEffectIndex === -1) {
    // Bezcelowy rozdział — od razu na stos (deterministyczny).
    queueTriggerToStack(state, {
      type: 'triggered',
      trigger: { event: 'saga_chapter' },
      effect: [],
    }, sagaObject, [], events, { sagaChapter: chapterNumber });
    return;
  }
  const targetSpec = effects[targetEffectIndex].requiresTarget;
  const candidates = triggerTargetCandidates(state, targetSpec, sagaObject);
  // Temat 2: cel wybiera kontroler blokującą decyzją resolve_trigger_target.
  // `specOverride` wskazuje konkretny `requiresTarget` z rozdziału (wielokrotne
  // cele w jednym rozdziale wybrałyby pierwszy — przyszła rozbudowa).
  // `allowNone = false`: brak legalnych celi = rozdział nic nie robi (CR 608.2b),
  // nie kolejkujemy wtedy pustej decyzji (jak w `tryFire` dla innych triggerów).
  if (candidates.length === 0) return;
  // ability deskryptor: identyczny kształt jak w `tryFire`, ale pole `effect`
  // jest PUSTE (decyzja CELU nie wykonuje jeszcze efektu — wykonuje go
  // `fireSagaChapter` z `payload.targets`). `requiresTarget` jest też
  // w trigger.requiresTarget dla spójności z `triggerTargetDecisionPending`/
  // `legalTriggerTargetCandidates` (czytają pending.ability?.trigger?.requiresTarget;
  // bez tego kandydaci byliby pusti). `specOverride` dla przyszłej rozbudowy
  // (wielokrotne cele w jednym rozdziale).
  const ability = {
    type: 'triggered',
    trigger: { event: 'saga_chapter', requiresTarget: targetSpec },
    effect: [],
  };
  // M172/B (uwaga właściciela): decyzja celu rozdziału niesie TYTUŁ rozdziału
  // (saga.chapterNames z Oracle — „Mesmerize") i typ celowanego efektu —
  // modal i log opisują, CO robi trigger, zamiast generycznego „cel triggera".
  queueTargetDecision(state, ability, sagaObject, candidates, false, [], events, {
    sagaChapter: chapterNumber,
    chapterName: sagaObject.saga?.chapterNames?.[chapterNumber - 1] ?? null,
    chapterEffectType: effects[targetEffectIndex].type ?? null,
  }, targetSpec);
}

/**
 * Odpala rozdział Sagi (CR 714): efekty rozdziału, zdarzenie saga_chapter_fired,
 * a po rozdziale OSTATNIM — poświęcenie Sagi (CR 714.4), o ile wciąż jest na
 * polu bitwy jako Saga (Shiva sama się przemienia w rozdziale III, więc jej
 * poświęcenia nie ma). Rozdział zwracający permanenta na pole bitwy (powrót
 * stroną przednią) uruchamia jego triggery wejścia — jeden ograniczony poziom
 * zagnieżdżenia, jak zdarzenia zdolności aktywowanej trafiające do
 * recentEvents komendy (głębsze zagnieżdżenie nie jest skanowane — spójne
 * z jednoprzebiegowym modelem triggerów engine).
 *
 * `chapterTargets` — wybrane przez gracza cele dla efektów rozdziału
 * z `requiresTarget` (Temat 2 dla Sag: Mesmerize Shiva I/II). Pierwszy
 * element listy to id wybrane dla PIERWSZEGO efektu z `requiresTarget`
 * w rozdziale (Mesmerize ma jeden efekt). Efekty BEZ `requiresTarget`
 * ignorują `chapterTargets` (dostają pustą listę). Brak `chapterTargets`
 * (deterministyczny fallback, np. po `resolve_trigger_target` ze ślepym
 * wpisem) → wszystkie efekty celowane dostają `[]` (CR 608.2b: bez celu nic
 * nie robi).
 */
function fireSagaChapter(state, sagaObject, chapterNumber, events, chapterTargets = null) {
  const chapters = sagaObject.saga?.chapters ?? [];
  const effects = chapters[chapterNumber - 1] ?? [];
  const before = state.events.length;
  // Pierwszy element chapterTargets (jeśli istnieje) to id celu dla
  // pierwszego efektu z requiresTarget — obecny katalog Sagi (Shiva) ma
  // jeden taki efekt na rozdział. Przyszłe Sagi z wieloma celowanymi
  // efektami wymagałyby rozbudowy, ale obecny wzorzec wystarcza.
  const chosen = Array.isArray(chapterTargets) && chapterTargets.length > 0
    ? chapterTargets[0] : null;
  for (const effect of effects) {
    let targets;
    if (effect.requiresTarget) {
      // Temat 2: cel wskazany przez gracza — jeden obiekt dla tego efektu.
      targets = chosen != null ? [chosen] : [];
    } else {
      // Efekt bezcelowy (Cold Snap: tap_all_lands_opponents_control,
      // exile_return_transformed, create_token itd.) — pusta lista.
      targets = [];
    }
    applyEffect(state, effect, sagaObject, targets);
  }
  state.events.push(event('saga_chapter_fired', {
    objectId: sagaObject.id, cardId: sagaObject.cardId,
    chapter: chapterNumber, totalChapters: chapters.length,
  }));
  events.push(...state.events.slice(before));
  // Triggery wejścia permanenta zwróconego przez rozdział (Jill powracająca
  // jako strona przednia po Cold Snap) odpala NORMALNY skan processTriggers
  // (zdarzenie object_moved → battlefield) — pętla zagnieżdżona poniżej
  // (usunięta) odpalała je DRUGI raz (podwójne decyzje celu ETB od T6).
  if (chapterNumber >= chapters.length) {
    const current = state.objects.get(sagaObject.id);
    if (current && current.zone === 'battlefield' && current.saga) {
      // M272 (błąd #17, CR 704.5s + 122.1e): po ostatnim rozdziale kontroler
      // POŚWIĘCA Sagę — a poświęcenie to śmierć permanenta, więc obowiązuje
      // zastąpienie strefy (licznik finality / „exile it instead"). M269
      // (błąd #5) sprowadził cztery ścieżki poświęcenia do `deathZoneFor`,
      // ale ta — jedyna poza game-state/effects/spells — została na sztywnym
      // grobie: Saga z licznikiem finality dawała się odzyskać z cmentarza.
      const toZone = deathZoneFor(state, current);
      const graveId = `${toZone === 'exile' ? 'exile' : 'grave'}-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, current.id, toZone, graveId);
      const sacrificed = event('permanent_sacrificed', {
        fromId: current.id, objectId: graveId, playerId: current.controllerId,
        cardId: moved.cardId, saga: true, toZone,
      });
      state.events.push(sacrificed);
      events.push(sacrificed);
    }
  }
}

/**
 * Wspólna aplikacja efektów triggera (używana przez rozstrzyganie stosu T6
 * oraz natychmiastowe ścieżki specjalne). `context` niesie dane zdarzenia
 * nadrzędnego (np. manaSpent rzutu — progi Tellah, Great Sage).
 */
function applyTriggerEffects(state, ability, source, targets, context = {}) {
  const before = state.events.length;
  // M157/F4(a) (ADR 0022): trigger wielocelowy („on EACH of up to N target
  // ...", requiresTarget.count > 1) aplikuje listę efektów RAZ NA CEL —
  // „each of" to ten sam efekt dla każdego wybranego celu (Weftblade
  // Enhancer). Cele, które stały się nielegalne, pomijają efekty same
  // (applyEffect sprawdza strefę — CR 608.2b).
  const spec = ability?.trigger?.requiresTarget;
  const multi = Number.isInteger(spec?.count) && spec.count > 1;
  if (multi && targets.length > 0) {
    // M166/D (Inferno Titan, ADR 0002): DWA różne wzorce wielocelowości:
    // „on EACH of up to N target..." (Weftblade) = efekt RAZ NA CEL;
    // „divided as you choose among one, two or three targets" (Titan)
    // = JEDNO aplikowanie z CAŁĄ listą celów + decyzja kwot. Rozróżnienie
    // po typie efektu (damage_divided), nie po nazwie karty.
    const effects = toEffectList(ability);
    if (effects.length === 1 && effects[0]?.type === 'damage_divided') {
      applyEffect(state, effects[0], source, targets, context);
      return state.events.slice(before);
    }
    for (const targetId of targets) {
      for (const effect of effects) {
        applyEffect(state, effect, source, [targetId], context);
      }
    }
    return state.events.slice(before);
  }
  for (const effect of toEffectList(ability)) {
    applyEffect(state, effect, source, targets, context);
  }
  return state.events.slice(before);
}

export function fireTrigger(state, ability, source, targets, events, context = {}) {
  // Natychmiastowa aplikacja (ścieżki specjalne: rozdziały Sag poza stosem
  // nie istnieją od T6 — ta funkcja zostaje dla kompatybilności API).
  const slice = applyTriggerEffects(state, ability, source, targets, context);
  const e = event('ability_triggered', { objectId: source.id, cardId: source.cardId, trigger: ability.trigger?.event });
  state.events.push(e);
  events.push(...slice, e);
}

/**
 * M258/F3 — WARD (CR 702.21): „Whenever this permanent becomes the target
 * of a spell or ability an opponent controls, counter that spell or
 * ability unless that player pays [cost]." Trigger ward kolejkujemy NAD
 * obiekt celujący (czar/zdolność już na stosie) — po rundzie passów
 * rozstrzygnie się PIERWSZY (LIFO, CR 603.3), czyli dokładnie tak, jak
 * ward działa w papierze. Wywołania: skan zdarzeń rzutu (spell_cast/
 * aura_spell_cast), aktywacji zdolności z celem (ability_activated z
 * onStack), kopii czarów (spell_copied) i resolver celu triggera
 * (game-state.js — pendingTriggerTargets).
 */
export function fireWardTriggers(state, casterId, targetingStackId, targetIds, events = []) {
  if (!targetingStackId || !Array.isArray(targetIds)) return;
  for (const targetId of targetIds) {
    if (targetId == null) continue;
    const target = state.objects.get(targetId);
    // Ward chroni PERMANENTY (nie graczy, nie czary na stosie) i tylko
    // przed czarami/zdolnościami PRZECIWNIKA kontrolera warda.
    if (!target || target.zone !== 'battlefield' || target.kind === 'player') continue;
    if (target.controllerId === casterId) continue;
    const amount = wardAmountOf(target, state);
    if (amount == null) continue;
    const ability = Object.freeze({
      type: 'triggered', keyword: 'ward',
      trigger: Object.freeze({ event: 'ward' }),
      effect: null,
    });
    // queueTriggerToStack dopisuje swoje zdarzenia do state.events SAM
    // (parametr `events` to kolektor dla wywołującego — nie przekazujemy
    // state.events, żeby nie dublować wpisów).
    const local = [];
    queueTriggerToStack(state, ability, target, [], local, {
      wardPay: Object.freeze({ targetingStackId, amount }),
    });
    events.push(...local);
  }
}

/**
 * T6 — TRIGGERY NA STOSIE (CR 603.3): zdolność triggerowana, która się
 * odpaliła, trafia na WSPÓLNY STOS (obok czarów) z wybranymi celami;
 * rozstrzyga się dopiero po pełnej rundzie passów (LIFO), jak czar.
 * Przeciwnik może odpowiedzieć instanitem, zanim efekty triggera zadziałają.
 *
 * Reprezentacja: pseudo-obiekt w zones.stack (kind 'trigger') z deskryptorem
 * triggerEntry { ability, sourceId, targets, extra } — dzięki temu stos
 * pozostaje jedną, uporządkowaną osią czasu (CR 405.2), a resolveTopOfStack
 * rozstrzyga na zmianę czary i triggery.
 */
export function queueTriggerToStack(state, ability, source, targets, events, extra = {}) {
  const id = `trigger-${state.objectSequence++}`;
  // LKI (CR 603.10): statystyki źródła z chwili odpalenia — gdy źródło
  // opuści pole bitwy przed rozstrzygnięciem, efekty „source_power" (Jyoti)
  // czytają z tej migawki zamiast z pustego stuba (NaN -> crash).
  const sourceLki = Object.freeze({
    power: source.power,
    toughness: source.toughness,
    powerModifier: source.powerModifier ?? 0,
    toughnessModifier: source.toughnessModifier ?? 0,
    faceDown: source.faceDown ?? false,
  });
  const entry = Object.freeze({
    id, zone: 'stack', controllerId: source.controllerId, cardId: source.cardId,
    kind: 'trigger',
    triggerEntry: Object.freeze({
      ability: Object.freeze({ ...ability }),
      sourceId: source.id,
      targets: [...(targets ?? [])],
      extra: Object.freeze({ ...(extra ?? {}) }),
      sourceLki,
    }),
  });
  state.objects.set(id, entry);
  state.zones.stack.push(id);
  const fired = event('ability_triggered', {
    objectId: source.id, cardId: source.cardId,
    trigger: ability?.trigger?.event ?? null, onStack: true,
  });
  state.events.push(fired);
  events.push(fired);
  // M171/Z6: wywołujący (announce podziału obrażeń) potrzebuje id wpisu.
  return entry;
  return entry;
}

/**
 * Aplikacja opóźnionych triggerów (CR 603.7) przy rozstrzyganiu ze stosu:
 * wpis niesie delayedType i dane z chwili zakolejkowania. Zwraca true, gdy
 * efekt zadziałał (obiekt wciąż istniał we właściwej strefie).
 */
function resolveDelayedTrigger(state, payload, events) {
  const pending = payload.delayed;
  if (!pending) return false;
  if (payload.delayedType === 'exile_object') {
    const object = state.objects.get(pending.objectId);
    if (!object || object.zone !== 'battlefield') return false;
    const exileId = `exile-${state.objectSequence++}`;
    // M262: badge źródła z chwili zakolejkowania (karta/efekt/mechanika);
    // warp ma własny keyword.
    moveObjectDirectly(state, pending.objectId, 'exile', exileId, {
      exiledBy: pending.exiledBy ?? (pending.warp ? 'warp' : undefined),
    });
    // M154 (Warp): wygnana w końcowym kroku karta dostaje `warpReady`, więc
    // można ją rzucić z exile w późniejszej turze za koszt warp (castPermanent
    // warpCast). Zwykłe exile_object (Puppeteer Clique) nic nie dokleja.
    if (pending.warp) {
      const exiled = state.objects.get(exileId);
      state.objects.set(exileId, Object.freeze({ ...exiled, warpReady: true, warped: false }));
    }
    const fired = event('object_exiled', {
      objectId: exileId, fromId: pending.objectId, cardId: object.cardId,
      playerId: pending.playerId, delayed: true,
    });
    state.events.push(fired);
    events.push(fired);
    return true;
  }
  if (payload.delayedType === 'reanimate_under_target_control') {
    const object = state.objects.get(pending.objectId);
    // Obiekt zniknął z grobu (np. wygnany w międzyczasie) — trigger wygasa.
    if (!object || object.zone !== 'graveyard') return false;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, pending.objectId, 'battlefield', newId);
    const permanent = Object.freeze({ ...moved, controllerId: pending.playerId, summoningSickness: true });
    state.objects.set(newId, permanent);
    // M274 (#24, CR 121.6): opóźniony powrót na pole bitwy to też WEJŚCIE —
    // liczniki wejścia obowiązują jak przy każdej innej ścieżce ETB.
    applyEnterCounters(state, newId);
    const movedEvent = event('object_moved', {
      fromId: pending.objectId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield', delayed: true,
    });
    state.events.push(movedEvent); events.push(movedEvent);
    const controlEvent = event('control_changed', {
      objectId: newId, cardId: permanent.cardId,
      controllerId: pending.playerId, fromControllerId: moved.controllerId,
    });
    state.events.push(controlEvent); events.push(controlEvent);
    return true;
  }
  return false;
}

/**
 * Rozstrzyga wpis triggera ze stosu (wywoływane przez resolveTopOfStack):
 * zdolność opuszcza stos, ponowna walidacja intervening-if (CR 603.4) —
 * gdy warunek nie zachodzi, zdolność nic nie robi; efekty aplikowane z LKI
 * źródła (CR 603.10). Zdarzenia z rozstrzygnięcia wracają do strumienia.
 */
export function resolveTriggerEntry(state, entry) {
  const before = state.events.length;
  const payload = entry.triggerEntry;
  // LKI (CR 603.10): źródło mogło zniknąć, zanim trigger się rozstrzygnął
  // (np. inny trigger z tej samej komendy przeniósł je na pole bitwy — persist
  // po FYOD). Dajemy efektom minimalny stub z LKI: id/controllerId/cardId —
  // efekty czytające strefę (state.objects.get) dostają undefined i robią
  // no-op (CR 608.2b), zamiast crashować na null.
  const liveSource = state.objects.get(payload.sourceId) ?? null;
  // Stub niesie LKI statystyki z chwili odpalenia (CR 603.10) — efekty
  // czytające power/toughness źródła (source_power) działają z ostatniej
  // znanej informacji zamiast produkować NaN.
  const lki = payload.sourceLki ?? {};
  const source = liveSource ?? Object.freeze({
    id: payload.sourceId, controllerId: entry.controllerId,
    cardId: entry.cardId, zone: 'none', kind: null,
    power: lki.power, toughness: lki.toughness,
    powerModifier: lki.powerModifier ?? 0, toughnessModifier: lki.toughnessModifier ?? 0,
    faceDown: lki.faceDown ?? false,
    counters: {}, formerCounters: {}, keywords: [], abilities: [], types: [],
  });
  // Zdolność opuszcza stos w momencie rozstrzygania.
  state.zones.stack = state.zones.stack.filter((id) => id !== entry.id);
  state.objects.delete(entry.id);
  // Delayed triggers (Puppeteer Clique — exile w end step, Plague Reaver —
  // powrót w upkeep celu): aplikacja niestandardowa (nie efekt generyczny).
  // Markery (delayedType/delayed/sagaChapter) niosie extra wpisu.
  const extra = payload.extra ?? {};
  // Storm (CR 702.40a): przy rozstrzygnięciu tej zdolności powstają KOPIE
  // czaru — tyle, ile czarów rzucono przed nim w tej turze (liczba zamrożona
  // przy rzucie). Kopie nie są rzucane (nie odpalają triggerów „whenever you
  // cast" — CR 707.10) i po rozstrzygnięciu przestają istnieć.
  if (extra.stormCopy) {
    const original = state.objects.get(extra.stormCopy.stackId);
    const copies = extra.stormCopy.copies ?? 0;
    if (!original || original.zone !== 'stack' || copies === 0) {
      // CR 608.2b/707.10: czar zniknął ze stosu (kontrczar) albo nie było
      // czego liczyć — zdolność mówi to graczowi wprost (M106/Z2).
      state.events.push(event('trigger_resolved', {
        objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, storm: true, noEffect: true,
        reason: copies === 0 ? 'no_result' : 'no_targets',
      }));
      return state.events.slice(before);
    }
    const created = [];
    for (let i = 0; i < copies; i += 1) {
      const copyId = `spell-copy-${state.objectSequence++}`;
      state.objects.set(copyId, Object.freeze({
        ...original, id: copyId,
        instanceId: `${original.instanceId}-copy-${i + 1}`,
        isSpellCopy: true,
        chosenTargets: [...(original.chosenTargets ?? [])],
      }));
      state.zones.stack.push(copyId);
      created.push(copyId);
      state.events.push(event('spell_copied', {
        playerId: entry.controllerId, cardId: entry.cardId, objectId: copyId,
        sourceStackId: original.id, copyNumber: i + 1, totalCopies: copies,
        targets: [...(original.chosenTargets ?? [])],
      }));
    }
    // „You may choose new targets for the copies" (CR 702.40a + 706.10c):
    // kontroler decyduje o KAŻDYM celu KAŻDEJ kopii — kolejka trzyma pary
    // (kopia, numer slotu celu), więc czary wielocelowe działają tak samo
    // jak jednocelowe (M111).
    const specs = original.spell?.targets ?? [];
    if (specs.length > 0 && created.length > 0) {
      const queue = [];
      for (const copyId of created) {
        for (let slot = 0; slot < specs.length; slot += 1) queue.push({ copyId, targetIndex: slot });
      }
      state.pendingCopyTargets = {
        playerId: entry.controllerId,
        queue,
        specs: Object.freeze(specs.map((entrySpec) => Object.freeze({ ...entrySpec }))),
        cardId: entry.cardId,
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = entry.controllerId;
      state.events.push(event('copy_targets_required', {
        playerId: entry.controllerId, cardId: entry.cardId, copyIds: [...created],
      }));
    }
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, storm: true, copies,
    }));
    return state.events.slice(before);
  }
  if (extra.delayedType) {
    const localEvents = [];
    const handled = resolveDelayedTrigger(state, { ...payload, delayedType: extra.delayedType, delayed: extra.delayed }, localEvents);
    const resolved = event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, delayed: true, noEffect: !handled,
    });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // M258/F3 — WARD (CR 702.21): „counter that spell or ability unless that
  // player pays {N}". Trigger jest NIEZALEŻNY od przetrwania permanentu z
  // ward (brak intervening-if); gdy obiekt celujący zniknął ze stosu, nie
  // ma czego kontrować (CR 608.2b). Kontroler czaru/zdolności zapłaci w
  // decyzji blokującej (resolve_ward_pay_choice); bez many — automatyczny
  // kontr (wzorzec queuePayOrSacrifice / counter_spell_unless_pays).
  if (extra.wardPay) {
    const targeting = state.objects.get(extra.wardPay.targetingStackId);
    const targetingOnStack = Boolean(targeting && targeting.zone === 'stack');
    if (targetingOnStack) {
      const payer = targeting.controllerId;
      if (producibleMana(state, payer) >= extra.wardPay.amount) {
        state.pendingWardPay = {
          playerId: payer,
          amount: extra.wardPay.amount,
          targetingStackId: extra.wardPay.targetingStackId,
          wardSourceId: payload.sourceId,
          wardCardId: entry.cardId ?? null,
          targetingCardId: targeting.cardId ?? null,
          restorePriorityTo: state.turn.priorityPlayerId,
        };
        state.turn.priorityPlayerId = payer;
        state.events.push(event('ward_choice_required', {
          playerId: payer, amount: extra.wardPay.amount,
          targetingStackId: extra.wardPay.targetingStackId, cardId: targeting.cardId ?? null,
          wardSourceId: payload.sourceId,
        }));
      } else {
        counterStackObject(state, extra.wardPay.targetingStackId, {
          counteredBy: payload.sourceId, counteredByCardId: entry.cardId ?? null, byWard: true,
        });
      }
    }
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, ward: true, noEffect: !targetingOnStack,
    }));
    return state.events.slice(before);
  }
  // Suspend (CR 702.62a, trzecia zdolność): „When the last time counter is
  // removed, if this card is exiled, you may cast it without paying its mana
  // cost." Przy rozstrzyganiu otwieramy JEDNORAZOWĄ decyzję gracza
  // (pendingSuspendCast): rzuć czar za darmo (ignorując timing — nawet
  // sorcery w turze przeciwnika) albo zostaw w exile na stałe. Odmowa nie
  // przywraca rzucalności — karta zostaje z zerem liczników i bez statusu
  // „zawieszonej".
  if (extra.suspendObjectId) {
    const card = state.objects.get(extra.suspendObjectId);
    if (card && card.zone === 'exile' && card.suspended && card.timeCounters === 0) {
      state.pendingSuspendCast = {
        playerId: entry.controllerId,
        objectId: extra.suspendObjectId,
        cardId: entry.cardId,
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = entry.controllerId;
      state.events.push(event('suspend_ready_required', {
        playerId: entry.controllerId, objectId: extra.suspendObjectId, cardId: entry.cardId,
      }));
    }
    const resolved = event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, suspend: true, noEffect: !card || card.zone !== 'exile' || !card.suspended,
    });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // Rozdział Sagi (CR 714.3 — zdolność rozdziału to zdolność triggerowana):
  // efekty + ewentualne poświęcenie po ostatnim rozdziale wykonuje
  // fireSagaChapter (zachowuje LKI, gdy Saga opuściła pole bitwy w oknie).
  // Temat 2 dla Sag: rozdziały z `requiresTarget` na efektach (Mesmerize Shiva
  // I/II) otrzymują cele z `payload.targets` (kolejka `pendingTriggerTargets`
  // → wybór gracza → `queueTriggerToStack` z wybranymi targetami). Cel
  // w `payload.targets` jest na pozycji `effectIndex` (numer efektu w
  // rozdziale), bo T2 nie pozwala na zagnieżdżone cele — jeden trigger
  // Sagi ma jeden `requiresTarget` na jednym efekcie.
  if (extra.sagaChapter != null) {
    if (source) {
      const localEvents = [];
      // payload.targets może być: [id] (jeden wybrany cel dla całego rozdziału,
      // kompatybilne z T2 dla pojedynczego efektu) albo [{effectIndex, targetId}]
      // dla wielu celowanych efektów. Mesmerize Shiva ma jeden efekt — wystarczy
      // pierwszy element listy.
      const pt = Array.isArray(payload.targets) ? payload.targets : [];
      fireSagaChapter(state, source, extra.sagaChapter, localEvents, pt);
    }
    const resolved = event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, saga: true, chapter: extra.sagaChapter,
    });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // Intervening-if (CR 603.4): warunek sprawdzany PONOWNIE przy rozstrzyganiu —
  // z danymi zdarzenia nadrzędnego (extra: np. kolory rzucanego czaru dla
  // player_casts_spell — bez tego „spellColorsInclude" nie zachodził).
  if (!conditionHolds(payload.ability?.trigger, state, source, payload.extra ?? {})) {
    const resolved = event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, noEffect: true,
    });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // Cele: efekty same pomijają cele, które przestały być legalne
  // (CR 608.2b — applyEffect sprawdza strefę przy każdej akcji).
  const beforeEffects = state.events.length;
  // M171/Z6 (CR 603.3d): kwoty podziału obrażeń zadeklarowane przy
  // umieszczaniu na stosie jadą w kontekście do applyEffect.
  applyTriggerEffects(state, payload.ability, source, payload.targets ?? [],
    payload.damageDivision ? { ...(payload.extra ?? {}), damageDivision: payload.damageDivision } : (payload.extra ?? {}));
  // M106/Z2 (decyzja właściciela 2026-08-16): trigger, który rozstrzygnął się
  // BEZ ŻADNEGO skutku (Undead Servant przy pustym grobie — 0 Zombie, Jyoti
  // bez rzutów commandera — 0 tokenów), ma to powiedzieć wprost. Dotąd gracz
  // widział „trigger się rozstrzyga" i nie wiedział, czy coś przegapił.
  // M106/Z2 wnioskowało „brak efektu" z BRAKU ZDARZEŃ. To za mocny wniosek:
  // legalny no-op (CR 701.20b — tap już tapniętego, untap odkręconego) też
  // nie produkuje zdarzeń, a trigger wykonał się w całości. M189/Z2 (Żywy
  // Tester, transkrypt audyt-m187/g10): bot rzucił Glaring Aegis w stwora
  // stapowanego wcześniej zdolnością many, a log ogłosił „nic się nie
  // wydarzyło (zerowy wynik)" — gracz miał prawo sądzić, że zdolność
  // przepadła. Efekt, który świadomie nic nie zmienia, bo stan JUŻ jest
  // docelowy, raportujemy jako zwykłe rozstrzygnięcie.
  const producedNothing = state.events.length === beforeEffects;
  const noOpByState = producedNothing
    && applyTriggerEffectsWereNoOp(state, payload.ability, payload.targets ?? [], source);
  // M256 (Żywy Tester, runda 2): „nie było czego wykonać" a „nikt nie pasuje
  // do efektu" to dwa RÓŻNE komunikaty dla gracza — pierwszy sugeruje usterkę,
  // drugi mówi, że karta nie miała na kim działać.
  const emptyReceiverReason = producedNothing && !noOpByState
    ? triggerEffectsReasonForEmptyReceivers(state, payload.ability, source, payload.targets ?? [])
    : null;
  const resolved = event('trigger_resolved', {
    objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId,
    trigger: payload.ability?.trigger?.event ?? null,
    ...(producedNothing && !noOpByState
      ? { noEffect: true, reason: emptyReceiverReason ?? 'no_result' }
      : {}),
  });
  state.events.push(resolved);
  return state.events.slice(before);
}

/**
 * Czy efekty triggera nie zmieniły stanu dlatego, że stan JUŻ był docelowy
 * (CR 701.20b: tap tapniętego / untap odkręconego to legalne, wykonane
 * działanie bez zmiany)? Rozróżnia „zdolność wykonała się, tylko nie było
 * co zmieniać" od „zdolność nie zrobiła nic" (Undead Servant przy pustym
 * grobie). Deskryptorowo — po typie efektu, nie po nazwie karty (ADR 0002).
 */
const STATE_IDEMPOTENT_EFFECTS = Object.freeze({
  tap_permanent: (object) => object?.tapped === true,
  untap_permanent: (object) => object?.tapped === false,
  // Silken Strength (M256/J, runda 3 Żywym Testerem): „when this Aura enters,
  // untap enchanted permanent" — odkręcenie już odkręconego gospodarza to
  // legalny no-op (CR 701.20b), nie porażka triggera (klasa M189/Z2).
  untap_enchanted_permanent: (object) => object?.tapped === false,
});

/**
 * Skąd efekt idempotentny bierze swój obiekt, gdy NIE ma jawnego celu:
 * aura (i wyposażenie) działa na GOSPODARZA (`attachedTo`), nie na siebie —
   domyślną regułą jest „cel albo źródło" (Steelfin Whale, M189/Z2e).
 */
const STATE_IDEMPOTENT_TARGET = Object.freeze({
  untap_enchanted_permanent: (state, source) => (source?.attachedTo
    ? state.objects.get(source.attachedTo) ?? null
    : null),
});

/**
 * Efekty ZBIOROWE, które legalnie nie zmieniają niczego, gdy stan jest już
 * docelowy (CR 701.20b). Osobna tabela, bo predykat dostaje CAŁY zbiór, nie
 * jeden obiekt: Village Bell-Ringer („untap all creatures you control")
 * odkręca zbiór, w którym sam jest — więc „pusty zbiór odbiorców" nie zdarza
 * się nigdy, a „wszystkie już odkręcone" jest wykonaniem zdolności, nie jej
 * porażką (M106/Z2).
 */
const STATE_IDEMPOTENT_MASS_EFFECTS = Object.freeze({
  untap_all_creatures_you_control: (state, source) => creaturesYouControl(state, source?.controllerId)
    .every((object) => object.tapped === false),
});

/**
 * Efekty, które działają na ZBIÓR odbiorców („każdy zakryty stwór",
 * „wszystkie stwory wracają do właściciela"): gdy zbiór jest pusty, trigger
 * nie ma kogo ruszyć — a to NIE to samo, co „efekt wykonał się bez skutku".
 * Gracz czytający „nie było czego wykonać" przy Veiled Ascension (żadnego
 * zakrytego stwora) albo przy Trostani Discordant (nikt nie trzyma cudzych
 * stworów) dostaje powód, który sugeruje usterkę; właściwy to „brak legalnych
 * celów" (M189/Z2). Deskryptor po typie efektu (ADR 0002), selektor WSPÓLNY
 * z efektem (`effects.js`) — jedna reguła, nie dwie kopie (L41/L48).
 *
 * Tabela rośnie wraz z obserwacjami Żywego Testera, tak jak
 * `STATE_IDEMPOTENT_EFFECTS`; świadomie NIE ma tu `create_token`
 * (Undead Servant przy pustym grobie to „nie było czego wykonać").
 */
export const EMPTY_RECEIVER_EFFECTS = Object.freeze({
  add_flying_counter_to_face_down_you_control: (state, effect, source) => (
    faceDownCreaturesYouControl(state, source?.controllerId).length === 0 ? 'no_targets' : null),
  control_to_owners_all_creatures: (state) => (
    creaturesNotControlledByOwner(state).length === 0 ? 'no_targets' : null),
  buff_land_creatures: (state, effect, source) => (
    landCreaturesYouControl(state, source?.controllerId).length === 0 ? 'no_targets' : null),
  sacrifice_each_other_creature: (state, effect, source) => (
    otherCreaturesYouControl(state, source?.controllerId, source?.id).length === 0
      ? 'no_targets' : null),
  // Mill to wyjątek w rodzinie: cel (gracz) ISTNIEJE, brakuje kart
  // w bibliotece — „brak legalnych celów" byłoby kłamstwem.
  mill_cards: (state, effect, source, targets) => (
    libraryCardsOf(state, millTargetPlayerId(state, effect, source, targets)).length === 0
      ? 'empty_library' : null),
});

/**
 * Powód „braku efektu" wynikający z PUSTEGO ZBIORU ODBIORCÓW (`no_targets`,
 * `empty_library`) albo `null`, gdy tej przyczyny nie ma. Pytamy wyłącznie
 * wtedy, gdy efekt wyprodukował zero zdarzeń — inaczej odpowiedź byłaby bez
 * znaczenia (L83: warunek musi mierzyć regułę).
 *
 * Zgodę wymagamy od KAŻDEGO znanego efektu triggera: mieszanka (jeden ma
 * odbiorców, drugi nie) nie ma jednego powodu, więc zostaje `no_result`.
 */
function triggerEffectsReasonForEmptyReceivers(state, ability, source, targets) {
  const effects = (Array.isArray(ability?.effect) ? ability.effect : [ability?.effect])
    .filter(Boolean)
    .filter((effect) => EMPTY_RECEIVER_EFFECTS[effect.type]);
  if (effects.length === 0) return null;
  const reasons = effects.map((effect) => EMPTY_RECEIVER_EFFECTS[effect.type](state, effect, source, targets));
  const first = reasons[0];
  return reasons.every((reason) => reason === first) ? first : null;
}

function applyTriggerEffectsWereNoOp(state, ability, targets, source) {
  const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
  const relevant = effects.filter(Boolean);
  if (relevant.length === 0) return false;
  return relevant.every((effect) => {
    const massPredicate = STATE_IDEMPOTENT_MASS_EFFECTS[effect.type];
    if (massPredicate) return massPredicate(state, source);
    const predicate = STATE_IDEMPOTENT_EFFECTS[effect.type];
    if (!predicate) return false;
    // Efekt bez jawnego celu działa na ŹRÓDŁO (Steelfin Whale, Midnight
    // Guard: „untap this creature") — tak samo jak w applyEffect. Aura działa
    // na GOSPODARZA (M256/J) — osobna tabela, bo obiektem nie jest źródło.
    const targetId = targets[effect.targetIndex ?? 0] ?? source?.id ?? null;
    const target = STATE_IDEMPOTENT_TARGET[effect.type]
      ? STATE_IDEMPOTENT_TARGET[effect.type](state, source)
      : (targetId != null ? state.objects.get(targetId) : null);
    return Boolean(target && target.zone === 'battlefield' && predicate(target));
  });
}

/**
 * Obowiązkowy trigger płatności w stylu „sacrifice it unless you pay {N}"
 * (Rupture Spire). Nie jest to opcjonalne „you may" — trigger odpala się
 * ZAWSZE, a kontroler musi zapłacić albo poświęcić permanent.
 *
 * Świadome uproszczenie (minimalny wymiar, udokumentowane w M10): płatność
 * jest automatyczna — najpierw z puli many, a gdy jej brak, engine tapuje
 * jednego nietapniętego landa kontrolera (pierwszego z listy pola bitwy),
 * żeby opłacić koszt. Kontroler nie może dobrowolnie zrezygnować z płatności;
 * poświęcenie następuje wyłącznie, gdy zapłacić się nie da.
 */
function firePayOrSacrifice(state, ability, source, events) {
  return queuePayOrSacrifice(state, source, ability.trigger?.payMana ?? 0, events, ability.trigger?.event);
}

/**
 * Wspólna procedura „zapłać {N} albo poświęć" (CR 601.2h/702.1): Rupture Spire
 * (trigger ETB) i ECHO (CR 702.29, Bone Shredder — pierwszy własny upkeep po
 * wejściu). Wydzielona w Batchu 46, żeby obie ścieżki miały JEDNĄ regułę
 * płatności i te same zdarzenia (L41).
 */
function queuePayOrSacrifice(state, source, amount, events, triggerEvent = 'echo', colors = []) {
  const controllerId = source.controllerId;
  // Temat 7 (Rupture Spire, CR 601.2h/702.1): „sacrifice it unless you pay
  // {1}" — wybór należy do KONTROLERA. Gdy płatność jest możliwa (pula +
  // nietapnięte landy), kolejkujemy decyzję resolve_pay_or_sacrifice; samą
  // płatność (spendMana z auto-tapem) albo poświęcenie wykonuje komenda.
  // Bez możliwości zapłaty — automatyczne poświęcenie (jak dotąd).
  // M259/B7 (CR 702.29 + 118.2): koszt echa {2}{B} wymaga pipa {B} —
  // bramka opłacalności obejmuje KOLORY (pula + nietapnięte źródła), a sama
  // płatność pobiera pipy (patrz resolve_pay_or_sacrifice → pay_mana).
  const canPay = producibleMana(state, controllerId) >= amount
    && (colors.length === 0 || canPayColoredCost(state, controllerId, [colors]));
  if (!canPay) {
    const before = state.events.length;
    applyEffect(state, { type: 'sacrifice_permanent' }, source, []);
    const e = event('ability_triggered', {
      objectId: source.id, cardId: source.cardId, trigger: triggerEvent,
      sacrificed: true, autoSacrificed: true,
    });
    state.events.push(e);
    events.push(...state.events.slice(before));
    return true;
  }
  state.pendingPayOrSacrifice = {
    playerId: controllerId, amount, sourceId: source.id, colors,
    restorePriorityTo: state.turn.priorityPlayerId,
  };
  state.turn.priorityPlayerId = controllerId;
  const required = event('pay_or_sacrifice_required', {
    playerId: controllerId, amount, sourceId: source.id, cardId: source.cardId,
    colors,
  });
  state.events.push(required);
  events.push(required);
  return true;
}

/** Czy trigger ma opcjonalny koszt (mana/życie) — poza sacrificeIfUnpaid. */
function hasPayCost(trigger) {
  return ((trigger.payMana ?? 0) > 0 || (trigger.payLife ?? 0) > 0) && !trigger.sacrificeIfUnpaid;
}

/**
 * Temat 2 — cel triggera jako DECYZJA kontrolera (CR 603/115.1b): zamiast
 * deterministycznego findTriggerTarget kontroler wybiera cel blokującą
 * decyzją resolve_trigger_target (jak cel delirium/mentora). Kolejność
 * kandydatów = dawna polityka (pierwszy kandydat = dawny wybór — proste boty
 * zachowują zachowanie). allowNone = „up to one"/„you may" (można odmówić).
 */
function queueTargetDecision(state, ability, source, candidates, allowNone, fixedTargetIds, events, extra, specOverride = null) {
  const controllerId = source.controllerId;
  // M242 (zgłoszenie H, Breaching Hippocamp): WYMAGANY trigger celowy, który
  // ma DOKŁADNIE JEDNEGO legalnego kandydata (i nic poza wyborem — brak celów
  // stałych, brak „up to N"), nie ma czego pytać kontrolera — cel wybiera
  // się automatycznie (duch CR 115.1d: z JEDNEGO legalnego celu ustawa
  // wymusza wybór, pytanie to szum UI — „modal z jednym przyciskiem").
  // Wyłączone: allowNone (zgoda nigdy nie jest automatyczna), cele stałe
  // (fixedTargetIds — auto gubiłoby informację o komponowaniu listy celów),
  // wielocele (count > 1 — żaden częściowy autowybór). Trigger i tak ide na
  // stos (odpowiedź przeciwnika jak dla celu wybranego z modalu).
  const autoSpec = ability?.trigger?.requiresTarget;
  const autoMulti = Number.isInteger(autoSpec?.count) && autoSpec.count > 1;
  if (!allowNone && candidates.length === 1 && fixedTargetIds.length === 0 && !autoMulti) {
    // LKI jak w ścieżce resolve (M166/B): źródło mogło umrzeć z SBA tej samej
    // komendy, co odpaliło trigger (Enrage) — bierzemy ostatni znany stan.
    const src = state.objects.get(source.id) ?? source;
    const srcLegal = Boolean(src
      && ['battlefield', 'graveyard', 'exile'].includes(src.zone)
      && triggerConditionHolds(state, ability, src, extra ?? {}));
    if (srcLegal) {
      queueTriggerToStack(state, ability, src, [candidates[0]], events, extra ?? {});
    }
    const resolved = event('trigger_target_resolved', {
      playerId: controllerId, sourceId: source.id, cardId: source.cardId,
      targetId: srcLegal ? candidates[0] : null, noEffect: !srcLegal,
      remaining: state.pendingTriggerTargets.length, auto: true,
    });
    state.events.push(resolved);
    events.push(resolved);
    return true;
  }
  state.pendingTriggerTargets.push({
    playerId: controllerId,
    sourceId: source.id,
    cardId: source.cardId,
    // M166/B (Enrage, CR 603.10): źródło może już nie żyć pod swoim id
    // (zginęło w SBA tej samej komendy, co odpaliło trigger). LKI pozwala
    // dokończyć decyzję celu i rozstrzygnąć trigger z umarłego źródła.
    sourceLki: state.objects.has(source.id) ? null : Object.freeze({ ...source }),
    ability: Object.freeze({ ...ability }),
    candidates: [...candidates],
    allowNone: Boolean(allowNone),
    fixedTargetIds: [...(fixedTargetIds ?? [])],
    extra: Object.freeze({ ...extra }),
    // Spec celów może żyć poza zdolnością (Greatsword — spec tworzony
    // w locie); bez override rozstrzyganie nie znałoby kandydatów.
    specOverride: specOverride ? Object.freeze({ ...specOverride }) : null,
    restorePriorityTo: state.turn.priorityPlayerId,
  });
  state.turn.priorityPlayerId = controllerId;
  // M172/B: rozdział Sagi ma effect: [] (efekty wykonuje fireSagaChapter) —
  // typ efektu dla etykiet bierzemy wtedy z extra.chapterEffectType.
  const effectType = ((Array.isArray(ability?.effect) ? ability.effect[0]?.type : ability?.effect?.type) ?? null)
    ?? extra?.chapterEffectType ?? null;
  const required = event('trigger_target_required', {
    playerId: controllerId, sourceId: source.id, cardId: source.cardId,
    candidateIds: [...candidates], allowNone: Boolean(allowNone), effectType,
    // M172/B: tytuł rozdziału Sagi (log/modal) — null poza Sagami.
    ...(extra?.chapterName ? { chapterName: extra.chapterName } : {}),
  });
  state.events.push(required);
  events.push(required);
  // Zdolność trafiła na stos (oczekuje na decyzję celu) — zdarzenie jak przy
  // delirium/mentor: log pokazuje, że trigger się ODPALIŁ i czeka na cel.
  const fired = event('ability_triggered', {
    objectId: source.id, cardId: source.cardId,
    trigger: ability?.trigger?.event ?? null, awaitingTarget: true,
  });
  state.events.push(fired);
  events.push(fired);
  return true;
}

/**
 * Czy kolejkowana decyzja celu triggera wciąż wymaga rozstrzygnięcia:
 * źródło na polu bitwy + intervening-if (CR 603.4) + legalni kandydaci
 * (dynamicznie — jak delirium/mentor). Ślepe wpisy czyści execute.
 */
/** Czy trigger może się rozstrzygnąć ze źródła w danej strefie (LKI, CR 603.10). */
function triggerSourceZoneLegal(source, triggerEvent) {
  if (!source) return false;
  if (source.zone === 'battlefield') return true;
  // Triggery śmierci/odejścia działają z ostatniej znanej informacji —
  // źródło jest w grobie/exile (Selhoff, Servant of the Scale).
  return ['dies', 'any_creature_dies', 'leaves_battlefield'].includes(triggerEvent);
}

export function triggerTargetDecisionPending(state, pending) {
  // M166/B: źródło umarłe (Enrage) — LKI z pendingu; zone ze snapshotu
  // (moment zdarzenia), więc prawa „leaves the battlefield" nie odcinają.
  const source = state.objects.get(pending.sourceId) ?? pending.sourceLki ?? null;
  if (!triggerSourceZoneLegal(source, pending.ability?.trigger?.event)) return false;
  // Warunek zależny od ZDARZENIA (Batch 24 — Mystic Sanctuary „enters
  // untapped", spellColorsInclude itd.) musi być przeliczany z kontekstem
  // zdarzenia zapamiętanym w decyzji (pending.extra) — inaczej decyzja celu
  // była auto-resolved (pruneDeadPendingDecisions) i trigger nigdy nie
  // odpalał. To NIE jest intervening-if (CR 603.4) — warunek jest częścią
  // ZDARZENIA triggera, nie stanu gry.
  if (!conditionHolds(pending.ability?.trigger, state, source, pending.extra ?? {})) return false;
  if (requiresCounter(pending.ability, 'deathtouch') && !hasCounter(source, 'deathtouch')) return false;
  const candidates = triggerTargetCandidates(state, pending.ability?.trigger?.requiresTarget, source, pending.extra);
  if (candidates.length === 0 && !pending.allowNone) return false;
  return true;
}

/** Warunek triggera (intervening-if, CR 603.4) sprawdzany przy rozstrzyganiu.
 *  Batch 24: warunki zależne od ZDARZENIA (spellColorsInclude, enteredUntapped)
 *  wymagają kontekstu zdarzenia (extra) — patrz resolve_trigger_target w
 *  game-state.js (bez tego trigger z requiresTarget był cicho porzucany). */
export function triggerConditionHolds(state, ability, source, extra = {}) {
  return conditionHolds(ability?.trigger, state, source, extra);
}

/** Legalni kandydaci decyzji celu triggera w chwili rozstrzygania. */
export function legalTriggerTargetCandidates(state, pending) {
  // M166/B (Enrage): źródło umarłe — LKI z pendingu (CR 603.10).
  const source = state.objects.get(pending.sourceId) ?? pending.sourceLki ?? null;
  if (!triggerSourceZoneLegal(source, pending.ability?.trigger?.event)) return [];
  const spec = pending.specOverride ?? pending.ability?.trigger?.requiresTarget;
  return triggerTargetCandidates(state, spec, source, pending.extra);
}

/** Odpala trigger z opcjonalnym kosztem; zwraca true, gdy się odpalił. */
function tryFire(state, ability, source, targets, events, extra = {}) {
  const trigger = ability?.trigger ?? {};
  if (ability?.type !== 'triggered') return false;
  // eventData (extra) dla warunków z danymi zdarzenia (spellColorsInclude).
  if (!conditionHolds(trigger, state, source, extra)) return false;
  if (trigger.requiresTarget) {
    const spec = trigger.requiresTarget;
    const candidates = triggerTargetCandidates(state, spec, source, extra);
    // Cel-obowiązkowy bez kandydata albo „up to one" bez kandydata: trigger
    // nie odpala (CR 603.3d; „up to one" = deterministyczne „nie" jak dotąd).
    if (candidates.length === 0) {
      // M106/Z2 (decyzja właściciela 2026-08-16): gracz MA się dowiedzieć,
      // że trigger nie zrobił nic i dlaczego. Wcześniej Puppeteer Clique
      // wchodził na stół i po prostu nie było żadnego wpisu o triggerze —
      // z perspektywy stołu wyglądało to na zgubioną zdolność.
      const skipped = event('trigger_resolved', {
        objectId: source.id, cardId: source.cardId, playerId: source.controllerId,
        noEffect: true, reason: 'no_targets',
      });
      state.events.push(skipped);
      events?.push?.(skipped);
      return false;
    }
    if (requiresCounter(ability, 'deathtouch') && !hasCounter(source, 'deathtouch')) return false;
    if (!canPayTrigger(state, source.controllerId, trigger)) return false;
    // Zoraline („you may pay ... When you do, ..."): NAJPIERW decyzja
    // płatności (Temat 8), PO zapłacie decyzja CELU (Temat 2).
    if (hasPayCost(trigger)) {
      return fireOrQueuePay(state, ability, source, [], events, extra, { requiresTargetDecision: true });
    }
    // Temat 2: cel wybiera kontroler — resolve_trigger_target zamiast
    // deterministycznego findTriggerTarget (Forge Devil, Kor Sanctifiers,
    // Jill, Puppeteer Clique itd.).
    return queueTargetDecision(state, ability, source, candidates, Boolean(spec.optional), [], events, extra);
  }
  if (trigger.mayFire) {
    // „You may" bez celu (Angel's Feather — „you may gain 1 life"): decyzja
    // tak/nie kontrolera (resolve_optional_trigger_choice).
    if (!canPayTrigger(state, source.controllerId, trigger)) return false;
    state.pendingOptionalTrigger = {
      playerId: source.controllerId,
      sourceId: source.id,
      ability: Object.freeze({ ...ability }),
      extra: Object.freeze({ ...extra }),
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = source.controllerId;
    const required = event('optional_trigger_required', {
      playerId: source.controllerId, sourceId: source.id, cardId: source.cardId,
    });
    state.events.push(required);
    events.push(required);
    return true;
  }
  // Modalne triggery (Batch 22: Etherwrought Page upkeep): trigger ma
  // `effect.modes` (jak spell.modes dla modalnych czarów) — kolejkuje
  // decyzję modalną (pendingModalTrigger, resolve_modal_choice).
  // Tryb jest wybierany przez kontrolera, po czym efekty trybu są
  // aplikowane jak zwykły efekt triggera.
  if (Array.isArray(trigger.modes) && trigger.modes.length > 0) {
    if (requiresCounter(ability, 'deathtouch') && !hasCounter(source, 'deathtouch')) return false;
    if (!canPayTrigger(state, source.controllerId, trigger)) return false;
    // M174/E-fix (Downwind Ambusher, CR 603.3b): tryb wybiera się przy
    // kładzeniu na stos — gdy KAŻDY tryb wymaga celu i żaden nie ma
    // legalnego kandydata, zdolność nie wchodzi na stos (bez decyzji;
    // wcześniej pendingModalTrigger bez ofert = deadlock „tylko kapituluj",
    // wykryty benchmarkiem B0 — graveyard vs black, pusty stół wroga).
    const anyModeAvailable = trigger.modes.some((mode) => {
      const spec = mode.targets?.[0];
      if (!spec) return true;
      return triggerTargetCandidates(state, spec, source, extra ?? {}).length > 0;
    });
    if (!anyModeAvailable) {
      const skipped = event('trigger_resolved', {
        objectId: source.id, cardId: source.cardId,
        trigger: trigger.event ?? null, noEffect: true, reason: 'no_targets',
      });
      state.events.push(skipped);
      events.push(skipped);
      return false;
    }
    state.pendingModalTrigger = {
      playerId: source.controllerId,
      sourceId: source.id,
      cardId: source.cardId,
      ability: Object.freeze({ ...ability }),
      modes: trigger.modes.map((m) => Object.freeze({ ...m, name: m.name ?? null })),
      extra: Object.freeze({ ...extra }),
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = source.controllerId;
    const required = event('modal_trigger_required', {
      playerId: source.controllerId, sourceId: source.id, cardId: source.cardId,
      modeCount: trigger.modes.length,
    });
    state.events.push(required);
    events.push(required);
    return true;
  }
  if (!canPayTrigger(state, source.controllerId, trigger)) return false;
  return fireOrQueuePay(state, ability, source, [], events, extra);
}

/**
 * Temat 8 — opcjonalne płatności triggerów („you may pay ... When you do, ...":
 * Panic Spellbomb {R}, Zoraline {W}{B} i 2 życia) to DECYZJA gracza, a nie
 * automat. Gdy trigger niesie payMana/payLife (bez sacrificeIfUnpaid),
 * kolejkujemy resolve_optional_pay_choice; po wyborze „tak" komenda płaci
 * i odpala trigger (z zachowanym kontekstem zdarzenia). Przy „nie" trigger
 * po prostu nie odpala. Dla triggerów z requiresTarget (Zoraline) płatność
 * poprzedza decyzję CELU (requiresTargetDecision).
 */
function fireOrQueuePay(state, ability, source, triggerTargets, events, extra, { requiresTargetDecision = false } = {}) {
  const trigger = ability?.trigger ?? {};
  const hasPay = (trigger.payMana ?? 0) > 0 || (trigger.payLife ?? 0) > 0;
  if (hasPay && !trigger.sacrificeIfUnpaid) {
    state.pendingOptionalPay = {
      playerId: source.controllerId,
      sourceId: source.id,
      ability: Object.freeze({ ...ability }),
      targetId: triggerTargets[0] ?? null,
      extra: Object.freeze({ ...extra }),
      restorePriorityTo: state.turn.priorityPlayerId,
      requiresTargetDecision: Boolean(requiresTargetDecision),
    };
    state.turn.priorityPlayerId = source.controllerId;
    const required = event('optional_pay_required', {
      playerId: source.controllerId, sourceId: source.id, cardId: source.cardId,
      payMana: trigger.payMana ?? 0, payLife: trigger.payLife ?? 0,
      // M265 (Żywy Tester, worek-basni vs final-fantasy seed 303): koszt bywa
      // KOLOROWY (Zoraline {W}{B}, Furious Forebear {1}{W}). Bez pipów opis
      // zdarzenia pisał generyczne „{2}" — cenę, której w grze nie ma —
      // podczas gdy przycisk decyzji (playerView.costColors) pokazywał
      // prawidłowe {W}{B}. Zdarzenie musi nieść ten sam koszt co komenda.
      payColors: trigger.payColors ?? [],
    });
    state.events.push(required);
    events.push(required);
    return true;
  }
  // Kontekst zdarzenia (extra) trafia do efektów triggera: manaSpent rzutu
  // (Tellah), enteredControllerId landa przeciwnika (Nightshade Harvester),
  // graveyardCardId karty do grobu (Disa) — wędruje z wpisem na stos
  // (T6: rozstrzygnięcie po rundzie passów). Bez tego triggery z danymi
  // zdarzenia ginęły cicho (root cause: tryFire upuszczał extra).
  queueTriggerToStack(state, ability, source, triggerTargets, events, extra);
  return true;
}

/**
 * „Whenever a [subtype] permanent card is put into your graveyard from
 * anywhere other than the battlefield, put it onto the battlefield" (Disa
 * the Restless — Lhurgoyf): trigger skanuje wejścia KART do grobu kontrolera
 * spoza pola bitwy (odrzucenie, mill, wygnanie, czar skontrowany). Deskryptor
 * niesie filtr podtypu (trigger.subtypes), a zdarzenie przekazuje konkretną
 * kartę w kontekście (graveyardCardId — efekt czyta ją z context).
 */
function fireCardIntoGraveyardFromNonbattlefield(state, ev, entered, events) {
  if (!entered || entered.name != null) return; // tokeny nie są kartami
  if (entered.kind === 'spell' || entered.kind === 'land') return; // nie permanent card
  for (const source of state.objects.values()) {
    if (source.zone !== 'battlefield') continue;
    for (const ability of effectiveAbilities(source)) {
      if (ability?.trigger?.event !== 'card_put_into_graveyard_from_nonbattlefield') continue;
      // „Your graveyard" — karta musi wpadać do grobu kontrolera źródła.
      if (entered.controllerId !== source.controllerId) continue;
      // Filtr podtypu (np. Lhurgoyf) — bez niego trigger dotyczy każdej karty.
      const wanted = ability.trigger.subtypes ?? [];
      if (wanted.length > 0 && !(wanted.some((subtype) => (entered.subtypes ?? []).includes(subtype)))) continue;
      tryFire(state, ability, source, [], events, { graveyardCardId: entered.id });
    }
  }
}

/**
 * Przetwarza triggery dla zdarzeń bieżącej komendy; zwraca nowe zdarzenia
 * (i dopisuje je do state.events). Wywoływana PO state-based actions, żeby
 * śmierć w wyniku obrażeń zdążyła wygenerować creature_destroyed.
 */
/**
 * M68 — daybound/nightbound (CR 708.9): GLOBALNY znacznik dnia/nocy, jak
 * inicjatywa. `setDayNight` zmienia designation i transformuje in-place
 * wszystkie permanenty daybound (przy →night) / nightbound (przy →day);
 * zwykłe transform DFC (Civilized Scholar itd.) bez tych keywordów są
 * nietknięte. Zwraca zdarzenia (day_night_changed + transformy).
 */
export function setDayNight(state, designation) {
  if (designation !== 'day' && designation !== 'night') throw new RangeError('Zły designation dnia/nocy');
  if (state.dayNight === designation) return [];
  state.dayNight = designation;
  const events = [event('day_night_changed', { designation })];
  state.events.push(events[0]);
  const transformKeyword = designation === 'night' ? 'daybound' : 'nightbound';
  for (const object of state.objects.values()) {
    if (object.zone !== 'battlefield') continue;
    if (!(object.keywords ?? []).includes(transformKeyword)) continue;
    if (!object.transformTo) continue;
    const before = state.events.length;
    applyEffect(state, { type: 'transform' }, object, []);
    events.push(...state.events.slice(before));
  }
  return events;
}

/**
 * CR 502.2 / 730.2: na początku tury, PRZED untapem, dzień/noc zmienia się
 * wg liczby czarów POPRZEDNIEGO aktywnego gracza:
 * - dzień i 0 czarów → noc;
 * - noc i ≥2 czary → dzień.
 * `previousActivePlayerId` = gracz, którego tura właśnie się skończyła.
 * `lastTurnSpellsCastByPlayer` musi już zawierać jego rzuty z tej tury.
 */
export function applyDayNightAtTurnStart(state, previousActivePlayerId) {
  if (state.dayNight !== 'day' && state.dayNight !== 'night') return [];
  const prevCasts = state.lastTurnSpellsCastByPlayer?.[previousActivePlayerId] ?? 0;
  if (state.dayNight === 'day' && prevCasts === 0) return setDayNight(state, 'night');
  if (state.dayNight === 'night' && prevCasts >= 2) return setDayNight(state, 'day');
  return [];
}

/**
 * M201/A1 (zgłoszenie właściciela, Mindstab — klasa L24/L6): skan triggerów
 * dopisywał część zdarzeń WYŁĄCZNIE do `state.events` (zdjęcie licznika czasu
 * suspend, gotowość rebound), a warstwa opisu czyta strumień KOMENDY — więc
 * przez cztery tury zawieszenia log i „Rozgrywka” milczały. Zamiast łatać
 * pojedyncze gałęzie (byłaby to trzecia kopia tej samej pomyłki) zamykamy
 * lukę w JEDNYM miejscu: wszystko, co skan dopisał do stanu, wraca do
 * wywołującego — w kolejności zapisu i bez duplikatów (zdarzenia są zamrożone,
 * więc porównujemy tożsamościowo).
 */
/**
 * Triggery wejścia wchodzącego permanentu — wspólna ścieżka dla zwykłego
 * wejścia (odpala od razu) i wejścia z devour (CR 702.82a: devour to
 * ZASTĘPCZY efekt — liczniki lądują na permanencie, zanim odpali się
 * jakikolwiek trigger ETB; triggery wchodzą więc po rozstrzygnięciu
 * decyzji, patrz deferredDevourEtb w processTriggersScan):
 * 1) własne „enter_battlefield" (firePayOrSacrifice dla obowiązkowej
 *    płatności sacrifice-unless-you-pay, tryFire dla reszty);
 * 2) triggery INNYCH permanentów (another_creature_enters, landfall,
 *    creature_you_control_enters — Impact Tremors — itd.).
 */
function fireEnterBattlefieldTriggers(state, entered, events, context = {}) {
  for (const ability of effectiveAbilities(entered)) {
    if (ability?.trigger?.event !== 'enter_battlefield') continue;
    // Obowiązkowa płatność typu „sacrifice unless you pay" to nie „you may"
    // — osobna, deterministyczna ścieżka (firePayOrSacrifice).
    if (ability.trigger?.sacrificeIfUnpaid) {
      firePayOrSacrifice(state, ability, entered, events);
      continue;
    }
    // Batch 24 (Mystic Sanctuary): „When this land enters UNTAPPED" —
    // kontekst zdarzenia niesie stan wejścia (tapped) do conditionHolds.
    tryFire(state, ability, entered, [], events, { enteredTapped: context.enteredTapped ?? Boolean(entered.tapped) });
  }
  // Triggery innych permanentów na wejście obiektu:
  // - „another_creature_enters" (Midnight Guard): wejście INNEGO stwora
  //   odkręca źródło (CR 603.2d — źródło nie jest tym, które weszło);
  // - „land_entered_under_your_control" (landfall, np. Skyclave Geopede):
  //   wejście landa pod kontrolą źródła.
  for (const source of state.objects.values()) {
    if (source.zone !== 'battlefield') continue;
    for (const ability of effectiveAbilities(source)) {
      const triggerEvent = ability?.trigger?.event;
      if (triggerEvent === 'another_creature_enters') {
        // Batch 45 (Ivy Lane Denizen): deskryptor może zawężać trigger do
        // stworów KONTROLERA źródła (youControl) i/lub koloru
        // (colorsInclude) — Midnight Guard bez pól działa jak dotąd.
        const tt = ability.trigger ?? {};
        const controlOk = !tt.youControl || entered.controllerId === source.controllerId;
        const colorOk = !tt.colorsInclude?.length
          || (entered.colors ?? []).some((c) => tt.colorsInclude.includes(c));
        if (entered.kind === 'creature' && source.id !== entered.id && controlOk && colorOk) {
          tryFire(state, ability, source, [], events);
        }
      } else if (triggerEvent === 'land_entered_under_your_control') {
        if (entered.kind === 'land' && entered.controllerId === source.controllerId) {
          tryFire(state, ability, source, [], events);
        }
      } else if (triggerEvent === 'creature_you_control_enters') {
        // Impact Tremors: „Whenever a creature you control enters" — dowolny
        // stwór wchodzący pod kontrolą źródła (źródło to enchantment).
        if (entered.kind === 'creature' && entered.controllerId === source.controllerId) {
          tryFire(state, ability, source, [], events);
        }
      } else if (triggerEvent === 'enchantment_you_control_enters') {
        // Constellation (CR 702.131): enchantment you control enters.
        const isEnch = entered.kind === 'enchantment' || (entered.types ?? []).includes('Enchantment');
        if (isEnch && entered.controllerId === source.controllerId) {
          tryFire(state, ability, source, [], events);
        }
      } else if (triggerEvent === 'artifact_you_control_enters') {
        // Steelfin Whale: „Whenever an artifact you control enters, untap
        // this creature" — dowolny artefakt wchodzący pod kontrolą źródła
        // (także artifact creature i samo źródło, gdy jest artefaktem).
        const isArt = entered.kind === 'artifact' || (entered.types ?? []).includes('Artifact');
        if (isArt && entered.controllerId === source.controllerId) {
          tryFire(state, ability, source, [], events);
        }
      } else if (triggerEvent === 'land_entered_under_opponent_control') {
        // Nightshade Harvester: „Whenever a land an opponent controls
        // enters, that player loses 1 life" — kontroler wchodzącego landa
        // (nie kontroler źródła) trafia w kontekście zdarzenia.
        if (entered.kind === 'land' && entered.controllerId !== source.controllerId) {
          tryFire(state, ability, source, [], events, { enteredControllerId: entered.controllerId });
        }
      }
    }
  }
}

export function processTriggers(state, recentEvents) {
  const stateEventsStart = state.events.length;
  const produced = processTriggersScan(state, recentEvents);
  const fromState = state.events.slice(stateEventsStart);
  const seen = new Set(fromState);
  return [...fromState, ...produced.filter((e) => !seen.has(e))];
}

function processTriggersScan(state, recentEvents) {
  const events = [];
  // Kontrolerzy, których permanenty opuściły pole bitwy w tej komendzie —
  // trigger „one or more permanents you control leave the battlefield"
  // odpala się RAZ na komendę, nie raz na permanent (CR 603.2).
  const leftBattlefield = new Set();
  // Instancje grupowych wyzwalaczy „one or more … deal combat damage to a
  // player” (Disa the Restless, Vaan, Street Thief), które już odpaliły w tej
  // komendzie. KLUCZ = żywiciel zdolności + jej indeks + filtr podtypów +
  // poszkodowany, bo grupowanie CR 603.2 scala ZDARZENIE (dwa stwory atakujące
  // razem to jeden wyzwalacz jednej instancji), a NIE sprawcę: KAŻDA instancja
  // zdolności wyzwala osobno (CR 603.3). Dedup po samym kontrolerze kasował
  // drugą kopię karty — audyt PR #92, znalezisko 4.
  const groupedCombatDamageFires = new Set();
  // Gracze, którzy w tej komendzie otrzymali combat damage — trigger
  // „whenever you're dealt combat damage" (Contested Game Ball) odpala się
  // RAZ na zadanie obrażeń, nie raz na atakującego (ruling WotC, M201/N2).
  const combatDamagedPlayers = new Set();
  /**
   * „You descended this turn" (CR 700.x, Canonized in Blood): gdy PERMANENT
   * CARD (nie token, nie czar) trafia do grobu gracza z dowolnej strefy.
   * Liczymy po kontrolerze obiektu (do czyjego grobu wpadł).
   */
  const markDescended = (object) => {
    if (!object) return;
    const isPermanentCard = object.name == null && object.kind !== 'spell';
    if (!isPermanentCard) return;
    if (!state.descendedThisTurn[object.controllerId]) {
      state.descendedThisTurn = { ...state.descendedThisTurn, [object.controllerId]: true };
    }
  };
  // Kolejka zdarzeń do skanu triggerów (CR 603.2): zdarzenia bieżącej
  // komendy ORAZ zdarzenia wytworzone przez ROZSTRZYGNĘTE triggery — trigger
  // rozstrzygnięty przed nadaniem priorytetu jest już faktem, więc triggery
  // od jego zdarzeń (np. delirium od obrażeń ETB Fear of Burning Alive,
  // odkręcenie Midnight Guard po tokenie z ETB Herdcallera) odpalają się w
  // TEJ SAMEJ komendzie. Każde zdarzenie skanowane dokładnie raz; CAP to
  // deterministyczny hamulec inżynierski przed nieograniczoną reakcją
  // łańcuchową (obecny katalog cykli nie produkuje — to granica stabilności
  // silnika, nie reguła MtG).
  const MAX_TRIGGER_EVENTS_SCANNED = 512;
  const queue = [...recentEvents];
  const aggregatedControllers = new Set();
  let scanned = 0;
  let idx = 0;
  const processEvent = (ev) => {
    // Wspólna ścieżka triggerów śmierci (CR 603.2/700.4): „dies" odpala się
    // przy KAŻDEJ zmianie strefy battlefield → graveyard, niezależnie od
    // przyczyny (obrażenia SBA, zniszczenie efektem, poświęcenie, prawo
    // legend). Wcześniej skan obejmował wyłącznie zgony SBA (creature_destroyed)
    // i object_moved — poświęcenia (Village Rites, devour) i zniszczenia
    // (Bone Splinters, Shatter) cicho gubiły triggery dies.
    const fireDeathTriggers = (died, simultaneousFellows = [], formerId = null) => {
      markDescended(died);
      if (!died) return;
      // Time to Feed (THS, CR 603.7a): opóźniony trigger „When that creature
      // dies this turn, you gain N life" — znacznik założony przy rozstrzyganiu
      // czaru na KONKRETNY obiekt. Odpala się raz, przy jego śmierci; wpis
      // znika z listy (reszta znaczników czeka do cleanup).
      // UWAGA (CR 400.7): obiekt w grobie to NOWY obiekt z NOWYM id, a znacznik
      // trzyma id z pola bitwy — dlatego dopasowujemy też `formerId` (LKI).
      const lifeMarks = state.gainLifeIfDiesThisTurn ?? [];
      if (lifeMarks.length > 0) {
        const deadIds = new Set([died.id, formerId].filter((id) => id != null));
        const fired = lifeMarks.filter((entry) => deadIds.has(entry.objectId));
        if (fired.length > 0) {
          state.gainLifeIfDiesThisTurn = lifeMarks.filter((entry) => !deadIds.has(entry.objectId));
          for (const entry of fired) {
            if (!state.players.some((pl) => pl.id === entry.playerId)) continue;
            // Jedyna droga zmiany życia (players.changeLife) — emituje
            // life_changed, które czyta log stołu i SBA.
            changeLife(state, entry.playerId, entry.amount);
          }
        }
      }
      for (const ability of abilitiesOnDeath(died)) {
        // M108 (Murder of Crows): „whenever ANOTHER creature dies" — źródło
        // nie liczy własnej śmierci (excludeSelf w deskryptorze triggera).
        if (ability?.trigger?.event === 'any_creature_dies' && ability.trigger.excludeSelf) continue;
        if (ability?.trigger?.event === 'dies' || ability?.trigger?.event === 'any_creature_dies') {
          // M67 (Guildsworn): LKI „wasn't blocking" — flaga z chwili śmierci.
          tryFire(state, ability, died, [], events, { wasBlocking: died?.isBlockingThisCombat === true });
        }
      }
      // M200/D+E2 (uwagi właściciela, CR 700.4c): „die” dotyczy STWORÓW —
      // poświęcenie/zniszczenie lądu lub artefaktu (Blazing Torch, Rupture
      // Spire) NIE jest śmiercią i nie może odpalać any_creature_dies.
      // Dotąd Selhoff Occultist mielił kartę przy każdym poświęceniu
      // jakiegokolwiek permanentu („trigger zadziałał dwa razy” = fałszywy
      // trigger na poświęcony artefakt + prawdziwy na zginętego stwora).
      const diedIsCreature = died?.kind === 'creature' || (died?.types ?? []).includes('Creature');
      // M160/A (Selhoff Occultist, CR 603.10a): przy JEDNOCZESNYCH zgonach
      // (jeden przebieg SBA — walka, masowe -X/-X) zdolności
      // any_creature_dies stworów, które zginęły RAZEM z `died`, też odpalają
      // — „patrzą wstecz” na stół sprzed zdarzenia. Pętla po polu bitwy niżej
      // ich nie widzi (leżą już w grobie), więc czytamy LKI współpoległych
      // ze zdarzeń tej samej partii SBA. Własna śmierć (fellow === died)
      // odpaliła wyżej — tu wyłącznie CUDZE zgony, więc excludeSelf
      // („another creature dies”) również się liczy.
      for (const fellow of simultaneousFellows) {
        if (!fellow || fellow.id === died.id) continue;
        const fellowIsCreature = fellow?.kind === 'creature'
          || (fellow?.types ?? []).includes('Creature');
        if (!fellowIsCreature) continue;
        for (const ability of abilitiesOnDeath(fellow)) {
          if (ability?.trigger?.event === 'any_creature_dies') {
            tryFire(state, ability, fellow, [], events);
          }
        }
      }
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.id === died.id) continue;
        for (const ability of effectiveAbilities(source)) {
          if (diedIsCreature && ability?.trigger?.event === 'any_creature_dies') tryFire(state, ability, source, [], events);
        }
        // Necrosquito (ONE): „Whenever ANOTHER creature or artifact you control
        // is put into a graveyard from the battlefield, put an oil counter on
        // this creature." Trigger skanuje INNE permanenty kontrolera źródła,
        // które zginęły (nie samego źródła), i jest stworem LUB artefaktem.
        const isCreatureOrArtifact = died?.kind === 'creature' || died?.kind === 'artifact'
          || (died?.types ?? []).includes('Creature') || (died?.types ?? []).includes('Artifact');
        if (!isCreatureOrArtifact) continue;
        if (died?.controllerId !== source.controllerId) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'other_permanent_you_control_dies') tryFire(state, ability, source, [], events);
        }
      }
      // Furious Forebear (TDM): „Whenever a creature you control dies while
      // this card is in your graveyard, you may pay {1}{W}. If you do, return
      // this card from your graveyard to your hand." — trigger ze źródłem
      // w GROBIE (karta), odpala się na śmierć kontrolowanego stwora.
      for (const source of state.objects.values()) {
        if (source.zone !== 'graveyard') continue;
        if (died?.kind !== 'creature' || died?.controllerId !== source.controllerId) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'other_creature_you_control_dies') {
            tryFire(state, ability, source, [], events, { diedCardId: died.cardId });
          }
        }
      }
    };
    if (ev.type === 'creature_destroyed') {
      // Finality (exile) NIE uruchamia triggera „dies" (CR 122.1b — obiekt
      // nie umiera, jest wygnany).
      if (ev.toZone === 'exile') return;
      // M160/A: współzgony tej samej partii SBA (simultaneousIds) — LKI
      // poległych źródeł z ich zdarzeń śmierci w bieżącej kolejce skanu.
      const fellows = (ev.simultaneousIds ?? []).length > 1
        ? queue
          .filter((sibling) => sibling !== ev && sibling.type === 'creature_destroyed'
            && sibling.toZone !== 'exile'
            && (ev.simultaneousIds ?? []).includes(sibling.fromId))
          .map((sibling) => state.objects.get(sibling.toId) ?? sibling.object)
        : [];
      // M160/A: TOKEN po śmierci przestaje istnieć (SBA CR 704.5e usuwa
      // trupa z grobu) — bez fallbacku na LKI zdarzenia śmierć tokena była
      // NIEWIDZIALNA dla triggerów any_creature_dies (fireDeathTriggers
      // dostawał undefined i wychodził).
      fireDeathTriggers(state.objects.get(ev.toId) ?? ev.object, fellows, ev.fromId);
    }
    if (ev.type === 'permanent_sacrificed') {
      if (ev.toZone === 'exile') return; // finality
      fireDeathTriggers(state.objects.get(ev.objectId) ?? ev.object, [], ev.objectId);
    }
    if (ev.type === 'permanent_destroyed') {
      if (ev.toZone === 'exile') return; // finality
      fireDeathTriggers(state.objects.get(ev.objectId) ?? ev.object, [], ev.objectId);
    }
    // „Whenever one or more permanents you control leave the battlefield"
    // (Nefarious Imp). Jedno zdarzenie = jedno odejście; CR 603.2 mówi
    // „one or more", ale w engine każde odejście generuje osobne zdarzenie,
    // więc grupujemy je po komendzie (patrz leftBattlefieldControllers niżej).
    // M254/D (zgłoszenie właściciela, Wormfang Newt): `permanent_destroyed`
    // (zniszczenie EFEKTEM — Spin Out, Murder) nie było tu w ogóle
    // uwzględnione, choć śmierć z OBRAŻEŃ (`creature_destroyed`, SBA) i
    // poświęcenie były. Skutek: „When this creature leaves the battlefield"
    // nie odpalało się po zniszczeniu karty czarem, więc wygnany ląd Newta
    // zostawał w exile na zawsze. To samo dotyczy triggerów „permanents you
    // control leave the battlefield" (Nefarious Imp) — licznik odejść wyżej.
    if (ev.type === 'creature_destroyed' || ev.type === 'permanent_destroyed'
      || ev.type === 'permanent_sacrificed'
      || (ev.type === 'object_moved' && ev.fromZone === 'battlefield' && ev.toZone !== 'battlefield')
      || (ev.type === 'object_exiled' && ev.fromId)) {
      // CR 603.10: obiekt mógł już przestać istnieć (token poza polem bitwy —
      // SBA CR 704.5e), więc po nieudanym odczycie ze stanu sięgamy po LKI
      // niesione w samym zdarzeniu. Bez tego trigger „whenever permanents you
      // control leave the battlefield" nie widział odchodzących TOKENÓW.
      const gone = ev.type === 'permanent_sacrificed'
        ? (state.objects.get(ev.objectId) ?? ev.object)
        : (state.objects.get(ev.toId) ?? state.objects.get(ev.object?.id) ?? state.objects.get(ev.objectId) ?? ev.object);
      if (gone?.controllerId) leftBattlefield.add(gone.controllerId);
      // „When this creature leaves the battlefield" (Fear of Abduction —
      // powrót wygnanych kart): trigger własny obiektu na ODEJŚCIE z pola bitwy
      // (dowolna strefa docelowa: ręka, exile, grób — CR 603.6c). Uwaga:
      // obiekt po zmianie strefy to NOWY obiekt (CR 400.7) — zdolności
      // czytamy z LKI (formerAbilityGrants + abilities) przez abilitiesOnDeath.
      if (gone) {
        for (const ability of abilitiesOnDeath(gone)) {
          if (ability?.trigger?.event === 'leaves_battlefield') {
            tryFire(state, ability, gone, [], events);
          }
        }
      }
    }
    if (ev.type === 'object_moved' && ev.fromZone === 'battlefield' && ev.toZone === 'graveyard') {
      // Finality obsługują ścieżki zdarzeń z toZone (creature_destroyed itd.);
      // object_moved bez toZone-exile = zwykła śmierć (np. prawo legend).
      fireDeathTriggers(state.objects.get(ev.object?.id), [], ev.fromId ?? ev.object?.id);
    }
    // Descended: permanent card wpada do grobu z ręki (odrzucenie), milla
    // albo poświęcenia — liczymy po kontrolerze docelowego obiektu.
    if (ev.type === 'permanent_sacrificed') markDescended(state.objects.get(ev.objectId));
    if (ev.type === 'card_discarded' || ev.type === 'card_milled') {
      const enteredGrave = state.objects.get(ev.objectId);
      markDescended(enteredGrave);
      // Wejście karty do grobu z ręki/biblioteki (nie z pola bitwy) — trigger
      // Disa the Restless („from anywhere other than the battlefield").
      fireCardIntoGraveyardFromNonbattlefield(state, ev, enteredGrave, events);
    }
    if (ev.type === 'object_moved' && ev.toZone === 'graveyard') {
      const enteredGrave = state.objects.get(ev.object?.id);
      markDescended(enteredGrave);
      if (ev.fromZone !== 'battlefield' && enteredGrave) {
        fireCardIntoGraveyardFromNonbattlefield(state, ev, enteredGrave, events);
      }
    }
    // M69 (Exploit): „When this creature exploits a creature, ..." — zdarzenie
    // exploited emituje resolve_exploit_choice po poświęceniu; trigger z
    // event 'exploits' odpala się na źródle (exploiterze), extra niesie
    // exploitedId (LKI poświęconego).
    // M177/B (Rakshasa Vizier): „Whenever one or more cards are put into
    // exile from your graveyard” — skan zdarzeń object_moved grób→exile
    // (koszt Maulera, escape i każda przyszła ścieżka używająca tej samej
    // konwencji zdarzeń). Każde zdarzenie = 1 karta (exiledCount w context).
    if (ev.type === 'object_moved' && ev.fromZone === 'graveyard' && ev.toZone === 'exile') {
      const graveOwnerId = ev.object?.controllerId ?? null;
      if (graveOwnerId) {
        for (const source of state.objects.values()) {
          if (source.zone !== 'battlefield') continue;
          for (const ability of effectiveAbilities(source)) {
            if (ability?.trigger?.event !== 'cards_exiled_from_your_graveyard') continue;
            if (source.controllerId !== graveOwnerId) continue;
            tryFire(state, ability, source, [], events, { exiledCount: 1 });
          }
        }
      }
    }
    if (ev.type === 'exploited') {
      const exploiter = state.objects.get(ev.exploiterId);
      if (exploiter && exploiter.zone === 'battlefield') {
        for (const ability of effectiveAbilities(exploiter)) {
          if (ability?.trigger?.event === 'exploits') {
            tryFire(state, ability, exploiter, [], events, { exploitedId: ev.exploitedId });
          }
        }
      }
    }
    // M166/B (Enrage, RIX — Cacophodon): „Whenever this creature is dealt
    // damage" — dowolne obrażenia STWORA (combat i niecombat; amount > 0,
    // CR 119.3 — w pełni zapobiegnięte nie odpala). Obiekt po id ze
    // zdarzenia ALBO targetLki (CR 603.10 looks-back — stwór zginął w SBA
    // tej samej komendy); komentarz zaktualizowany w M171 (audyt PR #68,
    // U1 — kod niżej CZYTA ev.targetLki, stara wersja notki temu przeczyła).
    if (ev.type === 'damage_dealt' && ev.amount > 0 && !isPlayerId(state, ev.target)) {
      // Obiekt na polu bitwy ALBO LKI ze zdarzenia (stwór zginął w SBA tej
      // samej komendy — trigger „looks back", CR 603.10). Zdolności czytamy
      // z LKI; efekty celują niezależnie (źródło triggera nie musi żyć).
      const victim = state.objects.get(ev.target) ?? ev.targetLki ?? null;
      if (victim && victim.kind === 'creature'
        && (state.objects.get(ev.target)?.zone === 'battlefield' || ev.targetLki)) {
        for (const ability of effectiveAbilities(victim)) {
          if (ability?.trigger?.event === 'dealt_damage') {
            tryFire(state, ability, victim, [], events, { damageAmount: ev.amount, damageSourceId: ev.source });
          }
        }
        // Batch 45 (Pain for All): „Whenever enchanted creature is dealt
        // damage" — trigger na AURZE przypiętej do poszkodowanego stwora
        // (źródłem triggera jest aura; kwota w kontekście zdarzenia).
        for (const attachment of [...state.objects.values()]) {
          if (attachment.zone !== 'battlefield' || attachment.attachedTo !== ev.target) continue;
          for (const ability of effectiveAbilities(attachment)) {
            if (ability?.trigger?.event === 'enchanted_creature_dealt_damage') {
              tryFire(state, ability, attachment, [], events, { damageAmount: ev.amount, damageSourceId: ev.source });
            }
          }
        }
      }
    }
    // Curiosity (ISD): „Whenever enchanted creature deals damage to an
    // opponent, you may draw a card." — KAŻDE obrażenia (combat i niecombat,
    // CR 119.3: tylko faktycznie zadane, amount > 0) zaczarowanego stwora do
    // gracza-PRZECIWNIKA kontrolera aury. Trigger siedzi na aurze; extra niesie
    // damagedPlayerId i sourceCreatureId (LKI jeśli stwór zginął w tej samej
    // komendzie — źródło aury). Audyt PR #41 (B3): wcześniej tylko combat.
    if (ev.type === 'damage_dealt' && isPlayerId(state, ev.target) && ev.amount > 0) {
      const dmgSource = state.objects.get(ev.source);
      if (dmgSource && dmgSource.zone === 'battlefield' && dmgSource.kind === 'creature') {
        for (const aura of state.objects.values()) {
          if (aura.zone !== 'battlefield' || aura.attachedTo !== dmgSource.id) continue;
          // „deals damage to an OPPONENT" — obrażenia do siebie lub sojusznika
          // kontrolera aury nie odpalają triggera.
          if (ev.target === aura.controllerId) continue;
          for (const ability of effectiveAbilities(aura)) {
            if (ability?.trigger?.event === 'enchanted_creature_damage_to_opponent') {
              tryFire(state, ability, aura, [], events, { damagedPlayerId: ev.target, sourceCreatureId: dmgSource.id });
            }
          }
        }
      }
    }
    // ev.amount > 0: w pełni zapobiegnięte obrażenia NIE są zadane (CR 119.3) —
    // triggery „deals combat damage" nie odpalają się przy 0 zadanych.
    if (ev.type === 'damage_dealt' && ev.combat !== false && isPlayerId(state, ev.target) && ev.amount > 0) {
      // M201 (znalezisko #2, CR 603.10/603.10a): dotąd stała tu bramka
      // „źródło musi wciąż być na polu bitwy” z instrukcją `return`, która
      // przerywała przetwarzanie CAŁEGO zdarzenia. Gdy atakujący z trample
      // ginął od blokera (obrażenia są jednoczesne — CR 510.2), przepadały
      // naraz: trigger obrońcy („whenever you're dealt combat damage”),
      // własny trigger źródła („deals combat damage to a player” — zdarzenie
      // zaszło, gdy stwór jeszcze istniał), grupowy trigger kontrolera
      // (Disa) i przejęcie inicjatywy (CR 725).
      // Zdolności czytamy z LKI zdarzenia; brak jakiejkolwiek informacji
      // o źródle = pomijamy WYŁĄCZNIE gałęzie źródła, nie całe zdarzenie.
      const source = state.objects.get(ev.source) ?? ev.sourceLki ?? null;
      // Speed (DFT „Start your engines!"): wzrost raz na turę aktywnego gracza
      // przy obrażeniach combat przeciwnika (max 4) — patrz bumpSpeedIfOpponentDamaged.
      if (source) bumpSpeedIfOpponentDamaged(state, source);
      // Inicjatywa (CR 725): stwory zadające combat damage posiadaczowi
      // inicjatywy przejmują ją (karta The Initiative; podstawa Underdark
      // Explorer). Pierwsze objęcie inicjatywy = venture do lochu.
      if (source && state.initiativePlayerId === ev.target && source.controllerId !== state.initiativePlayerId) {
        const before = state.events.length;
        applyEffect(state, { type: 'take_initiative' }, source, []);
        events.push(...state.events.slice(before));
      }
      for (const ability of effectiveAbilities(source ?? {})) {
        if (ability?.trigger?.event === 'combat_damage_to_player') {
          tryFire(state, ability, source, [], events, { damagedPlayerId: ev.target });
        }
      }
      // Batch 48 (Contested Game Ball, LCI): „Whenever you're dealt combat
      // damage…" — źródłem triggera jest dowolny permanent kontrolowany przez
      // GRACZA, KTÓRY OTRZYMAŁ obrażenia (trigger siedzi na artefakcie, nie na
      // stwora, który zadaje). Zdarzenie damage_dealt per obrażenie — trigger
      // odpala się per zdarzenie (CR 603.2: „whenever" na każdym zdarzeniu).
      // M201/N2 (audyt PR #72, ruling WotC 2023-11-10): trigger odpala się
      // RAZ na zadanie obrażeń, „no matter how many creatures deal combat
      // damage to you at the same time” — obrażenia bojowe są jednoczesne
      // (CR 510.2), a strumień zdarzeń jest per źródło. Grupujemy po
      // poszkodowanym graczu w obrębie komendy (wzór: Disa the Restless).
      if (!combatDamagedPlayers.has(ev.target)) {
        combatDamagedPlayers.add(ev.target);
        for (const candidate of state.objects.values()) {
          if (candidate.zone !== 'battlefield' || candidate.controllerId !== ev.target) continue;
          for (const ability of effectiveAbilities(candidate)) {
            if (ability?.trigger?.event !== 'combat_damage_to_you') continue;
            // Warunek intervening-if sprawdza tryFire z PEŁNYM extra (dane
            // zdarzenia) — pre-check z pustym eventData cicho uciszałby warunki
            // czytające dane zdarzenia (M200/O-N3; wzór: any_combat_damage).
            // Atakujący jedzie w zdarzeniu (state.combat jest już null po
            // end_of_combat).
            tryFire(state, ability, candidate, [], events, {
              damagedPlayerId: ev.target, attackingPlayerId: ev.attackingPlayerId ?? null,
            });
          }
        }
      }
      // „Whenever one or more creatures you control deal combat damage to a
      // player" (Disa the Restless, CR 603.2): trigger odpala się RAZ na
      // komendę, gdy DOWOLNY stwór kontrolera źródła zadał obrażenia graczowi
      // (grupowanie jak leftBattlefield — zdarzenie per stwór, trigger per
      // INSTANCJĘ zdolności). Źródło triggera samo może być stworem lub nie (Disa).
      if (source) {
        // Vaan, Street Thief (FIN): „Whenever one or more Scouts, Pirates,
        // and/or Rogues you control deal combat damage to a player" — trigger
        // z FILTREM PODTYPÓW na stworze zadającym obrażenia. Filtr wchodzi do
        // KLUCZA grupowania, bo stwór spoza podtypów nie może oznaczyć wszystkiego
        // jako „obsłużonego”: późniejszy trafny stwór w tej samej walce musi
        // odpalić zdolność. Klucz liczy się od INSTANCJI zdolności (żywiciel +
        // indeks + poszkodowany), nie od kontrolera — dwie kopie karty z tym
        // triggerem wyzwalają dwa razy (CR 603.3).
        const dealtSubtypes = source.subtypes ?? [];
        for (const candidate of state.objects.values()) {
          if (candidate.zone !== 'battlefield' || candidate.controllerId !== source.controllerId) continue;
          for (const [abilityIndex, ability] of effectiveAbilities(candidate).entries()) {
            if (ability?.trigger?.event !== 'any_combat_damage_to_player') continue;
            const filter = ability.trigger.subtypes;
            if (filter?.length && !dealtSubtypes.some((sub) => filter.includes(sub))) continue;
            const key = `${candidate.id}#${abilityIndex}|`
              + `${filter?.length ? [...filter].sort().join(',') : 'any'}|${ev.target ?? ''}`;
            if (groupedCombatDamageFires.has(key)) continue;
            groupedCombatDamageFires.add(key);
            tryFire(state, ability, candidate, [], events, { damagedPlayerId: ev.target });
          }
        }
      }
    }
    // „Whenever a source you control deals noncombat damage to an opponent"
    // (Fear of Burning Alive — Delirium): zdarzenie damage_dealt z flagą
    // combat === false, którego CEL jest graczem (obrażenia w stwora nie
    // odpalają — „to an opponent\"). Źródłem obrażeń (ev.source) może być
    // czar już po rozstrzygnięciu — czytamy kontrolera z ostatniej znanej
    // informacji obiektu (spelle w grobie zachowują controllerId). Cel
    // (stwór poszkodowanego gracza) wybiera KONTROLER triggera blokującą
    // decyzją resolve_delirium_target — jak wybory pokoi lochu (M24).
    if (ev.type === 'damage_dealt' && ev.combat === false && isPlayerId(state, ev.target) && ev.amount > 0) {
      const damageSource = state.objects.get(ev.source);
      const damageControllerId = damageSource?.controllerId ?? null;
      if (!damageControllerId || damageControllerId === ev.target) return;
      // Speed (DFT „Start your engines!"): wzrost także przy obrażeniach
      // niecombat (max 4, raz na turę aktywnego gracza).
      bumpSpeedIfOpponentDamaged(state, damageSource);
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.controllerId !== damageControllerId) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event !== 'noncombat_damage_to_opponent') continue;
          // Warunek intervening-if (delirium) sprawdzany przy odpaleniu;
          // powtórzony przy rozstrzyganiu celu (stan grobu mógł się zmienić)
          // — reguła CR 702.34 wymaga weryfikacji w obu momentach.
          if (!conditionHolds(ability.trigger, state, source)) continue;
          const candidates = state.zones.battlefield.filter((objectId) => {
            const candidate = state.objects.get(objectId);
            return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
              && candidate.controllerId === ev.target;
          });
          // Trigger bez legalnego celu nie trafia na stos — nie kolejkujemy.
          if (candidates.length === 0) continue;
          state.pendingDeliriumTargets.push({
            playerId: source.controllerId,
            sourceId: source.id,
            amount: ev.amount,
            opponentId: ev.target,
            candidateIds: candidates,
            restorePriorityTo: state.turn.priorityPlayerId,
          });
          state.turn.priorityPlayerId = source.controllerId;
          const required = event('delirium_target_required', {
            playerId: source.controllerId, sourceId: source.id,
            cardId: source.cardId, amount: ev.amount, opponentId: ev.target,
          });
          state.events.push(required); events.push(required);
          const fired = event('ability_triggered', {
            objectId: source.id, cardId: source.cardId,
            trigger: 'noncombat_damage_to_opponent',
          });
          state.events.push(fired); events.push(fired);
        }
      }
    }
    // Wejście na pole bitwy (rozstrzygnięty czar permanentu, powrót z grobu,
    // land drop, rozstrzygnięty czar aury bestow). permanent_cast NIE jest
    // wejściem — od T1 (stos) czar permanenta leży wtedy na stosie i wchodzi
    // dopiero przy rozstrzygnięciu (permanent_entered_battlefield); triggery
    // ETB muszą odpalić się po rundzie passów, nie w chwili rzutu.
    if (ev.type === 'land_played' || ev.type === 'permanent_entered_battlefield' || (ev.type === 'object_moved' && ev.toZone === 'battlefield')) {
      let entered = state.objects.get(ev.object?.id);
      if (!entered) return;
      // CR 730.2c / 702.145: daybound LUB nightbound przy designation=null
      // ustawia dzień (setDayNight transformuje nightbound → daybound).
      // Przy ustalonej designation permanent wchodzi właściwą stroną —
      // także poza resolvePermanentSpell (reanimacja, search, bounce).
      // Cast w nocy już transformuje przed eventem, więc tu widzimy
      // nightbound i nie dublujemy.
      const enterKw = entered.keywords ?? [];
      if (state.dayNight === null && (enterKw.includes('daybound') || enterKw.includes('nightbound'))) {
        setDayNight(state, 'day');
        entered = state.objects.get(entered.id) ?? entered;
      } else if (state.dayNight === 'night' && enterKw.includes('daybound') && entered.transformTo) {
        applyEffect(state, { type: 'transform' }, entered, []);
        entered = state.objects.get(entered.id) ?? entered;
      } else if (state.dayNight === 'day' && enterKw.includes('nightbound') && entered.transformTo) {
        applyEffect(state, { type: 'transform' }, entered, []);
        entered = state.objects.get(entered.id) ?? entered;
      }
      // stworem może być dowolny stwór (także samo źródło; wtedy bez grantu
      // zdolności). Cel wybiera kontroler realną, blokującą decyzją
      // resolve_backup (jak scry) — kolejkowane do state.pendingBackups.
      // Decydent przejmuje priorytet (jak pendingDevours) — ze skanem
      // wieloprzebiegowym stwór z backup może wejść ze zdarzenia TRIGGERA
      // także w komendzie przeciwnika; bez przejęcia priorytetu gra by
      // stanęła (posiadacz priorytetu nie miałby legalnej komendy).
      if (entered.backup && entered.kind === 'creature') {
        state.pendingBackups.push({
          playerId: entered.controllerId,
          sourceId: entered.id,
          cardId: entered.cardId,
          counters: entered.backup.counters,
          grantKeywords: [...(entered.backup.grantKeywords ?? [])],
          restorePriorityTo: state.turn.priorityPlayerId,
        });
        state.turn.priorityPlayerId = entered.controllerId;
        const fired = event('ability_triggered', {
          objectId: entered.id, cardId: entered.cardId,
          trigger: 'enter_battlefield', backup: true,
        });
        state.events.push(fired); events.push(fired);
      }
      // Devour (CR 702.82, Gorger Wurm): „As this creature enters, you may
      // sacrifice any number of creatures. It enters with that many +1/+1
      // counters on it." Sekwencyjna, blokująca decyzja kontrolera
      // (resolve_devour_choice — poświęcenie jednego stwora na krok albo
      // zakończenie). Bez innych stworów do poświęcenia decyzji nie kolejkujemy
      // — wyboru nie ma (jak „up to" bez celów). Poświęcić nie można samego
      // źródła (reguła devour: liczniki lądują NA źródle).
      if (entered.kind === 'creature' && entered.devour) {
        const devourCandidates = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
            && candidate.controllerId === entered.controllerId && candidate.id !== entered.id;
        });
        if (devourCandidates.length > 0) {
          state.pendingDevours.push({
            playerId: entered.controllerId,
            sourceId: entered.id,
            counters: entered.devour.counters ?? 1,
            candidateIds: devourCandidates,
            restorePriorityTo: state.turn.priorityPlayerId,
          });
          state.turn.priorityPlayerId = entered.controllerId;
          const required = event('devour_choice_required', {
            playerId: entered.controllerId, sourceId: entered.id,
            cardId: entered.cardId, counters: entered.devour.counters ?? 1,
            candidateIds: [...devourCandidates],
          });
          state.events.push(required); events.push(required);
          // CR 702.82a: devour to ZASTĘPCZY efekt wejścia — „This permanent
          // enters with N +1/+1 counters on it for each creature sacrificed
          // this way". Liczniki są na permanencie, zanim odpali się
          // jakikolwiek trigger ETB, więc triggery wejścia (własne i cudze,
          // np. Impact Tremors) odkładamy do opróżnienia kolejki decyzji.
          state.pendingDevourEtbs = state.pendingDevourEtbs ?? [];
          state.pendingDevourEtbs.push({
            objectId: entered.id, cardId: entered.cardId,
            enteredTapped: Boolean(entered.tapped),
          });
        } else {
          const fired = event('ability_triggered', {
            objectId: entered.id, cardId: entered.cardId,
            trigger: 'enter_battlefield', devour: true,
          });
          state.events.push(fired); events.push(fired);
        }
      }
      // Exploit (CR 702.110, Silumgar Butcher): „When this creature enters,
      // you may sacrifice a creature. When this creature exploits a creature,
      // ..." — opcjonalna, blokująca decyzja kontrolera (resolve_exploit_choice:
      // poświęć stwora albo skip), jak devour. Po poświęceniu emitujemy zdarzenie
      // exploited, które odpala trigger „exploits" (niżej w processEvent).
      if (entered.kind === 'creature' && entered.exploit) {
        const exploitCandidates = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
            && candidate.controllerId === entered.controllerId && candidate.id !== entered.id;
        });
        // Bez innych stworów „you may sacrifice a creature" nie ma wyboru —
        // decyzji nie kolejkujemy (jak devour), trigger „exploits" i tak nie
        // odpali (nic nie poświęcono). To NIE przerywa przetwarzania wejścia:
        // exploit to zdolność triggerowana (CR 702.110a — „When this creature
        // enters"), wejście nastąpiło niezależnie od dostępności kandydatów,
        // więc triggery wejścia (własne i innych permanentów) muszą odpalić.
        if (exploitCandidates.length > 0) {
          state.pendingExploits.push({
            playerId: entered.controllerId,
            sourceId: entered.id,
            candidateIds: exploitCandidates,
            restorePriorityTo: state.turn.priorityPlayerId,
          });
          state.turn.priorityPlayerId = entered.controllerId;
          const required = event('exploit_choice_required', {
            playerId: entered.controllerId, sourceId: entered.id,
            cardId: entered.cardId, candidateIds: [...exploitCandidates],
          });
          state.events.push(required); events.push(required);
        }
      }
      // Endure (TDM, Kin-Tree Nurturer): „When this creature enters, it
      // endures N" — wybór gracza: N liczników +1/+1 na źródle ALBO token
      // Spirit N/N biały (resolve_endure_choice). Decyzję kolejkujemy zawsze
      // (niezależnie od planszy — obie opcje działają na pustym stole).
      if (entered.kind === 'creature' && entered.endure != null) {
        state.pendingEndures.push({
          playerId: entered.controllerId,
          sourceId: entered.id,
          counters: entered.endure,
          restorePriorityTo: state.turn.priorityPlayerId,
        });
        state.turn.priorityPlayerId = entered.controllerId;
        const required = event('endure_choice_required', {
          playerId: entered.controllerId, sourceId: entered.id,
          cardId: entered.cardId, counters: entered.endure,
        });
        state.events.push(required); events.push(required);
        const fired = event('ability_triggered', {
          objectId: entered.id, cardId: entered.cardId,
          trigger: 'enter_battlefield', endure: true,
        });
        state.events.push(fired); events.push(fired);
      }
      // Saga (CR 714.3a/2a, Shiva Warden of Ice): „As this Saga enters\" —
      // kontroler kładzie licznik lore, co odpala rozdział I. Dotyczy każdej
      // drogi wejścia (rzut, powrót przemieniony, reanimacja). T6: rozdział
      // to zdolność triggerowana — idzie na STOS i rozstrzyga się po passach.
      // Temat 2 dla Sag: rozdziały z `requiresTarget` na efektach (Mesmerize
      // Shiva I/II) kolejkuja decyzję CELU zamiast iść od razu na stos.
      if (entered.saga) {
        addCounter(state, entered.id, 'lore', 1);
        queueSagaChapter(state, state.objects.get(entered.id) ?? entered, 1, events);
      }
      // (Veiled Ascension „face-down enter with flying counter" realizowane
      // w samym efekcie cloak — patrz effects.js, generyczna zdolność
      // statyczna; nie dublujemy tutaj, żeby licznik nie był nakładany 2×).
      // CR 702.82a — devour (ZASTĘPCZY efekt) musi rozstrzygnąć się PRZED
      // triggerami wejścia: dopóki dla tego obiektu wisi odłożony wpis,
      // oba zbiory triggerów (własne i innych permanentów) czekają i
      // odpalają się dopiero po opróżnieniu kolejki pendingDevours
      // (patrz deferredDevourEtb w processTriggersScan).
      const devourEtbDeferred = (state.pendingDevourEtbs ?? []).some((m) => m.objectId === entered.id);
      if (!devourEtbDeferred) {
        fireEnterBattlefieldTriggers(state, entered, events, { enteredTapped: Boolean(entered.tapped) });
      }
    }
    // Rzucenie czaru (spell_cast — instant/sorcery), zagranie permanentu
    // (permanent_cast — stwór/artefakt/enchantment) albo czar aury
    // (aura_spell_cast — bestow/czysta aura): triggery „when you cast a spell"
    // (np. Illusory Demon — poświęcenie źródła, tylko własne czary) oraz
    // „whenever a player casts a [kolor] spell" (Angel's Feather — dowolny
    // gracz, warunek na kolorze z deskryptora triggera). Źródło musi być na
    // polu bitwy, więc casting samego źródła go nie poświęca (nie było na polu bitwy).
    // M258/F3 — WARD (CR 702.21): skan celów rzutu/aktywacji pod kątem
    // permanentów przeciwnika z ward. Trigger ward ląduje NAD czarem/
    // zdolnością celującą i rozstrzyga się przed nią (LIFO).
    if (ev.type === 'spell_cast' || ev.type === 'permanent_cast' || ev.type === 'aura_spell_cast') {
      fireWardTriggers(state, ev.playerId, ev.object?.id ?? null, ev.targets ?? [], events);
    }
    if (ev.type === 'ability_activated' && ev.onStack && ev.stackEntryId) {
      fireWardTriggers(state, ev.playerId, ev.stackEntryId, ev.targets ?? [], events);
    }
    if (ev.type === 'spell_copied' && ev.objectId) {
      fireWardTriggers(state, ev.playerId, ev.objectId, ev.targets ?? [], events);
    }
    if (ev.type === 'spell_cast' || ev.type === 'permanent_cast' || ev.type === 'aura_spell_cast') {
      // Licznik rzutów PER GRACZ (Illvoi Operative: „your second spell each
      // turn" — transform używa globalnego spellsCastThisTurn). Każde
      // zdarzenie rzutu przechodzi skan dokładnie raz (kolejka FIFO z M37),
      // więc inkrement tutaj nie może się podwoić. Czar aury też jest
      // czarem i liczy się do „second spell" (inaczej niż licznik
      // transformu — jego semantyka zostaje bez zmian).
      state.spellsCastThisTurnByPlayer = {
        ...state.spellsCastThisTurnByPlayer,
        [ev.playerId]: (state.spellsCastThisTurnByPlayer?.[ev.playerId] ?? 0) + 1,
      };
      const castNumberThisTurn = state.spellsCastThisTurnByPlayer[ev.playerId];
      // CR 502.2 / 730.2: dzien/noc zmienia sie na poczatku tury (applyDayNightAtTurnStart), nie przy rzucie.
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(source)) {
          const triggerEvent = ability?.trigger?.event;
          if (triggerEvent === 'when_you_cast_spell') {
            // Casting SAMEJ karty nie poświęca jej: w MtG źródło nie jest na
            // polu bitwy w momencie rzucenia (jest na stosie). Ev permanent_cast
            // niesie obiekt już na polu bitwy — pomijamy go.
            if (source.controllerId !== ev.playerId || ev.object?.id === source.id) continue;
            // Batch 24 (Goblin Battle Jester): „Whenever you cast a RED spell,
            // target creature can't block this turn" — tryFire obsługuje warunek
            // spellColorsInclude (ev niesie kolory czaru) ORAZ requiresTarget
            // (decyzja celu triggera). Poprzednio gałąź szła wprost na stos
            // (bez warunku i bez celu).
            tryFire(state, ability, source, [], events, ev);
          } else if (triggerEvent === 'you_cast_noncreature_spell') {
            // Prowess (CR 702.108, Jeskai Windscout): „whenever you cast a
            // noncreature spell". Noncreature = instant/sorcery (spell_cast),
            // czar aury (aura_spell_cast — także karta-stwór rzucona za bestow,
            // bo wtedy jest czarem AURY, nie stwora, CR 702.103a) albo
            // permanent nie-będący stworem (permanent_cast z kind innym niż
            // 'creature': artefakt, enchantment). Land drop nie jest rzutem
            // (osobne zdarzenie) i tu nie wchodzi.
            if (source.controllerId !== ev.playerId || ev.object?.id === source.id) continue;
            const isNoncreatureCast = ev.type !== 'permanent_cast'
              || ev.object?.kind !== 'creature';
            if (!isNoncreatureCast) continue;
            // Kontekst rzutu: manaSpent ze zdarzenia (progi efektów Tellah,
            // Great Sage — „if four/eight or more mana was spent").
            // Batch 46 (Rediscover the Way III): trigger prowess-podobny może
            // WYMAGAĆ CELU („target creature you control gains double strike").
            // queueTriggerToStack sam celów nie wybiera — wtedy idziemy przez
            // tryFire, który otwiera decyzję wyboru celu (L48: jedna ścieżka
            // dla triggerów z celem, niezależnie od zdarzenia).
            if (ability.trigger?.requiresTarget) {
              tryFire(state, ability, source, [], events, { manaSpent: ev.manaSpent ?? 0 });
            } else {
              queueTriggerToStack(state, ability, source, [], events, { manaSpent: ev.manaSpent ?? 0 });
            }
          } else if (triggerEvent === 'you_cast_spell_targeting_permanent') {
            // Tiller of Flesh: „Whenever you cast a spell that targets one or
            // more permanents". Permanent = obiekt na BITWISKU (CR 110.1);
            // gracz celem nie jest (Nightsnare nie odpala), karta w grobie
            // ani czar na stosie też nie.
            if (source.controllerId !== ev.playerId || ev.object?.id === source.id) continue;
            const hitsPermanent = (ev.targets ?? []).some((targetId) => {
              const target = state.objects.get(targetId);
              return target?.zone === 'battlefield';
            });
            if (!hitsPermanent) continue;
            queueTriggerToStack(state, ability, source, [], events);
          } else if (triggerEvent === 'you_cast_second_spell_each_turn') {
            // Illvoi Operative: „Whenever you cast your second spell each
            // turn". Odpala wyłącznie przy DRUGIM rzucie kontrolera źródła
            // w tej turze (licznik per gracz powyżej). Własny rzut źródła go
            // nie odpala — źródło nie jest jeszcze na polu bitwy (jak prowess).
            if (source.controllerId !== ev.playerId || castNumberThisTurn !== 2) continue;
            queueTriggerToStack(state, ability, source, [], events);
          } else if (triggerEvent === 'you_cast_kicked_spell') {
            // Merfolk Falconer (ZNR): „Whenever you cast a kicked spell, scry 2".
            // Kicker opłaca się jako wariant rzutu — permanent_cast niesie flagę
            // `kicked` (resources.js), a spell_cast — gdyby kiedyś dostał kickera
            // — nie; sprawdzamy oba (eventData.kicked lub object.wasKicked).
            if (source.controllerId !== ev.playerId) continue;
            const kicked = ev.kicked === true || ev.object?.wasKicked === true;
            if (!kicked) continue;
            queueTriggerToStack(state, ability, source, [], events);
          } else if (triggerEvent === 'you_cast_spell_you_dont_own') {
            // Vaan, Street Thief (FIN): „Whenever you cast a spell you don't
            // own". Czar kontrolowany przez gracza, ale WŁAŚCICIELEM jest
            // inny gracz (ownerId na obiekcie stosu; kradzież przez efekty
            // „cast from exile/graveyard" — Halo Forager, Vaan).
            if (source.controllerId !== ev.playerId) continue;
            if (!ev.object || ev.object.ownerId == null || ev.object.ownerId === ev.playerId) continue;
            queueTriggerToStack(state, ability, source, [], events);
          } else if (triggerEvent === 'player_casts_spell') {
            // Przez tryFire — zdolność może nieść mayFire („you may" —
            // Angel's Feather, Temat 2) albo requiresTarget; kontekst
            // zdarzenia (ev) niesie kolory czaru do conditionHolds.
            tryFire(state, ability, source, [], events, ev);
          }
        }
      }
      // Spectral Prison: „When enchanted creature becomes the target of a
      // spell, sacrifice this Aura.\" Aury załączone do stwora, na które celuje
      // czar, poświęcają się.
      const spellTargets = ev.targets ?? [];
      for (const auraSource of state.objects.values()) {
        if (auraSource.zone !== 'battlefield' || !auraSource.attachedTo) continue;
        if (!spellTargets.includes(auraSource.attachedTo)) continue;
        for (const ability of effectiveAbilities(auraSource)) {
          if (ability?.trigger?.event === 'aura_host_targeted_by_spell') {
            queueTriggerToStack(state, ability, auraSource, [], events);
          }
        }
      }
      // Heroic (Wavecrash Triton, CR 702.128): „Whenever you cast a spell that
      // targets this creature, ..." — trigger na stwórze, na który celuje
      // rzucony czar (spell_cast/aura_spell_cast z celami). Odpala się na
      // KAŻDYM takim stwórze (tylko kontroler może rzucić czar celujący).
      for (const targetId of spellTargets) {
        const targetedCreature = state.objects.get(targetId);
        if (!targetedCreature || targetedCreature.zone !== 'battlefield' || targetedCreature.kind !== 'creature') continue;
        if (targetedCreature.controllerId !== ev.playerId) continue; // heroic = twój czar na twój stwór
        for (const ability of effectiveAbilities(targetedCreature)) {
          if (ability?.trigger?.event === 'spell_targets_this_creature') {
            // Heroic: trigger z requiresTarget (tap creature opponent controls) —
            // cel wybiera kontroler przez queueTargetDecision (tryFire).
            tryFire(state, ability, targetedCreature, [], events, { spellCardId: ev.cardId ?? null });
          }
        }
      }
    }
    // „Whenever you draw your second card each turn" (Jolrael, Mwonvuli
    // Recluse): odpala PRZY ZDARZENIU dobrania, które jest drugie w turze —
    // porządek niesie zdarzenie (`drawNumberThisTurn`, choke point
    // `recordCardDrawn`), NIE licznik odczytany po całej komendzie. Różnica
    // robi się przy dobraniach wsadowych: „draw two" na starcie tury to
    // JEDEN wyzwalacz (ordery 1 i 2), a przy 1 + 2 odpala drugi dobór, choć
    // licznik kończy na 3 (audyt PR #92, znalezisko 3). Mulligan ma jawne
    // null — karty wzięte po mulliganie nie są dobraniami (CR 701.3b).
    // card_drawn to jedyne zdarzenie dobrania (draw step, efekty, cycling).
    if (ev.type === 'card_drawn' && ev.playerId != null && ev.drawNumberThisTurn === 2) {
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.controllerId !== ev.playerId) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'you_draw_second_card_each_turn') {
            queueTriggerToStack(state, ability, source, [], events);
          }
        }
      }
    }
    // Chronic Flooding (RTR): „Whenever enchanted land becomes tapped, its
    // controller mills three cards." Trigger siedzi na AURZE, a zdarzeniem
    // jest tapnięcie GOSPODARZA — skanujemy aury załączone do tapniętego
    // permanentu (jak aura_host_targeted_by_spell przy czarach).
    if (ev.type === 'object_tapped') {
      for (const aura of state.objects.values()) {
        if (aura.zone !== 'battlefield' || aura.attachedTo !== ev.objectId) continue;
        for (const ability of effectiveAbilities(aura)) {
          if (ability?.trigger?.event === 'enchanted_permanent_tapped') {
            queueTriggerToStack(state, ability, aura, [], events);
          }
        }
      }
      // Nanoform Sentinel (EOE): „Whenever this creature becomes tapped, untap
      // another target permanent. This ability triggers only once each turn.\"
      // Trigger na SAMYM tapniętym obiekcie (self), z opcjonalnym limitem
      // raz-na-turę (`trigger.oncePerTurn`). Generyczny (ADR 0002) —
      // `tryFire` obsługuje `requiresTarget`; limit śledzi triggerFiredThisTurn.
      const tapped = state.objects.get(ev.objectId);
      if (tapped && tapped.zone === 'battlefield') {
        for (const [index, ability] of effectiveAbilities(tapped).entries()) {
          if (ability?.trigger?.event !== 'self_becomes_tapped') continue;
          const key = `${ev.objectId}:${index}`;
          if (ability.trigger.oncePerTurn && state.triggerFiredThisTurn?.[key]) continue;
          const fired = tryFire(state, ability, tapped, [], events);
          if (fired && ability.trigger.oncePerTurn) {
            state.triggerFiredThisTurn = { ...(state.triggerFiredThisTurn ?? {}), [key]: true };
          }
        }
      }
    }
    // Obrót twarzą do góry (morph/megamorph — Batch 24: Willbender):
    // triggery „when this creature is turned face up" na obróconym obiekcie.
    if (ev.type === 'turned_face_up') {
      const flipped = state.objects.get(ev.objectId);
      if (!flipped || flipped.zone !== 'battlefield') return;
      for (const ability of effectiveAbilities(flipped)) {
        if (ability?.trigger?.event === 'turned_face_up') tryFire(state, ability, flipped, [], events);
      }
    }
    // Batch 48 (Wooden Stake, ISD): „Whenever equipped creature BLOCKS OR
    // BECOMES BLOCKED BY a Vampire, destroy that creature." Zdarzenie
    // `blockers_declared` NIE BYLO dotad w ogole skanowane przez triggery —
    // ta galaz jest pierwsza. Dziala w OBIE strony (CR 509.1): nosiciel
    // blokujacy Wampira oraz Wampir blokujacy nosiciela. Podtyp pochodzi
    // z DESKRYPTORA zdolnosci (ADR 0002), wiec przyszle „…by a Zombie"
    // pojda ta sama sciezka bez zmian w silniku.
    if (ev.type === 'blockers_declared') {
      const assignments = ev.assignments ?? {};
      /** Pary (nosiciel, przeciwnik-w-bloku) z tej deklaracji. */
      const pairs = [];
      for (const [attackerId, blockerIds] of Object.entries(assignments)) {
        for (const blockerId of blockerIds ?? []) {
          pairs.push([attackerId, blockerId]);  // atakujacy zostal ZABLOKOWANY przez blokera
          pairs.push([blockerId, attackerId]);  // bloker BLOKUJE atakujacego
        }
      }
      for (const [ownId, foeId] of pairs) {
        const own = state.objects.get(ownId);
        const foe = state.objects.get(foeId);
        if (!own || own.zone !== 'battlefield' || !foe || foe.zone !== 'battlefield') continue;
        for (const attachment of state.objects.values()) {
          if (attachment.zone !== 'battlefield' || attachment.attachedTo !== ownId) continue;
          for (const ability of effectiveAbilities(attachment)) {
            if (ability?.trigger?.event !== 'equipped_creature_blocks_or_blocked_by') continue;
            const wanted = ability.trigger.subtype;
            if (wanted && !(foe.subtypes ?? []).includes(wanted)) continue;
            // Cel STALY: stwor bioracy udzial w tym bloku („that creature").
            // tryFire IGNORUJE przekazane cele (zawsze wysyla []), bo sluzy
            // triggerom bez celu albo z `requiresTarget`; tutaj cel jest
            // znany z samego zdarzenia, wiec kolejkujemy wprost.
            // M200/N5 (CR 603.4): intervening-if sprawdzany przy
            // ROZSTRZYGNIECIU (resolveTriggerEntry — z payload.extra), nie
            // przy kolejkowaniu — pre-check z pustym eventData byl
            // redundantny i nie zgodny z CR (wzorzec: O-N3).
            queueTriggerToStack(state, ability, attachment, [foeId], events);
          }
        }
      }
    }
    // Deklaracja atakujących: triggery „attacks" (na atakującym), tribał
    // „bat_attacks" (na kontrolowanych permanentach — np. Zoraline) oraz
    // triggery załączników „whenever equipped creature attacks" (Greatsword
    // of Tyr — zdolność siedzi na EQUIPMENTU, nie na nosicielu).
    if (ev.type === 'attackers_declared') {
      // „Attacks alone" (Exalted, CR 702.82; Angelic Benediction): dokładnie
      // JEDEN atakujący. Triggery attacks_alone odpalają się na każdym źródle
      // z tą zdolnością (exalted jest keywordem na źródle); extra niesie
      // attackerId — ten sam dla wszystkich źródeł (jeden samotny atakujący).
      const attacksAlone = (ev.attackerIds ?? []).length === 1;
      if (attacksAlone) {
        const aloneId = ev.attackerIds[0];
        const aloneAttacker = state.objects.get(aloneId);
        // Audyt PR #41 (B2, CR 702.82): „Whenever a creature YOU CONTROL
        // attacks alone" — trigger odpala się tylko, gdy KONTROLER źródła
        // kontroluje samotnie atakującego. Bez tego cudza Angelic Benediction
        // pompowała mojego stwora i dawała przeciwnikowi „you may tap target
        // creature" przy MOIM ataku.
        for (const source of state.objects.values()) {
          if (source.zone !== 'battlefield') continue;
          if (aloneAttacker && source.controllerId !== aloneAttacker.controllerId) continue;
          for (const ability of effectiveAbilities(source)) {
            if (ability?.trigger?.event === 'attacks_alone') {
              tryFire(state, ability, source, [], events, { attackerId: aloneId });
            }
          }
        }
      }
      // M154 (Batch 38, Talion's Messenger): „Whenever you attack with one or
      // more Faeries” — tribe trigger jak bat_attacks, ale odpala się RAZ na
      // combat, gdy aktywny gracz atakuje z ≥1 Faerie. Kontrolerem źródła
      // jest aktywny gracz (ten, kto deklaruje atakujących).
      {
        const attackedWithFaerie = (ev.attackerIds ?? []).some((id) => {
          const a = state.objects.get(id);
          return a && a.zone === 'battlefield' && (a.subtypes ?? []).includes('Faerie');
        });
        if (attackedWithFaerie) {
          for (const object of state.objects.values()) {
            if (object.zone !== 'battlefield' || object.controllerId !== ev.playerId) continue;
            for (const ability of effectiveAbilities(object)) {
              if (ability?.trigger?.event === 'faerie_attacks') tryFire(state, ability, object, [], events);
            }
          }
        }
      }
      for (const attackerId of ev.attackerIds ?? []) {
        const attacker = state.objects.get(attackerId);
        if (!attacker || attacker.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(attacker)) {
          if (ability?.trigger?.event === 'attacks') tryFire(state, ability, attacker, [], events);
        }
        if ((attacker.subtypes ?? []).includes('Bat')) {
          for (const object of state.objects.values()) {
            if (object.zone !== 'battlefield' || object.controllerId !== attacker.controllerId) continue;
            for (const ability of effectiveAbilities(object)) {
              if (ability?.trigger?.event === 'bat_attacks') tryFire(state, ability, object, [], events);
            }
          }
        }
        // Equipment noszony przez atakującego: „Whenever equipped creature
        // attacks, put a +1/+1 counter on it and tap up to one target creature
        // defending player controls.\" Temat 2: drugi cel („up to one") wybiera
        // KONTROLER decyzją resolve_trigger_target (allowNone = można nie
        // tapnąć niczego); nosiciel-atakujący jest celem STAŁYM
        // (fixedTargetIds — licznik +1/+1 ląduje zawsze, CR 608.2a).
        const defendingPlayerId = state.players.find((player) => player.id !== attacker.controllerId)?.id ?? null;
        const attachmentsWithAttackTrigger = [...state.objects.values()].filter((attachment) => attachment.zone === 'battlefield'
          && attachment.attachedTo === attackerId
          && effectiveAbilities(attachment).some((ability) => ability?.trigger?.event === 'equipped_creature_attacks'));
        for (const attachment of attachmentsWithAttackTrigger) {
          for (const ability of effectiveAbilities(attachment)) {
            if (ability?.trigger?.event !== 'equipped_creature_attacks') continue;
            // M212/Z4 (audyt Żywym Testerem): spec celu bierzemy z DESKRYPTORA
            // triggera, a nie na sztywno. Wcześniej KAŻDY trigger
            // „equipped creature attacks" dostawał cel Greatsword of Tyr
            // („tap up to one target creature defending player controls") —
            // więc White Mage's Staff („you gain 1 life", BEZ celu) pytał
            // o cel, dostawał odmowę i kończył jako „trigger bez efektu":
            // gracz nigdy nie dostawał życia (ADR 0002 — zero wiedzy o karcie
            // w silniku).
            const targetSpec = ability.trigger?.requiresTarget ?? null;
            if (!targetSpec) {
              // Trigger bez celu: odpala się wprost, z nosicielem jako
              // źródłem kontekstu (CR 603.3) — jak każdy inny bezcelowy.
              tryFire(state, ability, attachment, [attackerId], events);
              continue;
            }
            const candidates = triggerTargetCandidates(state, targetSpec, attachment, { defendingPlayerId });
            // „Up to one": bez stworów obrońcy trigger i tak odpala (licznik
            // na nosicielu) — decyzja z allowNone i pustymi kandydatami.
            // Kontekst (defendingPlayerId) musi wędrować do rozstrzygnięcia —
            // legalTriggerTargetCandidates liczy kandydatów dynamicznie.
            // „up to one" (trigger obowiązkowy, cel opcjonalny — licznik ląduje mimo
            // odmowy) ORAZ „you may ... when you do" (optional — odmowa kasuje
            // całość) pozwalają odmówić; różnicę rozstrzyga game-state po
            // `optional` przy resolve_trigger_target.
            const allowNone = Boolean(targetSpec.upTo || targetSpec.optional);
            queueTargetDecision(state, ability, attachment, candidates, allowNone, [attackerId], events, { defendingPlayerId }, targetSpec);
          }
        }
        // Mentor (CR 702.133, Boros Challenger): „Whenever this creature
        // attacks, put a +1/+1 counter on target attacking creature with
        // lesser power". Cel wybiera KONTROLER blokującą decyzją
        // resolve_mentor_target (jak cel delirium, M36). Kandydaci liczeni
        // w chwili odpalenia (siła żywa — effectivePower); brak kandydata =
        // zdolność nie trafia na stos (CR 603.3d) i nie blokuje gry.
        let hasMentor = false;
        for (const ability of effectiveAbilities(attacker)) {
          if (ability?.trigger?.event === 'mentor_attacks') hasMentor = true;
        }
        if (hasMentor) {
          const sourcePower = effectivePower(attacker, state) ?? 0;
          const candidates = (ev.attackerIds ?? []).filter((otherId) => {
            if (otherId === attackerId) return false;
            const other = state.objects.get(otherId);
            return other?.zone === 'battlefield' && other.kind === 'creature'
              && other.controllerId === attacker.controllerId
              && (effectivePower(other, state) ?? 0) < sourcePower;
          });
          if (candidates.length > 0) {
            state.pendingMentorTargets.push({
              playerId: attacker.controllerId,
              sourceId: attacker.id,
              sourcePower,
              candidateIds: candidates,
              restorePriorityTo: state.turn.priorityPlayerId,
            });
            state.turn.priorityPlayerId = attacker.controllerId;
            const required = event('mentor_target_required', {
              playerId: attacker.controllerId, sourceId: attacker.id,
              cardId: attacker.cardId, sourcePower,
            });
            state.events.push(required); events.push(required);
            const fired = event('ability_triggered', {
              objectId: attacker.id, cardId: attacker.cardId,
              trigger: 'mentor_attacks',
            });
            state.events.push(fired); events.push(fired);
          }
        }
      }
    }
    // Początek upkeepu: triggery z warunkiem na liczbę czarów w poprzedniej
    // turze (transform wilkołaków), zasada inicjatywy (CR 725) „venture into
    // Undercity" oraz opóźnione triggery „at the beginning of their next
    // upkeep" (Plague Reaver — powrót pod kontrolą gracza-celu).
    if (ev.type === 'step_advanced' && ev.step === 'upkeep') {
      if (state.initiativePlayerId && state.turn.activePlayerId === state.initiativePlayerId) {
        applyEffect(state, { type: 'venture_into_undercity', playerId: state.initiativePlayerId }, {}, []);
      }
      // Opóźniony powrót pod kontrolą celu (Plague Reaver): odpala się na
      // początku upkeepu gracza-celu. „NEXT upkeep\" — gdy zdolność aktywowała
      // się w turze samego celu, najbliższy (bieżący) upkeep się nie liczy
      // (wpis armedAt zachowuje turę i aktywnego gracza z chwili aktywacji).
      const remainingUpkeepDelayed = [];
      for (const pending of state.delayedTriggers) {
        if (pending.type !== 'reanimate_under_target_control' || pending.playerId !== state.turn.activePlayerId) {
          remainingUpkeepDelayed.push(pending);
          continue;
        }
        if (pending.armedAt && pending.armedAt.turn === state.turn.number && pending.armedAt.active === pending.playerId) {
          remainingUpkeepDelayed.push(pending);
          continue;
        }
        // T6: trigger opóźniony idzie na STOS (jak każdy trigger) — rozstrzyga
        // się po rundzie passów; aplikacja w resolveDelayedTrigger.
        const object = state.objects.get(pending.objectId);
        // Obiekt zniknął z grobu (np. wygnany w międzyczasie) — trigger wygasa.
        if (!object || object.zone !== 'graveyard') continue;
        queueTriggerToStack(state, {
          type: 'triggered',
          trigger: { event: 'delayed' },
          effect: [],
        }, object, [], events, { delayedType: 'reanimate_under_target_control', delayed: pending });
      }
      state.delayedTriggers = remainingUpkeepDelayed;
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(object)) {
          if (ability?.trigger?.event !== 'upkeep') continue;
          // „At the beginning of YOUR upkeep" — domyślny adresat triggera
          // upkeep to KONTROLER źródła (CR 504.x): bez bramy trigger odpalał
          // się w upkeepu każdego gracza (Etherwrought Page w turze
          // przeciwnika — zgłoszenie właściciela 2026-08-10, B). Jawne
          // wyjątki deklaruje condition: „each upkeep" (wilkołaki ISD/DKA)
          // albo upkeep innego gracza (curse „enchanted player's upkeep",
          // Feedback „upkeep of enchanted permanent's controller").
          const cond = ability.trigger.condition ?? {};
          const otherPlayersUpkeep = Boolean(cond.enchantedPlayerUpkeep || cond.enchantedPermanentControllerUpkeep);
          if (!cond.eachUpkeep && !otherPlayersUpkeep && object.controllerId !== state.turn.activePlayerId) continue;
          tryFire(state, ability, object, [], events);
        }
      }
    }
    // Batch 46 (Bone Shredder) — ECHO (CR 702.29): „At the beginning of your
    // upkeep, if this came under your control since the beginning of your
    // last upkeep, sacrifice it unless you pay its echo cost." Znacznik
    // `echoUnpaid` stawia wejście na pole bitwy; pierwszy WŁASNY upkeep po
    // wejściu pyta o zapłatę (ta sama decyzja co Rupture Spire —
    // pendingPayOrSacrifice), a po rozstrzygnięciu znacznik gaśnie, więc
    // echo płaci się dokładnie raz.
    if (ev.type === 'step_advanced' && ev.step === 'upkeep') {
      for (const object of [...state.objects.values()]) {
        if (object.zone !== 'battlefield' || !object.echoUnpaid) continue;
        if (object.controllerId !== state.turn.activePlayerId) continue;
        const cost = object.echo ?? 0;
        state.objects.set(object.id, Object.freeze({ ...object, echoUnpaid: false }));
        queuePayOrSacrifice(state, object, cost, events, 'echo', object.echoColors ?? []);
      }
    }
    // Suspend (CR 702.62a): „At the beginning of your upkeep, if this card is
    // suspended, remove a time counter from it." Zawieszone karty w exile
    // kontrolera-aktywnego tracą po jednym liczniku czasu. Gdy ostatni zniknie,
    // odpala się DRUGA zdolność („When the last time counter is removed, if
    // this card is exiled, you may cast it without paying its mana cost") —
    // idzie NA STOS jak każda zdolność wyzwalana, a przy rozstrzyganiu
    // (resolveTriggerEntry, extra.suspendObjectId) otwiera JEDNORAZOWĄ decyzję
    // gracza: rzuć za darmo albo zostaw w exile na stałe (CR 702.62a/c).
    if (ev.type === 'step_advanced' && ev.step === 'upkeep') {
      for (const id of [...state.zones.exile]) {
        const card = state.objects.get(id);
        if (!card || !card.suspended || card.controllerId !== state.turn.activePlayerId) continue;
        const remaining = (card.timeCounters ?? 0) - 1;
        if (remaining > 0) {
          state.objects.set(id, Object.freeze({ ...card, timeCounters: remaining }));
          state.events.push(event('time_counter_removed', {
            playerId: state.turn.activePlayerId, objectId: id, cardId: card.cardId,
            remaining, ready: false,
          }));
        } else {
          state.objects.set(id, Object.freeze({ ...card, timeCounters: 0 }));
          state.events.push(event('time_counter_removed', {
            playerId: state.turn.activePlayerId, objectId: id, cardId: card.cardId,
            remaining: 0, ready: true,
          }));
          // Zdolność wyzwalana na stos (CR 603.3) — rozstrzygnie się po rundzie
          // passów; source = zawieszona karta (LKI, jeśli zniknie).
          queueTriggerToStack(state, {
            type: 'triggered',
            trigger: { event: 'suspend_ready' },
            effect: [],
          }, card, [], events, { suspendObjectId: id });
        }
      }
      // Rebound (CR 702.97, Ojutai's Breath): „At the beginning of your next
      // upkeep, you may cast this card from exile without paying its mana
      // cost.\" — na początku upkeepu AKTYWNEGO gracza sprawdzamy, czy w exile
      // leży karta z `reboundReady` (zaznaczona przy rozstrzygnięciu czaru
      // rzuconego z ręki z deskryptorem `rebound`). Jeśli tak, otwieramy
      // JEDNORAZOWĄ decyzję (pendingReboundCast): rzuć za darmo albo zostaw
      // w exile na stałe (karta traci gotowość — rebound nie powtarza się).
      for (const id of [...state.zones.exile]) {
        const card = state.objects.get(id);
        if (!card || !card.reboundReady || card.controllerId !== state.turn.activePlayerId) continue;
        if (card.kind !== 'spell') continue;
        if (state.pendingReboundCast) continue;
        state.pendingReboundCast = {
          playerId: state.turn.activePlayerId,
          objectId: id,
          cardId: card.cardId,
          restorePriorityTo: state.turn.priorityPlayerId,
        };
        state.turn.priorityPlayerId = state.turn.activePlayerId;
        state.events.push(event('rebound_ready_required', {
          playerId: state.turn.activePlayerId, objectId: id, cardId: card.cardId,
        }));
      }
    }
    // Po kroku dobierania (CR 714.3b: „after your draw step") każda Saga
    // AKTYWNEGO gracza dostaje licznik lore i odpala kolejny rozdział.
    // Temat 2 dla Sag: rozdziały z `requiresTarget` kolejkuja decyzję CELU
    // (resolve_trigger_target) zamiast iść od razu na stos.
    if (ev.type === 'step_advanced' && ev.step === 'main1' && ev.phase === 'precombat_main') {
      for (const object of [...state.objects.values()]) {
        if (object.zone !== 'battlefield' || object.controllerId !== state.turn.activePlayerId || !object.saga) continue;
        addCounter(state, object.id, 'lore', 1);
        const current = state.objects.get(object.id) ?? object;
        queueSagaChapter(state, current, current.counters?.lore ?? 0, events);
      }
    }
    // Krok end: triggery „at the beginning of your end step" (Canonized in
    // Blood — „if you descended this turn, put a +1/+1 counter…") oraz
    // opóźnione triggery (CR 603.7) „at the beginning of your next end step,
    // exile it" (Puppeteer Clique).
    if (ev.type === 'step_advanced' && ev.step === 'end') {
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield' || object.controllerId !== state.turn.activePlayerId) continue;
        for (const ability of effectiveAbilities(object)) {
          if (ability?.trigger?.event === 'end_step') tryFire(state, ability, object, [], events);
        }
      }
      const remaining = [];
      for (const pending of state.delayedTriggers) {
        // M105/B6 (CR 603.7b): wpisy „at the beginning of THE NEXT end step"
        // (anyPlayerEndStep) odpalają się w NAJBLIŻSZYM kroku końcowym —
        // także w turze przeciwnika. Wpisy „YOUR next end step" (Puppeteer
        // Clique) nadal czekają na krok końcowy swojego kontrolera.
        if (!pending.anyPlayerEndStep && pending.playerId !== state.turn.activePlayerId) {
          remaining.push(pending); continue;
        }
        // Inne typy opóźnionych triggerów (Plague Reaver — powrót w upkeep
        // celu) obsługuje wyłącznie blok upkeep; tu tylko je zachowujemy.
        if (pending.type !== 'exile_object') { remaining.push(pending); continue; }
        const object = state.objects.get(pending.objectId);
        if (!object || object.zone !== 'battlefield') continue; // obiekt zniknął — trigger wygasa
        // T6: trigger opóźniony idzie na STOS — rozstrzyga się po rundzie
        // passów (resolveDelayedTrigger).
        queueTriggerToStack(state, {
          type: 'triggered',
          trigger: { event: 'delayed' },
          effect: [],
        }, object, [], events, { delayedType: 'exile_object', delayed: pending });
      }
      state.delayedTriggers = remaining;
    }
    // Początek walki: triggery „beginning_of_combat" (np. Jyoti — land
    // creatures dostają +X/+X do końca tury).
    if (ev.type === 'step_advanced' && ev.step === 'beginning_of_combat') {
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(object)) {
          if (ability?.trigger?.event !== 'beginning_of_combat') continue;
          // M201/E (zgłoszenie właściciela, Battle-Rattle Shaman): Oracle
          // rozróżnia DWA brzmienia, a silnik miał jedno zdarzenie:
          //  • „at the beginning of combat ON YOUR TURN” (Battle-Rattle
          //    Shaman) — tylko tura KONTROLERA (domyślne, częstsze);
          //  • „at the beginning of EACH combat” (Jyoti) — także tura
          //    przeciwnika; deskryptor `eachCombat` w danych karty.
          // Rozróżnienie deskryptorem, nie nazwą karty (ADR 0002); strażnik
          // katalogu pilnuje zgodności deskryptora z Oracle (L56).
          if (ability.trigger.eachCombat !== true && object.controllerId !== state.turn.activePlayerId) continue;
          tryFire(state, ability, object, [], events);
        }
      }
    }
  };
  for (;;) {
    for (; idx < queue.length && scanned < MAX_TRIGGER_EVENTS_SCANNED; idx += 1, scanned += 1) {
      const beforeEvent = events.length;
      processEvent(queue[idx]);
      // Zdarzenia wytworzone przez triggery wchodzą do kolejki skanu (CR 603.2).
      for (let j = beforeEvent; j < events.length; j += 1) queue.push(events[j]);
    }
    if (scanned >= MAX_TRIGGER_EVENTS_SCANNED) break;
    const freshControllers = [...leftBattlefield].filter((controllerId) => !aggregatedControllers.has(controllerId));
    if (freshControllers.length === 0 && idx >= queue.length) break;
    // „Whenever one or more permanents you control leave the battlefield"
    // (Nefarious Imp, CR 603.2): RAZ na kontrolera na komendę, także po
    // odejściach spowodowanych przez same triggery; zdarzenia agregatu
    // wracają do kolejki i też są skanowane.
    for (const controllerId of freshControllers) {
      aggregatedControllers.add(controllerId);
      const beforeAggregate = events.length;
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.controllerId !== controllerId) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'permanents_you_control_leave_battlefield') {
            tryFire(state, ability, source, [], events);
          }
        }
      }
      for (let j = beforeAggregate; j < events.length; j += 1) queue.push(events[j]);
    }
  }
  // CR 702.82a — odłożone triggery wejścia stwora z devour: devour to
  // ZASTĘPCZY efekt („This permanent enters with N +1/+1 counters on it for
  // each creature sacrificed this way"), więc liczniki są na permanencie,
  // ZANIM na stos wejdzie jakikolwiek trigger ETB (własny albo cudzy —
  // np. Impact Tremors). Decyzja devour jest blokująca, więc triggery
  // czekają na opróżnienie kolejki — niezależnie od tego, czy zrobiło to
  // resolve_devour_choice ({done:true} albo auto-close po poświęceniu
  // ostatniego kandydata), czy pruneDeadPendingDecisions.
  if ((state.pendingDevours?.length ?? 0) === 0 && (state.pendingDevourEtbs?.length ?? 0) > 0) {
    const deferred = state.pendingDevourEtbs;
    state.pendingDevourEtbs = [];
    for (const marker of deferred) {
      const entered = state.objects.get(marker.objectId);
      if (!entered) continue;
      const fired = event('ability_triggered', {
        objectId: entered.id, cardId: marker.cardId,
        trigger: 'enter_battlefield', devour: true,
      });
      state.events.push(fired); events.push(fired);
      fireEnterBattlefieldTriggers(state, entered, events, { enteredTapped: marker.enteredTapped });
    }
  }
  // Uwaga: zdarzenia triggerów są JUŻ w state.events — fireTrigger i bloki
  // kroków dopisują je przy tworzeniu, a lokalny `events` zbiera wyłącznie
  // wycinki state.events (slice(before)). Ponowny push duplikowałby każde
  // zdarzenie w logu (naprawione przy Plague Reaver / batch 16).
  return events;
}
