import { event } from '../protocol/types.js';
import { applyEffect } from './effects.js';
import { addCounter, hasCounter } from './counters.js';
import { effectiveAbilities, effectiveKeywords, effectivePower } from './permanents.js';
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
 * - `enter_battlefield` — permanent wchodzi na bitwisko (Zoraline; także landy:
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
  player.speed = (player.speed ?? 0) + 1;
  state.speedIncreasedThisTurn = { ...(state.speedIncreasedThisTurn ?? {}), [controllerId]: true };
  state.events.push(event('speed_changed', { playerId: controllerId, speed: player.speed }));
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
  if (condition.minSpellsLastTurn != null) return state.lastTurnSpellsCast >= condition.minSpellsLastTurn;
  // „Whenever a player casts a WHITE spell" (Angel's Feather): trigger
  // `player_casts_spell` z warunkiem na kolorze rzucanego czaru — kolory
  // niosie samo zdarzenie (publiczne dane karty, ADR 0002).
  if (Array.isArray(condition.spellColorsInclude)) {
    return (eventData.colors ?? []).some((color) => condition.spellColorsInclude.includes(color));
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
  // na bitwisko inną drogą (reanimacja, token, itp.).
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
function triggerTargetCandidates(state, spec, sourceObject, extra = {}) {
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
    // bitwiska, na końcu kontroler — porządek dawnej polityki.
    const players = state.players.map((p) => p.id);
    const opponentId = state.players.find((p) => p.id !== sourceObject.controllerId)?.id ?? null;
    const creatures = state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
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
    // Willbender (Batch 24): „target spell or ability with a single target".
    // Engine nie ma zdolności na stosie (rozstrzyga je natychmiast), więc
    // kandydatami są wyłącznie CZARY na stosie z dokładnie jednym celem
    // (chosenTargets.length === 1). Ograniczenie udokumentowane w karcie.
    return state.zones.stack.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'stack'
        && Array.isArray(object.chosenTargets) && object.chosenTargets.length === 1;
    });
  }
  if (spec.type === 'creature_you_control') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature'
        && object.controllerId === sourceObject.controllerId;
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
  if (spec.type === 'creature') {
    // Forge Devil, Reclusive Artificer, Cloudbound Moogle: stwory na bitwisku
    // (nie źródło, nie hexproof), kolejność bitwiska.
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature'
        && object.id !== sourceObject.id && !hexproofBlocked(object);
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
  if (spec.type === 'artifact_or_creature') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield'
        && (object.kind === 'creature' || object.kind === 'artifact')
        && object.id !== sourceObject.id && !hexproofBlocked(object);
    });
  }
  if (spec.type === 'other_nonland_permanent') {
    // Jill: inne niż źródło, nie-landy PRZECIWNIKA — najsilniejszy pierwszy.
    return state.zones.battlefield
      .filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.id === sourceObject.id) return false;
        if (object.controllerId === sourceObject.controllerId) return false;
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
  // Batch 22: Thistledown Players — dowolny NIE-land na bitwisku
  // (stwór, artefakt, enchantment). Źródło triggera nie jest celem
  // własnym (żeby ETB Thistledown nie odpalał na siebie).
  if (spec.type === 'nonland_permanent') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield') return false;
      if (object.id === sourceObject.id) return false;
      if (hexproofBlocked(object)) return false;
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
  queueTargetDecision(state, ability, sagaObject, candidates, false, [], events, { sagaChapter: chapterNumber }, targetSpec);
}

