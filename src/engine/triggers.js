import { holdReplacementResolution } from './destruction.js';
import { isTargetingBlockedByProtection } from './attachments.js';
import { event } from '../protocol/types.js';
import { singleTargetOfStackEntry } from './objects.js';
import {
  applyEffect, applyEnterCounters, creaturesNotControlledByOwner, creaturesYouControl, faceDownCreaturesYouControl,
  landCreaturesYouControl, libraryCardsOf, millTargetPlayerId, otherCreaturesYouControl,
  counterStackObject,
} from './effects.js';
import { addCounter, hasCounter } from './counters.js';
import { deathZoneFor, isCardInOpponentGraveyard } from './zones.js';
import { changeLife, setPlayerSpeed } from './players.js';
// CARD_TYPES (O-2 audytu PR #134, L41): zamknięta lista typów kart (CR 205.2a)
// ma JEDNO źródło w `permanents.js` — delirium (CR 207.2c), licznik wszystkich
// grobów i dozwolone typy w `render.js` czytają tę samą listę.
import { CARD_TYPES, effectiveAbilities, effectiveKeywords, effectivePower, wardAmountOf, grantKeywordsUntilEndOfTurn } from './permanents.js';
import { moveObjectDirectly } from './objects.js';
import { tapLandForMana, canPayColoredCost, spendMana, producibleMana } from './resources.js';

/**
 * Minimalny framework zdolności triggerowanych (CR 603).
 *
 * Uruchamiany po każdej zaakceptowanej komendzie (game-state.js `accepted`):
 * skanuje zdarzenia wygenerowane przez tę komendę (łącznie z centralnymi
 * state-based actions) i odpala triggery pasujących źródeł. Od T6 każda
 * odpalona zdolność idzie na WSPÓLNY STOS (queueTriggerToStack, CR 603.3)
 * i rozstrzyga się po pełnej rundzie passów — obaj gracze mają okno
 * odpowiedzi. Wybory „may" / „you may pay" / „unless" zapadają przy
 * rozstrzyganiu (CR 603.5, Etap F — queueDeferredChoiceTrigger); cele
 * i tryby — przy kładzeniu na stos (CR 603.3c/d).
 *
 * Obsługiwane zdarzenia triggerów:
 * - `dies` — obiekt opuszcza battlefield do graveyard (np. Highland Game);
 * - `combat_damage_to_player` — stwór zadaje obrażenia combat graczowi
 *   (Kappa Tech-Wrecker); cel wybiera kontroler (Temat 2), a „up to one"
 *   pozwala odmówić (allowNone);
 * - `enter_battlefield` — permanent wchodzi na pole bitwy (Zoraline; także landy:
 *   Rupture Spire z obowiązkową płatnością „sacrifice it unless you pay {1}",
 *   deskryptor `payMana` + `sacrificeIfUnpaid` — patrz queuePayOrSacrifice);
 * - `attacks` — stwór zostaje zadeklarowany jako atakujący (Zoraline);
 * - `bat_attacks` — „whenever a Bat you control attacks" (tribał Zoraline);
 * - `upkeep` — początek kroku upkeep z warunkiem na liczbę czarów
 *   w poprzedniej turze (transform wilkołaków).
 *
 * Opcjonalny koszt triggera: `payMana` / `payLife` w deskryptorze — zdolność
 * idzie na stos zawsze, a przy rozstrzyganiu kontroler decyduje, czy płaci
 * (resolve_optional_pay_choice; bez możliwości zapłaty — brak efektu).
 */

/**
 * Speed (Batch 24, Glitch Ghost Surveyor — „Start your engines!"): wzrasta
 * RAZ na własną turę, gdy PRZECIWNIK TRACI ŻYCIE (nie „gdy dostaje
 * obrażenia"), do maksimum 4. Samo „start" robi efekt start_engines
 * (ETB źródła); speed jest cechą gracza i trwa po odejściu źródła.
 * M361/B4 (ZŁOTO; mtg.wiki/page/Speed 2026-09-16, ADR 0030):
 * „Whenever one or more opponents lose life during your turn, if your
 * speed is less than 4, increase your speed by 1. This ability triggers
 * only once each turn." — hook na life_changed obejmuje JEDNYM punktem
 * obrażenia (combat/niecombat wołają changeLife) i czystą utratę życia
 * (lose_life), a z natury pomija: obrażenia zapobiegnięte (brak
 * life_changed), infect w gracza (tylko poison, bez changeLife — brak
 * utraty życia) oraz utratę własnego życia (tracący ≠ „opponent").
 * Bramki „tylko własna tura / raz na turę / max 4" bez zmian.
 */
function bumpSpeedOnLifeLost(state, loserId) {
  for (const player of state.players) {
    if (player.id === loserId) continue; // tracący to nie „opponent" sam dla siebie
    if ((player.speed ?? 0) <= 0) continue; // tylko gracze z prędkością
    if (state.turn.activePlayerId !== player.id) continue; // tylko własna tura
    if (state.speedIncreasedThisTurn?.[player.id]) continue; // raz na turę
    if ((player.speed ?? 0) >= 4) continue; // max speed
  // Zapis wyłącznie przez choke point `setPlayerSpeed` (players.js) — ten sam,
  // który stosuje akcję stanową „Start your engines!” (state-based.js). Bramka
  // „czy wolno wzrosnąć” zostaje tutaj (to warunek triggera), mutacja nie.
      // E7/B2 (zgłoszenie właściciela): `setPlayerSpeed` SAM pushuje zdarzenie
      // do `state.events` i dopiero potem je zwraca („wołający nie dubluje
      // pusha") — re-push tutaj dawał PODWÓJNY wpis „Zwiększasz prędkość"
      // w modalu Rozgrywka. Wołamy bez rozszerzania do dziennika.
      setPlayerSpeed(state, player.id, (player.speed ?? 0) + 1);
    state.speedIncreasedThisTurn = { ...(state.speedIncreasedThisTurn ?? {}), [player.id]: true };
  }
}

/**
 * Liczba różnych typów kart obecnych w grobie gracza (delirium, CR 207.2c:
 * próg 4). Filtr typów to wspólna `CARD_TYPES` (CR 205.2a) — nadtypy się nie
 * liczą, tokeny w grobie nie są kartami (`name` ustawione) i nie wnoszą typu.
 */
