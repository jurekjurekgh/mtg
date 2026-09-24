import { holdReplacementResolution } from './destruction.js';
import { event } from '../protocol/types.js';
import { spellExitZone } from './zones.js';
import { triggerTargetEffectFriendly } from './effect-intent.js';
import { producibleMana, spendMana, canPayColoredCost, castPermanent, spellManaPurpose } from './resources.js';
import { canPlayByImpulseFromExile, isImpulseWindowLive, isFreeImpulseCast, plottedTurnReached, warpTurnReached } from './impulse-window.js';
import { moveObjectDirectly } from './objects.js';
import { hasCreatureType, matchesSubtypeQualifier, isPlaneswalker, deathZoneFor, effectiveColors, effectiveKeywords, effectivePower, effectiveToughness, transformedCharacteristics, grantAbilitiesUntilEndOfTurn } from './permanents.js';
import { applyEffect, applyEnterCounters, dealNonCombatDamage, maybeAddFaceDownFlyingCounter, grantGift, shouldAutoDiscard, discardCardsForced } from './effects.js';
import { resolveTriggerEntry } from './triggers.js';
import { attachAuraToCreature, isLegalAuraHost, attachEquipmentToCreature } from './attachments.js';
import { effectiveProtectionFromColors, isTargetingBlockedByProtection } from './attachments.js';
import { addCounter } from './counters.js';
import { shuffle } from './shuffle.js';
import { changeLife, recordCardDrawn } from './players.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { parseManaCost, costReductionForSpell, conditionalCostReduction, reduceGenericCost, reduceAlternativeCost, coloredPipsOf, consumePendingSpellDiscount, delveGenericMana } from './mana-cost.js';
import { allControlledManaSources } from './mana-sources.js';

function hasColorForSpell(state, playerId, cardId, phyrexianPay = 0) {
  const costStr = MANA_COSTS[cardId];
  if (!costStr) return true;
  const parsed = parseManaCost(costStr);
  if (!parsed) return true;
  if (parsed.colored.length === 0 && parsed.hybrid.length === 0 && parsed.phyrexian.length === 0) return true;
  // Kolorowa pula (cz. 7): MtG-castability z UŻYTECZNYCH źródeł (pula + untapped).
  // Pipy phyrexian opłacone życiem (CR 118.9) nie wymagają kolorowego źródła.
  return canPayColoredCost(state, playerId, coloredPipsOf(cardId, phyrexianPay));
}

function hasColorForObject(state, playerId, object, phyrexianPay = 0) {
  if (!object) return true;
  if (object.kind === 'land') return true;
  return hasColorForSpell(state, playerId, object.cardId, phyrexianPay);
}

/**
 * Czary (instants/sorceries) przechodzą przez stos: rzucenie kładzie obiekt
 * na stos, a rozstrzygnięcie następuje po rundzie passów (LIFO). To jest
 * centralna pętla MtG; czary permanentów (cast_permanent) idą przez ten sam
 * stos od T1.
 *
 * Deskryptor czaru na obiekcie (`object.spell`):
 * { timing: 'instant'|'sorcery', targets: [{ type: 'creature' }],
 *   effects: [{ type: 'damage', amount } | { type: 'pump', power, toughness }] }
 * Deskryptory buduje warstwa kart; core zna wyłącznie ogólne typy efektów,
 * nigdy nazwy kart.
 */

/**
 * M202/odznaka #2 (CR 702.170d): rzut ZAPLOTOWANEJ karty to specjalne
 * pozwolenie ograniczone do „their main phase while the stack is empty during
 * any turn after the turn in which it became plotted” — przypomnienie na karcie
 * brzmi „Cast it **as a sorcery** on a later turn”, czyli timing karty NIE ma
 * znaczenia: zaplotowany instant też czeka na własną fazę main przy pustym
 * stosie. Bramka wisiała dotąd wyłącznie na `timing === 'sorcery'`, więc
 * zaplotowany instant omijałby ją całkowicie (w katalogu nie ma dziś
 * zaplotowanego instantu — luka utajona; zamykamy ją teraz, bo pierwsza taka
 * karta weszłaby bez bramki — L52).
 *
 * `suspendReady` jest WYŁĄCZONE z tej bramki: rzut suspend rozstrzyga się
 * w trakcie zdolności triggerowanej i ignoruje timing karty (CR 702.62c).
 */
export function plottedCastAllowed(state, playerId, object) {
  if (!object?.plotted || object.zone !== 'exile') return true;
  return ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
    && state.turn.activePlayerId === playerId
    && state.zones.stack.length === 0
    // Audyt PR #93 / znalezisko I (CR 702.170d): klauzula „on a later turn".
    // Ścieżka permanentów znała ją od Batcha 24 (castPermanent), ścieżka
    // czarów nie — zaplotowany czar znikał z ręki do exile i wracał na stos
    // w TEJ SAMEJ turze. Wspólna reguła mieszka w impulse-window.js.
    && plottedTurnReached(object, state);
}

function requireSpell(state, playerId, objectId, targets, cleaved, abilityWindowCast = false) {
  const object = state.objects.get(objectId);
  // Batch 46 (Gila Courser): karta wygnana „impulse" jest grywalna z exile
  // do końca twojej następnej tury — za PEŁNY koszt (w odróżnieniu od plot).
  const impulse = canPlayByImpulseFromExile(object, state);
  const plotted = object?.zone === 'exile' && (object.plotted || object.suspendReady);
  // Audyt PR #92: `abilityWindowCast` to osobne uprawnienie do rzutu z exile —
  // „karta leży w exile, bo właśnie wygnała ją zdolność, która wciąż jest na
  // stosie i o rzucie decyduje". Ściślejsze niż dawny stempel
  // `playableUntilTurn`: okno znika razem z decyzją, więc nie da się z niego
  // skorzystać „później w turze" (ruling WotC dla Vaana, 2025-02-10).
  // Nazwa jest celowo bezimienna (ADR 0002) — to mechanika, nie karta.
  if (!object || object.controllerId !== playerId || (!['hand', 'exile'].includes(object.zone)) || object.kind !== 'spell'
    || (object.zone === 'exile' && !plotted && !impulse && !abilityWindowCast)) {
    throw new Error('To nie jest rzucalny czar z ręki, zaplotowany albo gotowy z suspendu z exile');
  }
  if (!object.spell || !object.spell.effects?.length) throw new Error('Obiekt nie ma deskryptora czaru');
  const { timing } = object.spell;
  const targetSpec = cleaved && object.spell.cleave ? (object.spell.cleave.targets ?? []) : (object.spell.targets ?? []);
  // M202/odznaka #2 (CR 702.170d): zaplotowana karta — niezależnie od timingu.
  if (!plottedCastAllowed(state, playerId, object)) {
    throw new Error('Zaplotowaną kartę rzuca się w swoją fazę main przy pustym stosie, najwcześniej w turze po zaplonowaniu');
  }
  if (timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    // Rzucenie w oknie zdolności (np. „you may cast it" przy wygnaniu) ignoruje
    // timing czaru (CR 601.2b pomijany — ruling WotC: rzucasz, póki zdolność
    // jest na stosie), jak madness/suspend/rebound.
    if (!abilityWindowCast && (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0)) {
      throw new Error('Czar sorcery tylko w swoją fazę main przy pustym stosie');
    }
  } else if (timing !== 'instant') {
    throw new Error(`Nieznany timing czaru: ${timing}`);
  }
  const expected = targetSpec?.length ?? 0;
  const chosen = targets ?? [];
  if (!Array.isArray(chosen) || chosen.length !== expected) throw new Error('Nieprawidłowa liczba celów');
  return { object, targetSpec, chosen };
}

/**
 * Hexproof (CR 702.11): permanent kontrolowany przez INNEGO gracza nie może
 * być celem czarów ani zdolności (także triggerowanych). Efektywne keywordy
 * obejmują tymczasowy hexproofUntilTurn (Throne of the Dead Three).
 */
export function hasHexproofAgainst(state, object, casterId) {
  if (!object || object.zone !== 'battlefield') return false;
  if (object.controllerId === casterId) return false; // hexproof nie chroni przed własnymi czarami
  return effectiveKeywords(object, state).includes('hexproof');
}

/** Waliduje cele zgodnie ze specyfikacją deskryptora; zwraca obiekty celów. */

/**
 * M360/B1 (CR 702.103b): czy obiekt na stosie jest czarem NIE-będącym stworem
 * (cel Negate — „Counter target noncreature spell”). Czar aury rzucony za
 * bestow niesie kind 'creature' (dziedziczy po karcie), ale na stosie jest
 * czarem AURY (CR 702.103b: „it becomes an Aura enchantment”; ruling THS:
 * „either a creature spell or an Aura spell. It's never both”) — deskryptor
 * `spell.aura` rozstrzyga (mtg.wiki/Bestow + Scryfall THS/161, 2026-09-16).
 * Jeden helper dla oferty i walidacji (L48).
 */