/**
 * Odpala rozdział Sagi (CR 714): efekty rozdziału, zdarzenie saga_chapter_fired,
 * a po rozdziale OSTATNIM — poświęcenie Sagi (CR 714.4), o ile wciąż jest na
 * bitwisku jako Saga (Shiva sama się przemienia w rozdziale III, więc jej
 * poświęcenia nie ma). Rozdział zwracający permanenta na bitwisko (powrót
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
      const graveId = `grave-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, current.id, 'graveyard', graveId);
      const sacrificed = event('permanent_sacrificed', {
        fromId: current.id, objectId: graveId, playerId: current.controllerId,
        cardId: moved.cardId, saga: true,
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
  // opuści bitwisko przed rozstrzygnięciem, efekty „source_power" (Jyoti)
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
    moveObjectDirectly(state, pending.objectId, 'exile', exileId);
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
  // (np. inny trigger z tej samej komendy przeniósł je na bitwisko — persist
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
  if (extra.delayedType) {
    const localEvents = [];
    const handled = resolveDelayedTrigger(state, { ...payload, delayedType: extra.delayedType, delayed: extra.delayed }, localEvents);
    const resolved = event('trigger_resolved', {
      objectId: entry.id, cardId: entry.cardId, delayed: true, noEffect: !handled,
    });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // Rozdział Sagi (CR 714.3 — zdolność rozdziału to zdolność triggerowana):
  // efekty + ewentualne poświęcenie po ostatnim rozdziale wykonuje
  // fireSagaChapter (zachowuje LKI, gdy Saga opuściła bitwisko w oknie).
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
      objectId: entry.id, cardId: entry.cardId, saga: true, chapter: extra.sagaChapter,
    });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // Intervening-if (CR 603.4): warunek sprawdzany PONOWNIE przy rozstrzyganiu —
  // z danymi zdarzenia nadrzędnego (extra: np. kolory rzucanego czaru dla
  // player_casts_spell — bez tego „spellColorsInclude" nie zachodził).
  if (!conditionHolds(payload.ability?.trigger, state, source, payload.extra ?? {})) {
    const resolved = event('trigger_resolved', {
      objectId: entry.id, cardId: entry.cardId, noEffect: true,
    });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // Cele: efekty same pomijają cele, które przestały być legalne
  // (CR 608.2b — applyEffect sprawdza strefę przy każdej akcji).
  applyTriggerEffects(state, payload.ability, source, payload.targets ?? [], payload.extra ?? {});
  const resolved = event('trigger_resolved', {
    objectId: entry.id, cardId: entry.cardId,
    trigger: payload.ability?.trigger?.event ?? null,
  });
  state.events.push(resolved);
  return state.events.slice(before);
}

/**
 * Obowiązkowy trigger płatności w stylu „sacrifice it unless you pay {N}"
 * (Rupture Spire). Nie jest to opcjonalne „you may" — trigger odpala się
 * ZAWSZE, a kontroler musi zapłacić albo poświęcić permanent.
 *
 * Świadome uproszczenie (minimalny wymiar, udokumentowane w M10): płatność
 * jest automatyczna — najpierw z puli many, a gdy jej brak, engine tapuje
 * jednego nietapniętego landa kontrolera (pierwszego z listy bitwiska),
 * żeby opłacić koszt. Kontroler nie może dobrowolnie zrezygnować z płatności;
 * poświęcenie następuje wyłącznie, gdy zapłacić się nie da.
 */