export function graveyardCardTypeCount(state, playerId) {
  const present = new Set();
  for (const objectId of state.zones.graveyard) {
    const object = state.objects.get(objectId);
    if (!object || object.controllerId !== playerId || object.name != null) continue;
    for (const type of object.types ?? []) {
      if (CARD_TYPES.includes(type)) present.add(type);
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
  // Coven (CR 603.4): aktualne efektywne moce; ten sam predykat przy
  // wyzwoleniu i resolution. Nie zapamiętujemy trójki stworów.
  if (condition.distinctCreaturePowersAtLeast != null) {
    const powers = new Set(creaturesYouControl(state, sourceObject.controllerId)
      .map(object => effectivePower(object, state)));
    if (powers.size < condition.distinctCreaturePowersAtLeast) return false;
  }
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
  // Delirium (CR 207.2c, Fear of Burning Alive — intervening if):
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
  // Offspring (BLB, Rust-Shield Rampager): trigger „when this creature
  // enters, create a 1/1 token copy" istnieje tylko u stwora rzuconego
  // z opłaconym kosztem offspring (flaga wasOffspring na permanencie).
  if (condition.wasOffspring) {
    return Boolean(sourceObject?.wasOffspring);
  }
  // M67 (Homicidal Brute — tył Civilized Scholar): „At the beginning of your
  // end step, if this creature DIDN'T ATTACK this turn, tap this creature,
  // then transform it." — flaga attackedThisTurn na atakujących (declareAttackers),
  // czyszczona w cleanup; sprawdzana przy rozstrzyganiu triggera (intervening if).
  if (condition.saddled) {
    return Boolean(sourceObject?.saddled);
  }
  // Survival (DSK, Cautious Survivor; CR 603.4 + rulingi 2024-09-20): „At the
  // beginning of your second main phase, IF THIS CREATURE IS TAPPED, you gain
  // 2 life." — stan TAPNIĘCIA źródła. Warunek sprawdzany przy zgłoszeniu
  // (nietapnięty na starcie fazy = brak triggera; tapnięcie w fazie już nie
  // pomoże) I PONOWNIE przy rozstrzyganiu (odkręcony przed rozstrzygnięciem =
  // nic), a gdy źródło opuściło pole bitwy — z LKI („use its tapped or
  // untapped status as it last existed on the battlefield"): dlatego
  // queueTriggerToStack zapisuje `tapped` w migawce, a stub LKI je niesie.
  if (condition.sourceTapped) {
    return sourceObject?.tapped === true;
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
  // creature." Intervening if — liczba tapniętych stworów kontrolera źródła.
  if (condition.minTappedCreaturesControlled != null) {
    let tapped = 0;
    for (const object of state.objects.values()) {
      if (object.zone !== 'battlefield' || object.kind !== 'creature') continue;
      if (object.controllerId !== sourceObject?.controllerId) continue;
      if (object.tapped) tapped += 1;
    }
    return tapped >= condition.minTappedCreaturesControlled;
  }
  // Batch 48 (Stampeding Elk Herd, DTK): FORMIDABLE — ability WORD (CR 207.2c:
  // „they have no special rules meaning and no individual entries in the
  // Comprehensive Rules"), więc warunek bierzemy z TEKSTU karty, nie z numeru
  // reguły (dawniej cytowane „CR 702.103", czyli bestow — audyt PR #134, D2).
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

/** Czy kontroler triggera może opłacić opcjonalny koszt (mana / życie /
 *  znacznik ze źródła — `payCounter`, Kappa Tech-Wrecker „you may remove
 *  a deathtouch counter from it"). */
function canPayTrigger(state, controllerId, trigger, source = null) {
  const player = state.players.find((p) => p.id === controllerId);
  if (!player) return false;
  if (trigger?.payCounter) {
    // Usunąć znacznik można tylko z permanentu, który nadal jest na polu
    // bitwy i go ma (nowy obiekt po zmianie strefy nie ma znaczników, CR 400.7).
    const { counter, amount = 1 } = trigger.payCounter;
    if (!source || source.zone !== 'battlefield' || !hasCounter(source, counter, amount)) return false;
  }
  // Opcjonalna płatność many (Panic Spellbomb {R}, Zoraline {W}{B}) liczy
  // manę PRODUKOWALNĄ (pula + nietapnięte źródła) — sama pula pomijała
  // gracza z nietapniętym landem, choć w MtG można go tapnąć (bug złotej
  // odznaki; płatność resolve_optional_pay_choice i tak używa spendMana,
  // który auto-tapuje landy — check był niespójny z płatnością).
  // Kolorowe pipy opcjonalnej płatności (Panic Spellbomb — „you may pay {R}"):
  // muszą być pokryte kolorową pulą/nietapniętymi źródłami, jak koszty czarów.
  // (A: przed strażnikiem (czyste) — joint (iv) bramki źródeł kosztowych.)
  const payReqs = (trigger?.payColors ?? []).map((color) => [color]);
  if ((trigger?.payMana ?? 0) > producibleMana(state, controllerId, null, {}, payReqs)) return false;
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
  // Protection (CR 702.16b, dosłownie CR 2026-08-07 „The Hobbit": „A
  // permanent or player with protection can't be targeted by spells or
  // abilities..." — od źródła o chronionej jakości): dotyczy także celów
  // ZDOLNOŚCI TRIGGEROWANYCH i niezależnie od kontrolera (inaczej niż
  // hexproof — ochrona blokuje też własne źródła). Źródło = obiekt-źródło
  // triggera (LKI, gdy go brak, nie filtruje — jakości nieznane).
  const protectedBlocked = (object) => (sourceObject
    // F2 (audyt PR #112): ta sama reguła celowania co w spells.js — jeden
    // predykat zamiast kopii (L41/L107/L140). Jakości + drukowane kolory.
    ? isTargetingBlockedByProtection(state, object, sourceObject)
    : false);
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
      return object?.zone === 'battlefield' && object.kind === 'creature' && (!hexproofBlocked(object) && !protectedBlocked(object));
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
        && (!hexproofBlocked(object) && !protectedBlocked(object));
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
    // CR 603.3d / Oracle ‘target opponent’: wybór spośród przeciwników,
    // nie tylko pierwszy gracz (1v1 pozostaje identyczne).
    return state.players.filter(p => p.id !== sourceObject.controllerId).map(p => p.id);
  }
  if (spec.type === 'card_in_opponent_graveyard') {
    // Batch 59 (Scavenging Harpy): „exile target card from an opponent's
    // graveyard" — dowolna KARTA z grobu przeciwnika (nie tylko stwór).
    // Kolejność = polityka deterministyczna (prezentacja = enumeracja):
    // najpierw karty najwartościowsze (efekt jest WROGI wobec celu —
    // HOSTILE_TRIGGER_TARGET_EFFECTS), remis rozstrzyga kolejność grobu
    // (sort stabilny). Tokeny nie są kartami (CR 108.2b) — odsiewa je
    // wspólny predykat z `zones.js` (to samo w ofercie i walidacji).
    return state.zones.graveyard
      .filter((objectId) => isCardInOpponentGraveyard(state.objects.get(objectId), sourceObject.controllerId))
      .sort((a, b) => targetValue(state.objects.get(b)) - targetValue(state.objects.get(a)));
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
  if (spec.type === 'aura_or_equipment_card_in_graveyard' && spec.controlledBy === 'controller') {
    // Batch 53 (Ironclad Slayer, EMN): „return target Aura or Equipment card
    // from your graveyard to your hand" — karty-własnego grobu z podtypem
    // Aura albo Equipment (token nie jest kartą, CR 108.2b).
    return state.zones.graveyard.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.controllerId !== sourceObject.controllerId) return false;
      if (object.name != null) return false;
      const isAura = (object.types ?? []).includes('Enchantment') && (object.subtypes ?? []).includes('Aura');
      const isEquipment = (object.types ?? []).includes('Artifact')
        && ((object.subtypes ?? []).includes('Equipment') || object.equipment != null);
      return isAura || isEquipment;
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
      if (object.kind === 'spell') return false;
      // CR 110.4a + ruling OTJ (2024-04-12, Annie Flash): „permanent card"
      // łapie TAKŻE land (Zoraline mówi „nonland" — jej deskryptor nie ma
      // `allowLands`). Jedna reguła dla oferty i walidacji (L48).
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      if (isLand && !spec.allowLands) return false;
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
      return !protectedBlocked(object);
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
        && (!hexproofBlocked(object) && !protectedBlocked(object));
    });
  }
  if (spec.type === 'creature_opponent_controls') {
    // Warmaker Gunship (EOE): „target creature an opponent controls" — stwory
    // PRZECIWNIKA kontrolera źródła (nie własne), bez hexproof.
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature'
        && object.controllerId !== sourceObject.controllerId
        && (!hexproofBlocked(object) && !protectedBlocked(object));
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
      return (!hexproofBlocked(object) && !protectedBlocked(object));
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
      if (hexproofBlocked(object) || protectedBlocked(object)) return false;
      return true;
    });
  }
  // Batch 53 (Acidic Slime, M3C): „destroy target artifact, enchantment,
  // or land" — suma trzech rodzin permanentów na polu bitwy (generycznie,
  // ADR 0002). Walidacja celu po stronie triggera = wybór z tej listy.
  if (spec.type === 'artifact_or_enchantment_or_land') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield'
        && (isArtifactOrEnchantment(object) || isLand(object))
        && (!hexproofBlocked(object) && !protectedBlocked(object));
    });
  }
  if (spec.type === 'artifact_or_enchantment' && !spec.controlledBy) {
    // Kor Sanctifiers: artefakty/enchantmenty (linia typów), nie źródło.
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.id !== sourceObject.id && isArtifactOrEnchantment(object)
        && (!hexproofBlocked(object) && !protectedBlocked(object));
    });
  }
  if (spec.type === 'artifact_you_control') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield'
        && object.controllerId === sourceObject.controllerId
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'))
        && object.id !== sourceObject.id
        && !protectedBlocked(object);
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
        return object && object.zone === 'battlefield' && (!hexproofBlocked(object) && !protectedBlocked(object));
      })
      .sort((a, b) => targetValue(state.objects.get(b)) - targetValue(state.objects.get(a)));
  }
  if (spec.type === 'artifact_or_creature') {
    // M365 (batch 56, Mobile Garrison): „untap ANOTHER target artifact or
    // creature YOU CONTROL" — typ dostaje generyczne zawężenia (ADR 0002):
    // `controlledBy: 'controller'` (wzorzec z 'permanent'/'land_you_control')
    // oraz jawną deskę „another"/„other" (`notSelf`). Wykluczenie ŹRÓDŁA jest
    // w tym typie DOMYŚLNE od Lodestone Needle („up to one target artifact or
    // creature" na artefakcie, który właśnie wszedł — źródło nigdy nie było
    // kandydatem), więc `notSelf` ma domyślnie wartość prawdziwą i służy
    // udokumentowaniu deski w karcie; `notSelf: false` (dziś nieużywane)
    // dopuściłoby źródło — CR 115.2 dla celów bez „another".
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield') return false;
      if (object.kind !== 'creature' && object.kind !== 'artifact') return false;
      if (spec.notSelf !== false && object.id === sourceObject.id) return false;
      if (spec.controlledBy === 'controller' && object.controllerId !== sourceObject.controllerId) return false;
      return !hexproofBlocked(object) && !protectedBlocked(object);
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
        if (hexproofBlocked(object) || protectedBlocked(object)) return false;
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
          && object.controllerId === defendingPlayerId && (!hexproofBlocked(object) && !protectedBlocked(object));
      })
      .sort((a, b) => targetValue(state.objects.get(b)) - targetValue(state.objects.get(a)));
  }
  // Batch 22: Selesnya Charm tryb 2 — stwór z mocą ≥ N (domyślnie 5).
  if (spec.type === 'creature_with_power_at_least') {
    const min = spec.min ?? 5;
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
      if (hexproofBlocked(object) || protectedBlocked(object)) return false;
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
      if (hexproofBlocked(object) || protectedBlocked(object)) return false;
      if (spec.opponentControls && object.controllerId === sourceObject.controllerId) return false;
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      return !isLand;
    });
  }
  // Batch 58/B3 (Polluted Dead): „destroy target land" — DOWOLNY land na polu
  // bitwy, bez ograniczenia kontrolera (Oracle nie mówi „you don't control").
  // Lustro czarowej ścieżki celu (`legalTargetCandidates`/`validateTargets`
  // w spells.js obsługują `{ type: 'land' }` od Batcha 22 — Vandalize), żeby
  // oferta, walidacja decyzji i zdolność na stosie czytały jedną regułę (L48).
  if (spec.type === 'land') {
    return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && isLand(object)
        && (!hexproofBlocked(object) && !protectedBlocked(object));
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
        && object.id !== sourceObject.id
        && !protectedBlocked(object);
    });
  }
  return [];
}

/**
 * Zdolności działające przy śmierci: własne + nadane „do końca tury" przed
 * zmianą strefy (LKI, CR 603.10 — np. trigger z Fake Your Own Death).
 */
/**
 * W-9 (D4b, LKI — CR 603.10): czy obiekt, który opuścił pole bitwy, BYŁ
 * danego rodzaju w chwili odejścia. Nowy obiekt w grobie ma cechy karty
 * (CR 400.7 — animacja „do końca tury” nie przechodzi), więc obsadzony
 * pojazd czy ożywiony ląd rozpoznajemy po `formerKind`/`formerTypes`.
 * Token usunięty z grobu (fallback `ev.object`) — cechy z chwili zdarzenia.
 */
function diedAs(object, kind, type) {
  if (!object) return false;
  if (object.kind === kind || (object.types ?? []).includes(type)) return true;
  if (object.formerZone !== 'battlefield') return false;
  return object.formerKind === kind || (object.formerTypes ?? []).includes(type);
}

function abilitiesOnDeath(object) {
  return [...effectiveAbilities(object), ...(object.formerAbilityGrants ?? [])];
}

/** Czy któryś efekt wymaga zdjęcia licznika ze źródła (warunek odpalenia). */
/**
 * CR 714.2b — „{rN}—[Effect]" znaczy „When one or more lore counters are put
 * onto this Saga, if the number of lore counters on it was less than N and
 * became at least N, [effect]."
 *
 * Jedno miejsce wyliczające przekroczone progi (L41: kopie się rozjeżdżają).
 * Zgłoszenie właściciela B2 (2026-09-10): poświęcenie Sagi jest AKCJĄ
 * STANOWĄ (CR 714.4), więc od tej pory liczy się KAŻDA droga dołożenia
 * licznika lore — proliferate (CR 701.34) też. Wcześniej rozdziały
 * kolejkowały tylko wejście i akcja turowa, więc Saga dobita proliferatem do
 * ostatniego progu była poświęcana bez rozstrzygnięcia rozdziału.
 */