export function isNoncreatureSpellOnStack(object) {
  if (!object || object.zone !== 'stack') return false;
  // Zdolności (kind 'trigger'/'activated') to nie czary (CR 701.5a).
  if (object.kind === 'trigger' || object.kind === 'activated') return false;
  // Czar aury z bestow: kind 'creature', ale spell.aura — nie-stworowy.
  if (object.kind === 'creature' && object.spell?.aura !== true) return false;
  return true;
}
export function validateTargets(state, targetSpec, chosen, casterId, sourceColors = null, sourceObject = null) {
  return chosen.map((targetId, index) => {
    const spec = targetSpec[index];
    // Batch 45 (Assert Perfection, CR 601.2c): „up to one target" — pozycja
    // opcjonalna może zostać świadomie pusta (null) i to nie jest błąd.
    if (targetId == null && spec?.optional) return null;
    const object = state.objects.get(targetId);
    // Hexproof (CR 702.11): cel-permanent przeciwnika z hexproof jest nielegalny
    // dla WSZYSTKICH typów celów obiektowych (stwór, artefakt, aura, land...).
    // Cel-gracz (kind 'player') nie jest permanentem — hexproof go nie chroni.
    if (object && object.zone === 'battlefield' && object.kind !== 'player' && hasHexproofAgainst(state, object, casterId)) {
      throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
    }
    // Protection (CR 702.16b — DEBT: T = targeted). F2 (audyt PR #112): jedna
    // reguła dla oferty i walidacji — `isTargetingBlockedByProtection` czyta
    // OBA źródła ochrony (jakości + drukowane kolory — M110: Spare from Evil
    // „protection from non-Human creatures"); wcześniej żyły tu dwie
    // osobne gałęzie, a Fireball miał własną kopię tylko od kolorów.
    // Kolory ŹRÓDŁA: parametr `sourceColors` (ścieżka rzutu zna je najlepiej),
    // inaczej obiekt rzucającego, a ostatecznie gracz (kompatybilność).
    if (object) {
      let srcColors = Array.isArray(sourceColors) ? sourceColors : null;
      if (!srcColors) {
        const caster = state.objects.get(casterId) ?? state.players.find(p => p.id === casterId);
        srcColors = caster?.colors ?? [];
      }
      if (isTargetingBlockedByProtection(state, object, sourceObject, { sourceColors: srcColors })) {
        throw new Error(`Nielegalny cel: ${targetId} (protection)`);
      }
    }
    if (spec?.type === 'creature') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      // Batch 46 (Bone Shredder): „nonartifact, nonblack creature" — te same
      // filtry, co w ofercie/enumeracji triggerów (L48: jeden filtr, dwie
      // ścieżki nie mogą się rozjechać).
      if (spec.notArtifact && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'))) {
        throw new Error(`Nielegalny cel: ${targetId} (artefakt)`);
      }
      if (Array.isArray(spec.notColors) && spec.notColors.some((color) => (object.colors ?? []).includes(color))) {
        throw new Error(`Nielegalny cel: ${targetId} (wykluczony kolor)`);
      }
      return object;
    }
    // Batch 51 (Bloodrush): cel musi być ATAKUJĄCYM w tej walce — identyczna
    // reguła jak w `targetCandidatesBySpec` (pułapka M82: oferta ≠ walidacja
    // kończy się odrzuceniem komendy, którą sami zaproponowaliśmy).
    if (spec?.type === 'attacking_creature') {
      const attackerIds = state.combat?.attackers ?? [];
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature'
        || !attackerIds.includes(targetId)) {
        throw new Error(`Nielegalny cel: ${targetId} (nie atakuje)`);
      }
      return object;
    }
    // Cel „artifact" (Shatter, CR 701.7): artefakt na polu bitwy (kind artifact
    // albo typ Artifact — uwzględnia artefaktowe stwory, np. Esper Stormblade).
    if (spec?.type === 'artifact') {
      const isArtifact = object && object.zone === 'battlefield'
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'));
      if (!isArtifact) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „artifact_or_enchantment" (Expose to Daylight, M69): artefakt albo
    // enchantment na polu bitwy (typy — obejmuje artifact/enchantment creatures).
    if (spec?.type === 'artifact_or_enchantment') {
      const isAoE = object && object.zone === 'battlefield'
        && ((object.types ?? []).includes('Artifact') || (object.types ?? []).includes('Enchantment'));
      if (!isAoE) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „artifact_or_creature_or_enchantment" (Banishment Decree): artefakt,
    // stwór albo enchantment na polu bitwy (typy — obejmuje artifact/enchantment
    // creatures; land creatures i lądy nie są legalne).
    if (spec?.type === 'artifact_or_creature_or_enchantment') {
      const isLegal = object && object.zone === 'battlefield'
        && ((object.types ?? []).includes('Artifact')
          || (object.types ?? []).includes('Enchantment')
          || object.kind === 'creature');
      if (!isLegal) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Batch 56 (Volcanic Submersion): cel „artifact or land" — WYŁĄCZNIE te
    // dwa typy (stwór NIE jest legalny, inaczej niż w szerszym Twiddle).
    if (spec?.type === 'artifact_or_land') {
      const isLegal = object && object.zone === 'battlefield'
        && ((object.types ?? []).includes('Artifact')
          || object.kind === 'land' || (object.types ?? []).includes('Land'));
      if (!isLegal) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „artifact_or_creature_or_land" (Twiddle): artefakt, stwór albo land
    // na polu bitwy (typy — obejmuje artifact creatures i land creatures).
    if (spec?.type === 'artifact_or_creature_or_land') {
      const isLegal = object && object.zone === 'battlefield'
        && ((object.types ?? []).includes('Artifact')
          || object.kind === 'creature'
          || object.kind === 'land' || (object.types ?? []).includes('Land'));
      if (!isLegal) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Zakresy celowania obrażeń: player/PW oraz szersze any target.
    if (spec?.type === 'player_or_planeswalker') {
      if (state.players.some(player => player.id === targetId)) return { id: targetId, kind: 'player', controllerId: targetId };
      if (object?.zone === 'battlefield' && isPlaneswalker(object)) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    if (spec?.type === 'any_target') {
      if (state.players.some((player) => player.id === targetId)) return { id: targetId, kind: 'player', controllerId: targetId };
      if (object?.zone === 'battlefield' && (object.kind === 'creature' || isPlaneswalker(object))) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // M108 (Kazuul's Toll Collector): „target Equipment you control" —
    // walidacja MUSI znać ten typ, inaczej oferta jest, a execute odrzuca
    // komendę (rozjazd oferty i walidacji — pułapka z M82).
    if (spec?.type === 'equipment_you_control') {
      const isEquipment = object && (object.equipment != null || (object.subtypes ?? []).includes('Equipment'));
      if (!object || object.zone !== 'battlefield' || !isEquipment) throw new Error(`Nielegalny cel: ${targetId}`);
      if (object.controllerId !== casterId) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „creature you control" (Guidestone Compass) — własny stwór na polu bitwy.
    if (spec?.type === 'creature_you_control') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (object.controllerId !== casterId) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // M109 (Diplomatic Relations): „target creature an opponent controls".
    // Typ znany dotąd tylko triggerom (requiresTarget) — czar wymaga OFERTY
    // (legalTargetCandidates) i WALIDACJI w tym samym miejscu (pułapka M82).
    // M109 (Sagittars' Volley): „target creature with flying" — walidacja
    // po keywordzie efektywnym (spójna z ofertą powyżej).
    // Sterling Keykeeper: „target non-Mount creature" (walidacja spójna z ofertą).
    if (spec?.type === 'creature_without_subtype') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (hasCreatureType(object, spec.subtype, state)) {
        throw new Error(`Nielegalny cel: ${targetId} (podtyp ${spec.subtype})`);
      }
      return object;
    }
    if (spec?.type === 'creature_with_keyword') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (!effectiveKeywords(object, state).includes(spec.keyword)) {
        throw new Error(`Nielegalny cel: ${targetId} (brak ${spec.keyword})`);
      }
      return object;
    }
    if (spec?.type === 'creature_opponent_controls') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (object.controllerId === casterId) throw new Error(`Nielegalny cel: ${targetId} (własny stwór)`);
      return object;
    }
    // M154 (Batch 38): cel „creature or Vehicle" (Silken Strength,
    // Lotusguard Disciple) — stwór LUB Vehicle (artefakt z podtypem Vehicle).
    if (spec?.type === 'creature_or_vehicle') {
      const isVehicle = object && (object.subtypes ?? []).includes('Vehicle');
      if (!object || object.zone !== 'battlefield' || (object.kind !== 'creature' && !isVehicle)) {
        throw new Error(`Nielegalny cel: ${targetId}`);
      }
      return object;
    }
    // Cel „land you control" (Unstable Frontier) — land albo land creature
    // (typ Land) kontrolowany przez gracza aktywującego zdolność.
    if (spec?.type === 'land_you_control') {
      const isLand = object && (object.kind === 'land' || (object.types ?? []).includes('Land'));
      if (!object || object.zone !== 'battlefield' || !isLand) throw new Error(`Nielegalny cel: ${targetId}`);
      if (spec.controllerId && object.controllerId !== spec.controllerId) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „player" (Grave Exchange) — dowolny gracz (przedmiot celowania).
    if (spec?.type === 'player') {
      // M69 (Dreams of Steel and Oil — „Target opponent"): spec.opponent
      // ogranicza do przeciwnika rzucającego.
      if (spec?.opponent && targetId === casterId) throw new Error(`Nielegalny cel: ${targetId} (nie przeciwnik)`);
      if (state.players.some((player) => player.id === targetId)) {
        return { id: targetId, kind: 'player', controllerId: targetId };
      }
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „creature_with_subtypes" (Lunar Rejection) — stwór z jednym ze spec.subtypes.
    if (spec?.type === 'creature_with_subtypes') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      const hasSubtype = (spec.subtypes ?? []).some((sub) => hasCreatureType(object, sub, state));
      if (!hasSubtype) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „creature card from your graveyard" (Grave Exchange) — stwór-karta
    // w grobie rzucającego.
    if (spec?.type === 'creature_card_in_graveyard') {
      if (spec.maxManaValue != null && (object?.manaCost ?? 0) > spec.maxManaValue) {
        throw new Error(`Nielegalny cel: ${targetId} (mana value > ${spec.maxManaValue})`);
      }
      if (object && object.zone === 'graveyard' && object.kind === 'creature'
        && object.controllerId === casterId) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „card from your graveyard" (Barkform Harvester) — dowolna karta
    // w grobie kontrolera źródła.
    if (spec?.type === 'card_in_graveyard') {
      if (object && object.zone === 'graveyard' && object.controllerId === casterId) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „noncreature spell on the stack" (Negate) — czar na stosie, który
    // NIE jest stworzeniem (instants/sorceries, czyste aury oraz bestow
    // rzucony jako Aura — M360/B1, CR 702.103b: na stosie to czar AURY).
    if (spec?.type === 'noncreature_spell_on_stack') {
      // Zdolności triggerowane (kind 'trigger') i aktywowane (kind 'activated')
      // to nie czary — Negate ich nie kontruje (CR 701.5a: „counter target spell").
      if (isNoncreatureSpellOnStack(object)) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „spell on the stack" (Stoic Rebuttal — „Counter target spell\"):
    // DOWOLNY czar na stosie — także czar będący stworem (aura z bestow ma
    // na stosie kind 'creature') i czar aury. Czar nigdy nie jest legalnym
    // celem samego siebie: w chwili walidacji rzucający obiekt wciąż jest
    // w ręce (przenosi się na stos dopiero po walidacji).
    if (spec?.type === 'spell_on_stack') {
      // T6: zdolności triggerowane i aktywowane to nie czary — nie są celem
      // „counter target spell" (Stoic Rebuttal).
      if (object && object.zone === 'stack' && object.kind !== 'trigger' && object.kind !== 'activated') return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    if (spec?.type === 'artifact_spell_on_stack') {
      // Steel Sabotage: „Counter target artifact spell" — czar na stosie,
      // którego karta jest artefaktem (także artifact creature — kind 'creature').
      const isArtifact = object && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'));
      if (object && object.zone === 'stack' && object.kind !== 'trigger' && object.kind !== 'activated' && isArtifact) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „activated or triggered ability on the stack" (typ dodany w audycie PR #93).
    // Zdolność many NIE może być celem — i nie musi jej pilnować ten warunek:
    // taka zdolność w ogóle nie wchodzi na stos (CR 605.1a, patrz
    // `isActivatedManaAbility` w abilities.js), więc nie ma czego wskazać.
    if (spec?.type === 'ability_on_stack') {
      if (object && object.zone === 'stack' && (object.activatedEntry || object.triggerEntry)) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „target opponent" (Plague Reaver): gracz inny niż aktywujący.
    if (spec?.type === 'opponent') {
      if (targetId && targetId !== casterId && state.players.some((player) => player.id === targetId)) {
        return { id: targetId, kind: 'player', controllerId: targetId };
      }
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „creature with power N or greater" (Selesnya Charm tryb Exile):
    // stwór na polu bitwy z mocą efektywną >= spec.min (uwzględnia bufy, hymn,
    // pumosfery). Sprawdzenie MOCY EFEKTYWNEJ (effectivePower), nie bazowej
    // — w MtG moc liczy się z modyfikatorami (CR 613) w chwili rzutu i
    // ponownie w chwili rozstrzygania (CR 608.2b w collectLegalTargets).
    // Wcześniej ten typ celu był obsługiwany tylko w legalTargetCandidates
    // (oferta) — validateTargets rzucał „Nieznany typ celu", co powodowało
    // akceptację celu o mocy < N w castModalSpell (który pomija
    // validateTargets dla trybów). Teraz validateTargets spójnie sprawdza
    // minimalną moc i heksproof.
    // „Target creature with flying" / tapped/untapped (Piercing Rays):
    // cel-stwór w stanie TAPNIĘTYM albo ODKRĘCONYM — oferta i walidacja
    // spójne (L48).
    if (spec?.type === 'tapped_creature') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (!object.tapped) throw new Error(`Nielegalny cel: ${targetId} (nie jest tapped)`);
      return object;
    }
    if (spec?.type === 'untapped_creature') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (object.tapped) throw new Error(`Nielegalny cel: ${targetId} (jest tapped)`);
      return object;
    }
    if (spec?.type === 'creature_with_power_at_least') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') {
        throw new Error(`Nielegalny cel: ${targetId}`);
      }
      const min = spec.min ?? 5;
      if (hasHexproofAgainst(state, object, casterId)) {
        throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      }
      if ((effectivePower(object, state) ?? 0) < min) {
        throw new Error(`Nielegalny cel: ${targetId} (moc < ${min})`);
      }
      return object;
    }
    if (spec?.type === 'land') {
      if (!object || object.zone !== 'battlefield') throw new Error(`Nielegalny cel: ${targetId}`);
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      if (!isLand) throw new Error(`Nielegalny cel: ${targetId} (nie jest landem)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    if (spec?.type === 'enchantment') {
      if (!object || object.zone !== 'battlefield') throw new Error(`Nielegalny cel: ${targetId}`);
      const isEnchantment = object.kind === 'enchantment' || (object.types ?? []).includes('Enchantment');
      if (!isEnchantment) throw new Error(`Nielegalny cel: ${targetId} (nie jest enchantment)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    if (spec?.type === 'nonblack_creature') {
      // Dead Ringers (APC): „two target nonblack creatures" — w odróżnieniu
      // od Expunge artefaktowe stwory SĄ legalnym celem (liczy się tylko kolor).
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (effectiveColors(object).includes('B')) throw new Error(`Nielegalny cel: ${targetId} (black)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    if (spec?.type === 'nonartifact_nonblack_creature') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      const isArtifact = object.kind === 'artifact' || (object.types ?? []).includes('Artifact');
      if (isArtifact) throw new Error(`Nielegalny cel: ${targetId} (artifact)`);
      const isBlack = (object.colors ?? []).includes('B');
      if (isBlack) throw new Error(`Nielegalny cel: ${targetId} (black)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    if (spec?.type === 'creature_opponent_damaged_this_turn') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (object.controllerId === casterId) throw new Error(`Nielegalny cel: ${targetId} (nie przeciwnik)`);
      if (!object.damagedThisTurn) throw new Error(`Nielegalny cel: ${targetId} (brak obrażeń w tej turze)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    // M177/D (Vanish from Sight, L48 oferta=walidacja): dowolny NIE-land na
    // polu bitwy — typ istniał w ofercie (Thistledown Players), walidacja
    // rzucała „Nieznany typ celu”.
    if (spec?.type === 'permanent') {
      if (!object || object.zone !== 'battlefield') throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    if (spec?.type === 'nonland_permanent') {
      if (!object || object.zone !== 'battlefield') throw new Error(`Nielegalny cel: ${targetId}`);
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      if (isLand) throw new Error(`Nielegalny cel: ${targetId} (land)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    throw new Error(`Nieznany typ celu: ${spec?.type}`);
  });
}

/**
 * Efektywny koszt many czaru z warunkową obniżką (Metalcraft, Stoic Rebuttal,
 * CR 207.2c — ability word): „this spell costs {1} less to cast if you control three or
 * more artifacts\". Warunek oceniany w chwili rzucenia; koszt nigdy nie
 * spadnie poniżej 0. Zwraca liczbę (bez zmian, gdy brak deskryptora).
 */
export function effectiveSpellManaCost(state, object) {
  const base = object?.manaCost ?? 0;
  // Modyfikatory z permanentów (Etherium Sculptor) + warunkowa obniżka
  // z samej karty (Metalcraft, „if you control a Zombie") — CR 601.2f.
  const totalReduction = costReductionForSpell(state, object) + conditionalCostReduction(state, object);
  if (totalReduction === 0) return base;
  return reduceGenericCost(object?.cardId, base, totalReduction);
}

/**
 * Opcje rzutu czaru — ogon `castSpell`. Decyzja właściciela (audyt PR #93):
 * flagi nie mogą być kolejnymi argumentami pozycyjnymi. Przez pięć batchy
 * doklejalismy je jeden po drugim (`buyback, payAltCost, xValue,
 * phyrexianPayWithLife, abilityWindowCast, kicked`) i sygnatura urosła do 13
 * pozycji, na których `false, false, undefined, 0, true` jest MYLNE CICHE —
 * zamiana dwóch flag miejscami nie daje żadnego błędu. Kształt lustrzany do
 * `castPermanent(…, options)`; lista poniżej jest JEDYNYM źródłem nazw, a
 * nieznany klucz odrzucamy, więc literówka w opcji nie udaje uprawnienia (L21).
 */
/**
 * CR 702.174a: odbiorcą daru jest PRZECIWNIK kontrolera czaru. Bez wskazania
 * bierzemy jedynego przeciwnika (1v1); w grze wieloosobowej brak wskazania to
 * błąd (nie zgadujemy za gracza — oferta zawsze enumeruje konkretne id).
 */
export function giftRecipientFor(state, playerId, giftRecipientId = null) {
  const opponents = state.players.filter((p) => p.id !== playerId);
  if (giftRecipientId != null) return opponents.find((p) => p.id === giftRecipientId) ?? null;
  return opponents.length === 1 ? opponents[0] : null;
}

export const CAST_SPELL_OPTIONS = Object.freeze([
  'buyback', 'payAltCost', 'xValue', 'phyrexianPayWithLife', 'abilityWindowCast', 'kicked',
  // CR 702.174 (Gift, M355): obietnica daru = dodatkowy koszt (bez many) +
  // wskazany odbiorca. Dwie nazwy, bo to DWIE decyzje gracza (czy obiecać
  // i komu) — jedna flaga z id w środku udawałaby jedną.
  'gifted', 'giftRecipientId',
  // CR 702.66 (Delve, Batch 57/B4): karty wygnane z grobu jako część kosztu —
  // opcja jedzie w tej samej komendzie co reszta decyzji rzutu (deklaracja
  // czeka w `pendingDelveExile`, a wybór gracza wraca tu jako lista id).
  'delveExileIds',
  // Batch 57/B6a (Baral and Kari Zev): „you may cast a spell … from your hand
  // WITHOUT PAYING ITS MANA COST" — rzut z RĘKI w oknie zdolności. Uprawnienie
  // nadaje wyłącznie `resolve_hand_free_cast` (decyzja), więc komenda
  // `cast_spell`/`cast_permanent` tej opcji nie przekazuje (jak
  // `abilityWindowCast`) — inaczej każdy mógłby rzucić darmowo.
  'handFreeCast',
  // CR 702.117 (Surge, Batch 58/B1 — pierwszy INSTANT/SORCERY z surgiem):
  // alternatywny koszt rzutu, gdy rzuciłeś inny czar w tej turze. Ta sama
  // nazwa pola co na ścieżce permanentów (`cast_permanent.surgeCast`), więc
  // komenda, etykieta i kreator płatności używają jednego słowa.
  'surgeCast',
  // Etap F/4b (Cathartic Reunion w oknie rzutu — Vaan, Baral): karty
  // odrzucane jako koszt dodatkowy (CR 601.2h) wskazane Z GÓRY w komendzie
  // okna; bez tej opcji wybór otwiera zwykła decyzja `pendingDiscardChoice`.
  'discardCardIds',
]);

/** Rzuca czar: płaci koszt, kładzie obiekt na stos z wybranymi celami. */
export function castSpell(state, playerId, objectId, targets, sacrificeTargetId, modeIndex, stunTargetId, options = {}) {
  for (const key of Object.keys(options)) {
    if (!CAST_SPELL_OPTIONS.includes(key)) {
      throw new Error(`Nieznana opcja rzutu czaru: ${key} (znane: ${CAST_SPELL_OPTIONS.join(', ')})`);
    }
  }
  const {
    buyback = false, payAltCost = false, xValue, phyrexianPayWithLife = 0,
    abilityWindowCast = false, kicked = false, gifted = false, giftRecipientId = null,
    delveExileIds = null, handFreeCast = false, surgeCast = false, discardCardIds = null,
  } = options;
  const preObject = state.objects.get(objectId);
  // Surge (CR 702.117, Batch 58/B1): koszt alternatywny rozlicza tylko TA
  // funkcja — tryby „choose one", koszt X i Fireball mają własne ścieżki
  // płatności, więc wariant surge dostaje jawny błąd zamiast cichego
  // zignorowania kosztu (L5; lustro bramki kickera niżej).
  if (surgeCast && ((preObject?.spell?.modes && modeIndex != null)
    || preObject?.spell?.xCost || preObject?.spell?.fireball)) {
    throw new Error('Surge nie łączy się z rzutem modalnym, z kosztem X ani z Fireballem');
  }
  // Delve (CR 702.66) to pokrycie części generycznej kosztu WYDRUKU — przy
  // koszcie alternatywnym limit liczyłby się z niewłaściwej liczby, więc
  // łączenie wariantów jest jawnie odrzucane, dopóki katalog nie ma karty z
  // oboma (żadna nie ma; L5 — jawny brak obsługi zamiast złej płatności).
  if (surgeCast && delveExileIds != null) {
    throw new Error('Surge + delve: połączenie nieobsługiwane (limit delve liczony z wydruku — ograniczenie silnika, nie reguła)');
  }
  // Kicker (CR 702.33) na instantach i sorcerych rozlicza TA funkcja. Ścieżki
  // z własną walidacją kosztu (tryby „choose one\", koszt X, Fireball) idą do
  // osobnych funkcji, które kickera nie znają — JAWNY błąd zamiast cichego
  // zignorowania (L5: naprawa u źródła, nie maskowanie; oferta i tak takich
  // wariantów nie enumeruje, więc to bramka na wypadek błędnego płatnika).
  if (kicked && ((preObject?.spell?.modes && modeIndex != null)
    || preObject?.spell?.xCost || preObject?.spell?.fireball)) {
    throw new Error('Kicker nie łączy się z rzutem modalnym, z kosztem X ani z Fireballem');
  }
  // CR 702.174a (Gift): obietnicę daru składa się przy rzucaniu czaru, który
  // ma tę mechanikę; odbiorcą musi być PRZECIWNIK (wskazany razem z kosztem).
  // Wariant modalny/Kosztu X ma osobne ścieżki i daru nie rozlicza — jawny
  // błąd zamiast cichego zignorowania (L5; żadna karta z darem nie jest
  // modalna, więc to bramka na wypadek złego płatnika).
  if (gifted && preObject?.spell?.modes && modeIndex != null) {
    throw new Error('Gift nie łączy się z rzutem modalnym');
  }
  if (gifted && !preObject?.gift) throw new Error('Ta karta nie ma mechaniki gift');
  const giftRecipient = gifted
    ? giftRecipientFor(state, playerId, giftRecipientId)
    : null;
  if (gifted && !giftRecipient) throw new Error('Nieprawidłowy odbiorca daru');
  // Modal „Choose one" (Aerith Rescue Mission): osobna ścieżka walidacji —
  // cele i efekty pochodzą z wybranego trybu, a nie z nadrzędnego deskryptora.
  if (preObject?.spell?.modes && modeIndex != null) {
    // Audyt PR #93: ścieżka modalna musi znać to samo uprawnienie co `requireSpell`
    // — inaczej czar z „Choose one" wygnany w oknie zdolności nie ma żadnej drogi
    // autoryzacji (Vaan: stempel `playableUntilTurn` zdjęty słusznie, ruling WotC).
    return castModalSpell(state, playerId, objectId, modeIndex, targets, stunTargetId, abilityWindowCast, handFreeCast);
  }
  // Generyczny X-cost (Consume Spirit, Epic Experiment): koszt = manaCost + X.
  if (preObject?.spell?.xCost) {
    return castXCostSpell(state, playerId, objectId, targets, xValue, abilityWindowCast);
  }
  // Fireball (X-cost, „any number of targets", divided damage): osobna ścieżka —
  // X wybiera gracz, cele to dowolna liczba (stwory i/lub gracze), koszt {X}{R}+
  // {1} za każdy cel ponad pierwszy, obrażenia X dzielone po równo w dół.
  if (preObject?.spell?.fireball) {
    return castFireball(state, playerId, objectId, targets, xValue, abilityWindowCast);
  }
  const { object, targetSpec, chosen } = requireSpell(state, playerId, objectId, targets, false, abilityWindowCast);
  const player = state.players.find((entry) => entry.id === playerId);
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? [], object);
  // Batch 57/B6a: „bez płacenia kosztu many" to JEDEN predykat używany przez
  // wszystkie bramki kosztu poniżej (kolor, phyrexian, budżet kosztu
  // dodatkowego) — inaczej walidacje rozjeżdżają się z płatnością (L41/L48).
  // Uprawnienie jest ważne wyłącznie dla karty w RĘCE (strefa sprawdzana tu,
  // bo tylko ta ścieżka woła `handFreeCast`).
  if (handFreeCast && object.zone !== 'hand') throw new Error('Darmowy rzut bez kosztu many dotyczy karty z ręki');
  // Surge (CR 702.117a, Batch 58/B1): koszt ALTERNATYWNY — wymaga innego czaru
  // rzuconego w tej turze (licznik czytany PRZED tym rzutem, jak na ścieżce
  // permanentów). Co do łączenia z innymi wariantami kosztu: CR 601.2b zabrania
  // zastosować DWA koszty alternatywne („A player can't apply two alternative
  // methods of casting or two alternative costs to a single spell"), ale CR
  // 601.2f składa koszt całkowity jako „alternatywny + wszystkie dodatkowe −
  // redukcje", więc ani kicker (702.33a: „an ADDITIONAL [cost]"), ani delve
  // (702.66a: „isn't an additional or alternative cost") nie są regułowo
  // wykluczone. Bramki niżej to OGRANICZENIE IMPLEMENTACJI (ta ścieżka nie
  // składa kosztu surge z dopłatą/redukcją), a nie reguła gry — audyt PR #134,
  // F-3e; w katalogu nie ma karty z oboma mechanizmami (L5: jawny brak obsługi
  // zamiast złej płatności).
  const surge = surgeCast ? (object.surge ?? null) : null;
  if (surgeCast && !surge) throw new Error('Ta karta nie ma mechaniki surge');
  if (surgeCast && (state.spellsCastThisTurnByPlayer?.[playerId] ?? 0) < 1) {
    throw new Error('Surge: wymaga rzucenia innego czaru w tej turze');
  }
  if (surgeCast && kicked) throw new Error('Surge + kicker: połączenie nieobsługiwane (koszt alternatywny nie składa się z dodatkowym — ograniczenie silnika, CR 601.2f takie łączenie dopuszcza)');
  if (surgeCast && phyrexianPayWithLife > 0) throw new Error('Surge + phyrexian: połączenie nieobsługiwane (ograniczenie silnika, nie reguła)');
  // Dodatkowy koszt „sacrifice a creature" (Village Rites): walidacja celu-
  // poświęcenia PRZED jakąkolwiek mutacją (CR 601.2h) — nieudany rzut nie może
  // utracić many ani zostawić karty na stosie.
  const sacrificeCost = object.spell.additionalCost?.sacrificeCreature;
  const orPayMana = object.spell.additionalCost?.orPayMana;
  // Lash of the Balrog (LTR): „As an additional cost to cast this spell,
  // sacrifice a creature OR pay {4}." — caster wybiera: poświęcić (wariant
  // z sacrificeTargetId) albo zapłacić dodatkową manę (payAltCost). Walidacja
  // spójna z enumeracją oferty (legalSpellCasts).
  if (sacrificeCost && !payAltCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    if (!sacObject || sacObject.zone !== 'battlefield' || sacObject.kind !== 'creature' || sacObject.controllerId !== playerId) {
      throw new Error('Nielegalny cel dodatkowego kosztu (sacrifice a creature)');
    }
  }
  if (sacrificeCost && payAltCost) {
    // Koszt bazowy czaru = 0, gdy rzut jest darmowy (plot/suspend/impuls/B6a) —
    // inaczej bramka żądałaby many, której rzut w ogóle nie pobiera.
    const baseForAlt = (object.plotted || object.suspendReady || isFreeImpulseCast(object) || handFreeCast)
      ? 0 : effectiveSpellManaCost(state, object);
    if (orPayMana == null || baseForAlt + orPayMana > producibleMana(state, playerId, null, spellManaPurpose(object), coloredPipsOf(object.cardId))) {
      throw new Error('Za mało many na alternatywny koszt dodatkowy');
    }
  }
  // Batch 46 (Cathartic Reunion): koszt „discard two cards" — walidacja PRZED
  // jakąkolwiek mutacją (CR 601.2h), jak przy poświęceniu wyżej.
  const discardCost = object.spell.additionalCost?.discardCards ?? 0;
  if (discardCost > 0 && countDiscardableFor(state, playerId, objectId) < discardCost) {
    throw new Error('Za mało kart w ręce na dodatkowy koszt (discard)');
  }
  if (discardCardIds != null) {
    // Etap F/4b: wybór z komendy okna — dokładnie N różnych kart z ręki,
    // bez samego czaru; walidacja PRZED mutacją (L4).
    const ok = discardCost > 0 && Array.isArray(discardCardIds) && discardCardIds.length === discardCost
      && new Set(discardCardIds).size === discardCardIds.length
      && discardCardIds.every((id) => id !== objectId && state.zones.hand.includes(id)
        && state.objects.get(id)?.controllerId === playerId);
    if (!ok) throw new Error('Nieprawidłowy wybór kart do odrzucenia (koszt dodatkowy)');
  }
  // Kolorowa walidacja many (Sweet Oblivion: 2 Plains nie mogą rzucić U)
  // Plot – rzut bez kosztu many (bez koloru) – pomijamy walidację kolorową, jak w legalSpellCasts.
  // Suspend (CR 702.62): rzut po zdjęciu ostatniego licznika czasu — bez kosztu.
  // Batch 47: impulse „bez placenia" (Caves of Chaos Adventurer po ukonczonym
  // lochu) omija koszt i kolorowa walidacje — jak plot/suspend.
  const freeImpulse = isFreeImpulseCast(object);
  // Batch 57/B6a (Baral): jedyna definicja „kosztu many zniesionego" dla tej
  // ścieżki — trzy niżej bramki (kolor/nośnik phyrexian/koszt bazowy) muszą
  // czytać to samo, bo inaczej oferta i płatność się rozjeżdżają.
  const manaCostWaived = object.plotted || object.suspendReady || freeImpulse || handFreeCast;
  // Phyrexian mana (CR 118.9): każdy pip {R/P} płaci się maną LUB 2 życiem —
  // ta sama reguła co ścieżka permanentów (cast_permanent: warianty
  // phyrexianPayWithLife + changeLife). Batch 48 (Ruthless Invasion): PIERWSZY
  // czar z pitem phyrexian — dotąd ścieżka czarów znała tylko pipy kolorowe
  // (koszt liczony bez pipa = karta o manę tańsza; płatność życiem
  // niedostępna — klasa L23 + CR 118.9).
  // Koszt surge jest CAŁKIEM osobny (własna kwota i własne pipy) — symbole
  // phyrexian wydruku nie wchodzą do rachunku, a bramka kolorów pyta o pipy
  // KOSZTU SURGE (lustro `castPermanent`: altCostColors).
  const phyrexianSymbols = (manaCostWaived || surge) ? 0 : (object.phyrexianManaCost ?? 0);
  const lifePaid = phyrexianSymbols > 0 ? (phyrexianPayWithLife ?? 0) : 0;
  if (lifePaid < 0 || lifePaid > phyrexianSymbols) throw new Error('Nieprawidłowa liczba symboli phyrexian płaconych życiem');
  // Pipy aktywnego kosztu: koszt alternatywny surge pyta o SWOJE kolory,
  // zwykły rzut o pipy karty (jedno źródło dla bramki kolorów, kickera
  // i `spendMana` — L48: oferta = walidacja = płatność).
  const basePips = manaCostWaived ? []
    : surge ? (surge.colors ?? []).map((color) => [color])
      : coloredPipsOf(object.cardId, lifePaid);
  if (!manaCostWaived) {
    const colorGateOk = surge
      ? (basePips.length === 0 || canPayColoredCost(state, playerId, basePips))
      : hasColorForObject(state, playerId, object, lifePaid);
    if (!colorGateOk) throw new Error('Brak kolorowego źródła many');
  }
  // Kicker (CR 702.33) na czarach — ta sama zasada co na ścieżce permanentów
  // (`castPermanent` w resources.js): „You may pay an additional [cost] as you
  // cast this spell." — koszt dodatkowy dokłada się do sumy, JEGO pipy kolorów
  // do wymagań, a fakt opłacenia ląduje na obiekcie stosu (`wasKicked`) i
  // w zdarzeniu `spell_cast` (`kicked`) — tam, gdzie patrzą triggery
  // „if it was kicked" oraz „whenever you cast a kicked spell" (Merfolk
  // Falconer). Decyzja właściciela (audyt PR #93): silnik obsługuje kickera
  // także na instantach i sorcerych — to nie `limitations`, tylko brakująca
  // ścieżka rozliczenia kosztu.
  if (kicked && !object.kicker) throw new Error('Ta karta nie ma mechaniki kicker');
  const kicker = kicked ? (object.kicker ?? null) : null;
  const kickerPips = (kicker?.colors ?? []).map((color) => [color]);
  if (kickerPips.length > 0
    && !canPayColoredCost(state, playerId, [...basePips, ...kickerPips])) {
    throw new Error('Brak kolorowego źródła many na kickera');
  }
  // Warunkowa obniżka kosztu (Metalcraft, Stoic Rebuttal) oraz modyfikatory
  // z permanentów (Etherium Sculptor): płacimy efektywny koszt wyliczony
  // w chwili rzutu (warunki i modyfikatory oceniane na bieżącej planszy).
  // Surge (CR 702.117): kwota kosztu ALTERNATYWNEGO redukowana jak każdy inny
  // alt-koszt (`reduceAlternativeCost` — ta sama reguła co cleave/escape/
  // flashback/bestow: obniżki działają na generyczną część AKTYWNEGO kosztu,
  // nie na wydruk karty). Limit delve (CR 702.66) liczy się z kosztu
  // wydruku, dlatego łączenie surge+delve jest odrzucane wyżej.
  const baseMana = manaCostWaived ? 0
    : surge ? reduceAlternativeCost(state, object, surge.cost ?? object.manaCost ?? 0, surge.colors ?? [])
      : effectiveSpellManaCost(state, object);
  const altManaExtra = (sacrificeCost && payAltCost) ? (orPayMana ?? 0) : 0;
  // Pip phyrexian płacony maną to pełna jednostka many (CR 118.9); pipy
  // opłacone życiem nie biorą udziału w koszcie many. M259/B3: baseMana
  // (object.manaCost) zawiera już symbole phyrexian — odejmujemy lifePaid.
  // Kicker to koszt DODATKOWY (CR 601.2f): nie podlega obnizkom kosztu czaru
  // i placa go takze rzuty „without paying its mana cost" (plot/suspend).
  // CR 702.66 (Delve, Batch 57/B4): wygnanie kart z własnego grobu podczas
  // rzucania pokrywa część GENERYCZNĄ. Jak w ścieżce permanentów
  // (`castPermanent`): nie koszt alternatywny, limit = część generyczna,
  // wygnanie jest kosztem (CR 601.2h), walidacja przed mutacją.
  const delveIds = delveExileIds ?? null;
  let delveDeduct = 0;
  if (delveIds != null) {
    if (!object.delve) throw new Error('Ta karta nie ma mechaniki delve');
    if (!Array.isArray(delveIds) || new Set(delveIds).size !== delveIds.length) {
      throw new Error('Nieprawidłowy koszt Delve (exile)');
    }
    // CR 702.66a/66b (audyt PR #130, znalezisko B): limit to część generyczna
    // kosztu CAŁKOWITEGO, nie wydruku — `delveGenericMana` jest JEDNYM źródłem
    // tej reguły dla `delveExileLimit`, tej walidacji i `castPermanent`.
    // Rzut bez płacenia kosztu many (plot, impuls, darmowy rzut z ręki) nie ma
    // części generycznej do pokrycia — taki przypadek odrzuca strażnik sumy
    // poniżej (CR 118.7: składnik manowy zredukowany do niczego to {0}).
    if (delveIds.length > delveGenericMana(state, object)) {
      throw new Error('Delve: nie wolno wygnać więcej kart niż część generyczna kosztu całkowitego');
    }
    const ownGrave = new Set(state.zones.graveyard.filter((id) => id !== objectId
      && state.objects.get(id)?.controllerId === playerId));
    if (!delveIds.every((exId) => ownGrave.has(exId))) throw new Error('Nieprawidłowy koszt Delve (exile)');
    delveDeduct = delveIds.length;
  }
  const manaSpent = baseMana + altManaExtra - lifePaid + (kicker?.cost ?? 0) - delveDeduct;
  if (2 * lifePaid > (player.life ?? 0)) throw new Error('Niewystarczające życie');
  // Atomowość kosztu (CR 601.2h; audyt PR #130, znalezisko B): wygnanie kart
  // Delve jest MUTACJĄ, więc cała płatność musi być zwalidowana przed nią —
  // ujemna suma (wygnanie ponad część generyczną) albo brak many kończyły się
  // rzutem `spendMana` DOPIERO PO wygnaniu, więc odrzucona komenda zostawiała
  // grób w exile. Ta sama bramka, którą `castPermanent` ma przed mutacjami.
  if (delveIds != null) {
    if (!Number.isInteger(manaSpent) || manaSpent < 0) {
      throw new Error('Delve: wygnanie przewyższa część generyczną kosztu całkowitego');
    }
    const delveRequirements = [...basePips, ...kickerPips];
    if (producibleMana(state, playerId, null, spellManaPurpose(object), delveRequirements) < manaSpent) {
      throw new Error('Niewystarczająca mana na rzut z Delve');
    }
  }
  for (const exId of delveIds ?? []) {
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, exId, 'exile', exileId, { exiledBy: object.cardId });
    state.events.push(event('object_moved', {
      fromId: exId, object: moved, fromZone: 'graveyard', toZone: 'exile', delve: true,
    }));
  }
  spendMana(state, playerId, manaSpent, [...basePips, ...kickerPips], spellManaPurpose(object));
  if (lifePaid > 0) changeLife(state, playerId, -2 * lifePaid);
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  // Poświęcenie stwora jest KOSZTEM rzutu — następuje, zanim czar trafi na stos
  // (nawet przy późniejszym kontrczarze stwór pozostaje poświęcony — CR 601.2h).
  // Lash: przy wariantcie payAlt nie poświęcamy (zapłaciliśmy maną).
  // Batch 43 (Severed Strands): „You gain life equal to the sacrificed
  // creature's toughness" — wytrzymałość poświęconego liczymy PRZED ruchem
  // do grobu (LKI, CR 608.2g) i niesiemy na obiekcie stosu; efekt gain_life
  // z amountFromSacrificedToughness czyta ją przy rozstrzygnięciu.
  let sacrificedToughness = null;
  if (sacrificeCost && !payAltCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    sacrificedToughness = effectiveToughness(sacObject, state);
    // Finality (CR 122.1b): koszt poświęcenia to też śmierć — obiekt z finality
    // idzie do exile zamiast do grobu (spójnie z sacrifice_permanent).
    const toZone = deathZoneFor(state, sacObject);
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sacrificeTargetId, toZone, destId);
    state.events.push(event('permanent_sacrificed', {
      fromId: sacrificeTargetId, objectId: destId, playerId, cardId: moved.cardId, additionalCost: true, toZone,
    }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
    // Buyback (CR 702.27): jeśli gracz wybrał wariant z buyback, czar po
  // rozstrzygnięciu wraca do ręki zamiast do grobu. Flaga na obiekcie stosu.
  const wasBuyback = Boolean(object.spell?.buyback && buyback);
  // Rebound (CR 702.88): „If you cast this spell FROM YOUR HAND, exile it as
  // it resolves.\" — flaga tylko dla rzutu z RĘKI (nie z grobu/exile przez
  // flashback/suspend/plot). Przechodzi z kartą do strefy po rozstrzygnięciu
  // (resolveTopOfStack), gdzie decyduje o exile zamiast grobu.
  const reboundCast = Boolean(object.spell?.rebound && object.zone === 'hand');
  const stacked = Object.freeze({
    ...moved, tapped: false, chosenTargets: chosen.slice(), wasBuyback, reboundCast,
    // CR 702.33a: „was kicked" to własność CZARU na stosie — trigger wchodzący
    // po rozstrzygnięciu czyta ją z obiektu, nie ze zdarzenia rzutu.
    wasKicked: Boolean(kicker),
    // CR 702.117a: koszt surge to fakt CZARU na stosie (jak „was kicked") —
    // publiczny dla logu i dla triggerów czytających wybrany koszt.
    surgeCast: Boolean(surge),
    // CR 702.174a-b: obietnica daru (i jego odbiorca) jest własnością CZARU na
    // stosie — dar wydajemy przy rozstrzygnięciu (instanty/sorcery), a nie
    // w chwili rzucania, więc czar skontrowany nie daje niczego.
    wasGifted: Boolean(giftRecipient),
    giftRecipientId: giftRecipient?.id ?? null,
    ...(sacrificedToughness != null ? { sacrificedToughness } : {}),
  });
  state.objects.set(stackId, stacked);
  if (wasBuyback) {
    // Buyback koszt many jest dodatkowy do bazowego — płacimy różnicę
    const bbCost = object.spell.buyback.cost ?? 0;
    if (bbCost > 0) spendMana(state, playerId, bbCost, [], spellManaPurpose(object));
  }
  // Batch 46 (Cathartic Reunion): odrzucenie kart to KOSZT (CR 601.2h) —
  // płacone przy rzucaniu, po umieszczeniu czaru na stosie (czar nie może
  // odrzucić sam siebie). Wybór kart należy do gracza, więc kolejkujemy
  // blokującą decyzję; kontrczar nie zwraca odrzuconych kart.
  if (discardCost > 0 && discardCardIds != null) {
    discardCardsForced(state, {
      playerId, cardIds: [...discardCardIds], purpose: 'cost',
      sourceCardId: object.cardId ?? null, restorePriorityTo: state.turn.priorityPlayerId,
    });
  } else if (discardCost > 0) {
    const handIds = state.zones.hand.filter((handId) => state.objects.get(handId)?.controllerId === playerId);
    // Znalezisko A: koszt „odrzuć N" przy dokładnie N kartach płaci się sam
    // (priorytet nietknięty — nie ma decyzji do oddawania).
    if (shouldAutoDiscard({ count: Math.min(discardCost, handIds.length), candidateIds: handIds })) {
      discardCardsForced(state, {
        playerId, cardIds: [...handIds], purpose: 'cost',
        sourceCardId: object.cardId ?? null, restorePriorityTo: state.turn.priorityPlayerId,
      });
    } else {
    state.pendingDiscardChoice = {
      playerId,
      count: Math.min(discardCost, handIds.length),
      handIds,
      purpose: 'cost',
      sourceCardId: object.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = playerId;
    state.events.push(event('discard_choice_required', {
      playerId, count: Math.min(discardCost, handIds.length), cardIds: [...handIds],
      purpose: 'cost', sourceCardId: object.cardId ?? null,
    }));
    }
  }
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    // Batch 45 (Assert Perfection): pozycja optional może być null.
    targets: targetObjects.map((entry) => entry?.id ?? null),
    targetCardIds: targetObjects.map((entry) => entry?.cardId ?? null), plotted: Boolean(object.plotted),
    // Mana wydana na ten rzut (publiczna) — progi triggerów „if four or more
    // mana was spent to cast that spell" (Tellah, Great Sage) czytają ją
    // z kontekstu zdarzenia.
    manaSpent,
    // Kolory rzucanego czaru (publiczne) — trigger „a player casts a white
    // spell" (Angel's Feather) filtruje po nich generycznie.
    colors: [...(object.colors ?? [])],
    // Phyrexian mana (CR 118.9) — publiczne: ile symboli i czy opłacono
    // życiem (jak permanent_cast; log i panel nazywają wybór).
    phyrexianSymbols, phyrexianPaidWithLife: lifePaid,
    // Fakt użycia kickera (jawny w logu i dla triggerów „whenever you cast a
    // kicked spell" — triggers.js czyta `ev.kicked`; lustrzane pole
    // `permanent_cast` w resources.js).
    kicked: Boolean(kicker),
    // Surge (CR 702.117, Batch 58/B1) — jawny w logu i na obiekcie stosu
    // (lustrzane pole `permanent_cast` w resources.js).
    surgeCast: Boolean(surge),
    // Fakt obietnicy daru i jej odbiorca (jawny w logu; własność czaru na
    // stosie — CR 702.174a).
    gifted: Boolean(giftRecipient),
    giftRecipientId: giftRecipient?.id ?? null,
  });
  state.events.push(e);
  // Storm (CR 702.40a): „When you cast this spell, copy it for each spell cast
  // before it this turn." To ZDOLNOŚĆ TRIGGEROWANA — idzie na stos NAD czarem,
  // więc przeciwnik może na nią odpowiedzieć, a kopie powstają dopiero przy
  // jej rozstrzygnięciu (triggers.resolveTriggerEntry, gałąź stormCopy).
  // Liczba kopii to czary rzucone PRZED tym czarem w tej turze — licznik
  // zawiera już ten rzut, więc odejmujemy jeden i zamrażamy wartość.
  if (object.spell?.storm) {
    const copies = Math.max(0, (state.spellsCastThisTurn ?? 1) - 1);
    const triggerId = `trigger-${state.objectSequence++}`;
    state.objects.set(triggerId, Object.freeze({
      id: triggerId, zone: 'stack', controllerId: playerId, cardId: object.cardId,
      kind: 'trigger',
      triggerEntry: Object.freeze({
        ability: Object.freeze({ trigger: Object.freeze({ event: 'storm' }) }),
        sourceId: stackId,
        targets: [],
        extra: Object.freeze({ stormCopy: Object.freeze({ stackId, copies }) }),
        sourceLki: Object.freeze({}),
      }),
    }));
    state.zones.stack.push(triggerId);
    state.events.push(event('ability_triggered', {
      objectId: stackId, cardId: object.cardId, trigger: 'storm', onStack: true, copies,
    }));
  }
  return e;
}

/**
 * M161/O1 (zasada właściciela 2026-08-20: kod mechaniki gotowy na karty,
 * które dopiero przyjdą; obserwacja audytu PR #66): rzut INSTANT/SORCERY
 * za koszt madness (CR 702.35). W katalogu nie ma dziś takiej karty (strażnik
 * katalogu w test/m161-madness-spell-path.test.js sygnalizuje pierwszą),
 * ale routing resolve_madness_cast po kind kieruje tu obiekty spell.
 *
 * Wzorzec: handlery suspend/rebound — rzut z exile w rozstrzyganiu
 * jednorazowej decyzji, timing IGNOROWANY (CR 702.35a + ruling DMU 2023-01-06 — także sorcery w
 * cleanup i w turze przeciwnika), cele walidowane jak przy zwykłym rzucie.
 * Różnica: koszt madness się PŁACI (redukcje generyczne i płatność pipami
 * madness.colors — lustro castPermanent, M161/O2).
 *
 * Jawny zakres (pierwsza realna karta go rozszerza świadomie, test S10
 * pilnuje sygnału): czary bez kosztów dodatkowych (additionalCost), bez
 * xCost/fireball i bez trybów variableTargets — enumeracja ofert
 * (epicCastOffers) te kształty pomija, a ręczna komenda dostaje czytelny
 * powód odrzucenia zamiast cichego obejścia.
 */
export function castMadnessSpell(state, playerId, objectId, targets, modeIndex) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'exile' || !object.madnessReady) {
    throw new Error('Nielegalny czar madness');
  }
  if (object.kind !== 'spell') throw new Error('Ten obiekt nie jest czarem');
  if (!object.madness) throw new Error('Ta karta nie ma mechaniki madness');
  if (object.spell?.xCost || object.spell?.fireball) throw new Error('Madness: czar X/fireball poza zakresem');
  if (object.spell?.additionalCost) throw new Error('Madness: dodatkowy koszt czaru poza zakresem');
  const chosen = Array.isArray(targets) ? targets : [];
  let chosenTargets = [];
  let chosenMode;
  let targetSpec;
  if (object.spell?.modes) {
    if (!Number.isInteger(modeIndex) || modeIndex < 0 || modeIndex >= object.spell.modes.length) {
      throw new Error('Nieprawidłowy tryb czaru madness');
    }
    const mode = object.spell.modes[modeIndex];
    if (mode.variableTargets) throw new Error('Madness: variableTargets poza zakresem');
    targetSpec = mode.targets ?? [];
    chosenMode = modeIndex;
  } else {
    targetSpec = object.spell?.targets ?? [];
  }
  if (chosen.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów czaru madness');
  if (targetSpec.length > 0) {
    chosenTargets = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? [], object);
  }
  // Koszt madness (CR 702.35a) z redukcjami generycznymi — jak w castPermanent.
  let cost = object.madness.cost ?? object.manaCost ?? 0;
  cost = reduceGenericCost(object.cardId, cost, costReductionForSpell(state, object) + conditionalCostReduction(state, object));
  // Pipy KOSZTU MADNESS, nie karty (M161/O2); spendMana egzekwuje kolory
  // jako głęboką obronę (auto-tap kolorowopasujących źródeł).
  const requirements = (object.madness.colors ?? []).map((color) => [color]);
  if (producibleMana(state, playerId, null, spellManaPurpose(object), requirements) < cost) throw new Error('Niewystarczająca mana');
  if (!canPayColoredCost(state, playerId, requirements)) throw new Error('Brak kolorowego źródła many');
  spendMana(state, playerId, cost, requirements, spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({
    ...moved,
    tapped: false,
    chosenTargets: chosenTargets.map((entry) => entry.id),
    ...(chosenMode != null ? { chosenMode } : {}),
    // Gotowość madness jest jednorazowa — konsumowana rzutem.
    madnessReady: false,
  });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: chosenTargets.map((entry) => entry.id),
    targetCardIds: chosenTargets.map((entry) => entry.cardId),
    madness: true,
    manaSpent: cost,
    colors: [...(object.colors ?? [])],
    ...(chosenMode != null ? { modeIndex: chosenMode } : {}),
  });
  state.events.push(e);
  return e;
}

/**
 * Fireball (X-cost, „any number of targets"): X wybiera gracz (komenda niesie
 * xValue), cele to dowolna liczba legalnych stworów i/lub graczy (najpierw
 * stworów, potem graczy — mogą się powtarzać). Koszt = {X} + {R} + {1} za każdy
 * cel ponad pierwszy. Obrażenia X dzielone po równo (zaokr. w dół) między
 * wszystkie cele; reszta z dzielenia przepada (CR 119.4 „divided evenly").
 */
/**
 * Walidacja celów Fireballa („any number of targets"): stwory na polu bitwy
 * (bez hexproof wobec rzucającego, bez protection — CR 702.16b) i/lub
 * gracze, bez powtórzeń. Jedno źródło dla rzutu z ręki i dla rzutu „without
 * paying its mana cost" z okien decyzji (Etap F/4, game-state.js).
 */
export function validateFireballTargets(state, playerId, object, chosen) {
  const seen = new Set();
  for (const tId of chosen) {
    if (seen.has(tId)) throw new Error('Cel czaru X nie może się powtarzać');
    seen.add(tId);
    const target = state.objects.get(tId);
    const isPlayer = state.players.some((p) => p.id === tId);
    if (isPlayer) continue;
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') throw new Error(`Nielegalny cel czaru X: ${tId}`);
    if (hasHexproofAgainst(state, target, playerId)) throw new Error(`Nielegalny cel czaru X (hexproof): ${tId}`);
    // Protection (CR 702.16b — DEBT: T): wspólny predykat (F2). Fireball to {R},
    // ale reguła czyta też JAKOŚCI (np. „protection from creatures" — czar nie
    // jest stworem, więc nie blokuje; wcześniej ta kopia wcale nie znała jakości).
    if (isTargetingBlockedByProtection(state, target, object, { sourceColors: object.colors ?? [] })) {
      throw new Error(`Nielegalny cel czaru X (protection): ${tId}`);
    }
  }
}

function castFireball(state, playerId, objectId, targets, xValue, abilityWindowCast = false) {
  const object = state.objects.get(objectId);
  // Patrz `castXCostSpell`: to samo uprawnienie okna zdolności (audyt PR #93).
  const fromAbilityWindow = abilityWindowCast && object?.zone === 'exile';
  if (!object || object.controllerId !== playerId
    || (object.zone !== 'hand' && !fromAbilityWindow)
    || object.kind !== 'spell' || !object.spell?.fireball) {
    throw new Error('To nie jest rzucalny czar X z dowolną liczbą celów z ręki');
  }
  if (object.spell.timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    if (!abilityWindowCast && (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0)) {
      throw new Error('Czar sorcery tylko w swoją fazę main przy pustym stosie');
    }
  }
  const X = Number.isInteger(xValue) && xValue >= 0 ? xValue : 0;
  const chosen = Array.isArray(targets) ? targets : [];
  // „Any number of targets" (Oracle JVC): 0 celów jest legalne (czar nie robi
  // nic); oferta UI zaczyna się od 1 celu, ale walidacja przyjmuje pełną
  // przestrzeń Oracle. Duplikaty celów nielegalne — cel wybiera się raz.
  // Walidacja celów: stwory na polu bitwy (nie hexproof, nie protection od koloru
  // czaru — CR 702.16b) i/lub gracze. Brak górnego limitu poza opłacalnością.
  validateFireballTargets(state, playerId, object, chosen);
  // Koszt: {X} + {R} + {1} za każdy cel ponad pierwszy.
  const extraTargets = Math.max(0, chosen.length - 1);
  const totalCost = X + (object.manaCost ?? 0) + extraTargets;
  if (!object.plotted && totalCost > producibleMana(state, playerId, null, spellManaPurpose(object), coloredPipsOf(object.cardId))) throw new Error('Niewystarczająca mana na czar X');
  if (!object.plotted && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  const manaSpent = object.plotted ? 0 : totalCost;
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId), spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), fireballX: X });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: chosen.slice(),
    targetCardIds: chosen.map((id) => state.objects.get(id)?.cardId ?? null), plotted: Boolean(object.plotted), manaSpent,
    // Audyt PR #129 / F-1 (2026-09-19): zdarzenie musi nieść X tak samo jak
    // castXCostSpell — inaczej B1 właściciela („widać, za ile X zagrano”)
    // działał dla każdego czaru X prócz fireballowych, a `stacked.fireballX`
    // zna tylko silnik. Jedno źródło brzmienia logu czyta `e.xValue`
    // (session.js `spell_cast`, wzorzec L41).
    xValue: X,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/** Generyczny X-cost czar (Consume Spirit, Epic Experiment — Batch 30).
 *  Czar ma `spell.xCost` (manaCost = koszt bazowy BEZ X); X wybiera gracz
 *  (komenda niesie xValue). Całkowity koszt = manaCost + X. Cele walidowane
 *  wg `spell.targets` (zazwyczaj 0-1 cel — „any target"). X zapisujemy na
 *  obiekcie stosu (spellX), żeby efekty (damage/gain/exile) mogły go użyć.
 *
 *  KARTY SPOZA KATALOGU (Etap F/4, stan 2026-09-24: żaden czar X/Fireball
 *  w katalogu nie ma plot, suspend, flashback, kickera ani surge): ta ścieżka
 *  (i `castFireball`) zawsze płaci manaCost + X z ręki/okna zdolności. Rzut
 *  „without paying its mana cost" (plot, suspend, Discover, Epic…) idzie
 *  przez `castSpellWithoutManaCost` (game-state.js) z X = 0 (CR 107.3b).
 *  Gdy do katalogu wejdzie czar X z plot/flashbackiem/kickerem: rozliczyć
 *  tu koszt alternatywny/dodatkowy (CR 118.9, 601.2f) zamiast dopłacać
 *  pełny manaCost — dziś `castSpell` kieruje X do tej funkcji bez tych opcji.
 */
function castXCostSpell(state, playerId, objectId, targets, xValue, abilityWindowCast = false) {
  const object = state.objects.get(objectId);
  // Audyt PR #93: `abilityWindowCast` — czar X wygnany przez zdolność, która
  // pyta „you may cast it”, jest rzucalny z exile (CR 107.3a: X wybiera gracz
  // w chwili rzutu). Mirror `requireSpell`/`castModalSpell`.
  const fromAbilityWindow = abilityWindowCast && object?.zone === 'exile';
  if (!object || object.controllerId !== playerId
    || (object.zone !== 'hand' && !fromAbilityWindow)
    || object.kind !== 'spell' || !object.spell?.xCost) {
    throw new Error('To nie jest rzucalny X-cost czar z ręki');
  }
  if (object.spell.timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    if (!abilityWindowCast && (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0)) {
      throw new Error('Czar sorcery tylko w swoją fazę main przy pustym stosie');
    }
  }
  const X = Number.isInteger(xValue) && xValue >= 0 ? xValue : 0;
  const chosen = Array.isArray(targets) ? targets : [];
  const targetSpec = object.spell.targets ?? [];
  const targetObjects = targetSpec.length > 0 ? validateTargets(state, targetSpec, chosen, playerId, object.colors ?? [], object) : [];
  if (!object.plotted && !object.suspendReady && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  const baseCost = (object.plotted || object.suspendReady) ? 0 : effectiveSpellManaCost(state, object);
  const totalCost = baseCost + X;
  // „Spend only black mana on X" (Consume Spirit): X to pipy {B}, nie generic.
  // (A: asemblacja PRZED strażnikiem (czysta) — joint (iv) bramki kosztowych.)
  const xPips = [...coloredPipsOf(object.cardId)];
  if (object.spell.xCost.black && X > 0) {
    for (let i = 0; i < X; i += 1) xPips.push(['B']);
  }
  if (!object.plotted && totalCost > producibleMana(state, playerId, null, spellManaPurpose(object), xPips)) throw new Error('Niewystarczająca mana na czar');
  const manaSpent = object.plotted ? 0 : totalCost;
  spendMana(state, playerId, manaSpent, xPips, spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({
    ...moved, tapped: false,
    chosenTargets: targetObjects.map((entry) => entry?.id ?? null).filter((id) => id !== null),
    spellX: X,
  });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: stacked.chosenTargets,
    targetCardIds: stacked.chosenTargets.map((id) => state.objects.get(id)?.cardId ?? null),
    plotted: Boolean(object.plotted), manaSpent, xValue: X,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

export function castCleave(state, playerId, objectId, targets, sacrificeTargetId) {
  const preObject = state.objects.get(objectId);
  if (!preObject || !preObject.spell || !preObject.spell.cleave) {
    throw new Error('Ten czar nie ma alternatywnego kosztu cleave');
  }
  const { object, targetSpec, chosen } = requireSpell(state, playerId, objectId, targets, true);
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? [], object);
  const sacrificeCost = object.spell.additionalCost?.sacrificeCreature;
  if (sacrificeCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    if (!sacObject || sacObject.zone !== 'battlefield' || sacObject.kind !== 'creature' || sacObject.controllerId !== playerId) {
      throw new Error('Nielegalny cel dodatkowego kosztu (sacrifice a creature)');
    }
  }
  // Etap F (CR 118.9): bramka kolorów WYDRUKU tu nie obowiązuje — płacony
  // jest wyłącznie koszt cleave (jego pipy sprawdza canPayColoredCost niżej).
  // M267/C: pipy KOSZTU CLEAVE, nie karty (wzorzec madness M161/O2). Dotąd
  // płatność czytała `coloredPipsOf(cardId)` i trafiała przypadkiem — koszt
  // bazowy Lunar Rejection ma ten sam {U} co cleave. Pierwsza karta o innym
  // kolorze alt-kosztu płaciłaby złym kolorem.
  const cleaveRequirements = (object.spell.cleave.colors ?? []).map((color) => [color]);
  const manaSpent = object.plotted ? 0
    : reduceAlternativeCost(state, object, object.spell.cleave.manaCost ?? 0, cleaveRequirements.map((req) => req[0]));
  if (!object.plotted && !canPayColoredCost(state, playerId, cleaveRequirements)) {
    throw new Error('Brak kolorowego źródła many');
  }
  spendMana(state, playerId, manaSpent, cleaveRequirements, spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  if (sacrificeCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    const toZone = deathZoneFor(state, sacObject);
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sacrificeTargetId, toZone, destId);
    state.events.push(event('permanent_sacrificed', {
      fromId: sacrificeTargetId, objectId: destId, playerId, cardId: moved.cardId, additionalCost: true, toZone,
    }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), cleaved: true });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    // Batch 45 (Assert Perfection): pozycja optional może być null.
    targets: targetObjects.map((entry) => entry?.id ?? null),
    targetCardIds: targetObjects.map((entry) => entry?.cardId ?? null), plotted: Boolean(object.plotted),
    manaSpent,
    colors: [...(object.colors ?? [])], cleaved: true,
  });
  state.events.push(e);
  return e;
}

/**
 * Lista legalnych kandydatów dla pojedynczej pozycji specyfikacji celów.
 * Generyczna — nie zna nazw kart; decydują wyłącznie typy celów (ADR 0002).
 * Eksportowana, bo efekty engine (Batch 22: Stomping Slabs damage target)
 * korzystają z niej do wyliczenia oferty „any target" po reveal.
 */
/**
 * Kandydaci na cel wg deskryptora. `sourceObject` (opcjonalny) to ŹRÓDŁO
 * czaru/zdolności — potrzebne do ochrony przed JAKOŚCIĄ (CR 702.16b):
 * oferta musi odrzucać te same cele co validateTargets, inaczej UI proponuje
 * ruch, który engine odrzuci (pułapka M82).
 */
export function legalTargetCandidates(state, playerId, spec, sourceObject = null, targetOrderPreference = null) {
  const candidates = targetCandidatesBySpec(state, playerId, spec, targetOrderPreference);
  if (!sourceObject) return candidates;
  return candidates.filter((targetId) => {
    const target = state.objects.get(targetId);
    if (!target) return true; // cel-gracz (id gracza) — jakość go nie chroni
    // Protection (CR 702.16b — DEBT: T): ten sam predykat co walidacja (F2),
    // żeby oferta nie proponowała celu, który engine odrzuci (L48, pułapka M82).
    if (isTargetingBlockedByProtection(state, target, sourceObject)) return false;
    return true;
  });
}

function targetCandidatesBySpec(state, playerId, spec, targetOrderPreference = null) {
  const players = state.players.map((entry) => entry.id);
  const battlefieldCreatures = state.zones.battlefield.filter((objectId) => {
    const target = state.objects.get(objectId);
    return target?.kind === 'creature' && target.zone === 'battlefield'
      && !hasHexproofAgainst(state, target, playerId);
  });
  // M203/2: kolejność kandydatów jest TREŚCIĄ decyzji, nie szczegółem
  // implementacji — pierwszą ofertę bierze gracz klikający „pierwszą sensowną"
  // i każdy prosty bot. Przy konwencji „prezentacja = enumeracja" porządek
  // musi wynikać z reguły, a nie z kolejności strefy (dotąd brał się
  // z odwrócenia listy przez `unshift` w playerView, czyli z przypadku —
  // po zmianie konwencji Bring Low oferował jako pierwszy cel WŁASNEGO stwora).
  // Reguła: efekt przyjazny dla celu → najpierw stwory kontrolera; efekt
  // wrogi → najpierw stwory przeciwników. Klasyfikacja ta sama, co dla celów
  // triggerów (`triggerTargetEffectFriendly`), czyli jedno źródło (L41).
  const orderedByEffect = (ids) => {
    if (targetOrderPreference !== 'ownFirst' && targetOrderPreference !== 'opponentFirst') return ids;
    const mine = ids.filter((objectId) => state.objects.get(objectId)?.controllerId === playerId);
    const theirs = ids.filter((objectId) => state.objects.get(objectId)?.controllerId !== playerId);
    return targetOrderPreference === 'ownFirst' ? [...mine, ...theirs] : [...theirs, ...mine];
  };
  switch (spec.type) {
    case 'creature': return orderedByEffect(battlefieldCreatures);
    // M154 (Batch 38): stwór albo Vehicle (artefakt z podtypem Vehicle).
    case 'creature_or_vehicle':
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield') return false;
        const isVehicle = (object.subtypes ?? []).includes('Vehicle');
        if (object.kind !== 'creature' && !isVehicle) return false;
        return !hasHexproofAgainst(state, object, playerId);
      });
    // Cel „creature with subtypes\" (Lunar Rejection — Wolf/Werewolf):
    // stwór na polu bitwy mający co najmniej jeden z podtypów deskryptora.
    // validateTargets sprawdza to samo, więc oferta i walidacja są spójne.
    case 'creature_with_subtypes':
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        return (spec.subtypes ?? []).some((sub) => hasCreatureType(object, sub, state));
      });
    case 'artifact': return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object?.zone === 'battlefield'
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'))
        && !hasHexproofAgainst(state, object, playerId);
    });
    case 'artifact_or_enchantment': {
      // M69 (Expose to Daylight): artefakt albo enchantment na polu bitwy.
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield'
          && ((object.types ?? []).includes('Artifact') || (object.types ?? []).includes('Enchantment'))
          && !hasHexproofAgainst(state, object, playerId);
      });
    }
    case 'creature_or_enchantment': {
      // Batch 43 (Sea God's Scorn): stwór albo enchantment na polu bitwy
      // (enchantment creatures łapią się oba sposoby — jeden wpis).
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield'
          && (object.kind === 'creature' || (object.types ?? []).includes('Enchantment'))
          && !hasHexproofAgainst(state, object, playerId);
      });
    }
    case 'artifact_or_creature_or_enchantment': {
      // Banishment Decree: artefakt, stwór albo enchantment na polu bitwy.
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield'
          && ((object.types ?? []).includes('Artifact')
            || (object.types ?? []).includes('Enchantment')
            || object.kind === 'creature')
          && !hasHexproofAgainst(state, object, playerId);
      });
    }
    // Batch 56: cel „artifact or land" (Volcanic Submersion).
    case 'artifact_or_land': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        return (object.types ?? []).includes('Artifact')
          || object.kind === 'land' || (object.types ?? []).includes('Land');
      });
    }
    case 'artifact_or_creature_or_land': {
      // Twiddle: artefakt, stwór albo land na polu bitwy (także artifact/land
      // creatures). Spójnie z validateTargets (pułapka oferta/walidacja — M82).
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield'
          && ((object.types ?? []).includes('Artifact')
            || object.kind === 'creature'
            || object.kind === 'land' || (object.types ?? []).includes('Land'))
          && !hasHexproofAgainst(state, object, playerId);
      });
    }
    case 'player_or_planeswalker': return [...players, ...state.zones.battlefield.filter(id => {
      const object = state.objects.get(id);
      return object?.zone === 'battlefield' && isPlaneswalker(object) && !hasHexproofAgainst(state, object, playerId);
    })];
    case 'any_target': return [...new Set([...players, ...battlefieldCreatures,
      ...targetCandidatesBySpec(state, playerId, { type: 'player_or_planeswalker' })])];
    case 'player': {
      // M69 (Dreams of Steel and Oil — „Target opponent"): spec.opponent
      // ogranicza kandydatów do przeciwników rzucającego.
      if (spec?.opponent) return players.filter((id) => id !== playerId);
      // M202/N2 (audyt PR #73): `prefer: 'opponent'` to deskryptor DANYCH
      // (Dementia Bat — „Target player discards two cards”), który do tej pory
      // czytało wyłącznie `triggerTargetCandidates`. Bez niego kolejność
      // kandydatów była przypadkowa (porządek `state.players` + `unshift`
      // w `playerView`), a pierwsza oferta stołu i wybór prostego bota zależały
      // od kolejności tworzenia graczy. Preferencja jest tu jawna i generyczna:
      // przeciwnik pierwszy, kontroler pozostaje legalnym celem (CR 115.4).
      if (spec?.prefer === 'opponent') {
        const opponentId = players.find((id) => id !== playerId) ?? null;
        return opponentId ? [opponentId, ...players.filter((id) => id !== opponentId)] : players;
      }
      return players;
    }
    case 'creature_card_in_graveyard': {
      return state.zones.graveyard.filter((objectId) => {
        const object = state.objects.get(objectId);
        // Batch 45 (Unearth): „with mana value 3 or less" — filtr maxManaValue
        // spójny w OFERCIE i WALIDACJI (pułapka M82).
        if (spec?.maxManaValue != null && (object?.manaCost ?? 0) > spec.maxManaValue) return false;
        return object?.zone === 'graveyard' && object.kind === 'creature' && object.controllerId === playerId;
      });
    }
    case 'card_in_graveyard': {
      return state.zones.graveyard.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'graveyard' && object.controllerId === playerId;
      });
    }
    case 'noncreature_spell_on_stack': {
      // Negate: czary na stosie, które nie są stworami (instants/sorceries,
      // czyste aury oraz bestow jako Aura — M360/B1, CR 702.103b).
      // Bestow jako STWÓR wykluczony; triggery (kind 'trigger') to nie czary.
      return state.zones.stack.filter((objectId) => isNoncreatureSpellOnStack(state.objects.get(objectId)));
    }
    case 'spell_on_stack': {
      // Stoic Rebuttal („Counter target spell\"): dowolny czar na stosie,
      // także czar-stwór (bestow) czy czar aury — ale nie zdolność
      // triggerowana (kind 'trigger').
      return state.zones.stack.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'stack' && object.kind !== 'trigger' && object.kind !== 'activated';
      });
    }
    case 'ability_on_stack': {
      // Audyt PR #93: „Counter target activated or triggered ability".
      // Zdolność na stosie to wpis z `activatedEntry` (CR 602.2a) albo
      // `triggerEntry` (CR 603.3) — PREDYKAT TEN SAM co w `counterStackObject`,
      // bo dwie definicje „czym jest zdolność na stosie" to klasa L21.
      return state.zones.stack.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'stack' && Boolean(object.activatedEntry || object.triggerEntry);
      });
    }
    case 'artifact_spell_on_stack': {
      // Steel Sabotage: „Counter target artifact spell" — czary na stosie,
      // których karta jest artefaktem (także artifact creature).
      return state.zones.stack.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'stack' || object.kind === 'trigger' || object.kind === 'activated') return false;
        return object.kind === 'artifact' || (object.types ?? []).includes('Artifact');
      });
    }
    case 'opponent': {
      // „Target opponent\" (Plague Reaver): każdy gracz poza rzucającym.
      return players.filter((id) => id !== playerId);
    }
    case 'land_you_control': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        const isLand = object && (object.kind === 'land' || (object.types ?? []).includes('Land'));
        return isLand && object.zone === 'battlefield' && object.controllerId === playerId;
      });
    }
    // M108 (Kazuul's Toll Collector): „target Equipment you control".
    case 'equipment_you_control': {
      return state.zones.battlefield.filter((id) => {
        const object = state.objects.get(id);
        return object?.zone === 'battlefield' && object.controllerId === playerId
          && (object.equipment != null || (object.subtypes ?? []).includes('Equipment'));
      });
    }
    case 'creature_you_control': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield' && object.kind === 'creature' && object.controllerId === playerId;
      });
    }
    // M109 (Diplomatic Relations): „target creature an opponent controls\".
    // Ten sam typ nosi requiresTarget triggerów (triggers.js) — tu wchodzi
    // do OFERTY czarów, więc musi być też w validateTargets (pułapka M82).
    // M109 (Sagittars' Volley): „target creature with flying" — keyword
    // EFEKTYWNY (effectiveKeywords), więc latanie nadane aurą czy pumpem
    // liczy się tak samo jak wydrukowane.
    // Sterling Keykeeper (OTJ): „target non-Mount creature" — stwór, który
    // NIE ma wskazanego podtypu. Podtypy liczone efektywnie (changeling itp.).
    case 'creature_without_subtype': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        return !hasCreatureType(object, spec.subtype, state);
      });
    }
    case 'creature_with_keyword': {
      const keyword = spec.keyword;
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        return effectiveKeywords(object, state).includes(keyword);
      });
    }
    case 'creature_opponent_controls': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (object.controllerId === playerId) return false;
        return !hasHexproofAgainst(state, object, playerId);
      });
    }
    // Batch 22: Selesnya Charm tryb 2 — stwór z mocą ≥ N na polu bitwy.
    case 'tapped_creature': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield' && object.kind === 'creature' && object.tapped
          && !hasHexproofAgainst(state, object, playerId);
      });
    }
    case 'untapped_creature': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield' && object.kind === 'creature' && !object.tapped
          && !hasHexproofAgainst(state, object, playerId);
      });
    }
    // Batch 51 (Skinbrand Goblin — Bloodrush, CR 207.2c): „Target attacking
    // creature" — wyłącznie stwory zadeklarowane jako atakujące w TEJ walce
    // (`state.combat.attackers`). Poza walką zbiór jest pusty: CR 508.1k mówi,
    // że „attacking creature" istnieje tylko od deklaracji atakujących do
    // końca fazy walki — bez tego bloodrush celowałby w dowolnego stwora.
    case 'attacking_creature': {
      const attackerIds = state.combat?.attackers ?? [];
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (!attackerIds.includes(objectId)) return false;
        return !hasHexproofAgainst(state, object, playerId);
      });
    }
    case 'creature_with_power_at_least': {
      const min = spec.min ?? 5;
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        return (effectivePower(object, state) ?? 0) >= min;
      });
    }
    // Batch 22: Thistledown Players — dowolny NIE-land na polu bitwy (stwór,
    // artefakt, enchantment, planeswalker; engine: każy nonland permanent
    // to obiekt strefy battlefield inny niż land).
    case 'permanent': return state.zones.battlefield.filter(id => {
      const object = state.objects.get(id);
      return object?.zone === 'battlefield' && !hasHexproofAgainst(state, object, playerId);
    });
    case 'nonland_permanent': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
        return !isLand;
      });
    }
    // Batch 23: Vandalize — dowilny land na polu bitwy.
    case 'land': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
        return isLand;
      });
    }
    // Batch 23: Feedback — dowolny enchantment na polu bitwy.
    case 'enchantment': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        const isEnchantment = object.kind === 'enchantment' || (object.types ?? []).includes('Enchantment');
        return isEnchantment;
      });
    }
    // Dead Ringers (APC): nonblack creature — artefaktowe stwory dozwolone.
    case 'nonblack_creature': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        return !effectiveColors(object).includes('B');
      });
    }
    // Batch 23: Expunge — nonartifact, nonblack creature (CR 205.1, 300.1).
    case 'nonartifact_nonblack_creature': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        const isArtifact = object.kind === 'artifact' || (object.types ?? []).includes('Artifact');
        if (isArtifact) return false;
        const isBlack = (object.colors ?? []).includes('B');
        if (isBlack) return false;
        return true;
      });
    }
    case 'creature_opponent_damaged_this_turn': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (object.controllerId === playerId) return false;
        if (!object.damagedThisTurn) return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        return true;
      });
    }
    default: return [];
  }
}