function firePayOrSacrifice(state, ability, source, events) {
  const amount = ability.trigger?.payMana ?? 0;
  const controllerId = source.controllerId;
  // Temat 7 (Rupture Spire, CR 601.2h/702.1): „sacrifice it unless you pay
  // {1}" — wybór należy do KONTROLERA. Gdy płatność jest możliwa (pula +
  // nietapnięte landy), kolejkujemy decyzję resolve_pay_or_sacrifice; samą
  // płatność (spendMana z auto-tapem) albo poświęcenie wykonuje komenda.
  // Bez możliwości zapłaty — automatyczne poświęcenie (jak dotąd).
  const canPay = producibleMana(state, controllerId) >= amount;
  if (!canPay) {
    const before = state.events.length;
    applyEffect(state, { type: 'sacrifice_permanent' }, source, []);
    const e = event('ability_triggered', {
      objectId: source.id, cardId: source.cardId, trigger: ability.trigger?.event,
      sacrificed: true, autoSacrificed: true,
    });
    state.events.push(e);
    events.push(...state.events.slice(before));
    return true;
  }
  state.pendingPayOrSacrifice = {
    playerId: controllerId, amount, sourceId: source.id,
    restorePriorityTo: state.turn.priorityPlayerId,
  };
  state.turn.priorityPlayerId = controllerId;
  const required = event('pay_or_sacrifice_required', {
    playerId: controllerId, amount, sourceId: source.id, cardId: source.cardId,
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
  state.pendingTriggerTargets.push({
    playerId: controllerId,
    sourceId: source.id,
    cardId: source.cardId,
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
  const required = event('trigger_target_required', {
    playerId: controllerId, sourceId: source.id, cardId: source.cardId,
    candidateIds: [...candidates], allowNone: Boolean(allowNone),
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
 * źródło na bitwisku + intervening-if (CR 603.4) + legalni kandydaci
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
  const source = state.objects.get(pending.sourceId);
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
  const source = state.objects.get(pending.sourceId);
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
    if (candidates.length === 0) return false;
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
 * spoza bitwiska (odrzucenie, mill, wygnanie, czar skontrowany). Deskryptor
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

/** Czy na bitwisku jest permanent z keywordem daybound (wyzwalacz nocy). */
function hasDayboundPermanent(state) {
  for (const object of state.objects.values()) {
    if (object.zone !== 'battlefield') continue;
    if ((object.keywords ?? []).includes('daybound')) return true;
  }
  return false;
}

export function processTriggers(state, recentEvents) {
  const events = [];
  // Kontrolerzy, których permanenty opuściły bitwisko w tej komendzie —
  // trigger „one or more permanents you control leave the battlefield"
  // odpala się RAZ na komendę, nie raz na permanent (CR 603.2).
  const leftBattlefield = new Set();
  // Kontrolerzy, których STWORY zadały w tej komendzie combat damage graczowi
  // (Disa the Restless — „one or more creatures you control").
  const anyCombatDamageControllers = new Set();
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
    const fireDeathTriggers = (died) => {
      markDescended(died);
      if (!died) return;
      for (const ability of abilitiesOnDeath(died)) {
        if (ability?.trigger?.event === 'dies' || ability?.trigger?.event === 'any_creature_dies') {
          // M67 (Guildsworn): LKI „wasn't blocking" — flaga z chwili śmierci.
          tryFire(state, ability, died, [], events, { wasBlocking: died?.isBlockingThisCombat === true });
        }
      }
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.id === died.id) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'any_creature_dies') tryFire(state, ability, source, [], events);
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
    };
    if (ev.type === 'creature_destroyed') {
      // Finality (exile) NIE uruchamia triggera „dies" (CR 122.1b — obiekt
      // nie umiera, jest wygnany).
      if (ev.toZone === 'exile') return;
      fireDeathTriggers(state.objects.get(ev.toId));
    }
    if (ev.type === 'permanent_sacrificed') {
      if (ev.toZone === 'exile') return; // finality
      fireDeathTriggers(state.objects.get(ev.objectId));
    }
    if (ev.type === 'permanent_destroyed') {
      if (ev.toZone === 'exile') return; // finality
      fireDeathTriggers(state.objects.get(ev.objectId));
    }
    // „Whenever one or more permanents you control leave the battlefield"
    // (Nefarious Imp). Jedno zdarzenie = jedno odejście; CR 603.2 mówi
    // „one or more", ale w engine każde odejście generuje osobne zdarzenie,
    // więc grupujemy je po komendzie (patrz leftBattlefieldControllers niżej).
    if (ev.type === 'creature_destroyed' || ev.type === 'permanent_sacrificed'
      || (ev.type === 'object_moved' && ev.fromZone === 'battlefield' && ev.toZone !== 'battlefield')
      || (ev.type === 'object_exiled' && ev.fromId)) {
      const gone = ev.type === 'permanent_sacrificed'
        ? state.objects.get(ev.objectId)
        : (state.objects.get(ev.toId) ?? state.objects.get(ev.object?.id) ?? state.objects.get(ev.objectId));
      if (gone?.controllerId) leftBattlefield.add(gone.controllerId);
      // „When this creature leaves the battlefield" (Fear of Abduction —
      // powrót wygnanych kart): trigger własny obiektu na ODEJŚCIE z bitwiska
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
      fireDeathTriggers(state.objects.get(ev.object?.id));
    }
    // Descended: permanent card wpada do grobu z ręki (odrzucenie), milla
    // albo poświęcenia — liczymy po kontrolerze docelowego obiektu.
    if (ev.type === 'permanent_sacrificed') markDescended(state.objects.get(ev.objectId));
    if (ev.type === 'card_discarded' || ev.type === 'card_milled') {
      const enteredGrave = state.objects.get(ev.objectId);
      markDescended(enteredGrave);
      // Wejście karty do grobu z ręki/biblioteki (nie z bitwiska) — trigger
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
    // ev.amount > 0: w pełni zapobiegnięte obrażenia NIE są zadane (CR 119.3) —
    // triggery „deals combat damage" nie odpalają się przy 0 zadanych.
    if (ev.type === 'damage_dealt' && ev.combat !== false && isPlayerId(state, ev.target) && ev.amount > 0) {
      const source = state.objects.get(ev.source);
      // Uproszczenie: źródło musi wciąż być na bitwisku (trigger „z grobu"
      // dla źródła, które zginęło w tej samej komendzie, nie jest obsługiwany).
      if (!source || source.zone !== 'battlefield') return;
      // Speed (DFT „Start your engines!"): wzrost raz na turę aktywnego gracza
      // przy obrażeniach combat przeciwnika (max 4) — patrz bumpSpeedIfOpponentDamaged.
      bumpSpeedIfOpponentDamaged(state, source);
      // Inicjatywa (CR 725): stwory zadające combat damage posiadaczowi
      // inicjatywy przejmują ją (karta The Initiative; podstawa Underdark
      // Explorer). Pierwsze objęcie inicjatywy = venture do lochu.
      if (state.initiativePlayerId === ev.target && source.controllerId !== state.initiativePlayerId) {
        const before = state.events.length;
        applyEffect(state, { type: 'take_initiative' }, source, []);
        events.push(...state.events.slice(before));
      }
      for (const ability of effectiveAbilities(source)) {
        if (ability?.trigger?.event === 'combat_damage_to_player') {
          tryFire(state, ability, source, [], events, { damagedPlayerId: ev.target });
        }
      }
      // Curiosity (ISD): „Whenever enchanted creature deals damage to an
      // opponent, you may draw a card." — aura załączona do stwora, który
      // zadaje combat damage graczowi-PRZECIWNIKOWI (nie sobie). Trigger na
      // aurze; extra niesie damagedPlayerId i sourceCreatureId (LKI jeśli
      // stwór zginął w tej samej komendzie — źródło aury).
      for (const aura of state.objects.values()) {
        if (aura.zone !== 'battlefield' || aura.attachedTo !== source.id) continue;
        // Curiosity: „deals damage to an OPPONENT" — obrażenia do siebie lub
        // sojusznika kontrolera aury nie odpalają triggera.
        if (ev.target === aura.controllerId) continue;
        for (const ability of effectiveAbilities(aura)) {
          if (ability?.trigger?.event === 'enchanted_creature_combat_damage_to_opponent') {
            tryFire(state, ability, aura, [], events, { damagedPlayerId: ev.target, sourceCreatureId: source.id });
          }
        }
      }
      // „Whenever one or more creatures you control deal combat damage to a
      // player" (Disa the Restless, CR 603.2): trigger odpala się RAZ na
      // komendę, gdy DOWOLNY stwór kontrolera źródła zadał obrażenia graczowi
      // (grupowanie jak leftBattlefield — zdarzenie per stwór, trigger per
      // kontroler). Źródło triggera samo może być stworem lub nie (Disa).
      if (!anyCombatDamageControllers.has(source.controllerId)) {
        anyCombatDamageControllers.add(source.controllerId);
        for (const candidate of state.objects.values()) {
          if (candidate.zone !== 'battlefield' || candidate.controllerId !== source.controllerId) continue;
          for (const ability of effectiveAbilities(candidate)) {
            if (ability?.trigger?.event === 'any_combat_damage_to_player') {
              tryFire(state, ability, candidate, [], events, { damagedPlayerId: ev.target });
            }
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
    // Wejście na bitwisko (rozstrzygnięty czar permanentu, powrót z grobu,
    // land drop, rozstrzygnięty czar aury bestow). permanent_cast NIE jest
    // wejściem — od T1 (stos) czar permanenta leży wtedy na stosie i wchodzi
    // dopiero przy rozstrzygnięciu (permanent_entered_battlefield); triggery
    // ETB muszą odpalić się po rundzie passów, nie w chwili rzutu.
    if (ev.type === 'land_played' || ev.type === 'permanent_entered_battlefield' || (ev.type === 'object_moved' && ev.toZone === 'battlefield')) {
      const entered = state.objects.get(ev.object?.id);
      if (!entered) return;
      // M68 (daybound, CR 708.9c): gdy designation nie jest ustalone, a na
      // bitwisko wchodzi permanent z daybound — staje się dzień.
      if (state.dayNight === null && (entered.keywords ?? []).includes('daybound')) {
        setDayNight(state, 'day');
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
        }
        const fired = event('ability_triggered', {
          objectId: entered.id, cardId: entered.cardId,
          trigger: 'enter_battlefield', devour: true,
        });
        state.events.push(fired); events.push(fired);
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
        // odpali (nic nie poświęcono).
        if (exploitCandidates.length === 0) return;
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
        tryFire(state, ability, entered, [], events, { enteredTapped: Boolean(entered.tapped) });
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
            if (entered.kind === 'creature' && source.id !== entered.id) {
              tryFire(state, ability, source, [], events);
            }
          } else if (triggerEvent === 'land_entered_under_your_control') {
            if (entered.kind === 'land' && entered.controllerId === source.controllerId) {
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
    // Rzucenie czaru (spell_cast — instant/sorcery), zagranie permanentu
    // (permanent_cast — stwór/artefakt/enchantment) albo czar aury
    // (aura_spell_cast — bestow/czysta aura): triggery „when you cast a spell"
    // (np. Illusory Demon — poświęcenie źródła, tylko własne czary) oraz
    // „whenever a player casts a [kolor] spell" (Angel's Feather — dowolny
    // gracz, warunek na kolorze z deskryptora triggera). Źródło musi być na
    // bitwisku, więc casting samego źródła go nie poświęca (nie było na bitwisku).
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
      // M68 (daybound, CR 708.9d): „the first time a player casts a spell
      // during their turn after a permanent with daybound entered the
      // battlefield, it becomes night". Warunek dayNight !== 'night' sprawia,
      // że tylko PIERWSZY rzut (po zmianie na night warunek gaśnie) wyzwala;
      // daybound musi być na bitwisku. Noc transformuje daybound na nightbound.
      if (state.dayNight !== 'night' && hasDayboundPermanent(state)) {
        setDayNight(state, 'night');
      }
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(source)) {
          const triggerEvent = ability?.trigger?.event;
          if (triggerEvent === 'when_you_cast_spell') {
            // Casting SAMEJ karty nie poświęca jej: w MtG źródło nie jest na
            // bitwisku w momencie rzucenia (jest na stosie). Ev permanent_cast
            // niesie obiekt już na bitwisku — pomijamy go.
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
            queueTriggerToStack(state, ability, source, [], events, { manaSpent: ev.manaSpent ?? 0 });
          } else if (triggerEvent === 'you_cast_second_spell_each_turn') {
            // Illvoi Operative: „Whenever you cast your second spell each
            // turn". Odpala wyłącznie przy DRUGIM rzucie kontrolera źródła
            // w tej turze (licznik per gracz powyżej). Własny rzut źródła go
            // nie odpala — źródło nie jest jeszcze na bitwisku (jak prowess).
            if (source.controllerId !== ev.playerId || castNumberThisTurn !== 2) continue;
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
        for (const source of state.objects.values()) {
          if (source.zone !== 'battlefield') continue;
          for (const ability of effectiveAbilities(source)) {
            if (ability?.trigger?.event === 'attacks_alone') {
              tryFire(state, ability, source, [], events, { attackerId: aloneId });
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
            const candidates = triggerTargetCandidates(state, { type: 'creature_defending_player_controls' }, attachment, { defendingPlayerId });
            // „Up to one": bez stworów obrońcy trigger i tak odpala (licznik
            // na nosicielu) — decyzja z allowNone i pustymi kandydatami.
            // Kontekst (defendingPlayerId) musi wędrować do rozstrzygnięcia —
            // legalTriggerTargetCandidates liczy kandydatów dynamicznie.
            queueTargetDecision(state, ability, attachment, candidates, true, [attackerId], events, { defendingPlayerId }, { type: 'creature_defending_player_controls' });
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
      // M68 (daybound, CR 708.9f): w nocy, na początku upkeepu AKTYWNEGO
      // gracza, który nie rzucił żadnego czaru w swojej poprzedniej turze,
      // noc staje się dniem (nightbound transformują z powrotem).
      if (state.dayNight === 'night'
        && (state.lastTurnSpellsCastByPlayer?.[state.turn.activePlayerId] ?? 0) === 0) {
        setDayNight(state, 'day');
      }
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
    // Po kroku dobierania (CR 714.3b: „after your draw step") każda Saga
    // AKTYWNEGO gracza dostaje licznik lore i odpala kolejny rozdział.
    // Temat 2 dla Sag: rozdziały z `requiresTarget` kolejkuja decyzję CELU
    // (resolve_trigger_target) zamiast iść od razu na stos.
    if (ev.type === 'step_advanced' && ev.step === 'main' && ev.phase === 'precombat_main') {
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
        if (pending.playerId !== state.turn.activePlayerId) { remaining.push(pending); continue; }
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
          if (ability?.trigger?.event === 'beginning_of_combat') tryFire(state, ability, object, [], events);
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
  // Uwaga: zdarzenia triggerów są JUŻ w state.events — fireTrigger i bloki
  // kroków dopisują je przy tworzeniu, a lokalny `events` zbiera wyłącznie
  // wycinki state.events (slice(before)). Ponowny push duplikowałby każde
  // zdarzenie w logu (naprawione przy Plague Reaver / batch 16).
  return events;
}