function queueSagaChaptersForLore(state, sagaObject, previousTotal, newTotal, events) {
  if (!sagaObject?.saga) return 0;
  const chapters = sagaObject.saga.chapters ?? [];
  let queued = 0;
  for (let n = 1; n <= chapters.length; n += 1) {
    // Próg przekroczony TYM dołożeniem: było < N, jest >= N (714.2b).
    if (previousTotal >= n || newTotal < n) continue;
    queueSagaChapter(state, sagaObject, n, events);
    queued += 1;
  }
  return queued;
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
    // M407: pełne efekty rozdziału dla warstwy INTENCJI (friendly/debuff/
    // pump/evasionGrant) — ability.effect jest puste (M172/B), więc bez tego
    // sygnały widziały pustą listę i każdy rozdział Sag z celem wracał do
    // klasy „najmniejszy power" (uwaga z gry — Shiva/Mesmerize).
    chapterEffects: [...effects],
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
  // Zgłoszenie właściciela B2 (2026-09-10): poświęcenie Sagi po ostatnim
  // rozdziale to AKCJA STANOWA (CR 714.4, na liście SBA jako 704.5s) —
  // mtg.wiki/Saga: „the Saga's
  // controller sacrifices it as soon as its chapter ability has left the
  // stack, most likely by resolving or being countered. This state-based
  // action doesn't use the stack." Wcześniej siedziało tutaj, w środku
  // rozstrzygania rozdziału, więc `permanent_sacrificed` lądowało w logu
  // PRZED `trigger_resolved` („Rediscover the Way zostaje poświęcony" →
  // „…trigger się rozstrzyga (rozdział 3)"). Teraz robi to
  // `sacrificeFinishedSagas` (state-based.js, wołana z `execute` PO przebiegu
  // triggerów) z bramką „zdolność rozdziału zeszła ze stosu".
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
    // Audyt PR #96/F3 + PR #97/O3: flagi rzutu to FAKTY HISTORYCZNE —
    // re-check intervening-if (CR 603.4) i liczności efektów (Marut) czytają
    // je ze stubu LKI, gdy źródło opuściło już pole bitwy (CR 603.10/608.2b).
    wasOffspring: source.wasOffspring === true,
    wasKicked: source.wasKicked === true,
    wasCast: source.wasCast === true,
    manaFromTreasureSpent: source.manaFromTreasureSpent ?? 0,
    // Survival (batch 56, Cautious Survivor): stan tapnięcia źródła jest
    // faktem z chwili odpalenia triggera — re-check intervening-if (CR 603.4)
    // czyta go, gdy źródło zniknęło z pola bitwy (ruling DSK 2024-09-20:
    // „use its tapped or untapped status as it last existed").
    tapped: source.tapped === true,
  });
  // Audyt PR #96/F3: migawka cech źródła do efektów kopiujących
  // (create_offspring_token) — ruling Offspring (BLB): token powstaje także
  // gdy źródło opuści pole bitwy przed rozstrzygnięciem (CR 603.10/608.2b).
  const printLki = Object.freeze({
    kind: source.kind ?? null,
    cardName: source.cardName ?? source.cardId ?? null,
    colors: Object.freeze([...(source.colors ?? [])]),
    types: Object.freeze([...(source.types ?? [])]),
    subtypes: Object.freeze([...(source.subtypes ?? [])]),
    keywords: Object.freeze([...(source.keywords ?? [])]),
    abilities: Object.freeze([...(source.abilities ?? [])]),
    manaCost: source.manaCost ?? 0,
    ...(source.entersWithCounters ? { entersWithCounters: source.entersWithCounters } : {}),
    ...(source.entersWithCountersIf ? { entersWithCountersIf: source.entersWithCountersIf } : {}),
    ...(source.station ? { station: source.station } : {}),
    ...(source.saga ? { saga: source.saga } : {}),
    ...(source.transformTo ? { transformTo: source.transformTo } : {}),
    ...(source.frontFaceId ? { frontFaceId: source.frontFaceId } : {}),
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
      printLki,
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
      // Audyt PR #93 / znalezisko J (CR 702.185a): właściciel może rzucić
      // kartę z exile dopiero „after the current turn has ended" — stempel
      // tury wygnania, lustrzany do `plottedAtTurn` przy plocie.
      state.objects.set(exileId, Object.freeze({ ...exiled, warpReady: true, warped: false, warpedAtTurn: state.turn.number }));
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
    // M274 (#24, CR 122.6): opóźniony powrót na pole bitwy to też WEJŚCIE —
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
 * Etap F (CR 603.5) — rozstrzygnięcie zdolności z wyborem odroczonym do
 * rozstrzygania (queueDeferredChoiceTrigger). Otwiera blokującą decyzję
 * kontrolera; jej komenda (game-state.js) wykonuje efekt W RAMACH tego
 * rozstrzygnięcia (`resolveAbility` / `onResolution`) — przez
 * `applyDeferredTriggerEffects`, z tym samym źródłem (żywym albo stubem LKI).
 */
function resolveDeferredChoice(state, entry, payload, source, extra, choice) {
  const { deferredChoice: _omit, ...plainExtra } = extra;
  const controllerId = entry.controllerId;
  const resolvedEvent = (fields) => event('trigger_resolved', {
    objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, ...fields,
  });
  if (choice.kind === 'payOrSacrifice') {
    // „Sacrifice it unless you pay": permanent, który opuścił pole bitwy,
    // nie ma czego poświęcać — płatność nic by nie dała (CR 608.2b).
    const live = state.objects.get(payload.sourceId);
    if (!live || live.zone !== 'battlefield') {
      state.events.push(resolvedEvent({ noEffect: true, reason: 'source_left' }));
      return;
    }
    queuePayOrSacrifice(state, live, choice.amount ?? 0, [], choice.triggerEvent ?? 'echo', choice.colors ?? []);
    state.events.push(resolvedEvent({ payOrSacrifice: true }));
    return;
  }
  if (choice.kind === 'optionalPay') {
    const trigger = payload.ability?.trigger ?? {};
    if (!canPayTrigger(state, controllerId, trigger, state.objects.get(payload.sourceId) ?? null)) {
      // Nie da się zapłacić — „If/When you do" nie zachodzi.
      state.events.push(resolvedEvent({ noEffect: true, reason: 'cannot_pay' }));
      return;
    }
    state.pendingOptionalPay = {
      playerId: controllerId,
      sourceId: payload.sourceId,
      ability: Object.freeze({ ...payload.ability }),
      targetId: null,
      extra: Object.freeze({ ...plainExtra }),
      restorePriorityTo: state.turn.priorityPlayerId,
      requiresTargetDecision: Boolean(choice.requiresTargetDecision),
      onResolution: true,
      stackEntryId: entry.id,
      source,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('optional_pay_required', {
      playerId: controllerId, sourceId: payload.sourceId, cardId: entry.cardId,
      payMana: trigger.payMana ?? 0, payLife: trigger.payLife ?? 0,
      payColors: trigger.payColors ?? [],
      payCounter: trigger.payCounter ?? null,
    }));
    return;
  }
  // choice.kind === 'optional' — „you may [efekt]".
  // Zdolność z celami, których żaden nie istnieje już w grze (przesunięty
  // obiekt = nowy obiekt, CR 400.7), nie rozstrzyga się (CR 608.2b) — nie
  // ma o co pytać.
  const targets = payload.targets ?? [];
  const targetObjectIds = targets.filter((id) => typeof id === 'string' && !state.players.some((p) => p.id === id));
  if (targetObjectIds.length > 0 && targetObjectIds.length === targets.length
    && targetObjectIds.every((id) => !state.objects.has(id))) {
    state.events.push(resolvedEvent({ noEffect: true, reason: 'no_targets' }));
    return;
  }
  state.pendingOptionalTrigger = {
    playerId: controllerId,
    sourceId: payload.sourceId,
    cardId: entry.cardId,
    ability: Object.freeze({ ...payload.ability }),
    extra: Object.freeze({ ...plainExtra }),
    targets: [...(payload.targets ?? [])],
    restorePriorityTo: state.turn.priorityPlayerId,
    resolveAbility: true,
    stackEntryId: entry.id,
    source,
  };
  state.turn.priorityPlayerId = controllerId;
  state.events.push(event('optional_trigger_required', {
    playerId: controllerId, sourceId: payload.sourceId, cardId: entry.cardId,
  }));
}

/**
 * Etap F (CR 603.5): efekty zdolności, której wybór zapadł przy
 * rozstrzyganiu (decyzja tak / zapłacono). Źródło: żywy obiekt, a gdy
 * zniknął — stub LKI zapamiętany przy rozstrzyganiu (CR 603.10).
 */
export function applyDeferredTriggerEffects(state, pending, ability) {
  const live = state.objects.get(pending.sourceId);
  const source = live ?? pending.source;
  if (!source) return;
  const sourceForEffects = Object.freeze({ ...source, controllerId: pending.playerId });
  applyTriggerEffects(state, ability, sourceForEffects, pending.targets ?? [], pending.extra ?? {});
  state.events.push(event('trigger_resolved', {
    objectId: pending.stackEntryId ?? null, sourceId: pending.sourceId,
    cardId: source.cardId ?? pending.cardId ?? null,
  }));
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
  const printLki = payload.printLki ?? null;
  const sourceCharacteristics = liveSource ?? Object.freeze({
    id: payload.sourceId, controllerId: entry.controllerId,
    cardId: entry.cardId, zone: 'none', kind: null,
    power: lki.power, toughness: lki.toughness,
    powerModifier: lki.powerModifier ?? 0, toughnessModifier: lki.toughnessModifier ?? 0,
    faceDown: lki.faceDown ?? false,
    wasOffspring: lki.wasOffspring === true,
    // Audyt PR #97/O3: pozostałe fakty historyczne rzutu (rodzina F3).
    wasKicked: lki.wasKicked === true,
    wasCast: lki.wasCast === true,
    manaFromTreasureSpent: lki.manaFromTreasureSpent ?? 0,
    // Survival (batch 56): LKI niesie stan tapnięcia — re-check warunku
    // { sourceTapped } po śmierci/opuszczeniu pola bitwy (CR 603.4/603.10).
    tapped: lki.tapped === true,
    // Audyt PR #96/F3: nośnik cech dla efektów kopiujących (ruling Offspring).
    lkiPrint: printLki ? Object.freeze({
      kind: printLki.kind ?? null, cardId: entry.cardId,
      cardName: printLki.cardName ?? entry.cardId, controllerId: entry.controllerId,
      colors: [...(printLki.colors ?? [])], types: [...(printLki.types ?? [])],
      subtypes: [...(printLki.subtypes ?? [])], keywords: [...(printLki.keywords ?? [])],
      abilities: [...(printLki.abilities ?? [])], manaCost: printLki.manaCost ?? 0,
      ...(printLki.entersWithCounters ? { entersWithCounters: printLki.entersWithCounters } : {}),
      ...(printLki.entersWithCountersIf ? { entersWithCountersIf: printLki.entersWithCountersIf } : {}),
      ...(printLki.station ? { station: printLki.station } : {}),
      ...(printLki.saga ? { saga: printLki.saga } : {}),
      ...(printLki.transformTo ? { transformTo: printLki.transformTo } : {}),
      ...(printLki.frontFaceId ? { frontFaceId: printLki.frontFaceId } : {}),
    }) : null,
    counters: {}, formerCounters: {}, keywords: [], abilities: [], types: [],
  });
  // CR 109.5: zmiana kontrolera permanenta nie zmienia „you” na triggerze.
  const source = Object.freeze({ ...sourceCharacteristics, controllerId: entry.controllerId });
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
      if (producibleMana(state, payer, null, {}, []) >= extra.wardPay.amount) {
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
  // Etap F (CR 603.3 + 702.62a, druga zdolność suspend): „At the beginning
  // of your upkeep, if this card is suspended, remove a time counter from
  // it." — zdolność wyzwalana na STOSIE; intervening-if („if this card is
  // suspended", CR 603.4) sprawdzany ponownie teraz. Zdjęcie OSTATNIEGO
  // licznika wyzwala trzecią zdolność (suspend_ready) — też na stos.
  if (extra.suspendTickObjectId) {
    const tickId = extra.suspendTickObjectId;
    const card = state.objects.get(tickId);
    const stillSuspended = Boolean(card && card.zone === 'exile' && card.suspended && (card.timeCounters ?? 0) > 0);
    if (stillSuspended) {
      const remaining = card.timeCounters - 1;
      state.objects.set(tickId, Object.freeze({ ...card, timeCounters: remaining }));
      state.events.push(event('time_counter_removed', {
        playerId: entry.controllerId, objectId: tickId, cardId: card.cardId,
        remaining, ready: remaining === 0,
      }));
      if (remaining === 0) {
        queueTriggerToStack(state, {
          type: 'triggered',
          trigger: { event: 'suspend_ready' },
          effect: [],
        }, state.objects.get(tickId), [], [], { suspendObjectId: tickId });
      }
    }
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId,
      suspendTick: true, ...(stillSuspended ? {} : { noEffect: true }),
    }));
    return state.events.slice(before);
  }
  // Etap F (CR 603.3 + 603.7 + 702.88a): rebound — „At the beginning of your
  // next upkeep, you may cast this card from exile without paying its mana
  // cost." to OPÓŹNIONA zdolność wyzwalana: idzie na stos, a „may" (rzut albo
  // odmowa) pada przy rozstrzyganiu (CR 603.5). Karta, która opuściła exile
  // w odpowiedzi, nie daje już nic (CR 400.7).
  if (extra.reboundObjectId) {
    const card = state.objects.get(extra.reboundObjectId);
    const ready = Boolean(card && card.zone === 'exile' && card.reboundReady);
    if (ready) {
      state.pendingReboundCast = {
        playerId: entry.controllerId,
        objectId: extra.reboundObjectId,
        cardId: card.cardId,
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = entry.controllerId;
      state.events.push(event('rebound_ready_required', {
        playerId: entry.controllerId, objectId: extra.reboundObjectId, cardId: card.cardId,
      }));
    }
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId,
      rebound: true, ...(ready ? {} : { noEffect: true }),
    }));
    return state.events.slice(before);
  }
  // Etap F (CR 603.3 + 603.5 + 702.110a): exploit — „When this creature
  // enters, you may sacrifice a creature." Zdolność na stosie; wybór ofiary
  // (albo odmowa) pada przy rozstrzyganiu, spośród stworów kontrolera
  // obecnych TERAZ (VOW Release Notes: także sam exploiter, o ile jest).
  if (extra.exploitChoice) {
    const candidateIds = state.zones.battlefield.filter((objectId) => {
      const candidate = state.objects.get(objectId);
      return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
        && candidate.controllerId === entry.controllerId;
    });
    if (candidateIds.length > 0) {
      state.pendingExploits.push({
        playerId: entry.controllerId,
        sourceId: payload.sourceId,
        candidateIds,
        restorePriorityTo: state.turn.priorityPlayerId,
      });
      state.turn.priorityPlayerId = entry.controllerId;
      state.events.push(event('exploit_choice_required', {
        playerId: entry.controllerId, sourceId: payload.sourceId,
        cardId: entry.cardId, candidateIds: [...candidateIds],
      }));
    }
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId,
      exploit: true, ...(candidateIds.length > 0 ? {} : { noEffect: true, reason: 'no_targets' }),
    }));
    return state.events.slice(before);
  }
  // Etap F (CR 603.3 + 701.63): „When this creature enters, it endures N" —
  // zdolność na stosie; wybór (N liczników +1/+1 albo token Spirit N/N) pada
  // przy rozstrzyganiu. Gdy źródła nie ma już na polu bitwy, legalny jest
  // tylko token (CR 701.63b; bramka w resolve_endure_choice).
  if (extra.endureAmount != null) {
    applyEffect(state, { type: 'endure_x', amount: extra.endureAmount }, source, []);
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId, endure: true,
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
  // M359 (CR 603.3/608.2b): MENTOR z decyzji (Boros Challenger i rodzina).
  // Cel re-walidowany przy rozstrzyganiu: stwór na polu bitwy, NADAL
  // atakujący i o sile wciąż mniejszej od siły źródła (aktualnej, gdy
  // źródło żyje, albo ostatniej znanej ze snapshotu odpalenia — CR 603.10).
  if (extra.mentorCounter) {
    const targetId = (payload.targets ?? [])[0] ?? null;
    const target = targetId ? state.objects.get(targetId) : null;
    const sourcePower = (liveSource && liveSource.zone === 'battlefield' && liveSource.kind === 'creature')
      ? (effectivePower(liveSource, state) ?? 0)
      : (extra.mentorCounter.sourcePower ?? (lki.power ?? 0) + (lki.powerModifier ?? 0));
    const targetPower = target ? (effectivePower(target, state) ?? 0) : 0;
    const legal = Boolean(target && target.zone === 'battlefield' && target.kind === 'creature'
      && (state.combat?.attackers ?? []).includes(targetId)
      && targetPower < sourcePower);
    if (legal) addCounter(state, targetId, '+1/+1', 1);
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId,
      mentor: true, targetId, targetPower, sourcePower, noEffect: !legal,
      ...(!legal ? { reason: !target || target.zone !== 'battlefield' ? 'no_targets' : 'power_not_lesser' } : {}),
    }));
    return state.events.slice(before);
  }
  // M359 (CR 603.3/608.2b + 702.165a): BACKUP z decyzji (Gloomfang Mauler).
  // Cel re-walidowany przy rozstrzyganiu (stwór na polu bitwy); liczniki
  // zawsze, grant zdolności tylko, gdy cel to INNY stwór niż źródło
  // (porównanie id — źródło mogło zginąć w odpowiedzi, liczy się tożsamość
  // celu, nie przetrwanie źródła).
  if (extra.backupApply) {
    const targetId = (payload.targets ?? [])[0] ?? null;
    const target = targetId ? state.objects.get(targetId) : null;
    const legal = Boolean(target && target.zone === 'battlefield' && target.kind === 'creature');
    const grantedKeywords = legal && targetId !== payload.sourceId
      ? [...(extra.backupApply.grantKeywords ?? [])]
      : [];
    if (legal) {
      addCounter(state, targetId, '+1/+1', extra.backupApply.counters ?? 0);
      if (grantedKeywords.length > 0) grantKeywordsUntilEndOfTurn(state, targetId, grantedKeywords, { viaBackup: true });
    }
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId,
      backup: true, targetId, counters: extra.backupApply.counters ?? 0, grantedKeywords,
      self: targetId === payload.sourceId, noEffect: !legal,
      ...(!legal ? { reason: 'no_targets' } : {}),
    }));
    return state.events.slice(before);
  }
  // M359 (CR 603.3/603.4 + 207.2c): DELIRIUM z decyzji (Fear of Burning).
  // Cel re-walidowany przy rozstrzyganiu: stwór na polu bitwy pod kontrolą
  // poszkodowanego gracza („target creature that player controls"), ORAZ
  // intervening-if: 4+ typy kart w grobie kontrolera triggera — oba
  // sprawdzane PRZY ROZSTRZYGANIU (cel mógł zmienić kontrolera, typy
  // mogły opuścić grób w oknie odpowiedzi). Śmierć źródła nie zatrzymuje
  // triggera (CR 113.7a) — obrażenia idą ze snapshotu amount, źródłem
  // jest żywy obiekt albo stub LKI (jak pre-fix, ale bogatszy).
  if (extra.deliriumDamage) {
    const targetId = (payload.targets ?? [])[0] ?? null;
    const target = targetId ? state.objects.get(targetId) : null;
    const targetLegal = Boolean(target && target.zone === 'battlefield' && target.kind === 'creature'
      && target.controllerId === extra.deliriumDamage.opponentId);
    const deliriumHeld = graveyardCardTypeCount(state, extra.deliriumDamage.controllerId) >= 4;
    if (targetLegal && deliriumHeld) {
      applyEffect(state, { type: 'damage', amount: extra.deliriumDamage.amount ?? 0 }, source, [targetId]);
    }
    state.events.push(event('trigger_resolved', {
      objectId: entry.id, sourceId: payload.sourceId, cardId: entry.cardId,
      delirium: true, targetId, amount: extra.deliriumDamage.amount ?? 0,
      noEffect: !(targetLegal && deliriumHeld),
      ...(!(targetLegal && deliriumHeld) ? { reason: !targetLegal ? 'no_targets' : 'delirium_lost' } : {}),
    }));
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
  // Etap F (CR 603.5): wybór „may" / płatność „you may pay" / „unless"
  // zapada TERAZ — przy rozstrzyganiu, po sprawdzeniu intervening-if.
  // „You may [czasownik] target ..." (Reclusive Artificer, Battle-Rattle
  // Shaman, Mystic Sanctuary ...): cel wybrano przy kładzeniu na stos
  // (CR 603.3d — obowiązkowo, gdy istnieje), a samo „may" rozstrzyga się
  // tutaj — ścieżka resolve_trigger_target nie niesie `deferredChoice`,
  // więc wybór wynika z deskryptora (`mayFire`).
  const deferredChoice = extra.deferredChoice
    ?? (payload.ability?.trigger?.mayFire ? Object.freeze({ kind: 'optional' }) : null);
  if (deferredChoice) {
    resolveDeferredChoice(state, entry, payload, source, extra, deferredChoice);
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
  // legalny no-op (CR 701.26 — tap już tapniętego, untap odkręconego) też
  // nie produkuje zdarzeń, a trigger wykonał się w całości. M189/Z2 (Żywy
  // Tester, transkrypt audyt-m187/g10): bot rzucił Glaring Aegis w stwora
  // stapowanego wcześniej zdolnością many, a log ogłosił „nic się nie
  // wydarzyło (zerowy wynik)" — gracz miał prawo sądzić, że zdolność
  // przepadła. Efekt, który świadomie nic nie zmienia, bo stan JUŻ jest
  // docelowy, raportujemy jako zwykłe rozstrzygnięcie.
  if (holdReplacementResolution(state,entry,event('trigger_resolved',{
    objectId:entry.id,sourceId:payload.sourceId,cardId:entry.cardId,trigger:payload.ability?.trigger?.event??null,
  }))) return state.events.slice(before);
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
 * (CR 701.26: tap tapniętego / untap odkręconego to legalne, wykonane
 * działanie bez zmiany)? Rozróżnia „zdolność wykonała się, tylko nie było
 * co zmieniać" od „zdolność nie zrobiła nic" (Undead Servant przy pustym
 * grobie). Deskryptorowo — po typie efektu, nie po nazwie karty (ADR 0002).
 */
const STATE_IDEMPOTENT_EFFECTS = Object.freeze({
  tap_permanent: (object) => object?.tapped === true,
  untap_permanent: (object) => object?.tapped === false,
  // Silken Strength (M256/J, runda 3 Żywym Testerem): „when this Aura enters,
  // untap enchanted permanent" — odkręcenie już odkręconego gospodarza to
  // legalny no-op (CR 701.26), nie porażka triggera (klasa M189/Z2).
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
 * docelowy (CR 701.26). Osobna tabela, bo predykat dostaje CAŁY zbiór, nie
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
  // M356 (613 Duskmantle Seer): odbiorcą jest KAŻDY gracz (zawsze istnieje),
  // więc zero zdarzeń może pochodzić wyłącznie z pustych bibliotek — powód to
  // „pusta biblioteka", nie „brak celów" (ta sama rodzina co mill_cards).
  // Selektor WSPÓLNY z efektem (`libraryCardsOf` z effects.js, L41/L48).
  reveal_top_each_player_lose_life_mana_value: (state) => (
    state.players.every((player) => libraryCardsOf(state, player.id).length === 0)
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
 * Wspólna procedura „zapłać {N} albo poświęć" (CR 601.2h/702.1): Rupture Spire
 * (trigger ETB) i ECHO (CR 702.30, Bone Shredder — pierwszy własny upkeep po
 * wejściu). Wydzielona w Batchu 46, żeby obie ścieżki miały JEDNĄ regułę
 * płatności i te same zdarzenia (L41). Etap F (CR 603.5): wywoływana przy
 * ROZSTRZYGANIU triggera ze stosu (resolveDeferredChoice), nie przy
 * odpaleniu. Wybór zapłać/poświęć należy do kontrolera
 * (resolve_pay_or_sacrifice); bez możliwości zapłaty — poświęcenie.
 */
function queuePayOrSacrifice(state, source, amount, events, triggerEvent = 'echo', colors = []) {
  const controllerId = source.controllerId;
  // Temat 7 (Rupture Spire, CR 601.2h/702.1): „sacrifice it unless you pay
  // {1}" — wybór należy do KONTROLERA. Gdy płatność jest możliwa (pula +
  // nietapnięte landy), kolejkujemy decyzję resolve_pay_or_sacrifice; samą
  // płatność (spendMana z auto-tapem) albo poświęcenie wykonuje komenda.
  // Bez możliwości zapłaty — automatyczne poświęcenie (jak dotąd).
  // M259/B7 (CR 702.30 + 118.2): koszt echa {2}{B} wymaga pipa {B} —
  // bramka opłacalności obejmuje KOLORY (pula + nietapnięte źródła), a sama
  // płatność pobiera pipy (patrz resolve_pay_or_sacrifice → pay_mana).
  const canPay = producibleMana(state, controllerId, null, {}, [colors]) >= amount
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
  return ((trigger.payMana ?? 0) > 0 || (trigger.payLife ?? 0) > 0 || Boolean(trigger.payCounter))
    && !trigger.sacrificeIfUnpaid;
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
    // Batch 58/B6: wspólny predykat stref (refleks po przeszukaniu ma źródło
    // w grobie — czar rozstrzygnięty; L41) zamiast lokalnej listy stref.
    const srcLegal = Boolean(src
      && triggerSourceZoneResolvable(src, ability?.trigger?.event)
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
    // Batch 58/B6 (Prishe's Wanderings, CR 603.10): źródłem triggera może być
    // CZAR na stosie — rozstrzyga się (i znika z `state.objects` pod swoim id)
    // ZANIM gracz wybierze cel refleksu „when you search your library this
    // way". Dla źródła na stosie migawkę robimy od razu; w pozostałych
    // przypadkach żywy obiekt zostaje wiążący (LKI tylko, gdy już go nie ma).
    sourceLki: (state.objects.has(source.id) && source.zone !== 'stack')
      ? null : Object.freeze({ ...source }),
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
  // Refleks „When you do" (Audyt Batch53/A1): dziecko rozstrzygniętej już
  // zdolności — niezależne od strefy źródła (ruling LCI 2023-11-10).
  // Batch 58/B6: refleks po przeszukaniu biblioteki (Prishe's Wanderings) —
  // źródłem jest CZAR, który w chwili rozstrzygnięcia triggera jest już
  // w grobie (ruling FIN 2025-06-06), więc strefa 'none' jest legalna.
  return ['dies', 'any_creature_dies', 'leaves_battlefield', 'reflexive_sacrifice',
    'reflexive_discard', 'reflexive_search'].includes(triggerEvent);
}

/**
 * Strefa źródła dla DOMKNIĘCIA decyzji celu (L41 — jedno miejsce prawdy):
 * legalna strefa triggera (`triggerSourceZoneLegal`: pole bitwy oraz refleksy
 * „when you do / this way" z DOWOLNEJ strefy) albo LKI w grobie/wygnaniu
 * (śmierć/odejście źródła, CR 603.10). Używają tego ścieżka AUTO
 * (`queueTargetDecision`) i ręczna wielocelowa (game-state) — wcześniej każda
 * miała własną, ręcznie wypisaną listę stref.
 */
export function triggerSourceZoneResolvable(source, triggerEvent) {
  if (!source) return false;
  if (triggerSourceZoneLegal(source, triggerEvent)) return true;
  return source.zone === 'graveyard' || source.zone === 'exile';
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
  // Etap F (CR 603.5 + 603.12): „you may pay [koszt]. When you do, [efekt
  // z celem]" (Zoraline) — pierwsza zdolność NIE ma celu: idzie na stos
  // zawsze, płatność to wybór przy JEJ rozstrzyganiu, a dopiero opłacenie
  // tworzy refleksyjny trigger z celem. Kandydaci celu liczą się więc wtedy,
  // nie w chwili odpalenia (resolve_optional_pay_choice → decyzja celu).
  if (trigger.requiresTarget && hasPayCost(trigger)) {
    return queueDeferredChoiceTrigger(state, ability, source, events, extra, 'optionalPay', { requiresTargetDecision: true });
  }
  if (trigger.requiresTarget) {
    const spec = trigger.requiresTarget;
    const candidates = triggerTargetCandidates(state, spec, source, extra);
    // Cel obowiązkowy bez kandydata: zdolność jest usuwana ze stosu
    // (CR 603.3d). „Up to one target" (spec.optional — Lodestone Needle,
    // Jill) bez kandydata: CR pozwala położyć ją z zerem celów, ale jej
    // JEDYNY efekt dotyczy celu, więc rozstrzygnięcie nic by nie zrobiło —
    // pomijamy ją z wpisem „brak celów" (bez wpływu na grę: w katalogu nie ma
    // kart reagujących na samo położenie zdolności na stosie).
    // KARTA SPOZA KATALOGU: gdy pojawi się „up to one target" z efektem
    // NIEZALEŻNYM od celu (np. „draw a card and tap up to one target
    // creature"), taka zdolność musi iść na stos z zerem celów, a efekt bez
    // celu — wykonać się przy rozstrzyganiu (wzorzec: Greatsword of Tyr
    // w gałęzi `equipped_creature_attacks` — decyzja z allowNone i pustymi
    // kandydatami, licznik na nosicielu ląduje mimo braku celu).
    // „You may [czasownik] target" NIE używa spec.optional (Etap F, CR 603.5):
    // cel obowiązkowy + `mayFire` — wybór „may" przy rozstrzyganiu.
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
    if (!canPayTrigger(state, source.controllerId, trigger)) return false;
    // Temat 2: cel wybiera kontroler — resolve_trigger_target zamiast
    // deterministycznego findTriggerTarget (Forge Devil, Kor Sanctifiers,
    // Jill, Puppeteer Clique itd.).
    return queueTargetDecision(state, ability, source, candidates, Boolean(spec.optional), [], events, extra);
  }
  if (trigger.mayFire) {
    // „You may" bez celu (Angel's Feather — „you may gain 1 life"); wariant
    // z celem idzie gałęzią requiresTarget wyżej, a „may" rozstrzyga
    // resolveTriggerEntry z deskryptora.
    // Etap F (CR 603.5): zdolność idzie na stos NIEZALEŻNIE od zamiaru
    // kontrolera, a wybór tak/nie zapada przy rozstrzyganiu
    // (resolveTriggerEntry → pendingOptionalTrigger z `resolveAbility`).
    // Dawniej pytanie padało w chwili odpalenia, a „nie" w ogóle nie
    // kładło zdolności na stos — przeciwnik tracił okno odpowiedzi, a gracz
    // decydował przed nią.
    return queueDeferredChoiceTrigger(state, ability, source, events, extra, 'optional');
  }
  // Modalne triggery (Batch 22: Etherwrought Page upkeep): trigger ma
  // `effect.modes` (jak spell.modes dla modalnych czarów) — kolejkuje
  // decyzję modalną (pendingModalTrigger, resolve_modal_choice).
  // Tryb jest wybierany przez kontrolera, po czym efekty trybu są
  // aplikowane jak zwykły efekt triggera.
  if (Array.isArray(trigger.modes) && trigger.modes.length > 0) {
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
  // Etap F (CR 603.5): opcjonalna płatność nie bramkuje odpalenia —
  // opłacalność sprawdza się przy rozstrzyganiu (resolveDeferredChoice).
  if (!hasPayCost(trigger) && !canPayTrigger(state, source.controllerId, trigger)) return false;
  return fireOrQueuePay(state, ability, source, [], events, extra);
}

/**
 * Etap F (CR 603.5): „Some triggered abilities' effects are optional (they
 * contain “may,” ...). These abilities go on the stack when they trigger,
 * regardless of whether their controller intends to exercise the ability's
 * option or not. The choice is made when the ability resolves. Likewise,
 * triggered abilities that have an effect “unless” something is true or a
 * player chooses to do something will go on the stack normally; the “unless”
 * part of the ability is dealt with when the ability resolves."
 *
 * Wspólne wejście na stos dla trzech rodzin: `optional` („you may [efekt]"),
 * `optionalPay` („you may pay ... If/When you do") i `payOrSacrifice`
 * („sacrifice it unless you pay" — Rupture Spire, echo). Wybór rozstrzyga
 * `resolveDeferredChoice` przy rozstrzyganiu wpisu.
 */
function queueDeferredChoiceTrigger(state, ability, source, events, extra, kind, options = {}) {
  queueTriggerToStack(state, ability, source, [], events, {
    ...(extra ?? {}),
    deferredChoice: Object.freeze({ kind, ...options }),
  });
  return true;
}

/**
 * Temat 8 — opcjonalne płatności triggerów („you may pay [koszt]. If you do,
 * [efekt]": Panic Spellbomb {R}, Furious Forebear {1}{W}, Descendant of
 * Storms {1}{W}) to DECYZJA gracza, a nie automat.
 *
 * Etap F (CR 603.5): zdolność idzie na stos ZAWSZE — także gdy kontroler nie
 * zamierza albo nie może zapłacić — a płatność jest wyborem przy jej
 * rozstrzyganiu (resolveTriggerEntry → pendingOptionalPay z `onResolution`).
 * Dawniej decyzja i płatność padały w chwili odpalenia, a na stos szedł już
 * opłacony efekt: gracz płacił, zanim przeciwnik mógł odpowiedzieć.
 */
function fireOrQueuePay(state, ability, source, triggerTargets, events, extra) {
  const trigger = ability?.trigger ?? {};
  if (hasPayCost(trigger)) {
    return queueDeferredChoiceTrigger(state, ability, source, events, extra, 'optionalPay');
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
    // `dayNightDriven`: jedyna legalna droga obrotu permanentu daybound/
    // nightbound (ruling MID 2021-09-24 — bramka w effects.transform).
    applyEffect(state, { type: 'transform', dayNightDriven: true }, object, []);
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
 * 1) własne „enter_battlefield" (queueDeferredChoiceTrigger 'payOrSacrifice'
 *    dla „sacrifice it unless you pay", tryFire dla reszty);
 * 2) triggery INNYCH permanentów (another_creature_enters, landfall,
 *    creature_you_control_enters — Impact Tremors — itd.).
 */
function fireEnterBattlefieldTriggers(state, entered, events, context = {}) {
  for (const ability of effectiveAbilities(entered)) {
    if (ability?.trigger?.event !== 'enter_battlefield') continue;
    // Obowiązkowa płatność typu „sacrifice unless you pay" to nie „you may"
    // — decyzja zapłać/poświęć przy rozstrzyganiu (queuePayOrSacrifice).
    if (ability.trigger?.sacrificeIfUnpaid) {
      // Etap F (CR 603.5): „unless" rozstrzyga się przy rozstrzyganiu
      // zdolności — trigger idzie na stos jak każdy inny.
      queueDeferredChoiceTrigger(state, ability, entered, events, {}, 'payOrSacrifice', {
        amount: ability.trigger?.payMana ?? 0,
        colors: [...(ability.trigger?.payColors ?? [])],
        triggerEvent: ability.trigger?.event ?? 'enter_battlefield',
      });
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
        // Constellation (CR 207.2c): enchantment you control enters.
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

/**
 * M382 (CR 603.3b + CR 101.4): porządek APNAP dla PARTII zdolności, które
 * trafiły na stos w jednym skanie triggerów. „If multiple abilities have
 * triggered since the last time a player received priority, the abilities are
 * placed on the stack in a two-part process. First, each player, in APNAP
 * order, puts each triggered ability they control … on the stack in any order
 * they choose." APNAP = gracz aktywny, potem każdy inny gracz w kolejności tur
 * (CR 101.4) — w tym silniku kolejność tur to `state.players` cyklicznie od
 * gracza aktywnego (tak samo liczy ją `nextTurnStep`, turn.js). Kolejność
 * wewnątrz jednego kontrolera zostaje bez zmian (deterministyczna kolejność
 * wykrycia — silnik nie pyta gracza o kolejność własnych zdolności).
 *
 * `stackStart` = długość stosu przed skanem, więc regulujemy WYŁĄCZNIE wpisy
 * dodane przez ten skan (starsze wpisy stosu są nietykalne). Gdy w segmencie
 * jest cokolwiek poza triggerami (np. kopia czaru z efektu natychmiastowego),
 * nie przestawiamy niczego — mieszanie cudzych wpisów byłoby gorsze niż
 * zachowanie kolejności wykrycia.
 */
function placeTriggerBatchInApnapOrder(state, stackStart) {
  const stack = state.zones.stack;
  if (!Array.isArray(stack) || stackStart >= stack.length || stackStart < 0) return;
  const segment = stack.slice(stackStart);
  if (!segment.every((id) => state.objects.get(id)?.kind === 'trigger')) return;
  const activeId = state.turn?.activePlayerId ?? null;
  const players = (state.players ?? []).map((player) => player.id);
  const activeIndex = players.indexOf(activeId);
  // Kolejność tur od gracza aktywnego (CR 101.4); przy braku gracza aktywnego
  // zostaje kolejność z listy graczy.
  const order = activeIndex === -1
    ? [...players, null]
    : [...players.slice(activeIndex), ...players.slice(0, activeIndex), null];
  const rank = (id) => {
    const controllerId = state.objects.get(id)?.controllerId ?? null;
    const index = order.indexOf(controllerId);
    return index === -1 ? order.length : index; // bez kontrolera = na końcu
  };
  const sorted = segment
    .map((id, index) => ({ id, index }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.index - b.index)
    .map((entry) => entry.id);
  for (let i = 0; i < sorted.length; i += 1) stack[stackStart + i] = sorted[i];
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
  // M382 (CR 603.3b): wpisy stosu dodane przez TEN skan tworzą jedną partię
  // zdolności wyzwolonych od ostatniego priorytetu — na końcu skanu
  // przestawiamy je w kolejność APNAP (patrz helper niżej).
  const stackStart = state.zones.stack.length;
  // Kontrolerzy, których permanenty opuściły pole bitwy w tej komendzie —
  // trigger „one or more permanents you control leave the battlefield"
  // odpala się RAZ na komendę, nie raz na permanent (CR 603.2).
  const leftBattlefield = new Set();
  // GRUPOWANIE zbiorczych wyzwalaczy („Whenever one or more …") — patrz
  // `mayFireGrouped` poniżej. Zestaw kluczy jest JEDEN dla wszystkich ścieżek,
  // bo dawniej każda miała własny (osobny dedup obrażeń i osobny dedup
  // poszkodowanych) i zachowania rozjeżdżały się między kartami.
  const groupedTriggerFires = new Set();
  /**
   * Czy zdolność grupowa odpala się przy tym zdarzeniu. Tag
   * `trigger.groupPer` DEKLARUJE KARTĘ, a rdzeń tylko wykonuje (audyt PR #93,
   * decyzja właściciela: „engine jest headless i name-agnostic" — różnice
   * zachowań poszczególnych kart w deskryptorze karty, nie w warunkach w core):
   *   • 'affected_player' — raz na instancję zdolności i na gracza, którego
   *     dotyczy zdarzenie: „Whenever one or more [X] you control deal combat
   *     damage to a player" oraz „Whenever you're dealt combat damage"
   *     (ruling WotC M201/N2: raz na zadanie obrażeń, choćby zadało je kilka
   *     stworów — CR 510.2, obrażenia bojowe są jednoczesne, a silnik emituje
   *     zdarzenie per źródło);
   *   • 'controller' — raz na instancję zdolności i na kontrolera odchodzących
   *     permanentów: „Whenever one or more permanents you control leave the
   *     battlefield" (CR 603.2);
   *   • brak tagu — zdolność odpala się od KAŻDEGO zdarzenia (dosłowne
   *     „whenever", np. jeden stwór zadaje obrażenia).
   * Klucz zawsze obejmuje instancję zdolności i jej filtr, bo grupowanie scala
   * ZDARZENIE, a nie sprawcę: KAŻDA instancja wyzwala osobno (CR 603.3 —
   * audyt PR #92, znalezisko 4; dedup po samym graczu kasował drugą kopię
   * karty, tak samo jak przy `combat_damage_to_you`).
   */
  function mayFireGrouped(ability, { subject, abilityIndex = 0, filter = null, groupSubject = null }) {
    const groupPer = ability?.trigger?.groupPer ?? null;
    if (groupPer == null) return true;
    const key = `${subject}#${abilityIndex}|${groupPer}|`
      + `${filter?.length ? [...filter].sort().join(',') : 'any'}|${groupSubject ?? ''}`;
    if (groupedTriggerFires.has(key)) return false;
    groupedTriggerFires.add(key);
    return true;
  }
  /**
   * Znalezisko D (2026-09-17): kontroler obiektu z CHWILI zdarzenia śmierci
   * (CR 603.10a — LKI) — zdarzenia zniszczenia/poświęcenia niosą kontrolera
   * wprost (`controllerId`/`playerId`), a `ev.object` to obiekt sprzed zmiany
   * strefy (`moveObjectDirectly` nie mutuje referencji w zdarzeniu). Dopiero
   * brak wszystkich tych pól schodzi na obiekt po ruchu (jego kontroler to
   * właściciel — CR 400.3).
   */
  const eventControllerAtDeath = (ev, moved) =>
    ev?.controllerId ?? ev?.playerId ?? ev?.object?.controllerId ?? moved?.controllerId ?? null;
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
  // E9/F5: obiekty, których wejście na pole bitwy już obsłużono w tym
  // przebiegu (podwójna emisja object_moved + permanent_entered_battlefield).
  const etbEnterFired = new Set();
  let scanned = 0;
  let idx = 0;
  const processEvent = (ev) => {
    // Wspólna ścieżka triggerów śmierci (CR 603.2/700.4): „dies" odpala się
    // przy KAŻDEJ zmianie strefy battlefield → graveyard, niezależnie od
    // przyczyny (obrażenia SBA, zniszczenie efektem, poświęcenie, prawo
    // legend). Wcześniej skan obejmował wyłącznie zgony SBA (creature_destroyed)
    // i object_moved — poświęcenia (Village Rites, devour) i zniszczenia
    // (Bone Splinters, Shatter) cicho gubiły triggery dies.
    const fireDeathTriggers = (died, simultaneousFellows = [], formerId = null, controllerAtDeath = null) => {
      markDescended(died);
      if (!died) return;
      // Znalezisko D (właściciel, 2026-09-17 — Necrosquito + Awaken the Sleeper):
      // obiekt w grobie należy do WŁAŚCICIELA (CR 400.3 — patrz
      // `moveObjectDirectly`), więc `died.controllerId` kłamie o kontroli
      // z chwili śmierci. Wszystkie filtry „you control" i kontroler triggera
      // czytamy z LKI zdarzenia (CR 603.10a: zdolności śmierci patrzą na stan
      // SPRZED zdarzenia), a nie z obiektu po zmianie strefy.
      const diedControllerId = controllerAtDeath ?? died.controllerId ?? null;
      const diedLki = diedControllerId != null && diedControllerId !== died.controllerId
        ? Object.freeze({ ...died, controllerId: diedControllerId })
        : died;
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
          tryFire(state, ability, diedLki, [], events, { wasBlocking: died?.isBlockingThisCombat === true });
        }
      }
      // M200/D+E2 (uwagi właściciela, CR 700.4): „die” dotyczy STWORÓW —
      // poświęcenie/zniszczenie lądu lub artefaktu (Blazing Torch, Rupture
      // Spire) NIE jest śmiercią i nie może odpalać any_creature_dies.
      // Dotąd Selhoff Occultist mielił kartę przy każdym poświęceniu
      // jakiegokolwiek permanentu („trigger zadziałał dwa razy” = fałszywy
      // trigger na poświęcony artefakt + prawdziwy na zginętego stwora).
      const diedIsCreature = diedAs(died, 'creature', 'Creature');
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
        const fellowIsCreature = diedAs(fellow, 'creature', 'Creature');
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
        const isCreatureOrArtifact = diedAs(died, 'creature', 'Creature') || diedAs(died, 'artifact', 'Artifact');
        if (!isCreatureOrArtifact) continue;
        if (diedControllerId !== source.controllerId) continue;
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
        if (died?.kind !== 'creature' || diedControllerId !== source.controllerId) continue;
        // Zgłoszenie właściciela E1 (2026-09-10), CR 603.6c + ruling WotC
        // 2025-04-04 („If Furious Forebear dies at the same time as one or
        // more creatures you control, its ability won't trigger"): warunkiem
        // triggera jest pobyt karty W GROBIE **w chwili** śmierci stwora.
        // Karta, która właśnie umarła, dopiero TAM JEDZIE — zdolności
        // leaves-the-battlefield patrzą wstecz na stół, nie do przodu do
        // grobu. To samo dotyczy współpoległych z tej samej partii SBA
        // (walka, masowe -X/-X): w chwili zdarzenia jeszcze nie leżeli.
        if (source.id === died.id) continue;
        if (simultaneousFellows.some((fellow) => fellow?.id === source.id)) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'other_creature_you_control_dies') {
            tryFire(state, ability, source, [], events, { diedCardId: died.cardId });
          }
        }
      }
    };
    if (ev.type === 'creature_destroyed') {
      // Finality (exile) NIE uruchamia triggera „dies" (CR 122.1h — obiekt
      // nie umiera, jest wygnany).
      if (ev.toZone === 'exile') return;
      // M160/A: współzgony tej samej partii SBA (simultaneousIds) — LKI
      // poległych źródeł z ich zdarzeń śmierci w bieżącej kolejce skanu.
      const fellows = (ev.simultaneousIds ?? []).length > 1
        ? queue
          .filter((sibling) => sibling !== ev && sibling.type === 'creature_destroyed'
            && sibling.toZone !== 'exile'
            && (ev.simultaneousIds ?? []).includes(sibling.fromId))
          .map((sibling) => {
            const fellow = state.objects.get(sibling.toId) ?? sibling.object;
            const fellowController = eventControllerAtDeath(sibling, fellow);
            return fellow && fellowController != null && fellowController !== fellow.controllerId
              ? Object.freeze({ ...fellow, controllerId: fellowController })
              : fellow;
          })
        : [];
      // M160/A: TOKEN po śmierci przestaje istnieć (SBA CR 704.5e usuwa
      // trupa z grobu) — bez fallbacku na LKI zdarzenia śmierć tokena była
      // NIEWIDZIALNA dla triggerów any_creature_dies (fireDeathTriggers
      // dostawał undefined i wychodził).
      fireDeathTriggers(state.objects.get(ev.toId) ?? ev.object, fellows, ev.fromId,
        eventControllerAtDeath(ev, state.objects.get(ev.toId) ?? ev.object));
    }
    if (ev.type === 'permanent_sacrificed') {
      if (ev.toZone === 'exile') return; // finality
      fireDeathTriggers(state.objects.get(ev.objectId) ?? ev.object, [], ev.objectId,
        eventControllerAtDeath(ev, state.objects.get(ev.objectId) ?? ev.object));
    }
    if (ev.type === 'permanent_destroyed') {
      if (ev.toZone === 'exile') return; // finality
      fireDeathTriggers(state.objects.get(ev.objectId) ?? ev.object, [], ev.objectId,
        eventControllerAtDeath(ev, state.objects.get(ev.objectId) ?? ev.object));
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
      // CR 603.10a/400.3: „you control" przy odejściu też czytamy z LKI —
      // przejęty permanent, który opuszcza pole bitwy, liczy się kontrolerowi
      // z chwili odejścia (przed poprawką trafiał do właściciela).
      const goneControllerId = eventControllerAtDeath(ev, gone);
      if (goneControllerId) leftBattlefield.add(goneControllerId);
      // „When this creature leaves the battlefield" (Fear of Abduction —
      // powrót wygnanych kart): trigger własny obiektu na ODEJŚCIE z pola bitwy
      // (dowolna strefa docelowa: ręka, exile, grób — CR 603.6c). Uwaga:
      // obiekt po zmianie strefy to NOWY obiekt (CR 400.7) — zdolności
      // czytamy z LKI (formerAbilityGrants + abilities) przez abilitiesOnDeath.
      if (gone) {
        const goneLki = goneControllerId != null && goneControllerId !== gone.controllerId
          ? Object.freeze({ ...gone, controllerId: goneControllerId })
          : gone;
        for (const ability of abilitiesOnDeath(gone)) {
          if (ability?.trigger?.event === 'leaves_battlefield') {
            tryFire(state, ability, goneLki, [], events);
          }
        }
      }
    }
    if (ev.type === 'object_moved' && ev.fromZone === 'battlefield' && ev.toZone === 'graveyard') {
      // Finality obsługują ścieżki zdarzeń z toZone (creature_destroyed itd.);
      // object_moved bez toZone-exile = zwykła śmierć (np. prawo legend).
      fireDeathTriggers(state.objects.get(ev.object?.id), [], ev.fromId ?? ev.object?.id,
        eventControllerAtDeath(ev, state.objects.get(ev.object?.id)));
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
      let exploiter = state.objects.get(ev.exploiterId);
      // M361/B1 (ZŁOTO; VOW Release Notes, mtg.wiki/Exploit 2026-09-16, ADR 0030):
      // „You can sacrifice the creature with exploit if it's still on the
      // battlefield. This will cause its other ability to trigger." — przy
      // samopoświęceniu źródło jest już w grobie (moved.id), więc trigger
      // „exploits" odpalamy z obiektu LKI (jak trigger dies), nie z pola bitwy.
      // Bez flagi selfSacrifice wymóg „na stole" ZOSTAJE (VOW Notes: źródło
      // musi stać w chwili poświęcania — inaczej „that last ability won't
      // trigger"): pokrywa sekwencyjne kolejki multi-exploit (drugi exploiter
      // poświęcony jako ofiara pierwszego milczy).
      if ((!exploiter || exploiter.zone !== 'battlefield') && ev.selfSacrifice === true) {
        const lastKnown = state.objects.get(ev.exploitedId);
        if (lastKnown && (lastKnown.zone === 'graveyard' || lastKnown.zone === 'exile')) exploiter = lastKnown;
      }
      if (exploiter && (exploiter.zone === 'battlefield' || ev.selfSacrifice === true)) {
        for (const ability of effectiveAbilities(exploiter)) {
          if (ability?.trigger?.event === 'exploits') {
            tryFire(state, ability, exploiter, [], events, { exploitedId: ev.exploitedId });
          }
        }
      }
    }
    // Batch 53 (Glorifier of Suffering, LCI): reflexive „When you do" po
    // poświęceniu. Zdarzenie `reflexive_sacrifice` emituje resolve_sacrifice
    // (game-state) — skanujemy je jak każde zdarzenie triggera i odpalamy
    // zdolność źródła z `trigger.event === 'reflexive_sacrifice'`. To cel
    // „up to two target creatures" — tryFire przejmuje decyzję celu (Temat 2).
    if (ev.type === 'reflexive_sacrifice') {
      // Audyt Batch53/A1: zdolność niesie ZDARZENIE (z chwili rozstrzygnięcia
      // ETB) — refleks „When you do" odpala także gdy źródło opuściło pole
      // bitwy (kill w odpowiedzi na ETB; ruling LCI 2023-11-10, CR 603.10).
      if (ev.reflexiveAbility) {
        const live = state.objects.get(ev.sourceId);
        const source = (live && live.zone === 'battlefield') ? live : Object.freeze({
          id: ev.sourceId, controllerId: ev.playerId ?? live?.controllerId ?? null,
          cardId: ev.cardId ?? null, zone: 'none',
        });
        tryFire(state, ev.reflexiveAbility, source, [], events, { sacrificedId: ev.sacrificedId ?? null });
      } else {
        const source = state.objects.get(ev.sourceId);
        if (source && source.zone === 'battlefield') {
          for (const ability of effectiveAbilities(source)) {
            if (ability?.trigger?.event === 'reflexive_sacrifice') {
              tryFire(state, ability, source, [], events, { sacrificedId: ev.sacrificedId ?? null });
            }
          }
        }
      }
    }
    // M361/B2 (ZŁOTO, Talion's Messenger; Scryfall ruling 2023-09-01, ADR 0030):
    // „a second 'reflexive' ability triggers when you discard a card this
    // way. You choose a target for that ability as it goes on the stack. Each
    // player may respond to this triggered ability as normal." — handler jak
    // reflexive_sacrifice (zdolność niesie zdarzenie; LKI, CR 603.10).
    // Batch 58/B6 (Prishe's Wanderings; ruling FIN 2025-06-06): refleks „when
    // you search your library this way" — jak reflexive_discard (zdolność
    // niesie zdarzenie z chwili rozstrzygnięcia; źródłem jest czar, który może
    // już leżeć w grobie — LKI, CR 603.10).
    if (ev.type === 'reflexive_search') {
      if (ev.reflexiveAbility) {
        const live = state.objects.get(ev.sourceId);
        const source = (live && live.zone === 'battlefield') ? live : Object.freeze({
          id: ev.sourceId, controllerId: ev.playerId ?? live?.controllerId ?? null,
          cardId: ev.cardId ?? null, zone: 'none',
        });
        tryFire(state, ev.reflexiveAbility, source, [], events, { searchedFound: ev.found === true });
      } else {
        const source = state.objects.get(ev.sourceId);
        if (source && source.zone === 'battlefield') {
          for (const ability of effectiveAbilities(source)) {
            if (ability?.trigger?.event === 'reflexive_search') {
              tryFire(state, ability, source, [], events, { searchedFound: ev.found === true });
            }
          }
        }
      }
    }
    if (ev.type === 'reflexive_discard') {
      if (ev.reflexiveAbility) {
        const live = state.objects.get(ev.sourceId);
        const source = (live && live.zone === 'battlefield') ? live : Object.freeze({
          id: ev.sourceId, controllerId: ev.playerId ?? live?.controllerId ?? null,
          cardId: ev.cardId ?? null, zone: 'none',
        });
        tryFire(state, ev.reflexiveAbility, source, [], events, { discardedCount: ev.discardedCount ?? 0 });
      } else {
        const source = state.objects.get(ev.sourceId);
        if (source && source.zone === 'battlefield') {
          for (const ability of effectiveAbilities(source)) {
            if (ability?.trigger?.event === 'reflexive_discard') {
              tryFire(state, ability, source, [], events, { discardedCount: ev.discardedCount ?? 0 });
            }
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
      // Speed rośnie z life_changed (M361/B4) — obrażenia combat wołają
      // changeLife, więc osobny hook tutaj już nie istnieje.
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
      {
        for (const candidate of state.objects.values()) {
          if (candidate.zone !== 'battlefield' || candidate.controllerId !== ev.target) continue;
          for (const [abilityIndex, ability] of effectiveAbilities(candidate).entries()) {
            if (ability?.trigger?.event !== 'combat_damage_to_you') continue;
            // Ruling WotC (M201/N2): raz na zadanie obrażeń, niezależnie od
            // liczby atakujących — ale tylko gdy KARTA tak deklaruje
            // (`groupPer: 'affected_player'`). Dedup po samym graczu kasował
            // drugą kopię tego samego artefaktu (CR 603.3).
            if (!mayFireGrouped(ability, { subject: candidate.id, abilityIndex, groupSubject: ev.target })) continue;
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
            // Grupowanie po tagu karty (brak tagu = odpalenie per zdarzenie).
            if (!mayFireGrouped(ability, {
              subject: candidate.id, abilityIndex, filter, groupSubject: ev.target ?? null,
            })) continue;
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
      // Speed rośnie z life_changed (M361/B4) — patrz gałąź niżej.
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.controllerId !== damageControllerId) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event !== 'noncombat_damage_to_opponent') continue;
          // Warunek intervening-if (delirium) sprawdzany przy odpaleniu;
          // powtórzony przy rozstrzyganiu celu (stan grobu mógł się zmienić)
          // — reguła intervening-if (CR 603.4) wymaga weryfikacji w obu momentach.
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
    // Speed (M361/B4, mtg.wiki/Speed): „Whenever one or more opponents lose
    // life during your turn..." — JEDYNY punkt wzrostu: faktyczna utrata
    // życia (amount < 0), niezależnie od przyczyny (obrażenia i lose_life
    // wołają changeLife; infect/prewencja nie emitują straty życia).
    if (ev.type === 'life_changed' && ev.amount < 0 && isPlayerId(state, ev.playerId)) {
      bumpSpeedOnLifeLost(state, ev.playerId);
    }
    // Wejście na pole bitwy (rozstrzygnięty czar permanentu, powrót z grobu,
    // land drop, rozstrzygnięty czar aury bestow). permanent_cast NIE jest
    // wejściem — od T1 (stos) czar permanenta leży wtedy na stosie i wchodzi
    // dopiero przy rozstrzygnięciu (permanent_entered_battlefield); triggery
    // ETB muszą odpalić się po rundzie passów, nie w chwili rzutu.
    // E9/F5 (CR 603.6c): niektóre ścieżki (Throne of the Dead Three) emitują
    // DWA zdarzenia jednego wejścia (object_moved→battlefield ORAZ
    // permanent_entered_battlefield). Wejście = JEDNO zdarzenie reguł —
    // dedupe per wchodzący obiekt w obrębie jednego przebiegu skanu, żeby
    // triggery ETB (własne i innych permanentów) nie odpalały się podwójnie.
    if (ev.type === 'land_played' || ev.type === 'permanent_entered_battlefield' || (ev.type === 'object_moved' && ev.toZone === 'battlefield')) {
      const enteredKey = ev.object?.id ?? ev.objectId;
      if (etbEnterFired.has(enteredKey)) return;
      etbEnterFired.add(enteredKey);
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
        // CR 702.145d: kontrola permanentu z daybound przy „ani dzień, ani
        // noc" → dzień. CR 702.145g (dosłownie, CR 2026-08-07): „Any time a
        // player controls a permanent with nightbound, if it's neither day nor
        // night and there are no permanents with daybound on the battlefield,
        // it becomes night." — nightbound SAM robi noc; dzień tylko, gdy
        // daybound jest gdzieś na polu (release notes: daybound i nightbound
        // wchodzą razem → dzień; wchodzący nightbound wtedy transformuje).
        const dayboundAnywhere = enterKw.includes('daybound')
          || [...state.objects.values()].some((o) => o.zone === 'battlefield' && o.id !== entered.id && (o.keywords ?? []).includes('daybound'));
        setDayNight(state, dayboundAnywhere ? 'day' : 'night');
        entered = state.objects.get(entered.id) ?? entered;
      } else if (state.dayNight === 'night' && enterKw.includes('daybound') && entered.transformTo) {
        // `dayNightDriven`: to obrót STEROWANY parą daybound/nightbound
        // (CR 702.145c — wejście w nocy poza rzutem wchodzi tylną stroną),
        // więc przechodzi przez bramkę `effects.transform` (Batch 59/G1.10).
        applyEffect(state, { type: 'transform', dayNightDriven: true }, entered, []);
        entered = state.objects.get(entered.id) ?? entered;
      } else if (state.dayNight === 'day' && enterKw.includes('nightbound') && entered.transformTo) {
        applyEffect(state, { type: 'transform', dayNightDriven: true }, entered, []);
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
      // M361/B1 (ZŁOTO; VOW Release Notes, mtg.wiki/Exploit 2026-09-16, ADR 0030):
      // kandydatem jest KAŻDY stwór kontrolera, WŁĄCZNIE ze źródłem („A player
      // can sacrifice any creature they control when the exploit ability
      // resolves, including the creature with exploit itself"). Dotąd filtr
      // `candidate.id !== entered.id` wykluczał źródło, więc samotny Rzeźnik
      // nie dostawał nawet decyzji — a mógł poświęcić siebie i odpalić
      // „when this exploits" („This will cause its other ability to trigger").
      // Decyzję kolejkujemy zawsze (źródło stoi na stole w chwili wejścia);
      // odmowa = jawny skip („you don't have to").
      if (entered.kind === 'creature' && entered.exploit) {
        const exploitCandidates = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
            && candidate.controllerId === entered.controllerId;
        });
        // Kolejkujemy ZAWSZE (niezależnie od planszy — samo źródło jest
        // kandydatem, więc lista nie bywa pusta): exploit to zdolność
        // triggerowana (CR 702.110a — „When this creature enters"), wejście
        // nastąpiło niezależnie od dostępności kandydatów, więc triggery
        // wejścia (własne i innych permanentów) muszą odpalić — a rezygnacja
        // to jawny skip decyzji, nie brak triggera.
        // Etap F (CR 603.3 + 603.5): zdolność idzie na STOS, a wybór ofiary
        // pada przy rozstrzyganiu (resolveTriggerEntry, extra.exploitChoice) —
        // przeciwnik ma okno odpowiedzi (np. zabicie exploitera, CR 603.10).
        if (exploitCandidates.length > 0) {
          queueTriggerToStack(state, {
            type: 'triggered', keyword: 'exploit',
            trigger: { event: 'enter_battlefield', exploit: true },
            effect: [],
          }, entered, [], events, { exploitChoice: true });
        }
      }
      // Endure (TDM, Kin-Tree Nurturer): „When this creature enters, it
      // endures N" — wybór gracza: N liczników +1/+1 na źródle ALBO token
      // Spirit N/N biały (resolve_endure_choice). Decyzję kolejkujemy zawsze
      // (niezależnie od planszy — obie opcje działają na pustym stole).
      // Etap F (CR 603.3): zdolność idzie na STOS, wybór pada przy
      // rozstrzyganiu (resolveTriggerEntry, extra.endureAmount).
      if (entered.kind === 'creature' && entered.endure != null) {
        queueTriggerToStack(state, {
          type: 'triggered', keyword: 'endure',
          trigger: { event: 'enter_battlefield', endure: true },
          effect: [],
        }, entered, [], events, { endureAmount: entered.endure });
      }
      // Saga (CR 714.3a/2a, Shiva Warden of Ice): „As this Saga enters\" —
      // kontroler kładzie licznik lore, co odpala rozdział I. Dotyczy każdej
      // drogi wejścia (rzut, powrót przemieniony, reanimacja). T6: rozdział
      // to zdolność triggerowana — idzie na STOS i rozstrzyga się po passach.
      // Temat 2 dla Sag: rozdziały z `requiresTarget` na efektach (Mesmerize
      // Shiva I/II) kolejkuja decyzję CELU zamiast iść od razu na stos.
      if (entered.saga) {
        addCounter(state, entered.id, 'lore', 1);
        queueSagaChaptersForLore(state, state.objects.get(entered.id) ?? entered, 0, 1, events);
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
      // Batch 57/B6a (Baral and Kari Zev, CR 603.2 + ruling TDC 2023-04-14):
      // „Whenever you cast your FIRST instant or sorcery spell each turn" —
      // licznik PER GRACZ i PER TYP KARTY, niezależny od tego, co stoi na polu
      // bitwy. Ruling mówi wprost: liczą się czary rzucone wcześniej w turze,
      // nawet jeśli Baral wszedł dopiero później — dlatego licznik jest
      // w stanie gry, a nie na permanencie. Zdarzenie rzutu przechodzi skan
      // dokładnie raz (ta sama gwarancja co `spellsCastThisTurnByPlayer`),
      // więc inkrement nie może się podwoić.
      const castTypes = ev.object?.types ?? [];
      const instantSorcery = castTypes.includes('Instant') || castTypes.includes('Sorcery');
      if (instantSorcery && ev.type === 'spell_cast') {
        const instantSorceryNumber = (state.instantSorceryCastThisTurnByPlayer?.[ev.playerId] ?? 0) + 1;
        state.instantSorceryCastThisTurnByPlayer = {
          ...state.instantSorceryCastThisTurnByPlayer,
          [ev.playerId]: instantSorceryNumber,
        };
        if (instantSorceryNumber === 1) {
          for (const source of state.objects.values()) {
            if (source.zone !== 'battlefield' || source.controllerId !== ev.playerId) continue;
            for (const ability of effectiveAbilities(source)) {
              if (ability?.trigger?.event !== 'first_instant_sorcery_cast') continue;
              // Dane czaru wyzwalającego jadą w `extra` (jak `spellColorsInclude`
              // dla „whenever you cast a RED spell"): efekt decyzji liczy
              // z nich typ wspólny i próg MV. Zdolność wyzwalana przez czar,
              // który sam jest instant/sorcery — czyli zawsze (deskryptor).
              tryFire(state, ability, source, [], events, {
                spellCardId: ev.cardId ?? null,
                spellManaValue: ev.object?.manaCost ?? 0,
                spellCardTypes: castTypes.filter((t) => t === 'Instant' || t === 'Sorcery'),
              });
            }
          }
        }
      }
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
            // bo wtedy jest czarem AURY, nie stwora, CR 702.103b) albo
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
      // Zgłoszenie właściciela B1 (2026-09-10): opóźnione zdolności „do końca
      // tury" z rejestru stanowego (rozdział III Sagi). Ich źródło mogło już
      // opuścić pole bitwy — Saga jest poświęcana po ostatnim rozdziale
      // (CR 714.4), a ruling WotC 2025-04-04 wprost mówi, że zdolność
      // rozdziału III „may trigger multiple times during the turn, even
      // though Rediscover the Way will likely no longer be on the
      // battlefield" — więc pętla po polu bitwy wyżej ich nie widzi.
      for (const grant of state.turnAbilityGrants ?? []) {
        if (grant.controllerId !== ev.playerId) continue;
        if (grant.trigger?.event !== 'you_cast_noncreature_spell') continue;
        const grantIsNoncreatureCast = ev.type !== 'permanent_cast' || ev.object?.kind !== 'creature';
        if (!grantIsNoncreatureCast) continue;
        // Źródło: żywy obiekt (jeśli jeszcze istnieje) albo LKI z chwili
        // uzbrojenia (CR 603.10) — Saga zwykle jest już w grobie pod nowym id.
        const grantSource = state.objects.get(grant.sourceId) ?? grant.sourceLki
          ?? {
            id: grant.sourceId, cardId: grant.cardId,
            controllerId: grant.controllerId, zone: 'battlefield',
          };
        tryFire(state, { type: 'triggered', trigger: grant.trigger, effect: grant.effect },
          grantSource, [], events, { manaSpent: ev.manaSpent ?? 0 });
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
      // Heroic (Wavecrash Triton, CR 207.2c — ability word): „Whenever you cast a spell that
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
    // null — karty wzięte po mulliganie nie są dobraniami (CR 103.5).
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
      // Batch 53 (Ichorclaw Myr, SOM): „Whenever this creature becomes
      // blocked, it gets +2/+2 until end of turn." Trigger odpala się RAZ
      // na ATARKUJĄCEGO, niezależnie od liczby blokerów (ruling WotC).
      // „Becomes blocked" dotyczy atakującego; bloker dostaje analogiczny
      // status tylko przez przyszły event (np. „becomes blocking").
      for (const [attackerId, blockerIds] of Object.entries(assignments ?? {})) {
        if (!Array.isArray(blockerIds) || blockerIds.length === 0) continue;
        const attacker = state.objects.get(attackerId);
        if (!attacker || attacker.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(attacker)) {
          if (ability?.trigger?.event === 'becomes_blocked') {
            tryFire(state, ability, attacker, [], events);
          }
        }
      }
    }
    // Deklaracja atakujących: triggery „attacks" (na atakującym), tribał
    // „bat_attacks" (na kontrolowanych permanentach — np. Zoraline) oraz
    // triggery załączników „whenever equipped creature attacks" (Greatsword
    // of Tyr — zdolność siedzi na EQUIPMENTU, nie na nosicielu).
    if (ev.type === 'attackers_declared') {
      // „Attacks alone" (Exalted, CR 702.83; Angelic Benediction): dokładnie
      // JEDEN atakujący. Triggery attacks_alone odpalają się na każdym źródle
      // z tą zdolnością (exalted jest keywordem na źródle); extra niesie
      // attackerId — ten sam dla wszystkich źródeł (jeden samotny atakujący).
      const attacksAlone = (ev.attackerIds ?? []).length === 1;
      if (attacksAlone) {
        const aloneId = ev.attackerIds[0];
        const aloneAttacker = state.objects.get(aloneId);
        // Audyt PR #41 (B2, CR 702.83): „Whenever a creature YOU CONTROL
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
        // Mentor (CR 702.134, Boros Challenger): „Whenever this creature
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
              // M359: cardId źródła do wpisu stosu (LKI nazwy, gdy źródło
              // zniknie przed decyzją — w grze niemożliwe, w testach tak).
              cardId: attacker.cardId ?? null,
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
    // Batch 46 (Bone Shredder) — ECHO (CR 702.30): „At the beginning of your
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
        // Etap F (CR 702.30a + 603.5): echo to zdolność WYZWALANA — idzie
        // na stos (przeciwnik może odpowiedzieć), a „sacrifice it unless you
        // pay" rozstrzyga się przy jej rozstrzyganiu.
        const echoAbility = Object.freeze({
          type: 'triggered', keyword: 'echo',
          trigger: Object.freeze({ event: 'echo' }),
          effect: null,
        });
        queueDeferredChoiceTrigger(state, echoAbility, state.objects.get(object.id), events, {}, 'payOrSacrifice', {
          amount: cost, colors: [...(object.echoColors ?? [])], triggerEvent: 'echo',
        });
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
        if ((card.timeCounters ?? 0) <= 0) continue;
        // Etap F (CR 603.3): „remove a time counter" to zdolność wyzwalana —
        // na STOS; licznik zdejmuje rozstrzygnięcie (extra.suspendTickObjectId),
        // a ostatni zdjęty wyzwala suspend_ready (też na stos).
        queueTriggerToStack(state, {
          type: 'triggered', keyword: 'suspend',
          trigger: { event: 'suspend_upkeep' },
          effect: [],
        }, card, [], events, { suspendTickObjectId: id });
      }
      // Rebound (CR 702.88, Ojutai's Breath): „At the beginning of your next
      // upkeep, you may cast this card from exile without paying its mana
      // cost.\" — na początku upkeepu AKTYWNEGO gracza sprawdzamy, czy w exile
      // leży karta z `reboundReady` (zaznaczona przy rozstrzygnięciu czaru
      // rzuconego z ręki z deskryptorem `rebound`). Jeśli tak, opóźniona
      // zdolność idzie na stos, a jej rozstrzygnięcie otwiera JEDNORAZOWĄ
      // decyzję (pendingReboundCast): rzuć za darmo albo zostaw w exile na
      // stałe (karta traci gotowość — rebound nie powtarza się).
      for (const id of [...state.zones.exile]) {
        const card = state.objects.get(id);
        if (!card || !card.reboundReady || card.controllerId !== state.turn.activePlayerId) continue;
        if (card.kind !== 'spell') continue;
        // Etap F (CR 603.7 + 603.5): opóźniona zdolność na STOS (każda karta
        // osobno — dawniej druga karta z rebound czekała, bo decyzja była
        // natychmiastowa i jedna naraz); „may" przy rozstrzyganiu.
        queueTriggerToStack(state, {
          type: 'triggered', keyword: 'rebound',
          trigger: { event: 'rebound_upkeep' },
          effect: [],
        }, card, [], events, { reboundObjectId: id });
      }
    }
    // CR 714.2b: licznik lore dołożony DOWOLNĄ drogą (proliferate — CR 701.34,
    // efekt „put a lore counter") triggeruje przekroczone rozdziały. Zdarzenie
    // `counter_added` jest tu widoczne, bo pochodzi z ciała komendy
    // (`state.events.slice(before)` w execute); liczniki z wejścia i z akcji
    // turowej są dokładane WNĘTRZEM tego skanu, więc tam helper wołamy wprost
    // (bez podwójnego odpalenia).
    if (ev.type === 'counter_added' && ev.counter === 'lore') {
      const loreSaga = state.objects.get(ev.objectId);
      if (loreSaga?.zone === 'battlefield' && loreSaga.saga) {
        const newTotal = Number.isInteger(ev.total) ? ev.total : (loreSaga.counters?.lore ?? 0);
        queueSagaChaptersForLore(state, loreSaga, newTotal - (ev.amount ?? 1), newTotal, events);
      }
    }
    // Po kroku dobierania (CR 714.3b: „after your draw step") każda Saga
    // AKTYWNEGO gracza dostaje licznik lore i odpala kolejny rozdział.
    // Temat 2 dla Sag: rozdziały z `requiresTarget` kolejkuja decyzję CELU
    // (resolve_trigger_target) zamiast iść od razu na stos.
    if (ev.type === 'step_advanced' && ev.step === 'main1' && ev.phase === 'precombat_main') {
      for (const object of [...state.objects.values()]) {
        if (object.zone !== 'battlefield' || object.controllerId !== state.turn.activePlayerId || !object.saga) continue;
        const loreBefore = object.counters?.lore ?? 0;
        addCounter(state, object.id, 'lore', 1);
        const current = state.objects.get(object.id) ?? object;
        queueSagaChaptersForLore(state, current, loreBefore, current.counters?.lore ?? loreBefore + 1, events);
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
    // Początek DRUGIEJ fazy głównej: triggery Survival (DSK, Cautious
    // Survivor; CR 603.4 + ruling 2024-09-20). Skan odpala się DOKŁADNIE raz
    // na wejściu w krok (main2/postcombat_main) — tapnięcie stwora już
    // w drugiej fazie nie da triggera, bo zdarzenie minęło (ruling: „You
    // won't be able to tap it during your second main phase in time"). Tura:
    // tylko aktywny gracz („YOUR second main phase"); dodatkowe fazy główne
    // nie istnieją w silniku (ruling: brak triggera w trzeciej i dalszych).
    if (ev.type === 'step_advanced' && ev.step === 'main2' && ev.phase === 'postcombat_main') {
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield' || object.controllerId !== state.turn.activePlayerId) continue;
        for (const ability of effectiveAbilities(object)) {
          if (ability?.trigger?.event === 'beginning_of_second_main') tryFire(state, ability, object, [], events);
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
          // Grupowanie po kontrolerze deklaruje KARTA (tag `groupPer`), rdzeń
          // nie zna żadnej karty po nazwie ani po nazwie zdarzenia-grup.
          if (ability?.trigger?.event === 'permanents_you_control_leave_battlefield'
            && ability?.trigger?.groupPer === 'controller') {
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
  // M382 (CR 603.3b): partia zdolności wyzwolonych w tym skanie idzie na stos
  // w kolejności APNAP — bez tego o kolejności decydowała kolejność wstawienia
  // obiektów do `state.objects` (praktycznie kolejność wejścia permanentów na
  // pole bitwy), więc gdy permanent gracza nieaktywnego był wcześniejszy, jego
  // zdolność rozstrzygała się OSTATNIA zamiast pierwszej.
  placeTriggerBatchInApnapOrder(state, stackStart);
  // Uwaga: zdarzenia triggerów są JUŻ w state.events — fireTrigger i bloki
  // kroków dopisują je przy tworzeniu, a lokalny `events` zbiera wyłącznie
  // wycinki state.events (slice(before)). Ponowny push duplikowałby każde
  // zdarzenie w logu (naprawione przy Plague Reaver / batch 16).
  return events;
}