/**
 * Iloczyn kartezjański list kandydatów (warianty celów czaru).
 *
 * Reguła rozróżniania celów jest WIERNIE CR 601.2c i zależy od WYSTĄPIEŃ
 * słowa „target" (nie od liczby slotów):
 *
 *   „The same target can't be chosen multiple times for any one instance of
 *   the word „target" on the spell. However, if the spell uses the word
 *   „target" in multiple places, the same object, player, or zone can be
 *   chosen once for each instance of the word "target" (as long as it fits
 *   the targeting criteria). […] A spell that says „Destroy target artifact
 *   and target land," however, can target the same artifact land twice
 *   because it uses the word "target" in multiple places."
 *
 * `words` niesie numer wystąpienia słowa dla każdego slotu (domyślnie: jeden
 * slot = jedno wystąpienie). Ten sam obiekt powtarzać wolno TYLKO między
 * różnymi wystąpieniami; w obrębie jednego wystąpienia sloty muszą wskazywać
 * różne obiekty (M212/Z6: „two target nonblack creatures" = jedno słowo
 * z liczbą 2 — Dead Ringers ma oba sloty oznaczone `targetWord: 0`).
 * `null` (slot „up to one" / odmowa celu) powtarzać wolno zawsze — to brak
 * celu, nie obiekt.
 */
function cartesian(pools, words = null) {
  if (pools.length === 0) return [[]];
  const tags = words ?? pools.map((_, i) => i);
  const [first, ...rest] = pools;
  const tails = cartesian(rest, tags.slice(1));
  const out = [];
  for (const head of first) {
    for (const tail of tails) {
      const clash = head !== null && head !== undefined && tail.some(
        (t, j) => t === head && tags[0] === tags[j + 1],
      );
      if (clash) continue;
      out.push([head, ...tail]);
    }
  }
  return out;
}

/**
 * Ponowna walidacja celów w momencie rozstrzygania (CR 608.2b): cele, które
 * przestały być legalne, są pomijane (efekt ich nie dotyka); czar bez
 * żadnego legalnego celu NIE rozstrzyga się („fizzle") — schodzi ze stosu
 * bez efektów, a skutki „as it resolves" (buyback, rebound, przygoda) nie
 * zachodzą.
 */
function collectLegalTargets(state, targetSpec, chosen, casterId, sourceColors = null, sourceObject = null) {
  // Tablica indeksowana JAK targetSpec: na miejscu celu, który przestał być
  // legalny, jest null (efekt odnoszący się do niego nic nie robi — CR 608.2b).
  // Dzięki temu czary wielocelowe (Grave Exchange) mapują efekty na właściwe
  // cele nawet, gdy jeden z nich zniknął przed rozstrzygnięciem.
  return targetSpec.map((spec, index) => {
    try {
      return validateTargets(state, [spec], [chosen[index]], casterId, sourceColors, sourceObject)[0];
    } catch {
      return null;
    }
  });
}

/**
 * Rozstrzyga wierzchni czar stosu (LIFO): efekty, potem obiekt do graveyard.
 * Zwraca pełny przyrost zdarzeń z rozstrzygnięcia (w tym damage_dealt,
 * stats_modified, token_created), żeby trafiły do strumienia wynikowego komendy
 * i logu UI — nie tylko do state.events.
 *
 * Czar AURY (spell.aura — bestow albo czysta aura) rozstrzyga się inaczej:
 * przy legalnym celu aura WCHODZI na pole bitwy załączona do stwora (przestaje
 * być stworem). Gdy cel stał się nielegalny: karta z bestow wchodzi jako
 * zwykły stwór (CR 702.103e: „As a bestowed Aura spell begins resolving, if
 * its target is illegal, it ceases to be bestowed and the effect making it an
 * Aura spell ends. It continues resolving as a creature spell."), a czysta aura —
 * jak każdy czar
 * bez legalnego celu — idzie do grobu, nie wchodząc na pole bitwy (CR 608.2b).
 */
/**
 * D (2026-08-11): rozstrzyga NIEmany zdolność aktywowaną ze stosu (CR 602.2a).
 * Efekty stosujemy do celów (LKI źródeł jak przy triggerach — CR 603.10).
 * Emitujemy ability_resolved (log) i usuwamy wpis ze stosu.
 */
function resolveActivatedAbilityEntry(state, entry) {
  const before = state.events.length;
  const payload = entry.activatedEntry;
  const liveSource = state.objects.get(payload.sourceId) ?? null;
  const lki = payload.sourceLki ?? {};
  const sourceCharacteristics = liveSource ?? Object.freeze({
    id: payload.sourceId, controllerId: entry.controllerId, cardId: entry.cardId,
    zone: 'none', kind: null, power: lki.power, toughness: lki.toughness,
    powerModifier: lki.powerModifier ?? 0, toughnessModifier: lki.toughnessModifier ?? 0,
    faceDown: lki.faceDown ?? false, counters: {}, formerCounters: {}, keywords: [], abilities: [], types: [],
  });
  // CR 109.5: „you” to kontroler ZDOLNOŚCI, nie nowy kontroler źródła.
  // Źródło pozostaje tym samym obiektem dla cech (np. power/LKI).
  const source = Object.freeze({ ...sourceCharacteristics, controllerId: entry.controllerId,
    ...(payload.sacrificedToughness != null ? { sacrificedToughness: payload.sacrificedToughness } : {}),
    // M360/B4: snapshot mocy do LKI station (effects.js station_counters).
    ...(payload.stationTappedPower != null ? { stationTappedPower: payload.stationTappedPower } : {}),
  });
  state.zones.stack = state.zones.stack.filter((id) => id !== entry.id);
  state.objects.delete(entry.id);
  const effectList = Array.isArray(payload.ability?.effect) ? payload.ability.effect : [payload.ability.effect];
  // Audyt PR #41 (B7.1, CR 608.2b): cele zdolności rewalidujemy przy
  // rozstrzyganiu — cel nielegalny (zniknął z pola bitwy, dostał hexproof/
  // protection, a dla Liry „power X or less" urósł ponad X w oknie
  // odpowiedzi) wypada z listy, a efekty robią no-op. Wcześniej zdolność
  // tapowała stwora, który przestał być legalnym celem.
  const targetSpec = payload.ability?.targets ?? [];
  let targets = payload.targets ?? [];
  if (targetSpec.length > 0) {
    const sourceColors = source?.colors ?? [];
    const revalidated = [];
    for (let i = 0; i < targets.length; i += 1) {
      const tId = targets[i];
      try {
        const spec = targetSpec[i] ?? targetSpec[0];
        validateTargets(state, [spec], [tId], payload.playerId, sourceColors, source);
        // Entrancing Lyre (Temat 10): „Tap target creature with power X or
        // less" — warunek mocy sprawdzany PONOWNIE przy rozstrzyganiu.
        if (payload.ability?.cost?.manaX && payload.ability.cost.maxPowerX) {
          const target = state.objects.get(tId);
          const isPlayer = state.players.some((p) => p.id === tId);
          if (!isPlayer && (!target || target.zone !== 'battlefield' || effectivePower(target, state) > (payload.xValue ?? 0))) continue;
        }
        revalidated.push(tId);
      } catch {
        // cel nielegalny — wypada (CR 608.2b), efekty go nie dotyczą
      }
    }
    targets = revalidated;
    // CR 608.2b (M90): „If all its targets (...) are now illegal, the spell or
    // ability doesn't resolve." Zdolność, która straciła WSZYSTKIE cele,
    // fizzluje — bez wykonywania efektów. Wcześniej efekty szły dalej z pustą
    // listą, więc np. Ballista Wielder („deals 1 damage to any target")
    // wywoływał markDamage(undefined) i engine rzucał „Nieprawidłowy cel
    // obrażeń", przerywając partię (crash pełnej macierzy benchmarku B0).
    // Wyjątek: zdolności wewnętrzne (equip/ninjutsu/cycling) mają własne
    // ścieżki fizzle poniżej i nie korzystają z ability.targets.
    if (targets.length === 0) {
      state.events.push(event('ability_resolved', {
        playerId: payload.playerId, sourceId: payload.sourceId, cardId: entry.cardId,
        abilityIndex: payload.abilityIndex, fizzled: true, reason: 'no_legal_targets',
      }));
      return state.events.slice(before);
    }
  }
  // Soulbright Flamekin: licznik rozstrzygnięć TYLKO zdolności z onNthResolve.
  if (liveSource && payload.ability?.onNthResolve) {
    const next = (liveSource.abilityResolvedThisTurn ?? 0) + 1;
    state.objects.set(liveSource.id, Object.freeze({ ...liveSource, abilityResolvedThisTurn: next }));
  }
  const resolveCount = (state.objects.get(payload.sourceId)?.abilityResolvedThisTurn
    ?? (liveSource?.abilityResolvedThisTurn ?? 0) + 1);
  for (const effect of effectList) {
    // Audyt PR #41 (B7.2, CR 702.49a + 602.2a): ninjutsu rozstrzyga się ze
    // stosu — karta wchodzi na pole bitwy tapnięta i atakująca; celem
    // (payload.targets[0]) jest atakujący zwrócony do ręki (koszt).
    if (effect?.type === '__ninjutsu_enter__') {
      const cardInHand = state.objects.get(payload.sourceId);
      if (cardInHand && cardInHand.zone === 'hand' && cardInHand.controllerId === payload.playerId) {
        const bfId = `permanent-${state.objectSequence++}`;
        const moved = moveObjectDirectly(state, cardInHand.id, 'battlefield', bfId);
        const permanent = Object.freeze({ ...moved, tapped: true, summoningSickness: true });
        state.objects.set(bfId, permanent);
        // M360/B5: ninjutsu z end_of_combat — walka sprzątnięta, ninja wchodzi
        // tapnięty bez dopisu do atakujących (CR 511.3 i tak zdejmuje z walki).
        state.combat?.attackers.push(bfId);
        if (permanent.entersWithCounters) {
          for (const [name, amount] of Object.entries(permanent.entersWithCounters)) {
            addCounter(state, bfId, name, amount);
          }
        }
        state.events.push(event('permanent_entered_battlefield', {
          fromId: cardInHand.id, objectId: bfId, object: permanent,
          cardId: permanent.cardId, controllerId: payload.playerId, ninjutsu: true,
        }));
      }
      state.events.push(event('ability_resolved', {
        playerId: payload.playerId, sourceId: payload.sourceId, cardId: entry.cardId,
        abilityIndex: payload.abilityIndex, ninjutsu: true,
      }));
      return state.events.slice(before);
    }
    // Audyt PR #41 (B7.2, CR 602.2a): cycling/channel rozstrzygają się ze
    // stosu — dobranie (zwykły cycling) albo szukanie (typecycling/channel,
    // decyzja gracza resolve_search_choice) po pełnej rundzie passów.
    if (effect?.type === '__cycling_resolve__' || effect?.type === '__channel_resolve__') {
      const isChannel = effect?.type === '__channel_resolve__';
      const qualifier = isChannel
        ? (payload.ability?.channel ?? { types: ['Basic', 'Land'] })
        : (payload.ability?.cycling ?? {});
      const drawAmount = qualifier?.drawCards;
      if (!isChannel && drawAmount != null) {
        for (let i = 0; i < drawAmount; i += 1) {
          const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === payload.playerId);
          if (!topId) {
            // M272 (błąd #21, CR 704.5b + 104.4b): próba dobrania z PUSTEJ
            // biblioteki to ZNACZNIK dla akcji stanowej, nie ciche „nic".
            // Ścieżka cyklowania po prostu przerywała pętlę, więc gracz, który
            // wycyklował ostatnią kartę, nigdy nie przegrywał — partia toczyła
            // się dalej z pustą biblioteką. Znacznik kasuje przebieg SBA.
            if (state.status === 'active') {
              state.emptyLibraryDraw = {
                ...(state.emptyLibraryDraw ?? {}), [payload.playerId]: true,
              };
            }
            break;
          }
          const handId = `hand-${state.objectSequence++}`;
          const drawn = moveObjectDirectly(state, topId, 'hand', handId);
          // A92/3: cycling to pełnoprawne dobranie (CR 122.12) — idzie przez
          // ten sam choke point co krok dobierania i efekt `draw_cards`.
          recordCardDrawn(state, payload.playerId, { fromId: topId, object: drawn });
        }
        state.events.push(event('ability_resolved', {
          playerId: payload.playerId, sourceId: payload.sourceId, cardId: entry.cardId,
          abilityIndex: payload.abilityIndex, cycling: true,
        }));
        return state.events.slice(before);
      }
      // Typecycling / channel: szukanie w bibliotece — wybór gracza
      // (resolve_search_choice; CR 701.19b). Bez kandydatów: fail-to-find
      // (przeszukanie + tasowanie, zdolność domyka się).
      const searchQualifier = {
        types: qualifier?.allTypes ?? qualifier?.types ?? [],
        subtypes: qualifier?.subtypes ?? [],
        // M385: typy stworów mają własny klucz (changeling pasuje tylko tu,
        // CR 702.73a) — przenoszone razem z resztą kwalifikatora.
        creatureTypes: qualifier?.creatureTypes ?? [],
      };
      const candidates = state.zones.library.filter((id) => {
        const candidate = state.objects.get(id);
        if (!candidate || candidate.controllerId !== payload.playerId || candidate.id === payload.sourceId) return false;
        const types = searchQualifier.types;
        const subtypes = searchQualifier.subtypes;
        const typeOk = types.length === 0 || types.every((t) => (candidate.types ?? []).includes(t));
        // M385: wspólny predykat podtypów (changeling wyłącznie dla typów
        // stworów) — ta sama reguła co w librarySearchMatches (L41).
        const subtypeOk = matchesSubtypeQualifier(candidate, searchQualifier);
        return typeOk && subtypeOk;
      });
      if (candidates.length === 0) {
        const own = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === payload.playerId);
        const shuffled = shuffle(own, state.seed + state.objectSequence);
        let cursor = 0;
        state.zones.library = state.zones.library.map((id) => {
          if (state.objects.get(id)?.controllerId !== payload.playerId) return id;
          const replacement = shuffled[cursor];
          cursor += 1;
          return replacement;
        });
        state.events.push(event('library_searched', { playerId: payload.playerId, foundCardId: null, shuffled: true, qualifier: searchQualifier }));
        state.events.push(event('ability_resolved', {
          playerId: payload.playerId, sourceId: payload.sourceId, cardId: entry.cardId,
          abilityIndex: payload.abilityIndex, cycling: !isChannel, channel: isChannel, fizzled: false,
        }));
        return state.events.slice(before);
      }
      state.pendingSearchChoice = {
        playerId: payload.playerId, qualifier: searchQualifier, destination: isChannel ? 'battlefield' : 'hand',
        entersTapped: isChannel,
        sourceCardId: entry.cardId,
        candidateIds: [...candidates],
        destinations: null,
        chain: null,
        mandatory: false,
        emitter: {
          kind: isChannel ? 'channel' : 'cycling',
          playerId: payload.playerId, objectId: payload.sourceId, abilityIndex: payload.abilityIndex,
          cardId: entry.cardId,
        },
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = payload.playerId;
      const required = event('search_choice_required', {
        playerId: payload.playerId, candidateIds: [...candidates],
        destination: isChannel ? 'battlefield' : 'hand',
        sourceCardId: entry.cardId, cycling: !isChannel, channel: isChannel,
      });
      state.events.push(required);
      return state.events.slice(before);
    }
    // Audyt PR #41 (B7.2): equip rozstrzyga się ze stosu — cel rewalidowany
    // (CR 608.2b): zniknął z pola bitwy, dostał hexproof/protection od koloru
    // sprzętu albo przestał być nasz → fizzle (equipment zostaje odłączony).
    if (effect?.type === '__equip_attach__') {
      const targetId = targets[0];
      let legal = false;
      if (targetId != null) {
        try {
          const spec = Object.freeze({ type: 'creature' });
          const validated = validateTargets(state, [spec], [targetId], payload.playerId, source?.colors ?? [], source)[0];
          legal = validated.controllerId === payload.playerId;
        } catch {
          legal = false;
        }
      }
      if (legal) {
        // Audyt PR #41 (B7.2, crash pełnego B0): SAME źródło też musi być
        // nadal legalnym equipment na polu bitwy — sprzęt mógł zniknąć, gdy
        // equip czekał na stosie (source to wtedy LKI stub, a
        // attachEquipmentToCreature rzuca). Wtedy fizzle (CR 608.2b).
        const equipLive = state.objects.get(source.id);
        const equipLegal = Boolean(equipLive && equipLive.zone === 'battlefield' && equipLive.equipment);
        if (equipLegal) {
          // attachEquipmentToCreature already emits object_attached with
          // via:'equip' and hostCardId — no duplicate needed (M73d Gold).
          attachEquipmentToCreature(state, source.id, targetId);
        }
        legal = equipLegal;
      }
      state.events.push(event('ability_resolved', {
        playerId: payload.playerId, sourceId: payload.sourceId, cardId: entry.cardId,
        abilityIndex: payload.abilityIndex, keyword: 'equip', fizzled: !legal,
      }));
      return state.events.slice(before);
    }
    // M115 (Krumar Initiate): efekty skalowane X-em ({X} w koszcie zdolności)
    // dostają wartość X z payloadu aktywacji — inaczej „endure X" nie wie,
    // ile liczników zaproponować.
    applyEffect(state, effect, source, targets, { xValue: payload.xValue ?? 0, sourceUntapVersion: lki.untapVersion ?? 0 });
  }
  // A4 (znalezisko właściciela 2026-09-12, Balamb Garden): rozstrzygnięta
  // zdolność crew OZNACZA pojazd. CR 702.122e: „Whenever [this Vehicle]
  // becomes crewed" means "Whenever a crew ability of [this Vehicle]
  // resolves." — znacznik jest tą chwilą (efekty już zastosowane, więc
  // przy kontrze/fizzlu flaga nie stanie). Czyści go cleanup razem
  // z animacją, zmiana strefy (CR 400.7) i nowa strona DFC; kafel pokazuje
  // „obsadzony", bot nie re-crewuje (M230 już czyta animatedUntilEOT).
  if (payload.ability?.cost?.crewPower) {
    const crewed = state.objects.get(payload.sourceId);
    if (crewed && crewed.zone === 'battlefield') {
      state.objects.set(crewed.id, Object.freeze({ ...crewed, crewed: true }));
    }
  }
  const nth = payload.ability?.onNthResolve;
  if (nth && resolveCount === (nth.n ?? 3) && nth.effect) {
    if (nth.may) {
      const live = state.objects.get(payload.sourceId);
      state.pendingOptionalTrigger = {
        playerId: payload.playerId,
        sourceId: payload.sourceId,
        resolveEffect: nth.effect,
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = payload.playerId;
      state.events.push(event('optional_trigger_required', {
        playerId: payload.playerId, sourceId: payload.sourceId,
        cardId: live?.cardId ?? entry.cardId, mayAddMana: nth.effect.amount ?? null,
      }));
    } else {
      applyEffect(state, nth.effect, source, targets);
    }
  }
  if (holdReplacementResolution(state,entry,event('ability_resolved',{
    playerId:payload.playerId,sourceId:payload.sourceId,cardId:entry.cardId,abilityIndex:payload.abilityIndex,
  }))) return state.events.slice(before);
  state.events.push(event('ability_resolved', {
    playerId: payload.playerId, sourceId: payload.sourceId, cardId: entry.cardId,
    abilityIndex: payload.abilityIndex,
  }));
  return state.events.slice(before);
}

export function resolveTopOfStack(state) {
  if (state.zones.stack.length === 0) throw new Error('Stos jest pusty');
  const before = state.events.length;
  const stackId = state.zones.stack[state.zones.stack.length - 1];
  const object = state.objects.get(stackId);
  // T6 — zdolność triggerowana na stosie (pseudo-obiekt kind 'trigger'):
  // rozstrzyga się jak czar, po pełnej rundzie passów (intervening-if
  // sprawdzany ponownie — CR 603.4).
  if (object.triggerEntry) return resolveTriggerEntry(state, object);
  // D (2026-08-11): NIEmany zdolność aktywowana na stosie — efekty stosujemy
  // przy rozstrzyganiu (po pełnej rundzie passów, przeciwnik mógł odpowiedzieć
  // instanitem). Źródło z LKI (mogło zniknąć — sacrifice self, z grobu).
  if (object.activatedEntry) return resolveActivatedAbilityEntry(state, object);
  // Czar PERMANENTU (stwór/artefakt/enchantment rzucony przez cast_permanent,
  // cast_adventure_creature albo Discover): nie ma deskryptora czaru —
  // rozstrzygnięcie to wejście na pole bitwy (CR 608.2a), patrz niżej.
  if (!object.spell) return resolvePermanentSpell(state, stackId, object, before);
  // Fireball (X-cost, divided damage): osobne rozstrzygnięcie — X obrażeń
  // podzielone po równo (zaokr. w dół) między wybrane cele (stworzenia i/lub
  // gracze). CR 119.4 „divided evenly, rounded down" — reszta przepada.
  if (object.spell?.fireball) {
    return resolveFireball(state, stackId, object, before);
  }
  // Cleave (CR 701.33): rzucony z kosztem cleave czar rozstrzyga się z celami
  // i efektami z deskryptora cleave (wykreślony fragment tekstu zmienia legalne
  // cele — np. Lunar Rejection zamiast stwora Wolf/Werewolf celuje dowolnego).
  const targetSpec = (object.cleaved && object.spell.cleave)
    ? (object.spell.cleave.targets ?? [])
    : (object.spell.targets ?? []);
  const chosen = object.chosenTargets ?? [];
  if (object.spell.aura && (object.bestow || object.aura)) {
    return resolveAuraSpell(state, stackId, object, chosen, before);
  }
  // Modal „Choose one" (Aerith Rescue Mission): rozstrzygamy wybrany tryb —
  // efektry trybu aplikujemy do jego celów (wszystkich celowanych albo
  // dodatkowego, np. celu stun). Tryby tu używane nie blokują rozstrzygania.
  if (object.chosenMode != null && object.spell.modes) {
    const mode = object.spell.modes[object.chosenMode];
    const modeTargets = mode.targets ?? object.spell.targets ?? [];
    // M361/B5 (ZŁOTO; CR 608.2b, ADR 0030): cele trybu modalnego walidujemy
    // przy rozstrzyganiu TYM SAMYM helperem co ścieżka zwykła (L48) —
    // hexproof/protection/moc zyskane w oknie odpowiedzi też unieważniają
    // cel, nie tylko zmiana strefy. Dotąd filtr liveChosen patrzył wyłącznie
    // na strefę (battlefield/stack), więc modalny removal trafiał cel
    // z hexproof (Selesnya Charm vs Magic Damper). Cele-gracze i cele-czary
    // (M87: artifact_spell_on_stack) przechodzą przez validateTargets tak
    // samo jak przy rzucie — parytet oferta/rzut/rozstrzygnięcie.
    // Tryby ZMIENNE („up to N target …" — Wrap in Flames, Sea God's Scorn):
    // collectLegalTargets mapuje spec↔cel 1:1, a tu JEDEN typ kryje wiele
    // celów — każdy cel z osobna przeciw typowi trybu (lustro
    // validateVariableTargets z rzutu: legalTargetCandidates filtruje
    // hexproof i protection tym samym predykatem co walidacja — F2/L48).
    let liveChosen;
    if (mode.variableTargets) {
      const spec = { type: mode.variableTargets.type ?? 'creature' };
      const legal = new Set(legalTargetCandidates(state, object.controllerId, spec, object));
      liveChosen = (object.chosenTargets ?? []).filter((tId) => legal.has(tId));
    } else {
      liveChosen = collectLegalTargets(state, modeTargets, object.chosenTargets ?? [],
        object.controllerId, object.colors ?? [], object)
        .map((entry) => entry?.id ?? null)
        .filter((id) => id !== null);
    }
    // M271 (błąd #13, CR 608.2b): „If all its targets ... are now illegal,
    // the spell or ability doesn't resolve." Ścieżka ZDOLNOŚCI ma ten test
    // od M90, bliźniacza ścieżka CZARU MODALNEGO go NIE miała: tryb, który
    // stracił jedyny cel, przechodził dalej z pustą listą i wykonywał swoje
    // efekty NIECELOWANE. „Your Temple Is Under Attack" (tryb 2: „target
    // opponent" + „each player draws") dawał obu graczom karty, mimo że czar
    // w ogóle nie powinien się rozstrzygnąć.
    // Warunek dotyczy WYŁĄCZNIE trybów, które celów wymagają — tryb bez
    // celów rozstrzyga się normalnie (modeTargets wyliczone wyżej, dla walidacji).
    // Tryb zmienny rzucony z zerem celów (min 0, M146) celów NIE MA — fizzluje
    // tylko taki, którego wybrane cele wszystkie stały się nielegalne.
    const hadTargets = mode.variableTargets
      ? (object.chosenTargets ?? []).length > 0
      : modeTargets.length > 0;
    if (hadTargets && liveChosen.length === 0) {
      // M271 (błąd #14): także fizzle respektuje `exileInsteadOfGraveyard`;
      // flashback wygania przy KAŻDYM zejściu ze stosu (CR 702.34a).
      const zoneFizzle = spellExitZone(object, { flashedBack: Boolean(object.flashedBack) });
      const graveFizzle = `${zoneFizzle}-${state.objectSequence++}`;
      moveObjectDirectly(state, stackId, zoneFizzle, graveFizzle);
      state.events.push(event('spell_resolved', {
        fromId: stackId, toId: graveFizzle, cardId: object.cardId,
        controllerId: object.controllerId,
        fizzled: true, reason: 'no_legal_targets', modal: true,
        modeIndex: object.chosenMode,
        modeName: object.spell?.modes?.[object.chosenMode]?.name ?? null,
      }));
      return state.events.slice(before);
    }
    for (const effect of mode.effects ?? []) {
      const effTargets = resolveModalEffectTargets(state, effect, object, liveChosen);
      if (effTargets === null) continue;
      applyEffect(state, effect, object, effTargets);
    }
    if (holdReplacementResolution(state,object,{modal:true,modeIndex:object.chosenMode,modeName:mode.name})) return state.events.slice(before);
    // M271 (błąd #14): strefę zejścia liczy WSPÓLNY helper, nie sztywny grób.
    // KARTY SPOZA KATALOGU (Etap F): żaden czar modalny w katalogu nie ma
    // buyback, rebound ani przygody — gdy się pojawi, ta ścieżka musi
    // przejąć obsługę z gałęzi niemodalnej niżej (powrót do ręki / wygnanie
    // z reboundReady / wygnanie „on an adventure", tylko przy faktycznym
    // rozstrzygnięciu). Flashback działa już tutaj (CR 702.34a).
    const zoneModal = spellExitZone(object, { flashedBack: Boolean(object.flashedBack) });
    const graveId = `${zoneModal}-${state.objectSequence++}`;
    moveObjectDirectly(state, stackId, zoneModal, graveId);
    state.events.push(event('spell_resolved', {
      fromId: stackId, toId: graveId, cardId: object.cardId, controllerId: object.controllerId,
      fizzled: false, modal: true, modeIndex: object.chosenMode,
      // M91 (uwaga D): rozstrzygnięcie też nazywa tryb — gracz widzi w logu,
      // co się właściwie stało (3 obrażenia vs wygnanie artefaktów).
      modeName: object.spell?.modes?.[object.chosenMode]?.name ?? null,
    }));
    return state.events.slice(before);
  }
  const legalTargets = collectLegalTargets(state, targetSpec, chosen, object.controllerId, object.colors ?? [], object).map((entry) => entry?.id ?? null);
  const fizzled = targetSpec.length > 0 && legalTargets.every((entry) => entry === null);
  // CR 702.174j (ruling BLB 2024-07-26): „For instants and sorceries with gift,
  // the gift is given … as part of the resolution of the spell. This happens
  // before any of the spell's other effects would take place." Czar, który się
  // nie rozstrzyga (fizzle/kontra), nie daje daru.
  if (!fizzled && object.wasGifted) grantGift(state, object);
  if (!fizzled) {
    const effects = object.cleaved && object.spell.cleave ? (object.spell.cleave.effects ?? object.spell.effects) : object.spell.effects;
    for (let i = 0; i < effects.length; i += 1) {
      // Blokująca decyzja w środku listy efektów (surveil/scry — np. Curate:
      // „Surveil 2, then draw a card") wstrzymuje rozstrzyganie: pozostałe
      // efekty dokończy komenda resolve_* (patrz finishPendingSpell), a czar
      // zostaje na stosie do tego czasu (jawna strefa publiczna).
      const blocked = applyEffect(state, effects[i], object, legalTargets);
      if (blocked) {
        state.pendingSpell = { stackId, effects: effects.slice(i + 1) };
        return state.events.slice(before);
      }
    }
  }
  // Buyback (CR 702.27): jeśli czar miał zapłacony buyback, wraca do ręki
  // właściciela zamiast do grobu (analogicznie do clash — pendingSpellReturnToHand).
  // Etap F (CR 702.27a „put this card into your hand AS IT RESOLVES" + CR
  // 608.2b): czar bez żadnego legalnego celu NIE rozstrzyga się — idzie do
  // grobu (dawniej buyback zwracał go do ręki także po fizzlu).
  if (object.wasBuyback && !fizzled) {
    state.pendingSpellReturnToHand = true;
  }
  const returnToHand = state.pendingSpellReturnToHand;
  state.pendingSpellReturnToHand = false;
  // Clash (Release the Ants): wygrany czar wraca do ręki WŁAŚCICIELA
  // („If you win, return Release the Ants to its owner's hand").
  if (returnToHand) {
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, stackId, 'hand', handId);
    state.events.push(event('object_moved', { fromId: stackId, object: moved, fromZone: 'stack', toZone: 'hand', returnedByClash: true }));
    const resolved = event('spell_resolved', { fromId: stackId, toId: handId, cardId: object.cardId, controllerId: object.controllerId, fizzled, returnToHand: true });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // Adventure (CR 715.3): rozstrzygnięty czar przygody idzie do EXILE
  // („on an adventure\"), nie do grobu — stamtąd można rzucić stronę-stwora
  // (cast_adventure_creature). Kontrczar (counter_spell) wysyła kartę do
  // grobu jak każdy czar — to inna ścieżka, bez flagi adventure w zdarzeniu.
  // Kopia czaru (storm, CR 707.10 + 608.2m): po rozstrzygnięciu przestaje
  // istnieć — nie jest kartą, więc nie trafia do grobu.
  if (object.isSpellCopy) {
    state.zones.stack = state.zones.stack.filter((id) => id !== stackId);
    state.objects.delete(stackId);
    state.events.push(event('spell_resolved', {
      fromId: stackId, toId: null, cardId: object.cardId,
      controllerId: object.controllerId, fizzled, copy: true,
    }));
    return state.events.slice(before);
  }
  // Etap F (CR 608.2b): fizzle to NIE rozstrzygnięcie — przygoda (CR 715.3d:
  // „as it resolves") i rebound (CR 702.88a: „exile it as it resolves") nie
  // wygnają czaru, który się nie rozstrzygnął; idzie do grobu. Flashback
  // (CR 702.34a: „any time it would leave the stack") wygania zawsze.
  const adventure = Boolean(object.adventure) && !fizzled;
  const flashedBack = Boolean(object.flashedBack);
  // Rebound (CR 702.88, Ojutai's Breath): czar rzucony z ręki z deskryptorem
  // `rebound` idzie po rozstrzygnięciu do EXILE zamiast do grobu, a na początku
  // następnego upkeepu kontrolera otwiera jednorazową decyzję rzutu bez kosztu.
  const reboundCast = Boolean(object.reboundCast && !object.isSpellCopy) && !fizzled;
  // M174/E (Halo Forager): exileInsteadOfGraveyard — „If that spell would
  // be put into a graveyard, exile it instead" (dotyczy też fizzle niżej).
  const zoneAfterResolve = spellExitZone(object, { adventure, flashedBack, reboundCast });
  const afterId = `${zoneAfterResolve}-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, stackId, zoneAfterResolve, afterId);
  // Rebound: zaznacz wygnaną kartę jako gotową do rzutu bez kosztu w przyszłym
  // upkeepu (reboundReady — czytane przez trigger upkeepu, jak suspendReady).
  if (reboundCast) {
    state.objects.set(afterId, Object.freeze({ ...state.objects.get(afterId), reboundReady: true }));
  }
  const resolved = event('spell_resolved', {
    fromId: stackId, toId: afterId, cardId: object.cardId,
    controllerId: object.controllerId, fizzled, adventure, rebound: Boolean(reboundCast),
    ...(adventure ? { object: moved } : {}),
  });
  state.events.push(resolved);
  return state.events.slice(before);
}

/**
 * Dokańcza czar wstrzymany przez blokującą decyzję (state.pendingSpell):
 * wykonuje pozostałe efekty i opuszcza stos (grób albo — po wygranym clash —
 * ręka właściciela). Wywoływane z execute po resolve_scry/resolve_surveil.
 */
/**
 * Rozstrzyga Fireball. Oracle (M10): „Fireball deals X damage divided evenly,
 * rounded down, among any number of targets." Podział jest DETERMINISTYCZNY —
 * gracz nie wybiera ilości (X i cele ustala rzut); każdy wciąż legalny cel
 * dostaje floor(X / liczba wciąż legalnych celów), reszta przepada
 * („rounded down", CR 119.4).
 *
 * Kluczowy ruling (WotC 2017-11-17, dosłownie ze Scryfall — audyt E5,
 * 2026-09-10): „Fireball's damage is divided as Fireball RESOLVES, not as
 * it's cast, because there are no choices involved. The division involves
 * only targets that are still legal as Fireball resolves." — dzielnik to
 * WYŁĄCZNIE cele wciąż legalne przy rozstrzygnięciu (poprzednio silnik
 * dzielił przez liczbę celów z rzutu, gubiąc udziały nielegalnych celów).
 * Drugi ruling: celów może być więcej niż X — gdy legalnych celów jest
 * więcej niż X, floor(X/n)=0 i nikt nie dostaje obrażeń. Wszystkie cele
 * nielegalne przy rozstrzygnięciu → czar skontrowany (CR 608.2b) do grobu.
 */
function resolveFireball(state, stackId, object, before) {
  const X = object.fireballX ?? 0;
  const chosen = object.chosenTargets ?? [];
  // Żywe cele: gracze zawsze; stwory tylko na polu bitwy (CR 608.2b).
  const live = chosen.filter((tId) => {
    if (state.players.some((p) => p.id === tId)) return true;
    const target = state.objects.get(tId);
    return Boolean(target && target.zone === 'battlefield' && target.kind === 'creature');
  });
  // Skontrowany tylko, gdy BYŁY cele i ŻADEN nie przeżył do rozstrzygnięcia
  // (CR 608.2b). X=0 / zero celów to legalny czar bez efektu — rozstrzyga się.
  const fizzled = chosen.length > 0 && live.length === 0;
  if (X > 0 && live.length > 0) {
    // Podział po równo w dół między cele WYŁĄCZNIE wciąż legalne (ruling
    // WotC 2017-11-17). floor(X/n)=0 przy n > X → nikt nie oberwie (ruling 4).
    const per = Math.floor(X / live.length);
    const source = object; // źródło obrażeń = czar na stosie
    for (const tId of live) {
      if (per > 0) dealNonCombatDamage(state, source, tId, per);
    }
  }
  // Etap F: strefę zejścia liczy wspólny helper (flashback CR 702.34a,
  // „exile instead" — Halo Forager), nie sztywny grób.
  const zoneAfterX = spellExitZone(object, { flashedBack: Boolean(object.flashedBack) });
  const graveId = `${zoneAfterX}-${state.objectSequence++}`;
  moveObjectDirectly(state, stackId, zoneAfterX, graveId);
  state.events.push(event('spell_resolved', {
    fromId: stackId, toId: graveId, cardId: object.cardId,
    controllerId: object.controllerId, fizzled,
  }));
  return state.events.slice(before);
}

export function finishPendingSpell(state, stackId, remainingEffects) {
  const before = state.events.length;
  const object = state.objects.get(stackId);
  if (!object || object.zone !== 'stack') throw new Error('Wstrzymany czar nie jest na stosie');
  // Cleave: wstrzymany czar rozstrzyga się z celami deskryptora cleave (jak
  // resolveTopOfStack), żeby spójność oferty/walidacji/rozstrzygnięcia była
  // zachowana także przy blokującej decyzji w środku listy efektów cleave.
  const targetSpec = (object.cleaved && object.spell.cleave)
    ? (object.spell.cleave.targets ?? [])
    : (object.spell.targets ?? []);
  const legalTargets = collectLegalTargets(state, targetSpec, object.chosenTargets ?? [], object.controllerId, object.colors ?? [], object).map((entry) => entry?.id ?? null);
  for (const effect of remainingEffects ?? []) {
    const blocked = applyEffect(state, effect, object, legalTargets);
    if (blocked) {
      // Decyzja zagnieżdżona (np. surveil po surveil) — czekamy dalej.
      state.pendingSpell = { stackId, effects: remainingEffects.slice(remainingEffects.indexOf(effect) + 1) };
      return state.events.slice(before);
    }
  }
  // Etap F: dokończenie wstrzymanego czaru to TO SAMO rozstrzygnięcie, co
  // w resolveTopOfStack — skutki „as it resolves" (buyback CR 702.27a,
  // przygoda CR 715.3d, rebound CR 702.88a) muszą zajść także tutaj
  // (dawniej czar z decyzją w środku efektów je tracił).
  if (object.wasBuyback) state.pendingSpellReturnToHand = true;
  const returnToHand = state.pendingSpellReturnToHand;
  state.pendingSpellReturnToHand = false;
  if (returnToHand) {
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, stackId, 'hand', handId);
    state.events.push(event('object_moved', { fromId: stackId, object: moved, fromZone: 'stack', toZone: 'hand', returnedByClash: true }));
    const resolved = event('spell_resolved', { fromId: stackId, toId: handId, cardId: object.cardId, controllerId: object.controllerId, fizzled: false, returnToHand: true });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  if (object.isSpellCopy) {
    // Kopia czaru (storm) po dokończeniu efektów przestaje istnieć.
    state.zones.stack = state.zones.stack.filter((id) => id !== stackId);
    state.objects.delete(stackId);
    const resolvedCopy = event('spell_resolved', {
      fromId: stackId, toId: null, cardId: object.cardId,
      controllerId: object.controllerId, fizzled: false, copy: true,
    });
    state.events.push(resolvedCopy);
    return state.events.slice(before);
  }
  const flashedBack = Boolean(object.flashedBack);
  const adventure = Boolean(object.adventure);
  const reboundCast = Boolean(object.reboundCast && !object.isSpellCopy);
  const zoneAfter = spellExitZone(object, { adventure, flashedBack, reboundCast });
  const afterId = `${zoneAfter}-${state.objectSequence++}`;
  const movedAfter = moveObjectDirectly(state, stackId, zoneAfter, afterId);
  if (reboundCast) {
    state.objects.set(afterId, Object.freeze({ ...state.objects.get(afterId), reboundReady: true }));
  }
  const resolved = event('spell_resolved', {
    fromId: stackId, toId: afterId, cardId: object.cardId, controllerId: object.controllerId,
    fizzled: false, flashedBack, adventure, rebound: reboundCast,
    ...(adventure ? { object: movedAfter } : {}),
  });
  state.events.push(resolved);
  return state.events.slice(before);
}

/** Rozstrzygnięcie czaru aury (bestow albo czystej) — patrz resolveTopOfStack. */
function resolveAuraSpell(state, stackId, object, chosen, before) {
  const targetId = chosen[0];
  // Aura „Enchant player" (Curse of the Pierced Heart): wchodzi na pole bitwy
  // jako zwykły enchantment (nie 'aura') z polem `enchantedPlayerId` — gracz
  // nie opuszcza pola bitwy, więc aura nie staje się osierocona (CR 704.5m
  // dotyczy tylko obiektów). Docelowego gracza wybiera się przy rzucaniu.
  if (object.enchantPlayer) {
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, stackId, 'battlefield', newId);
    const permanent = Object.freeze({ ...moved, kind: 'enchantment', enchantedPlayerId: targetId });
    state.objects.set(newId, permanent);
    state.events.push(event('permanent_entered_battlefield', {
      fromId: stackId, objectId: newId, object: permanent, cardId: moved.cardId,
      controllerId: moved.controllerId, aura: true, enchantPlayer: true, enchantedPlayerId: targetId,
    }));
    return state.events.slice(before);
  }
  const host = state.objects.get(targetId);
  // Legalność gospodarza wg deskryptora aury („enchant creature" /
  // „enchant enchantment" / artifact_or_creature) — wspólne z SBA
  // (attachments.isLegalAuraHost), żeby rozstrzygnięcie nie rozmijało
  // się z tym, co SBA uzna za legalne (Batch 23: Feedback).
  const hostLegal = isLegalAuraHost(object, host);
  // Audyt PR #41 (B6, CR 702.16b): gospodarz mógł ZYSKAĆ protection od koloru
  // czaru, gdy aura czekała na stosie (np. Benevolent Blessing z flash na
  // celu). Czysta aura fizzluje (CR 608.2b — grób), bestow wchodzi jako stwór
  // (CR 702.103e — cel nielegalny przy rozstrzyganiu kończy bycie bestowed,
  // „It continues resolving as a creature spell. See rule 608.3b.").
  const hostProtected = host && effectiveProtectionFromColors(state, host)
    && (object.colors ?? []).some((c) => effectiveProtectionFromColors(state, host).includes(c));
  const legalNow = hostLegal && !hostProtected;
  if (!legalNow && !object.bestow) {
    // Czysta aura przy nielegalnym celu NIE wchodzi na pole bitwy — trafia
    // wprost do grobu (jak czar „fizzle", CR 608.2b + 704.5m).
    // Strefa przez wspólny helper (zastąpienia „exile instead").
    const zoneAuraFizzle = spellExitZone(object, { flashedBack: Boolean(object.flashedBack) });
    const graveId = `${zoneAuraFizzle}-${state.objectSequence++}`;
    moveObjectDirectly(state, stackId, zoneAuraFizzle, graveId);
    state.events.push(event('spell_resolved', {
      fromId: stackId, toId: graveId, cardId: object.cardId,
      controllerId: object.controllerId, fizzled: true,
    }));
    return state.events.slice(before);
  }
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, stackId, 'battlefield', newId);
  if (legalNow) {
    // Aura wchodzi załączona — od wejścia NIE jest stworem (kind 'aura');
    // attachAuraToCreature dokleja zdarzenie object_attached.
    const attached = attachAuraToCreature(state, newId, targetId);
    state.events.push(event('permanent_entered_battlefield', {
      fromId: stackId, objectId: newId, object: attached, cardId: moved.cardId,
      controllerId: moved.controllerId, attachedTo: targetId, aura: true,
    }));
    // Benevolent Blessing (CMR): „As this Aura enters, choose a color."
    // Queue a color choice decision — protection is applied after choice.
    if (object.aura?.chooseColor) {
      state.pendingColorChoice = {
        playerId: object.controllerId,
        auraId: newId,
        // A1: cel wyboru niesie pending (symetrycznie do lądu w playLand) —
        // aura z chooseColor wybiera kolor OCHRONY ('protection').
        purpose: 'protection',
        sourceCardId: object.cardId,
      };
      state.events.push(event('color_choice_required', { playerId: object.controllerId, auraId: newId }));
    }
  } else {
    // Cel nielegalny w momencie rozstrzygnięcia: karta bestow wchodzi jako
    // ZWYKŁY STWÓR (godna uwagi reguła bestow — inne aury poszłyby do grobu).
    state.events.push(event('permanent_entered_battlefield', {
      fromId: stackId, objectId: newId, object: state.objects.get(newId), cardId: moved.cardId,
      controllerId: moved.controllerId, unattached: true, aura: true,
    }));
  }
  return state.events.slice(before);
}

/**
 * Rozstrzygnięcie czaru permanentu (stwór/artefakt/enchantment rzucony przez
 * cast_permanent, cast_adventure_creature albo Discover): obiekt wchodzi na
 * pole bitwy (CR 608.2a). Cechy WEJŚCIA — liczniki ETB (entersWithCounters),
 * bloodthirst (CR 702.54), face-down morph — aplikujemy TU, nie przy rzucie
 * (wcześniej castPermanent rozstrzygał je od razu, zanim przeciwnik mógł
 * odpowiedzieć instanitem na stosie).
 *
 * LKI rzutu (wasCast, wasKicked, manaFromTreasureSpent, adventureDone,
 * summoningSickness) niosła kopia na stosie; moveObjectDirectly czyści część
 * pól przy zmianie strefy (CR 400.7 — nowy obiekt), więc pola wejścia
 * przywracamy z obiektu stosu.
 */
function resolvePermanentSpell(state, stackId, object, before) {
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, stackId, 'battlefield', newId);
  const permanent = Object.freeze({
    ...moved,
    faceDown: Boolean(object.faceDown),
    manaFromTreasureSpent: object.manaFromTreasureSpent ?? 0,
    // M381: stempel z chwili rzutu nie jest cechą permanentu — zdejmujemy go,
    // żeby nie wisiał na obiekcie po wykorzystaniu (czystość fingerprintu).
    grantedAbilitiesFromTurn: null,
  });
  state.objects.set(newId, permanent);
  // M381 (Cherished Hatchling): zdolności nadane czarowi przez GRANT TURY
  // („whenever you cast a Dinosaur spell this turn, it gains …") doklejamy
  // w chwili wejścia — permanent ma je JUŻ, gdy skan triggerów widzi jego
  // wejście (CR 603.6a), a cleanup zdejmuje grant jak resztę „this turn".
  for (const ability of object.grantedAbilitiesFromTurn ?? []) {
    if (ability) grantAbilitiesUntilEndOfTurn(state, newId, [ability]);
  }
  // M68 (daybound, CR 708.9 — „Permanents enter the battlefield nightbound"):
  // gdy jest NOC, permanent z daybound wchodzi od razu na nightbound stronę —
  // transform PRZED zdarzeniem wejścia, żeby triggery ETB odpalily się na
  // właściwej stronie (jak w MtG; transform in-place — id bez zmian).
  if (state.dayNight === 'night' && (permanent.keywords ?? []).includes('daybound') && permanent.transformTo) {
    const target = permanent.transformTo;
    const nightbound = Object.freeze({
      ...permanent,
      // Komplet charakterystyk drugiej strony (CR 712.8) — wspólny helper,
      // ten sam co w transform_permanent i crafcie: niesie też `kind`/`types`,
      // więc strona nocna zmieniająca rodzaj permanentu nie gubi typu.
      ...transformedCharacteristics(target, permanent),
      // CR 202.3b (M258/Etap 2.3b): ta sama reguła MV co transform/craft —
      // payload niesie koszt przedni, aplikujemy go przy wejściu nocną
      // stroną (no-op dla zwykłych DFC, spread trzyma ten sam koszt).
      manaCost: target.manaCost ?? permanent.manaCost ?? 0,
      transformTo: {
        cardId: permanent.cardId,
        cardName: permanent.cardName,
        kind: permanent.kind,
        power: permanent.power,
        toughness: permanent.toughness,
        abilities: permanent.abilities,
        keywords: permanent.keywords ?? [],
        subtypes: permanent.subtypes ?? [],
        types: permanent.types ?? [],
        manaCost: permanent.manaCost ?? 0,
      },
    });
    state.objects.set(newId, nightbound);
    // controllerId: warstwa stołu kwalifikuje transform do panelu
    // „Rozgrywka" po kontrolerze (isHumanHeadline, M257/K4).
    state.events.push(event('object_transformed', { objectId: newId, fromCardId: permanent.cardId, cardId: target.cardId, enteredNightbound: true, controllerId: nightbound.controllerId }));
  }
  const enteredNow = state.objects.get(newId);
  // M154 (Warp): permanent rzucony za koszt warp — przy wejściu zbroimy
  // opóźniony trigger wygnania w najbliższym kroku końcowym („at the
  // beginning of the NEXT end step" — także w turze przeciwnika). Po wygnaniu
  // karta dostanie `warpReady` i można ją rzucić z exile w późniejszej turze.
  if (enteredNow?.warped) {
    state.delayedTriggers.push({
      type: 'exile_object', objectId: newId, playerId: enteredNow.controllerId,
      armedOnTurn: state.turn.number, anyPlayerEndStep: true, warp: true,
      // M262: badge mechaniki — „Wygnane: Warp".
      exiledBy: 'warp',
    });
  }
  // Wejście na pole bitwy — DOKŁADNIE jedno zdarzenie wejścia (jak
  // resolveAuraSpell): triggery ETB skanują permanent_entered_battlefield;
  // dodatkowy object_moved → battlefield odpalałby je DRUGI raz.
  state.events.push(event('permanent_entered_battlefield', {
    fromId: stackId, objectId: newId, object: enteredNow, cardId: enteredNow.cardId,
    controllerId: enteredNow.controllerId, resolved: true,
  }));
  // Cechy WEJŚCIA na pole bitwy (liczniki wejścia CR 122.1a, warunkowe
  // CR 614.1c, bloodthirst CR 702.54a) — M274: JEDNA implementacja dla
  // wszystkich ścieżek wejścia (`applyEnterCounters` w effects.js). Wcześniej
  // ta ścieżka miała własną kopię, a rodzina reanimacji nie miała żadnej:
  // dokładnie wzorzec L107 (helper istnieje, ścieżka go omija).
  applyEnterCounters(state, newId);
  // „You may have this creature enter as a copy of any <subtype> creature"
  // (CR 707): decyzja gracza PRZED SBA — flaga enteringAsCopy pomija 0/0
  // do czasu resolve_enter_as_copy (odmowa = 0/0 ginie SBA).
  if (permanent.enterAsCopy && !permanent.faceDown) {
    const targetSubtype = permanent.enterAsCopy.subtype;
    const allies = state.zones.battlefield
      .map((id) => state.objects.get(id))
      .filter((o) => o && o.id !== newId && o.zone === 'battlefield' && o.kind === 'creature'
        && (o.subtypes ?? []).includes(targetSubtype))
      .sort((a, b) => (effectivePower(b, state) ?? 0) - (effectivePower(a, state) ?? 0));
    if (allies.length > 0) {
      const src = state.objects.get(newId);
      state.objects.set(newId, Object.freeze({ ...src, enteringAsCopy: true }));
      state.pendingEnterAsCopy = {
        playerId: permanent.controllerId,
        sourceId: newId,
        candidateIds: allies.map((o) => o.id),
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = permanent.controllerId;
      state.events.push(event('trigger_target_required', {
        playerId: permanent.controllerId, sourceId: newId, cardId: permanent.cardId,
        candidateIds: allies.map((o) => o.id), allowNone: true, enterAsCopy: true,
      }));
    }
  }
  // Audyt PR #41 (B4): Veiled Ascension — „Face-down creatures you control
  // enter with a flying counter on them." Dotyczy KAŻDEGO zakrytego stwora
  // wchodzącego na pole bitwy (morph/megamorph, nie tylko cloak).
  if (permanent.faceDown) {
    maybeAddFaceDownFlyingCounter(state, permanent.controllerId, newId);
  }
  const resolved = event('spell_resolved', {
    fromId: stackId, toId: newId, cardId: permanent.cardId,
    controllerId: permanent.controllerId, fizzled: false, permanent: true,
    // M102/U6 (CR 708.2): rozstrzygnięcie ZAKRYTEGO permanentu musi nieść tę
    // informację, inaczej log nazywa kartę po imieniu tuż pod zamaskowanym
    // „morph wchodzi na pole bitwy" i cała ochrona FoW jest bezwartościowa.
    // Kontrakt taki sam jak w `permanent_cast` (resources.js).
    faceDown: Boolean(permanent.faceDown),
  });
  state.events.push(resolved);
  return state.events.slice(before);
}

/**
 * Plotuje czar z ręki: płaci koszt, przenosi kartę do exile i oznacza ją jako
 * zaplotowaną. Późniejsze cast z exile nie płaci many w minimalnym modelu
 * projektu, ale nadal podlega timingowi czaru.
 */
/**
 * M154 (Batch 38, Warp — EOE): „You may cast this card from your hand for its
 * warp cost. Exile this creature at the beginning of the next end step, then
 * you may cast it from exile on a later turn."
 *
 * Rzut za koszt warp: alternatywny koszt (castPermanent z warpCast:true) —
 * permanent wchodzi na stos jak zwykły rzut; przy wejściu zbroimy
 * opóźniony trigger wygnania w najbliższym kroku końcowym
 * (resolvePermanentSpell → state.delayedTriggers). Po wygnaniu karta ma
 * `warpReady` i można ją rzucić z exile w późniejszej turze — już ZA ZWYKŁY
 * koszt many (cast_permanent z exile), bo warp działa wyłącznie z ręki.
 *
 * Audyt PR #93 / znalezisko J (CR 702.185a): „Warp [cost]" means „You may cast
 * this card **from your hand** by paying [cost] rather than its mana cost" …
 * „Its owner may cast this card after the current turn has ended" — drugie
 * zdanie nie daje żadnego kosztu alternatywnego, więc z exile płaci się koszt
 * many. Engine oferował i przyjmował rzut z exile ZA KOSZT WARP (Weftblade
 * Enhancer: 3 zamiast 6 — talia worek-legend), czyli drugi rzut w cenie
 * połowy. Warp pozostaje wyłącznie akcją z ręki.
 */
export function warpCard(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  if (object?.zone === 'exile') {
    throw new Error('Warp jest kosztem rzutu z ręki — kartę wygnaną rzuca się z exile za koszt many (cast_permanent)');
  }
  return castPermanent(state, playerId, objectId, { warpCast: true });
}

export function plotCard(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  // Batch 24 (Spinewoods Paladin — pierwsza karta z plotem w katalogu): plot
  // dotyczy także PERMANENTÓW (stwór/artefakt/enchantment), nie tylko czarów —
  // karta idzie z ręki do exile z licznikiem plot, a później rzuca się ją bez
  // kosztu many (cast_permanent z exile, patrz resources.castPermanent).
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || !object.plot) {
    throw new Error('To nie jest plotowalna karta z ręki');
  }
  if (object.kind !== 'spell' && object.kind !== 'creature' && object.kind !== 'artifact' && object.kind !== 'enchantment') {
    throw new Error('Ta karta nie jest plotowalna');
  }
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (state.turn.activePlayerId !== playerId || !mainPhase || state.zones.stack.length > 0) {
    throw new Error('Plot tylko w swoją fazę main przy pustym stosie');
  }
  // Koszt plot może nieść pipy kolorów (Plot {3}{G} = 4 many z {G}) — walidacja
  // kolorowa przed mutacją (CR 601.2h), jak przy rzutach.
  const plotColors = (object.plot.colors ?? []).map((c) => [c]);
  if (plotColors.length > 0 && !canPayColoredCost(state, playerId, plotColors)) {
    throw new Error('Brak kolorowego źródła many na plot');
  }
  spendMana(state, playerId, object.plot.cost ?? 0, plotColors);
  const exileId = `exile-${state.objectSequence++}`;
  // M262: plot (CR 702.170a) — badge mechaniki „Wygnane: Plot".
  const moved = moveObjectDirectly(state, objectId, 'exile', exileId, { exiledBy: 'plot' });
  const plotted = Object.freeze({ ...moved, plotted: true, plottedAtTurn: state.turn.number });
  state.objects.set(exileId, plotted);
  const plottedEvent = event('card_plotted', {
    playerId, fromId: objectId, toId: exileId, cardId: object.cardId,
    object: plotted, cost: object.plot.cost ?? 0,
  });
  state.events.push(plottedEvent);
  return plottedEvent;
}

/**
 * Suspend (CR 702.62, Mindstab): „Suspend N—[koszt]" znaczy „jeśli możesz
 * zacząć rzucać tę kartę z ręki, możesz zamiast tego zapłacić [koszt] i wygnać
 * ją z N licznikami czasu". Jak plot (specjalna akcja sorcery-speed z ręki),
 * ale karta w exile niesie liczniki czasu, a upkeep zdejmuje po jednym.
 * Gdy ostatni licznik zniknie, kartę można rzucić z exile bez kosztu many
 * (spells.legalSpellCasts/castSpell traktują ją jak zaplotowaną).
 */
export function suspendCard(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || !object.suspend) {
    throw new Error('To nie jest zawieszalna karta z ręki');
  }
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (state.turn.activePlayerId !== playerId || !mainPhase || state.zones.stack.length > 0) {
    throw new Error('Suspend tylko w swoją fazę main przy pustym stosie');
  }
  // Koszt suspend może nieść pipy kolorów (Suspend 4—{B}) — walidacja
  // kolorowa przed mutacją (CR 601.2h), jak przy plot.
  const suspendColors = (object.suspend.colors ?? []).map((c) => [c]);
  if (suspendColors.length > 0 && !canPayColoredCost(state, playerId, suspendColors)) {
    throw new Error('Brak kolorowego źródła many na suspend');
  }
  spendMana(state, playerId, object.suspend.cost ?? 0, suspendColors);
  const exileId = `exile-${state.objectSequence++}`;
  // M262: suspend (CR 702.62a) — badge mechaniki „Wygnane: Suspend".
  const moved = moveObjectDirectly(state, objectId, 'exile', exileId, { exiledBy: 'suspend' });
  const suspended = Object.freeze({
    ...moved, suspended: true, timeCounters: object.suspend.timeCounters ?? 4,
  });
  state.objects.set(exileId, suspended);
  const e = event('card_suspended', {
    playerId, fromId: objectId, toId: exileId, cardId: object.cardId,
    object: suspended, timeCounters: suspended.timeCounters,
    cost: object.suspend.cost ?? 0,
  });
  state.events.push(e);
  return e;
}

/**
 * Warianty rzucenia czarów dostępne graczowi (objectId × legalne cele).
 * Dla czarów bezcelowych cele to pusta tablica. Zaplotowane czary z exile
 * są castowane bez kosztu many.
 */
/**
 * Enumeracja Fireballa: podzbiory celów (stwory na polu bitwy + gracze) × wartości
 * X, które gracz może zapłacić (koszt {X}+{R}+{1}/cel ≤ dostępna mana). Ograniczamy
 * podzbiory do rozsądnego limitu (jak COMBAT_OPTION_CAP w combat.js), żeby nie
 * eksplodować przy dużej planszy. Każda komenda niesie xValue i targets.
 */
/**
 * Oferty rzutu Fireballa (X + „any number of targets” + {1} za każdy cel ponad
 * pierwszy): podzbiory celów do 3 i X od 1 do budżetu, limit 15 (bez tego
 * spread setek tysięcy wariantów wywalał stos). Wspólne dla ręki i okna
 * zdolności Vaana — audyt PR #93, L74: jedna implementacja.
 */
export function legalFireballCasts(state, playerId, objectId, object, manaAvailable, { withoutManaCost = false } = {}) {
  const casts = [];
  const creatures = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((candidate) => candidate?.zone === 'battlefield' && candidate.kind === 'creature'
      && !hasHexproofAgainst(state, candidate, playerId)
      // Protection (CR 702.16b — DEBT: T): TEN SAM predykat co walidacja
      // castFireball (F2) — oferta i walidacja nie mogą się rozjechać (L48).
      && !isTargetingBlockedByProtection(state, candidate, object, { sourceColors: object.colors ?? [] }))
    .map((candidate) => candidate.id);
  const players = state.players.map((p) => p.id);
  const allTargets = [...creatures, ...players];
  if (allTargets.length === 0) return casts;
  // Podzbiory rozmiaru 1..min(allTargets.length, 3) — limit kombinacji,
  // żeby oferta nie eksplodowała przy dużej planszy (Fireball „any number").
  const maxTargets = Math.min(allTargets.length, 3);
  const subsets = (arr, k) => {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [head, ...rest] = arr;
    const withHead = subsets(rest, k - 1).map((x) => [head, ...x]);
    return [...withHead, ...subsets(rest, k)];
  };
  const base = object.manaCost ?? 0; // {R}
  // X ograniczamy do 15 — pokrywa praktyczne użycia (lethal), bez setek
  // tysięcy wariantów przy dużej puli many (stack overflow przy spreadzie).
  for (let n = 1; n <= maxTargets; n += 1) {
    const extra = Math.max(0, n - 1);
    for (const combo of subsets(allTargets, n)) {
      // Etap F/4: rzut „without paying its mana cost" — X = 0 (CR 107.3b),
      // koszt {X}{R} zniesiony, ale dopłata {1} za każdy cel ponad pierwszy
      // to zwiększenie kosztu, które płaci się nadal (CR 601.2f).
      if (withoutManaCost) {
        if (extra <= manaAvailable) casts.push({ objectId, targets: combo, xValue: 0 });
        continue;
      }
      const maxX = Math.min(manaAvailable - base - extra, 15);
      for (let X = 1; X <= maxX; X += 1) {
        casts.push({ objectId, targets: combo, xValue: X });
      }
    }
  }
  return casts;
}

/**
 * Ile kart gracz może odrzucić jako dodatkowy koszt rzutu (CR 601.2h) —
 * ręka BEZ rzucanego czaru (sam czar opuszcza rękę wcześniej niż płacimy
 * koszty, więc nie może się „odrzucić sam").
 */
export function countDiscardableFor(state, playerId, castObjectId) {
  return state.zones.hand.filter((handId) => handId !== castObjectId
    && state.objects.get(handId)?.controllerId === playerId).length;
}

export function legalSpellCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  // Oferta po manie produkowalnej (pula + nietapnięte landy): czar jest dostępną
  // akcją od razu, a płatność sama do-tapuje landy (spendMana).
  // M202/N1: budżet PER KARTA — mana ograniczona drukiem nie opłaci czaru
  // nie-artefaktowego (L48: oferta musi liczyć tak samo jak płatność).
  const manaAvailable = (forObject, reqs = null) => producibleMana(state, playerId, null, spellManaPurpose(forObject), reqs);
  const ids = [
    ...state.zones.hand,
    ...state.zones.exile.filter((id) => {
      const obj = state.objects.get(id);
      if (obj?.controllerId !== playerId) return false;
      // Batch 47: karta wygnana IMPULSEM (Gila Courser, Caves of Chaos
      // Adventurer) jest grywalna z exile do konca wskazanej tury. Dotad
      // requireSpell ja przyjmowal, ale OFERTA jej nie enumerowala, wiec
      // gracz nie mial jej w „Twoje dzialania" (klasa L48).
      const impulseLive = isImpulseWindowLive(obj, state);
      return obj?.plotted || obj?.suspendReady || impulseLive;
    }),
  ];
  for (const id of ids) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || object.kind !== 'spell' || !object.spell) continue;
    // „Without paying its mana cost" (ukonczony loch) — jak plot.
    const freeImpulseCast = isFreeImpulseCast(object);
    if (freeImpulseCast) {
      if (object.spell.timing === 'sorcery') {
        const mainPhaseFree = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
        if (!mainPhaseFree || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
      }
    }
    // Metalcraft (Stoic Rebuttal): warunkowa obniżka kosztu oceniana w chwili
    // enumeracji — przy spełnionym warunku czar pojawia się przy mniejszej puli.
    // Suspend (CR 702.62): rzut po zdjęciu ostatniego licznika czasu jest
    // bez kosztu many — jak zaplotowany.
    // Phyrexian mana (CR 118.9): pips {R/P} czaru — warianty komendy
    // phyrexianPayWithLife k=0..N (lustro ścieżki cast_permanent; Batch 48:
    // Ruthless Invasion — pierwszy czar z pitem phyrexian). Bez pipów:
    // zwykła bramka many + kolorów (zachowanie sprzed Batcha 48).
    const phyrexianSymbols = (!object.plotted && !object.suspendReady && !freeImpulseCast) ? (object.phyrexianManaCost ?? 0) : 0;
    const spellPhyrexianVariants = (() => {
      if (phyrexianSymbols === 0) {
        if (object.plotted || object.suspendReady || freeImpulseCast) return [null];
        // CR 702.66 (Delve, Batch 57/B4): część generyczna kosztu może zostać
        // pokryta wygnaniem kart z własnego grobu — oferta musi liczyć tak samo
        // jak płatność (L48), więc bramka przepuszcza czar, gdy opłacalny jest
        // KTÓRYKOLWIEK wariant 0..limit (decyzję i tak podejmie
        // `pendingDelveExile`, więc nie enumerujemy tu podzbiorów). Reguła
        // siedzi w `affordableDelveCounts` — jednym źródle dla deklaracji i dla
        // obu bramek oferty (audyt PR #130, znalezisko A: bramka „limit > 0”
        // odbierała rzut przy pustym grobie, choć wygnanie jest opcjonalne).
        if (object.delve) return affordableDelveCounts(state, playerId, object).length > 0 ? [null] : [];
        const payable = effectiveSpellManaCost(state, object) <= manaAvailable(object, coloredPipsOf(object.cardId, 0));
        return (payable && hasColorForSpell(state, playerId, object.cardId, 0)) ? [null] : [];
      }
      const base = effectiveSpellManaCost(state, object);
      const out = [];
      // M259/B3: base (manaCost) zawiera symbole phyrexian — wariant k płaci
      // base - k many + 2k życia (dotąd base +(symbols-k) przy manaCost bez
      // symboli).
      for (let k = 0; k <= phyrexianSymbols; k += 1) {
        if (base - k > manaAvailable(object, coloredPipsOf(object.cardId, k))) continue;
        if (2 * k > (player.life ?? 0)) continue;
        if (!hasColorForSpell(state, playerId, object.cardId, k)) continue;
        out.push(k);
      }
      return out;
    })();
    // Surge (CR 702.117, Batch 58/B1 — pierwszy instant/sorcery z surgiem):
    // koszt alternatywny ma WŁASNĄ kwotę i WŁASNE pipy, więc jest liczony
    // niezależnie od wariantów kosztu bazowego (przy 3 manie Boulder Salvo nie
    // ma wariantu bazowego, a surge ma być oferowany). Gate licznika czyta to
    // samo `spellsCastThisTurnByPlayer > 0` co `castPermanent` i walidacja
    // (L48: oferta = płatność). Wariantu nie ma przy darmowym rzucie
    // (plot/suspend/impuls) — tam koszt many jest zniesiony, a nie zastępowany.
    const surgeOffer = (() => {
      if (!object.surge || object.plotted || object.suspendReady || isFreeImpulseCast(object)) return false;
      if ((state.spellsCastThisTurnByPlayer?.[playerId] ?? 0) < 1) return false;
      const requirements = (object.surge.colors ?? []).map((color) => [color]);
      const cost = reduceAlternativeCost(state, object, object.surge.cost ?? object.manaCost ?? 0, object.surge.colors ?? []);
      if (cost > manaAvailable(object, requirements)) return false;
      return requirements.length === 0 || canPayColoredCost(state, playerId, requirements);
    })();
    if (spellPhyrexianVariants.length === 0 && !surgeOffer) continue;
    // Kicker (CR 702.33, audyt PR #93): wariant z dodatkowym kosztem —
    // dokładany PO zwykłych wariantach, żeby pierwsza pozycja panelu została
    // najtańszym naturalnym rzutem (proste boty i tester stołu biorą pierwszą;
    // ten sam porządek co przy `cast_permanent` w playerView). Enumerujemy
    // tylko tam, gdzie walidacja potrafi kickera rozliczyć (ścieżka prosta —
    // tryby, koszt X i Fireball mają osobne funkcje rzutu bez kickera).
    // L48: oferta liczy tak samo jak płatność — koszt AND pipy kolorów kickera.
    const freeCastForKicker = () => Boolean(object.plotted || object.suspendReady
      || isFreeImpulseCast(object));
    const pushKickerSpellCasts = (cast) => {
      if (!object.kicker) return;
      const kickerCost = object.kicker.cost ?? 0;
      const kickerPips = (object.kicker.colors ?? []).map((color) => [color]);
      const freeCast = freeCastForKicker();
      const base = freeCast ? 0 : effectiveSpellManaCost(state, object);
      for (const k of spellPhyrexianVariants) {
        // M259/B3: wariant phyrexianu płacony życiem obniża sumę o k.
        const pips = freeCast ? [] : coloredPipsOf(object.cardId, k ?? 0);
        if (base + kickerCost - (k ?? 0) > manaAvailable(object, [...pips, ...kickerPips])) continue;
        if (pips.length + kickerPips.length > 0
          && !canPayColoredCost(state, playerId, [...pips, ...kickerPips])) continue;
        const kickedCast = { ...cast, kicked: true };
        if (k != null) kickedCast.phyrexianPayWithLife = k;
        casts.push(kickedCast);
      }
    };
    // Gift (CR 702.174, Crumb and Get It): wariant z obietnicą daru NIE zmienia
    // kosztu many — dokładamy go za naturalnym rzutem, po jednym wariancie na
    // PRZECIWnika (odbiorcę wskazuje się razem z kosztem; „You can’t pay a gift
    // cost more than once”). Permanentów z darem katalog nie ma — dar dla nich
    // działa przez trigger ETB (CR 702.174b), więc ta ścieżka powstanie razem
    // z pierwszą taką kartą (dziś: jawny brak obsługi, nie ciche pominięcie).
    const pushGiftSpellCasts = (cast) => {
      if (!object.gift) return;
      for (const opponentId of state.players.map((p) => p.id).filter((pid) => pid !== playerId)) {
        casts.push({ ...cast, gifted: true, giftRecipientId: opponentId });
      }
    };
    const pushSpellCast = (cast) => {
      // Kolejność panelu (M203/2): przy konwencji „prezentacja = enumeracja"
      // wariant manowy (k=null) jest PIERWSZY wprost z tablicy wariantów —
      // dawniej wymagało to odwrócenia, bo playerView wstawiał przez unshift.
      // Surge (CR 702.117a) jest kosztem TAŃSZYM od wydrukowanego, więc idzie
      // PRZED wariantem bazowym — jak na ścieżce permanentów (`cast_permanent`
      // oferuje surge przed zwykłym rzutem). Wariantu z dopłatą kickera przy
      // surgu nie ma: to ograniczenie implementacji (koszt surge nie składa się
      // z kosztem dodatkowym — audyt PR #134, F-3e), a nie reguła; CR 601.2f
      // łączenie kosztu alternatywnego z dodatkowym wprost dopuszcza.
      if (surgeOffer) casts.push({ ...cast, surgeCast: true });
      for (const k of spellPhyrexianVariants) {
        casts.push(k == null ? cast : { ...cast, phyrexianPayWithLife: k });
      }
      if (surgeOffer) return;
      pushKickerSpellCasts(cast);
      pushGiftSpellCasts(cast);
    };
    if (object.spell.timing === 'sorcery') {
      const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
      if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
    }
    // M202/odznaka #2 (CR 702.170d): ta sama bramka co w walidacji — oferta nie
    // może obiecywać rzutu, który execute odrzuci (L48).
    if (!plottedCastAllowed(state, playerId, object)) continue;
    // Modal „Choose one" (Aerith Rescue Mission): każdy tryb enumerujemy osobno.
    if (object.spell.modes) {
      // M203/2: przy konwencji „prezentacja = enumeracja" (playerView doklada
      // przez `push`) tryby wchodza wprost w kolejnosci z Oracle — mode 0
      // pierwszy (domyslna sugestia; Fortify: Ofensywa przed Obroną).
      for (let modeIndex = 0; modeIndex < object.spell.modes.length; modeIndex += 1) {
        for (const cast of legalModeCasts(state, playerId, id, modeIndex, object.spell.modes[modeIndex])) {
          casts.push(cast);
        }
      }
      continue;
    }
    // Generyczny X-cost (Consume Spirit, Epic Experiment — Batch 30): czar ma
    // deskryptor `spell.xCost` (koszt bazowy w manaCost NIE zawiera X). X
    // wybiera gracz; całkowity koszt = manaCost + X. Audyt PR #93: oferty liczy
    // `legalXCostCasts` — ten sam generator obsługuje też okno zdolności Vaana.
    if (object.spell?.xCost) {
      // C1 (zgłoszenie właściciela 2026-09-10): wariant niesie ŁĄCZNY koszt
      // (X + baza) — kreator/etykieta pokazują go graczowi, zanim ten
      // potwierdzi rzut (inaczej „nagle" tapuje się więcej lądów, niż
      // gracz oczekiwał; płatność silnika była poprawna, brakowało widoku).
      for (const cast of legalXCostCasts(state, playerId, id, object, manaAvailable(object, coloredPipsOf(object.cardId, 0)))) {
        casts.push({ ...cast, cost: (cast.xValue ?? 0) + effectiveSpellManaCost(state, object) });
      }
      continue;
    }
    // Fireball (X-cost, any-number-of-targets): oferujemy X od 1 do dostępnej
    // many (po pokryciu {R} + {1}/cel), dla każdego podzbioru celów (stwory +
    // gracze). Pełna enumeracja podzbiorów ograniczona do rozsądnego limitu.
    if (object.spell?.fireball) {
      const fbc = legalFireballCasts(state, playerId, id, object, manaAvailable(object, coloredPipsOf(object.cardId, 0)));
      // C1: łączny koszt wariantu = X + {R} + {1} za każdy cel ponad pierwszy
      // (Oracle: „This spell costs {1} more to cast for each target beyond
      // the first") — dokładnie tyle pobierze castFireball. UI pokazuje tę
      // liczbę PRZED potwierdzeniem, żeby gracz wiedział, ile źródeł będzie
      // tapowanych (zgłoszenie: „wybrałem X=3, a tapnęło wszystkie 6 lądów"
      // — wariant miał 3 cele i kosztował 6, czego nic nie zapowiadało).
      for (const fc of fbc) {
        casts.push({ ...fc, cost: fc.xValue + (object.manaCost ?? 0) + Math.max(0, fc.targets.length - 1) });
      }
      continue;
    }
    const targetSpec = object.spell.targets ?? [];
    // Dodatkowy koszt „As an additional cost to cast this spell, sacrifice a
    // creature" (Village Rites): enumerujemy po stworach kontrolera; brak stwora
    // = czar niedostępny. Cel-poświęcenie niesie komenda (sacrificeTargetId).
    const sacrificeCost = object.spell.additionalCost?.sacrificeCreature;
    const orPayMana = object.spell.additionalCost?.orPayMana;
    // Lash of the Balrog (LTR): „sacrifice a creature OR pay {4}" — do
    // wariantów poświęcenia (per stwór) dokładamy wariant zapłaty maną
    // (payAltCost), gdy gracz ma na nią dość (koszt bazowy + {4}). Brak stwora
    // NIE czyni czaru niedostępnym — gracz może zapłacić maną.
    const sacrificePool = sacrificeCost
      ? state.zones.battlefield.filter((oid) => {
        const candidate = state.objects.get(oid);
        return candidate?.zone === 'battlefield' && candidate.kind === 'creature' && candidate.controllerId === playerId;
      })
      : [null];
    const payAltAvailable = Boolean(sacrificeCost && orPayMana != null
      && effectiveSpellManaCost(state, object) + orPayMana <= manaAvailable(object, coloredPipsOf(object.cardId, 0)));
    if (sacrificeCost && sacrificePool.length === 0 && !payAltAvailable) continue;
    // Batch 46 (Cathartic Reunion): „As an additional cost to cast this spell,
    // discard two cards." Koszt trzeba móc ZAPŁACIĆ, żeby czar był rzucalny
    // (CR 601.2h) — liczymy karty ręki BEZ samego czaru. Oferta i walidacja
    // używają tego samego warunku (L48).
    const discardCost = object.spell.additionalCost?.discardCards ?? 0;
    if (discardCost > 0 && countDiscardableFor(state, playerId, id) < discardCost) continue;
    if (targetSpec.length === 0) {
      for (const sacId of sacrificePool) {
        const cast = { objectId: id, targets: [] };
        if (sacId !== null) cast.sacrificeTargetId = sacId;
        pushSpellCast(cast);
      }
      if (payAltAvailable) pushSpellCast({ objectId: id, targets: [], payAltCost: true });
      // Buyback (CR 702.27): wariant z dodatkowym kosztem — czar wraca do ręki
      // po rozstrzygnięciu zamiast do grobu. Enumerujemy osobną komendę
      // tylko gdy gracz ma dość many na bazę + buyback.
      if (object.spell.buyback && !object.plotted) {
        const baseCost = effectiveSpellManaCost(state, object);
        const bbCost = object.spell.buyback.cost ?? 0;
        for (const k of spellPhyrexianVariants) {
          // M259/B3: manaCost zawiera symbole phyrexian — wariant k obniża
          // łączny koszt dokładnie o k jednostek (płacone życiem).
          const pipMana = k == null ? 0 : -k;
          if (baseCost + bbCost + pipMana > manaAvailable(object, coloredPipsOf(object.cardId, k ?? 0))) continue;
          const cast2 = { objectId: id, targets: [], buyback: true };
          if (k != null) cast2.phyrexianPayWithLife = k;
          casts.push(cast2);
        }
      }
      continue;
    }
    // Kandydaci dla każdej pozycji specyfikacji celów (iloczyn kartezjański —
    // czary wielocelowe jak Grave Exchange). Każdy typ jest generyczny.
    // Batch 45 (Assert Perfection): pozycja celu z `optional: true` („up to
    // one target") enumeruje też wariant BEZ celu (null) — czar rzucalny
    // nawet przy braku kandydatów na tej pozycji.
    // M203/2: `spell.effects` klasyfikujemy tym samym helperem co efekty
    // zdolności (`triggerTargetEffectFriendly` czyta `.effect`, więc
    // podajemy adapter) — bez drugiego, rozjeżdżającego się klasyfikatora.
    const effectFriendly = triggerTargetEffectFriendly({ effect: object.spell.effects ?? [] });
    const targetOrderPreference = effectFriendly ? 'ownFirst' : 'opponentFirst';
    const candidatePools = targetSpec.map((spec) => {
      const pool = legalTargetCandidates(state, playerId, spec, object, targetOrderPreference);
      return spec?.optional ? [...pool, null] : pool;
    });
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools, targetSpec.map((sp, wi) => sp?.targetWord ?? wi))) {
      for (const sacId of sacrificePool) {
        const cast = { objectId: id, targets: combo };
        if (sacId !== null) cast.sacrificeTargetId = sacId;
        pushSpellCast(cast);
      }
      if (payAltAvailable) pushSpellCast({ objectId: id, targets: combo, payAltCost: true });
    }
  }
  // M102/U8 (Żywy Tester, graveyard vs innistrad): czar z dodatkowym kosztem
  // „poświęć stwora" może celować w stwora, którym się płaci. To LEGALNE (cele
  // wybiera się przed zapłatą kosztów — CR 601.2c/601.2h), ale przy
  // rozstrzygnięciu czar fizzluje (CR 608.2b): gracz traci kartę, stwora i manę
  // bez żadnego efektu. Wariantu nie usuwamy (bywa świadomym zagraniem), ale
  // spychamy na KONIEC oferty — pierwsza pozycja jest domyślną sugestią UI
  // i to ją kliknął tester, tracąc Midnight Guard za darmo.
  // M203/2: przy konwencji „prezentacja = enumeracja" (playerView dokłada
  // przez `push`) sensowne warianty idą tu na POCZĄTEK, a fizzle na KONIEC —
  // dawniej trzeba było odwrotnie, bo `unshift` odwracał całą listę.
  const fizzlesItself = (cast) => cast.sacrificeTargetId != null
    && (cast.targets ?? []).includes(cast.sacrificeTargetId);
  return [...casts.filter((c) => !fizzlesItself(c)), ...casts.filter(fizzlesItself)];
}

export function legalCleaveCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  // M202/N1: budżet PER KARTA — mana ograniczona drukiem nie opłaci czaru
  // nie-artefaktowego (L48: oferta musi liczyć tak samo jak płatność).
  const manaAvailable = (forObject, reqs = null) => producibleMana(state, playerId, null, spellManaPurpose(forObject), reqs);
  const ids = [
    ...state.zones.hand,
    ...state.zones.exile.filter((id) => state.objects.get(id)?.controllerId === playerId && state.objects.get(id)?.plotted),
  ];
  for (const id of ids) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || object.kind !== 'spell' || !object.spell || !object.spell.cleave) continue;
    // Etap F (CR 118.9 + 601.2f): koszt alternatywny ZASTĘPUJE koszt many —
    // bramka kolorów i budżet pytają o pipy KOSZTU CLEAVE, nie wydruku karty
    // (lustro legalFlashbackCasts; jedno źródło z castCleave — L48).
    const cleaveRequirements = (object.spell.cleave.colors ?? []).map((color) => [color]);
    const cleaveCost = reduceAlternativeCost(state, object, object.spell.cleave.manaCost ?? 0, object.spell.cleave.colors ?? []);
    if (!object.plotted && cleaveCost > manaAvailable(object, cleaveRequirements)) continue;
    if (!object.plotted && cleaveRequirements.length > 0 && !canPayColoredCost(state, playerId, cleaveRequirements)) continue;
    if (object.spell.timing === 'sorcery') {
      const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
      if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
    }
    // M202/odznaka #2 (CR 702.170d): ta sama bramka co w walidacji — oferta nie
    // może obiecywać rzutu, który execute odrzuci (L48).
    if (!plottedCastAllowed(state, playerId, object)) continue;
    const targetSpec = object.spell.cleave.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    // Batch 45 (Assert Perfection): pozycja celu z `optional: true` („up to
    // one target") enumeruje też wariant BEZ celu (null) — czar rzucalny
    // nawet przy braku kandydatów na tej pozycji.
    const candidatePools = targetSpec.map((spec) => {
      const pool = legalTargetCandidates(state, playerId, spec, object);
      return spec?.optional ? [...pool, null] : pool;
    });
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools, targetSpec.map((sp, wi) => sp?.targetWord ?? wi))) {
      casts.push({ objectId: id, targets: combo });
    }
  }
  return casts;
}

/**
 * Modal „Choose one" (Aerith Rescue Mission): enumeracja wariantów pojedynczego
 * trybu. Tryb ze zwykłymi (stałej liczby) celami enumerujemy jak zwykły czar;
 * tryb z `variableTargets` („up to N target creatures") enumeruje podzbiory
 * celów o rozmiarze min..max, a `stunAmongTargets` dokłada wybór jednego z nich
 * jako celu dodatkowego (np. stun counter).
 */
/**
 * Oferty rzutu czaru z kosztem X (`spell.xCost`): X od 0 do tego, na co stać
 * gracza (po pokryciu bazy i z uwzględnieniem `cap`), dla każdego zestawu
 * celów. „Spend only black mana on X" (Consume Spirit) odrzuca warianty,
 * których czarne pipy przekraczają źródła.
 *
 * Wspólny dla rzutu z ręki (`legalSpellCasts`) i dla okna zdolności Vaana
 * (`epicCastOffers`) — audyt PR #93, L74: jedna implementacja.
 */
export function legalXCostCasts(state, playerId, objectId, object, manaAvailable) {
  const casts = [];
  const baseCost = effectiveSpellManaCost(state, object);
  const maxX = Math.max(0, manaAvailable - baseCost);
  const cap = object.spell.xCost.cap ?? 15;
  const targetSpec = object.spell.targets ?? [];
  let pools = [[]];
  if (targetSpec.length > 0) {
    pools = cartesian(targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec, object)),
      targetSpec.map((sp, wi) => sp?.targetWord ?? wi));
  }
  if (pools.length === 0) pools = [[]];
  const basePips = coloredPipsOf(object.cardId);
  const blackX = Boolean(object.spell.xCost.black);
  // X-black (Consume Spirit): budżet PER X z tymi samymi pipami co walidacja
  // (S3: baza + X czarnych) — dopuszczalne X to prefiks [0..X*] (budżet
  // niemalejący w X, koszt rosnący). Hoist przed pętlę celów: budżet nie
  // zależy od combo. Parametr manaAvailable to górne ograniczenie.
  const purpose = spellManaPurpose(object);
  const feasibleX = [];
  for (let X = 0; X <= Math.min(maxX, cap); X += 1) {
    const reqs = [...basePips];
    if (blackX) for (let i = 0; i < X; i += 1) reqs.push(['B']);
    if (X > producibleMana(state, playerId, null, purpose, reqs) - baseCost) break;
    if (blackX && X > 0 && !canPayColoredCost(state, playerId, reqs)) continue;
    feasibleX.push(X);
  }
  for (const combo of pools) {
    for (const X of feasibleX) {
      casts.push({ objectId, targets: combo, xValue: X });
    }
  }
  return casts;
}

/**
 * Oferty rzutu JEDNEGO trybu czaru modalnego (cele stałe i zmienne).
 * Wspólna dla rzutu z ręki (`legalSpellCasts`) i dla okien „you may cast it”
 * (`epicCastOffers` w game-state.js) — audyt PR #93: kopia w oknach pomijała
 * tryby z „up to N target ...”, przez co karta była niegrywalna z exile, choć
 * z ręki i wg Oracle grywalna (L74: jedna implementacja; L48: oferta = wykonanie).
 */
/**
 * Limit wariantów oferty dla trybu z celami zmiennymi („up to N targets").
 * Kombinacji jest 2^n, więc przy szerokim stole panel akcji puchnie
 * wykładniczo (zmierzone: 8 stworów → 93 warianty). Projekt ma ten sam
 * kompromis w walce (`COMBAT_OPTION_CAP`): OFERTA jest ograniczona,
 * a WALIDACJA w `execute` pozostaje pełna (bot nadal może zagrać legalny
 * wariant, którego nie ma w panelu) — audyt PR #93, znalezisko H.
 */
export const VARIABLE_TARGET_OPTION_CAP = 32;

/** Wybór wariantów do oferty, gdy kombinacji jest więcej niż limit. */
function trimVariableTargetCombos(combos, cap, maxSize) {
  if (combos.length <= cap) return combos;
  const empty = combos.filter((combo) => combo.length === 0);
  const singles = combos.filter((combo) => combo.length === 1);
  const fullest = combos.filter((combo) => combo.length === maxSize);
  const middle = combos.filter((combo) => combo.length !== 0 && combo.length !== 1 && combo.length !== maxSize);
  // Kolejność deterministyczna (ADR 0005): „nic”, „po jednym”, „ilu się da”,
  // a na końcu warianty pośrednie — gracz zachowuje skrajne wybory, a panel
  // mieści się na telefonie.
  return [...empty, ...singles, ...fullest, ...middle].slice(0, cap);
}

/**
 * Walidacja celów trybu z `variableTargets` (CR 601.2c): każdy cel musi być
 * legalny, liczba celów mieścić się w [min, max], a ten sam cel nie może być
 * wybrany dwa razy. PEŁNA i niezależna od (ograniczonej) oferty — wspólna dla
 * rzutu z ręki (`castModalSpell`) i okien „you may cast it" (audyt PR #93).
 */
export function validateVariableTargets(state, playerId, mode, chosen, object, stunTargetId = undefined) {
  const allowed = mode.variableTargets.type
    ? new Set(legalTargetCandidates(state, playerId, { type: mode.variableTargets.type }, object))
    : null;
  const seen = new Set();
  for (const tId of chosen) {
    const target = state.objects.get(tId);
    if (allowed ? !allowed.has(tId) : (!target || target.zone !== 'battlefield' || target.kind !== 'creature')) {
      throw new Error(`Nielegalny cel: ${tId}`);
    }
    // CR 601.2c: „target” oznacza RÓŻNE obiekty — ten sam stwór dwa razy to
    // nie są dwa cele.
    if (seen.has(tId)) throw new Error(`Cel wybrany dwa razy: ${tId}`);
    seen.add(tId);
  }
  const min = mode.variableTargets.min ?? 1;
  const max = mode.variableTargets.max ?? chosen.length;
  if (chosen.length < min || chosen.length > max) throw new Error('Nieprawidłowa liczba celów trybu');
  // M146: wariant ZERO celów trybu „… put a stun counter on ONE OF THEM” jest
  // legalny; bez celów nie ma na kim położyć licznika i ta część nie następuje.
  if (mode.stunAmongTargets && chosen.length > 0 && !chosen.includes(stunTargetId)) {
    throw new Error('Cel stun musi być jednym z celowanych stworów');
  }
  return chosen.slice();
}

export function legalModeCasts(state, playerId, objectId, modeIndex, mode, cap = VARIABLE_TARGET_OPTION_CAP) {
  const casts = [];
  if (mode.variableTargets) {
    // Batch 43 (Sea God's Scorn): „up to three target creatures and/or
    // enchantments" — variableTargets może nieść `type` (spec jak w
    // legalTargetCandidates, np. 'creature_or_enchantment'); bez `type`
    // zachowanie historyczne: dowolny stwór na polu bitwy.
    const source = state.objects.get(objectId);
    const creatures = mode.variableTargets.type
      ? legalTargetCandidates(state, playerId, { type: mode.variableTargets.type }, source)
      : state.zones.battlefield.filter((id) => {
        const candidate = state.objects.get(id);
        return candidate?.zone === 'battlefield' && candidate.kind === 'creature';
      });
    const min = mode.variableTargets.min ?? 1;
    const max = Math.min(mode.variableTargets.max ?? creatures.length, creatures.length);
    const subsets = (arr, k) => {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [head, ...rest] = arr;
      const withHead = subsets(rest, k - 1).map((s) => [head, ...s]);
      return [...withHead, ...subsets(rest, k)];
    };
    const combos = [];
    for (let k = min; k <= max; k += 1) combos.push(...subsets(creatures, k));
    // Audyt PR #93 (znalezisko H): kombinacji jest 2^n — ofertę przycinamy do
    // `cap` (walidacja w `execute` zostaje pełna, patrz wyżej).
    for (const combo of trimVariableTargetCombos(combos, cap, max)) {
      // M105/B4 (CR 601.2c): „up to N target creatures" pozwala wybrać ZERO
      // celów. Wariant pusty istnieje także dla trybu z dodatkowym celem
      // („Put a stun counter on ONE OF THEM") — bez tej gałęzi pętla po
      // `combo` nie dawała żadnej oferty i cały tryb znikał przy pustym
      // stole (albo nie dało się go rzucić „na pusto").
      if (mode.stunAmongTargets && combo.length > 0) {
        for (const stunId of combo) casts.push({ objectId, targets: combo, modeIndex, stunTargetId: stunId });
      } else {
        casts.push({ objectId, targets: combo, modeIndex });
      }
    }
    return casts;
  }
  const spec = mode.targets ?? [];
  if (spec.length === 0) {
    casts.push({ objectId, targets: [], modeIndex });
    return casts;
  }
  const source = state.objects.get(objectId);
  const pools = spec.map((s) => legalTargetCandidates(state, playerId, s, source));
  if (pools.some((p) => p.length === 0)) return casts;
  for (const combo of cartesian(pools, spec.map((sp, wi) => sp?.targetWord ?? wi))) casts.push({ objectId, targets: combo, modeIndex });
  return casts;
}

/**
 * Mapuje efektry trybu modalnego na cele rozstrzygania. `applyTo: 'allChosen'`
 * = wszystkie celeowane (np. tap), `applyTo: 'extra:<field>'` = dodatkowy cel
 * z modeExtra (np. stunTargetId); null = pomiń efekt (cel zniknął).
 */
function resolveModalEffectTargets(state, effect, object, liveChosen) {
  if (effect.applyTo === 'allChosen') return liveChosen;
  if (typeof effect.applyTo === 'string' && effect.applyTo.startsWith('extra:')) {
    const key = effect.applyTo.slice('extra:'.length);
    const val = object.modeExtra?.[key];
    if (!val) return null;
    // M361/B5: cel dodatkowy (stun) jest przy rzucie PODZBIOMEM chosen
    // (validateVariableTargets: stunAmongTargets) — przy rozstrzygnięciu też
    // musi być wciąż legalny (hexproof w odpowiedzi gasi i stuna).
    if (!liveChosen.includes(val)) return null;
    const target = state.objects.get(val);
    if (!target || target.zone !== 'battlefield') return null;
    return [val];
  }
  // Domyślnie efekty trybu stosują się do wybranych celów (mogą być puste —
  // np. create_token nie potrzebuje celu; używa kontrolera źródła).
  return liveChosen;
}

/**
 * Rzuca czar modalny (Aerith Rescue Mission): waliduje cele wybranego trybu
 * (stałe albo zmienne) i kładzie czar na stos z wybranym trybem + celami.
 */
function castModalSpell(state, playerId, objectId, modeIndex, targets, stunTargetId, abilityWindowCast = false, handFreeCast = false) {
  const object = state.objects.get(objectId);
  // M228/3 (błąd odkryty przez rotującą próbkę benchmarku): czar MODALNY
  // z exile jest rzucalny nie tylko gdy `plotted`, ale też jako suspend-ready
  // i jako IMPULSE (playableUntilTurn). Bez tego oferta (legalSpellCasts)
  // enumerowała tryby impulse-czaru z exile (Your Temple Is Under Attack po
  // ukończonym lochu), a execute je odrzucał — rozjazd oferty i wykonania
  // (L48/L41). Mirror gałęzi z requireSpell.
  const impulse = canPlayByImpulseFromExile(object, state);
  const plottedLike = object?.zone === 'exile' && (object.plotted || object.suspendReady);
  if (!object || object.controllerId !== playerId || !['hand', 'exile'].includes(object.zone)
    || object.kind !== 'spell'
    || (object.zone === 'exile' && !plottedLike && !impulse && !abilityWindowCast)) {
    throw new Error('To nie jest rzucalny czar z ręki albo zaplotowany z exile');
  }
  if (!object.spell?.modes) throw new Error('Ten czar nie jest modalny');
  const mode = object.spell.modes[modeIndex];
  if (!mode) throw new Error('Nieznany tryb czaru modalnego');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  // Opłacalność po manie produkowalnej — spendMana sam do-tapuje landy.
  // M111 (CR 601.2f): czar MODALNY też podlega obniżkom kosztu — wybór trybu
  // nie zmienia kosztu rzutu, więc nie ma powodu, by omijał Etherium Sculptor.
  // Rzut bez płacenia (plot albo impulse „without paying its mana cost" po
  // ukończonym lochu) kosztuje 0; zwykły impulse — pełny koszt.
  const freeCast = object.plotted || object.suspendReady || isFreeImpulseCast(object) || handFreeCast;
  const modalCost = freeCast ? 0 : effectiveSpellManaCost(state, object);
  if (modalCost > producibleMana(state, playerId, null, spellManaPurpose(object), coloredPipsOf(object.cardId))) throw new Error('Niewystarczająca mana');
  if (!freeCast && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  if (object.spell.timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    // Rzut w oknie zdolności ignoruje timing (CR 601.2b pomijany — ruling WotC
    // dla Vaana: rzucasz, póki zdolność jest na stosie) — mirror `requireSpell`.
    if (!abilityWindowCast
      && (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0)) {
      throw new Error('Czar sorcery tylko w swoją fazę main przy pustym stosie');
    }
  }
  const chosen = Array.isArray(targets) ? targets : [];
  let chosenTargets = [];
  if (mode.variableTargets) {
    // Audyt PR #93 (znalezisko H): jeden walidator dla rzutu z ręki i okien
    // „you may cast it" — pełny (niezależny od przyciętej oferty).
    chosenTargets = validateVariableTargets(state, playerId, mode, chosen, object, stunTargetId);
  } else {
    const spec = mode.targets ?? [];
    if (chosen.length !== spec.length) throw new Error('Nieprawidłowa liczba celów trybu');
    validateTargets(state, spec, chosen, playerId, object.colors ?? [], object);
    chosenTargets = chosen.slice();
  }
  const manaSpent = modalCost;
  // Tryb wybrany przy darmowym rzucie (Baral) nie płaci pipów czaru — inaczej
  // spendMana żądałby kolorów od rzutu, który kosztuje 0 (CR 118.9a).
  spendMana(state, playerId, manaSpent, freeCast ? [] : coloredPipsOf(object.cardId), spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const modeExtra = mode.stunAmongTargets ? { stunTargetId } : {};
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets, chosenMode: modeIndex, modeExtra });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: chosenTargets,
    targetCardIds: chosenTargets.map((id) => state.objects.get(id)?.cardId ?? null), modeIndex, manaSpent,
    // M91 (uwaga D): log stołu musi powiedzieć, KTÓRY tryb wybrano — z
    // perspektywy gracza „Choose one" to dwie różne karty. describeGameEvent
    // jest czystą funkcją bez dostępu do rejestru, więc nazwa trybu jedzie
    // w zdarzeniu (dane karty: spell.modes[i].name, nie warunek na nazwę).
    modeName: mode.name ?? null,
    stunTargetId: mode.stunAmongTargets ? stunTargetId : undefined,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/** Limit oferowanych podzbiorów wygnania Escape (jak CREW_OPTION_CAP). */
export const ESCAPE_OPTION_CAP = 32;

/** Limit oferowanych podzbiorów wygnania Delve (jak ESCAPE_OPTION_CAP). */
export const DELVE_OPTION_CAP = 32;

/**
 * Delve (CR 702.66, Hooting Mandrills): „Each card you exile from your
 * graveyard while casting this spell pays for {1}." — mechanika NIE jest
 * kosztem alternatywnym (ruling KTK 2021-03-19): nie zmienia kosztu ani mana
 * value czaru, obniża wyłącznie część GENERICZNĄ, nie wolno wygnać więcej kart
 * niż wynosi ta część, a liczba kart jest zmienna (0..limit).
 *
 * Wzorzec przepływu jak Escape (M241): deklaracja rzutu kolej­kuje decyzję
 * (`pendingDelveExile` → `resolve_delve_exile`), bo podzbiory × cele nie mogą
 * iść do oferty. Różnica: Escape ma FIXED `exileCount`, delve — widełki.
 */
export function delveExileLimit(state, playerId, object) {
  if (!object?.delve) return 0;
  // CR 702.66a/66b (audyt PR #130, znalezisko B): limit to część generyczna
  // kosztu CAŁKOWITEGO (po obniżkach z CR 601.2f), nie liczba z wydruku —
  // „applies only after the total cost of the spell with delve is determined”.
  // Jedno źródło reguły: `delveGenericMana` (mana-cost.js) — czytają ją też
  // obie walidacje płatności (`castSpell`, `castPermanent`), więc oferta,
  // decyzja i wykonanie nie mogą się rozjechać (L48/L107).
  const generic = delveGenericMana(state, object);
  const own = state.zones.graveyard.filter((id) => id !== object.id
    && state.objects.get(id)?.controllerId === playerId);
  return Math.max(0, Math.min(generic, own.length));
}

/** Koszt many czaru/permanentu z delve po wygnaniu `delveCount` kart. */
export function delveManaAfter(state, playerId, object, delveCount) {
  // `effectiveSpellManaCost` = druk minus obniżki (modyfikatory z permanentów
  // + warunkowe z karty), wyłącznie w części generycznej — to samo, co liczyła
  // tu kiedyś osobna gałąź dla permanentów (dwa wzory, jedna reguła: L41).
  const base = effectiveSpellManaCost(state, object);
  return Math.max(0, base - Math.max(0, delveCount));
}

/**
 * Opłacalne liczby wygnania Delve (0..limit) — JEDNO źródło dla deklaracji
 * (`declareDelveCast`) i dla OBU bramek oferty (czary tutaj, permanenty w
 * `game-state.js`), żeby oferta nie publikowała ruchu, którego płatność
 * odrzuci (L48), i żeby PUSTY GRÓB nie odbierał rzutu za pełny koszt: przy
 * limicie 0 jedynym wariantem jest k=0, opłacalny dokładnie wtedy, gdy
 * opłacalny jest zwykły rzut (CR 702.66a — „you MAY exile”; audyt PR #130,
 * znalezisko A: bramka `limit > 0` czyniła Hooting Mandrills niegrywalnym bez
 * materiału w grobie). Pusta lista = żaden wariant nie jest opłacalny.
 */
export function affordableDelveCounts(state, playerId, object) {
  if (!object?.delve) return [];
  if (!hasColorForObject(state, playerId, object)) return [];
  const limit = delveExileLimit(state, playerId, object);
  const available = producibleMana(state, playerId, null, spellManaPurpose(object), coloredPipsOf(object.cardId, 0));
  const counts = [];
  for (let k = 0; k <= limit; k += 1) {
    if (delveManaAfter(state, playerId, object, k) <= available) counts.push(k);
  }
  return counts;
}

/**
 * Deklaracja rzutu czaru/permanentu z Delve. Waliduje, że PRZYNAJMNIEJ JEDEN
 * wariant kosztu jest opłacalny (od 0 do limitu wygnania — L48: oferta nie
 * publikuje ruchu, którego płatność nie przyjmie), a wybór liczby i kart
 * odkłada do `pendingDelveExile`.
 */
export function declareDelveCast(state, playerId, objectId, call) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || !object.delve) {
    throw new Error('To nie jest czar z Delve w twojej ręce');
  }
  const maxExile = delveExileLimit(state, playerId, object);
  // Limit 0 (pusty grób albo brak części generycznej w koszcie całkowitym) NIE
  // znaczy „brak rzutu”: wygnanie jest opcjonalne (CR 702.66a), a decyzja bez
  // alternatywy nie jest decyzją — wołający (game-state.js) rzuca wtedy wprost
  // zwykłą ścieżką, bez otwierania `pendingDelveExile`.
  if (maxExile === 0) throw new Error('Delve: brak kart do wygnania (rzut idzie zwykłą ścieżką)');
  if (!hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  // Opłacalność wariantów liczy JEDNA funkcja — ta sama, którą czytają bramki
  // oferty (L48: oferta nie publikuje ruchu, którego płatność odrzuci).
  const affordable = affordableDelveCounts(state, playerId, object);
  if (affordable.length === 0) throw new Error('Niewystarczająca mana na rzut z Delve');
  const own = state.zones.graveyard.filter((id) => id !== objectId
    && state.objects.get(id)?.controllerId === playerId);
  state.pendingDelveExile = {
    playerId,
    objectId,
    cardId: object.cardId ?? null,
    call,
    maxExile,
    minExile: affordable[0],
    affordableCounts: affordable,
    candidateIds: [...own],
    manaCostBase: delveManaAfter(state, playerId, object, 0),
    restorePriorityTo: state.turn.priorityPlayerId,
  };
  state.turn.priorityPlayerId = playerId;
  const e = event('delve_exile_required', {
    playerId, sourceId: objectId, cardId: object.cardId ?? null,
    maxExile, minExile: affordable[0], candidateIds: [...own],
  });
  state.events.push(e);
  return e;
}

/**
 * Domknięcie kosztu Delve: wygnij `exileIds` (0..limit) z własnego grobu,
 * zapłać obniżoną manę i połóż czar na stosie. Rzut wykonuje ścieżka
 * wskazana w `pending.call` (permanent albo czar) z opcją `delveExileIds`,
 * która między innymi pilnuje CR 702.66 (limit części generycznej).
 */
export function resolveDelveExile(state, playerId, exileIds) {
  const pending = state.pendingDelveExile;
  if (!pending || pending.playerId !== playerId) throw new Error('To nie jest twoja decyzja Delve');
  const object = state.objects.get(pending.objectId);
  if (!object || object.zone !== 'hand') { state.pendingDelveExile = null; throw new Error('Czar zniknął z ręki'); }
  const own = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  const ids = Array.isArray(exileIds) ? [...exileIds] : null;
  const valid = ids
    && new Set(ids).size === ids.length
    && ids.length <= pending.maxExile
    // L48: wykonanie nie może przyjąć wyboru, którego OFERTA nie opublikowała
    // (liczba kart musi być wśród opłacalnych — inaczej rzut padłby na
    // płatności, już po zdjęciu decyzji).
    && (pending.affordableCounts ?? []).includes(ids.length)
    && ids.every((exId) => exId !== pending.objectId && own.includes(exId));
  if (!valid) throw new Error('Nieprawidłowy koszt Delve (exile)');
  state.pendingDelveExile = null;
  if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
    state.turn.priorityPlayerId = pending.restorePriorityTo;
  }
  const call = pending.call ?? {};
  const e = call.kind === 'spell'
    ? castSpell(state, playerId, pending.objectId, call.targets ?? [], call.sacrificeTargetId ?? null,
      call.modeIndex ?? null, call.stunTargetId ?? null, { ...(call.options ?? {}), delveExileIds: ids })
    : castPermanent(state, playerId, pending.objectId, { ...(call.options ?? {}), delveExileIds: ids });
  state.events.push(event('delve_exile_resolved', {
    playerId, sourceId: pending.objectId, cardId: pending.cardId,
    exileIds: ids.slice(), delveCount: ids.length,
  }));
  return e;
}

/**
 * Escape (CR 702.138, Sweet Oblivion): czar z deskryptorem spell.escape w grobie
 * można rzucić za koszt escape + wygnanie exileCount innych kart z grobu. Gracz
 * wybiera które exileCount kart wygnać (warianty podzbiorów, cap 32 jak crew).
 * Cel czaru wybiera gracz jak przy zwykłym rzucie.
 */
export function legalEscapeCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  // M202/N1: budżet PER KARTA — mana ograniczona drukiem nie opłaci czaru
  // nie-artefaktowego (L48: oferta musi liczyć tak samo jak płatność).
  const manaAvailable = (forObject, reqs = null) => producibleMana(state, playerId, null, spellManaPurpose(forObject), reqs);
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  const sorceryWindow = state.turn.activePlayerId === playerId && mainPhase && state.zones.stack.length === 0;
  const ownGraveyard = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  // Helper: wszystkie podzbiory rozmiaru k z arr (cap 32, jak crew)
  const subsets = (arr, k, cap = 32) => {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const out = [];
    const n = arr.length;
    const rec = (start, chosen) => {
      if (out.length >= cap) return;
      if (chosen.length === k) { out.push([...chosen]); return; }
      for (let i = start; i < n; i += 1) {
        chosen.push(arr[i]);
        rec(i + 1, chosen);
        chosen.pop();
        if (out.length >= cap) return;
      }
    };
    rec(0, []);
    return out;
  };
  for (const id of ownGraveyard) {
    const object = state.objects.get(id);
    if (!object || object.kind !== 'spell' || !object.spell?.escape) continue;
    if (!sorceryWindow) continue;
    const escape = object.spell.escape;
    // M111 (CR 601.2f): obniżki kosztu z permanentów dotyczą też kosztu
    // alternatywnego — escape nie jest wyjątkiem.
    // Etap F (CR 118.9 + 601.2f): płacony jest WYŁĄCZNIE koszt escape —
    // budżet i bramka kolorów pytają o jego pipy, nie o wydruk karty
    // (lustro legalFlashbackCasts i castEscape — L48).
    const escapeRequirements = (escape.colors ?? []).map((color) => [color]);
    if (reduceAlternativeCost(state, object, escape.cost ?? 0, escape.colors ?? []) > manaAvailable(object, escapeRequirements)) continue;
    if (escapeRequirements.length > 0 && !canPayColoredCost(state, playerId, escapeRequirements)) continue;
    const others = ownGraveyard.filter((otherId) => otherId !== id);
    if (others.length < escape.exileCount) continue;
    const targetSpec = object.spell.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    // Batch 45 (Assert Perfection): pozycja celu z `optional: true` („up to
    // one target") enumeruje też wariant BEZ celu (null) — czar rzucalny
    // nawet przy braku kandydatów na tej pozycji.
    const candidatePools = targetSpec.map((spec) => {
      const pool = legalTargetCandidates(state, playerId, spec, object);
      return spec?.optional ? [...pool, null] : pool;
    });
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools, targetSpec.map((sp, wi) => sp?.targetWord ?? wi))) {
      casts.push({ objectId: id, targets: combo });
    }
    // M241 (zgłoszenie J/K/L): komenda rzutu NIE niesie już podzbioru
    // wygnania (C(n,k) × cele rozwalało modal — „80+ opcji” — i WPIEKANY
    // cel tłukł self-mill Sweet Oblivion). Część „wygnij N kart” to
    // osobna decyzja queued (pendingEscapeExile → resolve_escape_exile),
    // oferta dla botów/enumeracje w legalCommands, gracz dostaje
    // multiselect z kandydatów.
    void subsets;
    void ESCAPE_OPTION_CAP;
  }
  return casts;
}

/**
 * Rzuca czar z grobu przez Escape (Sweet Oblivion): płaci koszt escape, wygania
 * exileCount innych kart z grobu (koszt) i kładzie czar na stos z celami.
 */
/**
 * Deklaracja rzutu przez Escape (Sweet Oblivion, Sleep of the Dead):
 * waliduje celem+manię (CR 601.2b–c) i KOLEJKUJE decyzję wygnania
 * (pendingEscapeExile → resolve_escape_exile), która dokonuje płatności
 * i kładzie czar na stos (CR 601.2h). Dwukrok, żeby UI mogło pokazać
 * (a) JAWNY wybór celu, (b) multiselect kart z grobu — zamiast
 * eksplodującej enumeracji podzbiorów × cele (zgłoszenie J/K/L 2026-08-27).
 */
export function castEscape(state, playerId, objectId, targets) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'graveyard' || object.kind !== 'spell' || !object.spell?.escape) {
    throw new Error('To nie jest czar z Escape w twoim grobie');
  }
  const escape = object.spell.escape;
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (state.turn.activePlayerId !== playerId || !mainPhase || state.zones.stack.length > 0) {
    throw new Error('Escape rzuca się w swoją fazę main przy pustym stosie');
  }
  const targetSpec = object.spell.targets ?? [];
  const chosen = targets ?? [];
  if (!Array.isArray(chosen) || chosen.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów');
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? [], object);
  const ownGraveyard = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  const others = ownGraveyard.filter((id) => id !== objectId);
  if (others.length < escape.exileCount) throw new Error('Za mało kart w grobie na koszt Escape');
  // Opłacalność — jak przy zwykłym rzucie (nie oddajemy, dopóki nie zapłacimy).
  const escapeCost = reduceAlternativeCost(state, object, escape.cost ?? 0, escape.colors ?? []);
  const escapeRequirements = (escape.colors ?? []).map((color) => [color]);
  if (escapeCost > producibleMana(state, playerId, null, spellManaPurpose(object), escapeRequirements)) throw new Error('Niewystarczająca mana na Escape');
  if (escapeRequirements.length > 0 && !canPayColoredCost(state, playerId, escapeRequirements)) throw new Error('Brak kolorowego źródła many');
  state.pendingEscapeExile = {
    playerId,
    objectId,
    cardId: object.cardId ?? null,
    targets: targetObjects.map((entry) => entry.id),
    targetCardIds: targetObjects.map((entry) => entry.cardId),
    exileCount: escape.exileCount,
    candidateIds: [...others],
    manaCost: escapeCost,
    colors: [...(escape.colors ?? [])],
    restorePriorityTo: state.turn.priorityPlayerId,
  };
  state.turn.priorityPlayerId = playerId;
  const e = event('escape_exile_required', {
    playerId, sourceId: objectId, cardId: object.cardId ?? null,
    exileCount: escape.exileCount, candidateIds: [...others],
  });
  state.events.push(e);
  return e;
}

/**
 * Domknięcie kosztu Escape: wygnij dokładnie exileCount innych kart z własnego
 * grobu (CR 702.138a „exile three OTHER cards”), zaplać manę i połóż czar
 * na stosie z wybranymi wcześniej celami.
 */
export function resolveEscapeExile(state, playerId, exileIds) {
  const pending = state.pendingEscapeExile;
  if (!pending || pending.playerId !== playerId) throw new Error('To nie jest twoja decyzja Escape');
  const object = state.objects.get(pending.objectId);
  if (!object || object.zone !== 'graveyard') { state.pendingEscapeExile = null; throw new Error('Czar zniknął z grobu'); }
  const ownGraveyard = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  const valid = Array.isArray(exileIds)
    && exileIds.length === pending.exileCount
    && new Set(exileIds).size === exileIds.length
    && exileIds.every((exId) => exId !== pending.objectId && ownGraveyard.includes(exId));
  if (!valid) throw new Error('Nieprawidłowy koszt Escape (exile)');
  state.pendingEscapeExile = null;
  const manaSpent = pending.manaCost;
  // M267/C: pipy KOSZTU ESCAPE (pending.colors pochodzi z deskryptora karty),
  // nie kosztu bazowego — jak madness (M161/O2).
  const escapeRequirements = (pending.colors ?? []).map((color) => [color]);
  if (!canPayColoredCost(state, playerId, escapeRequirements)) {
    throw new Error('Brak kolorowego źródła many');
  }
  spendMana(state, playerId, manaSpent, escapeRequirements, spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  for (const exId of exileIds) {
    const exileId = `exile-${state.objectSequence++}`;
    // M262: escape (CR 702.138) — karta wygania materiał z grobu; źródłem
    // jest karta uciekająca („Wygnane: <ta sama karta>", decyzja właściciela).
    const moved = moveObjectDirectly(state, exId, 'exile', exileId, { exiledBy: object.cardId });
    state.events.push(event('object_moved', { fromId: exId, object: moved, fromZone: 'graveyard', toZone: 'exile', escape: true }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, pending.objectId, 'stack', stackId);
  const chosenTargets = [...pending.targets];
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets, escaped: true });
  state.objects.set(stackId, stacked);
  const resolved = event('escape_exile_resolved', {
    playerId, sourceId: pending.objectId, cardId: pending.cardId,
    exileIds: exileIds.slice(),
  });
  state.events.push(resolved);
  const e = event('spell_cast', {
    playerId, fromId: stackId, object: stacked, cardId: object.cardId,
    targets: chosenTargets,
    targetCardIds: [...pending.targetCardIds], escaped: true, manaSpent,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  state.turn.priorityPlayerId = pending.restorePriorityTo ?? playerId;
  return e;
}

/**
 * Flashback (CR 702.34): czar z deskryptorem spell.flashback w grobie można
 * rzucić za koszt flashback. Instant = z priorytetem; sorcery = okno sorcery.
 * Po rozstrzygnięciu karta idzie do exile (flashedBack).
 */
export function legalFlashbackCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  // M202/N1: budżet PER KARTA — mana ograniczona drukiem nie opłaci czaru
  // nie-artefaktowego (L48: oferta musi liczyć tak samo jak płatność).
  const manaAvailable = (forObject, reqs = null) => producibleMana(state, playerId, null, spellManaPurpose(forObject), reqs);
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  const sorceryWindow = state.turn.activePlayerId === playerId && mainPhase && state.zones.stack.length === 0;
  const ownGraveyard = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  for (const id of ownGraveyard) {
    const object = state.objects.get(id);
    if (!object || object.kind !== 'spell' || !object.spell?.flashback) continue;
    const timing = object.spell.timing ?? 'sorcery';
    if (timing === 'sorcery' && !sorceryWindow) continue;
    const fb = object.spell.flashback;
    const requirements = (fb.colors ?? []).map((c) => [c]);
    if (reduceAlternativeCost(state, object, fb.cost ?? 0, fb.colors ?? []) > manaAvailable(object, requirements)) continue;
    if (requirements.length > 0 && !canPayColoredCost(state, playerId, requirements)) continue;
    const targetSpec = object.spell.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    // Batch 45 (Assert Perfection): pozycja celu z `optional: true` („up to
    // one target") enumeruje też wariant BEZ celu (null) — czar rzucalny
    // nawet przy braku kandydatów na tej pozycji.
    const candidatePools = targetSpec.map((spec) => {
      const pool = legalTargetCandidates(state, playerId, spec, object);
      return spec?.optional ? [...pool, null] : pool;
    });
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools, targetSpec.map((sp, wi) => sp?.targetWord ?? wi))) casts.push({ objectId: id, targets: combo });
  }
  return casts;
}

export function castFlashback(state, playerId, objectId, targets) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'graveyard' || object.kind !== 'spell' || !object.spell?.flashback) {
    throw new Error('To nie jest czar z Flashback w twoim grobie');
  }
  const fb = object.spell.flashback;
  const timing = object.spell.timing ?? 'sorcery';
  if (timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    if (state.turn.activePlayerId !== playerId || !mainPhase || state.zones.stack.length > 0) {
      throw new Error('Flashback sorcery tylko w swoją fazę main przy pustym stosie');
    }
  }
  const targetSpec = object.spell.targets ?? [];
  const chosen = targets ?? [];
  if (!Array.isArray(chosen) || chosen.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów');
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? [], object);
  const flashbackCost = reduceAlternativeCost(state, object, fb.cost ?? 0, fb.colors ?? []);
  const requirements = (fb.colors ?? []).map((c) => [c]);
  if (flashbackCost > producibleMana(state, playerId, null, spellManaPurpose(object), requirements)) throw new Error('Niewystarczająca mana na Flashback');
  if (requirements.length > 0 && !canPayColoredCost(state, playerId, requirements)) {
    throw new Error('Brak kolorowego źródła many');
  }
  const manaSpent = flashbackCost;
  spendMana(state, playerId, manaSpent, requirements, spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), flashedBack: true });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id),
    targetCardIds: targetObjects.map((entry) => entry.cardId), flashedBack: true, manaSpent,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Adventure (CR 715, Gray Slaad // Entropic Decay): legalne rzuty strony
 * przygodowej z RĘKI — sorcery-speed, koszt z deskryptora adventure
 * (liczba całkowita + pipy kolorów). Oferta po manie produkowalnej, jak
 * inne rzuty; cele bierzemy z deskryptora czaru przygody.
 */
export function legalAdventureCasts(state, playerId) {
  const casts = [];
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return casts;
  // M202/N1: budżet PER KARTA — mana ograniczona drukiem nie opłaci czaru
  // nie-artefaktowego (L48: oferta musi liczyć tak samo jak płatność).
  const manaAvailable = (forObject, reqs = null) => producibleMana(state, playerId, null, spellManaPurpose(forObject), reqs);
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  const sorceryWindow = state.turn.activePlayerId === playerId && mainPhase && state.zones.stack.length === 0;
  if (!sorceryWindow) return casts;
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (!object || object.controllerId !== playerId || !object.adventure) continue;
    const adventure = object.adventure;
    const requirements = (adventure.colors ?? []).map((color) => [color]);
    if (reduceAlternativeCost(state, object, adventure.cost ?? 0, adventure.colors ?? []) > manaAvailable(object, requirements)) continue;
    if (requirements.length > 0 && !canPayColoredCost(state, playerId, requirements)) continue;
    const targetSpec = adventure.spell?.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    // Batch 45 (Assert Perfection): pozycja celu z `optional: true` („up to
    // one target") enumeruje też wariant BEZ celu (null) — czar rzucalny
    // nawet przy braku kandydatów na tej pozycji.
    const candidatePools = targetSpec.map((spec) => {
      const pool = legalTargetCandidates(state, playerId, spec, object);
      return spec?.optional ? [...pool, null] : pool;
    });
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools, targetSpec.map((sp, wi) => sp?.targetWord ?? wi))) casts.push({ objectId: id, targets: combo });
  }
  return casts;
}

/**
 * Rzuca stronę przygodową karty z ręki (CR 715): płaci koszt przygody,
 * kładzie czar na stos (deskryptor czaru z adventure.spell); po
 * rozstrzygnięciu karta idzie do EXILE („on an adventure\"), nie do grobu.
 */
export function castAdventure(state, playerId, objectId, targets) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || !object.adventure) {
    throw new Error('To nie jest karta z przygodą w twojej ręce');
  }
  const adventure = object.adventure;
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
    throw new Error('Przygoda to czar sorcery — tylko w swoją fazę main przy pustym stosie');
  }
  const targetSpec = adventure.spell?.targets ?? [];
  const chosen = targets ?? [];
  if (!Array.isArray(chosen) || chosen.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów przygody');
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? [], object);
  const cost = reduceAlternativeCost(state, object, adventure.cost ?? 0, adventure.colors ?? []);
  const requirements = (adventure.colors ?? []).map((color) => [color]);
  if (cost > producibleMana(state, playerId, null, spellManaPurpose(object), requirements)) throw new Error('Niewystarczająca mana');
  if (requirements.length > 0 && !canPayColoredCost(state, playerId, requirements)) {
    throw new Error('Brak kolorowego źródła many');
  }
  spendMana(state, playerId, cost, requirements, spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({
    ...moved,
    // Obiekt na stosie jest CZAREM (sorcery) z deskryptorem przygody;
    // flaga adventure przenosi go po rozstrzygnięciu do exile.
    kind: 'spell', spell: adventure.spell, tapped: false,
    chosenTargets: chosen.slice(), adventure: true,
  });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id),
    targetCardIds: targetObjects.map((entry) => entry.cardId), adventure: true,
    manaSpent: cost,
    colors: [...(adventure.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Legalne rzuty strony-stwora karty z przygodą z EXILE („on an adventure\",
 * CR 715.3): zwykły rzut permanenta — koszt many karty, kolorowe pipy z
 * MANA_COSTS, timing jak przy cast_permanent (main phase bez flash).
 */
export function legalAdventureCreatureCasts(state, playerId) {
  const casts = [];
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return casts;
  // M202/N1: budżet PER KARTA — mana ograniczona drukiem nie opłaci czaru
  // nie-artefaktowego (L48: oferta musi liczyć tak samo jak płatność).
  const manaAvailable = (forObject, reqs = null) => producibleMana(state, playerId, null, spellManaPurpose(forObject), reqs);
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (!(state.turn.activePlayerId === playerId && mainPhase && state.zones.stack.length === 0)) return casts;
  for (const id of state.zones.exile) {
    const object = state.objects.get(id);
    if (!object || object.controllerId !== playerId || !object.adventure || object.plotted) continue;
    if ((object.manaCost ?? 0) > manaAvailable(object, coloredPipsOf(object.cardId, 0))) continue;
    if (!hasColorForObject(state, playerId, object)) continue;
    casts.push({ objectId: id });
  }
  return casts;
}

/**
 * Rzuca stronę-stwora karty z przygodą z exile (CR 715.3): jak castPermanent,
 * ale źródłem jest exile „on an adventure\" — po wejściu na pole bitwy karta
 * jest zwykłym permanentem (flaga adventureDone odróżnia ją od świeżej).
 */
export function castAdventureCreature(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'exile' || !object.adventure) {
    throw new Error('To nie jest karta z przygodą w twoim exile');
  }
  if (object.plotted) throw new Error('Karta zaplotowana rzuca się komendą cast_spell');
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
    throw new Error('Stwór z przygody — tylko w swoją fazę main przy pustym stosie');
  }
  const cost = reduceGenericCost(object.cardId, object.manaCost ?? 0, costReductionForSpell(state, object));
  if (cost > producibleMana(state, playerId, null, spellManaPurpose(object), coloredPipsOf(object.cardId))) throw new Error('Niewystarczająca mana');
  if (!hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  spendMana(state, playerId, cost, coloredPipsOf(object.cardId), spellManaPurpose(object));
  consumePendingSpellDiscount(state, object);
  state.spellsCastThisTurn += 1;
  // Rzut strony-stwora to rzut CZARU — obiekt idzie na STOS (jak cast_permanent);
  // na pole bitwy wchodzi po rozstrzygnięciu (resolvePermanentSpell). Obiekt
  // z exile „on an adventure" zachowuje deskryptor spell strony przygody —
  // WYKRESLAMY go, żeby rozstrzygnięcie potraktowało rzut jak permanent
  // (root cause: bez tego czar przygody rozstrzygał się DRUGI raz).
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({
    ...moved,
    spell: null,
    summoningSickness: true, tapped: false, wasCast: true, adventureDone: true,
    chosenTargets: [],
  });
  state.objects.set(stackId, stacked);
  const e = event('permanent_cast', {
    playerId, fromId: objectId, object: stacked, manaCost: cost, adventure: true,
    manaSpent: cost,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

export { effectivePower, effectiveToughness };
