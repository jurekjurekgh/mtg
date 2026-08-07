import { event } from '../protocol/types.js';
import { producibleMana, spendMana, canPayColoredCost } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { effectivePower, effectiveToughness } from './permanents.js';
import { applyEffect } from './effects.js';
import { attachAuraToCreature } from './attachments.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { parseManaCost, canPayManaCost, costReductionForSpell, reduceGenericCost, coloredPipsOf } from './mana-cost.js';
import { allControlledManaSources } from './mana-sources.js';

function hasColorForSpell(state, playerId, cardId) {
  const costStr = MANA_COSTS[cardId];
  if (!costStr) return true;
  const parsed = parseManaCost(costStr);
  if (!parsed) return true;
  if (parsed.colored.length === 0 && parsed.hybrid.length === 0 && parsed.phyrexian.length === 0) return true;
  // Kolorowa pula (cz. 7): MtG-castability z UŻYTECZNYCH źródeł (pula + untapped).
  return canPayColoredCost(state, playerId, coloredPipsOf(cardId));
}

function hasColorForObject(state, playerId, object) {
  if (!object) return true;
  if (object.kind === 'land') return true;
  return hasColorForSpell(state, playerId, object.cardId);
}

/**
 * Czary (instants/sorceries) przechodzą przez stos: rzucenie kładzie obiekt
 * na stos, a rozstrzygnięcie następuje po rundzie passów (LIFO). To jest
 * centralna pętla MtG — w przeciwieństwie do uproszczonej ścieżki permanentów
 * (cast_permanent), która na razie nie korzysta ze stosu.
 *
 * Deskryptor czaru na obiekcie (`object.spell`):
 * { timing: 'instant'|'sorcery', targets: [{ type: 'creature' }],
 *   effects: [{ type: 'damage', amount } | { type: 'pump', power, toughness }] }
 * Deskryptory buduje warstwa kart; core zna wyłącznie ogólne typy efektów,
 * nigdy nazwy kart.
 */

function requireSpell(state, playerId, objectId, targets, cleaved) {
  const object = state.objects.get(objectId);
  const plotted = object?.zone === 'exile' && object.plotted;
  if (!object || object.controllerId !== playerId || (!['hand', 'exile'].includes(object.zone)) || object.kind !== 'spell' || (object.zone === 'exile' && !plotted)) {
    throw new Error('To nie jest rzucalny czar z ręki albo zaplotowany z exile');
  }
  if (!object.spell || !object.spell.effects?.length) throw new Error('Obiekt nie ma deskryptora czaru');
  const { timing } = object.spell;
  const targetSpec = cleaved && object.spell.cleave ? (object.spell.cleave.targets ?? []) : (object.spell.targets ?? []);
  if (timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
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

/** Waliduje cele zgodnie ze specyfikacją deskryptora; zwraca obiekty celów. */
export function validateTargets(state, targetSpec, chosen, casterId) {
  return chosen.map((targetId, index) => {
    const spec = targetSpec[index];
    const object = state.objects.get(targetId);
    if (spec?.type === 'creature') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „artifact" (Shatter, CR 701.7): artefakt na bitwisku (kind artifact
    // albo typ Artifact — uwzględnia artefaktowe stwory, np. Esper Stormblade).
    if (spec?.type === 'artifact') {
      const isArtifact = object && object.zone === 'battlefield'
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'));
      if (!isArtifact) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „any target" (Release the Ants): gracz albo stwór — oba są legalne.
    if (spec?.type === 'any_target') {
      if (state.players.some((player) => player.id === targetId)) return { id: targetId, kind: 'player', controllerId: targetId };
      if (object && object.zone === 'battlefield' && object.kind === 'creature') return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „creature you control" (Guidestone Compass) — własny stwór na bitwisku.
    if (spec?.type === 'creature_you_control') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (object.controllerId !== casterId) throw new Error(`Nielegalny cel: ${targetId}`);
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
      if (state.players.some((player) => player.id === targetId)) {
        return { id: targetId, kind: 'player', controllerId: targetId };
      }
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „creature_with_subtypes" (Lunar Rejection) — stwór z jednym ze spec.subtypes.
    if (spec?.type === 'creature_with_subtypes') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      const hasSubtype = (spec.subtypes ?? []).some((sub) => (object.subtypes ?? []).includes(sub));
      if (!hasSubtype) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „creature card from your graveyard" (Grave Exchange) — stwór-karta
    // w grobie rzucającego.
    if (spec?.type === 'creature_card_in_graveyard') {
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
    // NIE jest stworzeniem (instants/sorceries oraz czyste aury). Stwory
    // zagrywane przez cast_permanent nie trafiają na stos w tym engine;
    // cast bestow (kind 'creature') jest stworem i NIE jest celem Negate.
    if (spec?.type === 'noncreature_spell_on_stack') {
      if (object && object.zone === 'stack' && object.kind !== 'creature') return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „spell on the stack" (Stoic Rebuttal — „Counter target spell\"):
    // DOWOLNY czar na stosie — także czar będący stworem (aura z bestow ma
    // na stosie kind 'creature') i czar aury. Czar nigdy nie jest legalnym
    // celem samego siebie: w chwili walidacji rzucający obiekt wciąż jest
    // w ręce (przenosi się na stos dopiero po walidacji).
    if (spec?.type === 'spell_on_stack') {
      if (object && object.zone === 'stack') return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „target opponent" (Plague Reaver): gracz inny niż aktywujący.
    if (spec?.type === 'opponent') {
      if (targetId && targetId !== casterId && state.players.some((player) => player.id === targetId)) {
        return { id: targetId, kind: 'player', controllerId: targetId };
      }
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    throw new Error(`Nieznany typ celu: ${spec?.type}`);
  });
}

/**
 * Efektywny koszt many czaru z warunkową obniżką (Metalcraft, Stoic Rebuttal,
 * CR 702.80): „this spell costs {1} less to cast if you control three or
 * more artifacts\". Warunek oceniany w chwili rzucenia; koszt nigdy nie
 * spadnie poniżej 0. Zwraca liczbę (bez zmian, gdy brak deskryptora).
 */
export function effectiveSpellManaCost(state, object) {
  const base = object?.manaCost ?? 0;
  let totalReduction = 0;
  const reduction = object?.spell?.costReduction;
  // Modyfikatory z permanentów na bitwisku (Etherium Sculptor, CR 601.2f):
  // redukują część generyczną niezależnie od warunku Metalcraft karty.
  totalReduction += costReductionForSpell(state, object);
  if (!reduction && totalReduction === 0) return base;
  const condition = reduction?.condition ?? {};
  if (condition.controlsArtifactsAtLeast != null) {
    const artifacts = [...(state?.objects?.values?.() ?? [])].filter((candidate) => candidate.zone === 'battlefield'
      && candidate.controllerId === object.controllerId
      && (candidate.kind === 'artifact' || (candidate.types ?? []).includes('Artifact'))).length;
    if (artifacts >= condition.controlsArtifactsAtLeast) {
      totalReduction += reduction.amount ?? 0;
    }
  }
  return reduceGenericCost(object?.cardId, base, totalReduction);
}

/** Rzuca czar: płaci koszt, kładzie obiekt na stos z wybranymi celami. */
export function castSpell(state, playerId, objectId, targets, sacrificeTargetId, modeIndex, stunTargetId) {
  const preObject = state.objects.get(objectId);
  // Modal „Choose one" (Aerith Rescue Mission): osobna ścieżka walidacji —
  // cele i efekty pochodzą z wybranego trybu, a nie z nadrzędnego deskryptora.
  if (preObject?.spell?.modes && modeIndex != null) {
    return castModalSpell(state, playerId, objectId, modeIndex, targets, stunTargetId);
  }
  const { object, targetSpec, chosen } = requireSpell(state, playerId, objectId, targets);
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId);
  // Dodatkowy koszt „sacrifice a creature" (Village Rites): walidacja celu-
  // poświęcenia PRZED jakąkolwiek mutacją (CR 601.2h) — nieudany rzut nie może
  // utracić many ani zostawić karty na stosie.
  const sacrificeCost = object.spell.additionalCost?.sacrificeCreature;
  if (sacrificeCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    if (!sacObject || sacObject.zone !== 'battlefield' || sacObject.kind !== 'creature' || sacObject.controllerId !== playerId) {
      throw new Error('Nielegalny cel dodatkowego kosztu (sacrifice a creature)');
    }
  }
  // Kolorowa walidacja many (Sweet Oblivion: 2 Plains nie mogą rzucić U)
  // Plot – rzut bez kosztu many (bez koloru) – pomijamy walidację kolorową, jak w legalSpellCasts.
  if (!object.plotted && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  // Warunkowa obniżka kosztu (Metalcraft, Stoic Rebuttal) oraz modyfikatory
  // z permanentów (Etherium Sculptor): płacimy efektywny koszt wyliczony
  // w chwili rzutu (warunki i modyfikatory oceniane na bieżącej planszy).
  const manaSpent = object.plotted ? 0 : effectiveSpellManaCost(state, object);
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  // Poświęcenie stwora jest KOSZTEM rzutu — następuje, zanim czar trafi na stos
  // (nawet przy późniejszym kontrczarze stwór pozostaje poświęcony — CR 601.2h).
  if (sacrificeCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    const graveId = `grave-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sacrificeTargetId, 'graveyard', graveId);
    state.events.push(event('permanent_sacrificed', {
      fromId: sacrificeTargetId, objectId: graveId, playerId, cardId: moved.cardId, additionalCost: true,
    }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice() });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id), plotted: Boolean(object.plotted),
    // Mana wydana na ten rzut (publiczna) — progi triggerów „if four or more
    // mana was spent to cast that spell" (Tellah, Great Sage) czytają ją
    // z kontekstu zdarzenia.
    manaSpent,
    // Kolory rzucanego czaru (publiczne) — trigger „a player casts a white
    // spell" (Angel's Feather) filtruje po nich generycznie.
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
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId);
  const sacrificeCost = object.spell.additionalCost?.sacrificeCreature;
  if (sacrificeCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    if (!sacObject || sacObject.zone !== 'battlefield' || sacObject.kind !== 'creature' || sacObject.controllerId !== playerId) {
      throw new Error('Nielegalny cel dodatkowego kosztu (sacrifice a creature)');
    }
  }
  if (!object.plotted && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  const manaSpent = object.plotted ? 0 : (object.spell.cleave.manaCost ?? 0);
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  if (sacrificeCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    const graveId = `grave-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sacrificeTargetId, 'graveyard', graveId);
    state.events.push(event('permanent_sacrificed', {
      fromId: sacrificeTargetId, objectId: graveId, playerId, cardId: moved.cardId, additionalCost: true,
    }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), cleaved: true });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id), plotted: Boolean(object.plotted),
    manaSpent,
    colors: [...(object.colors ?? [])], cleaved: true,
  });
  state.events.push(e);
  return e;
}

/**
 * Lista legalnych kandydatów dla pojedynczej pozycji specyfikacji celów.
 * Generyczna — nie zna nazw kart; decydują wyłącznie typy celów (ADR 0002).
 */
function legalTargetCandidates(state, playerId, spec) {
  const players = state.players.map((entry) => entry.id);
  const battlefieldCreatures = state.zones.battlefield.filter((objectId) => {
    const target = state.objects.get(objectId);
    return target?.kind === 'creature' && target.zone === 'battlefield';
  });
  switch (spec.type) {
    case 'creature': return battlefieldCreatures;
    // Cel „creature with subtypes\" (Lunar Rejection — Wolf/Werewolf):
    // stwór na bitwisku mający co najmniej jeden z podtypów deskryptora.
    // validateTargets sprawdza to samo, więc oferta i walidacja są spójne.
    case 'creature_with_subtypes':
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        return (spec.subtypes ?? []).some((sub) => (object.subtypes ?? []).includes(sub));
      });
    case 'artifact': return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object?.zone === 'battlefield'
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'));
    });
    case 'any_target': return [...players, ...battlefieldCreatures];
    case 'player': return players;
    case 'creature_card_in_graveyard': {
      return state.zones.graveyard.filter((objectId) => {
        const object = state.objects.get(objectId);
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
      // czyste aury). Bestow (kind 'creature') wykluczony — Negate liczy
      // wyłącznie czary nie-stworowe.
      return state.zones.stack.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'stack' && object.kind !== 'creature';
      });
    }
    case 'spell_on_stack': {
      // Stoic Rebuttal („Counter target spell\"): dowolny czar na stosie,
      // także czar-stwór (bestow) czy czar aury.
      return state.zones.stack.filter((objectId) => state.objects.get(objectId)?.zone === 'stack');
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
    case 'creature_you_control': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield' && object.kind === 'creature' && object.controllerId === playerId;
      });
    }
    default: return [];
  }
}

/** Iloczyn kartezjański list kandydatów (warianty celów czaru). */
function cartesian(pools) {
  if (pools.length === 0) return [[]];
  const [first, ...rest] = pools;
  const tails = cartesian(rest);
  const out = [];
  for (const head of first) {
    for (const tail of tails) out.push([head, ...tail]);
  }
  return out;
}

/**
 * Ponowna walidacja celów w momencie rozstrzygania (CR 608.2b w uproszczeniu):
 * cele, które przestały być legalne, są pomijane; czar bez żadnego
 * legalnego celu rozstrzyga się bez efektów („fizzle").
 */
function collectLegalTargets(state, targetSpec, chosen, casterId) {
  // Tablica indeksowana JAK targetSpec: na miejscu celu, który przestał być
  // legalny, jest null (efekt odnoszący się do niego nic nie robi — CR 608.2b).
  // Dzięki temu czary wielocelowe (Grave Exchange) mapują efekty na właściwe
  // cele nawet, gdy jeden z nich zniknął przed rozstrzygnięciem.
  return targetSpec.map((spec, index) => {
    try {
      return validateTargets(state, [spec], [chosen[index]], casterId)[0];
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
 * przy legalnym celu aura WCHODZI na bitwisko załączona do stwora (przestaje
 * być stworem). Gdy cel stał się nielegalny: karta z bestow wchodzi jako
 * zwykły stwór (wyjątek CR 702.103b), a czysta aura — jak każdy czar
 * bez legalnego celu — idzie do grobu, nie wchodząc na bitwisko (CR 608.2b).
 */
export function resolveTopOfStack(state) {
  if (state.zones.stack.length === 0) throw new Error('Stos jest pusty');
  const before = state.events.length;
  const stackId = state.zones.stack[state.zones.stack.length - 1];
  const object = state.objects.get(stackId);
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
    const liveChosen = (object.chosenTargets ?? []).filter((tId) => {
      // Cel-gracz (np. „target opponent\" trybu modalnego) nie jest obiektem w
      // strefie — zostawiamy go, żeby efekty „draw_cards_both_players\" dostały
      // prawidłowy cel (bez tego filtr bitwiska upuszczałby id gracza).
      if (state.players.some((p) => p.id === tId)) return true;
      const target = state.objects.get(tId);
      return target && target.zone === 'battlefield';
    });
    for (const effect of mode.effects ?? []) {
      const effTargets = resolveModalEffectTargets(state, effect, object, liveChosen);
      if (effTargets === null) continue;
      applyEffect(state, effect, object, effTargets);
    }
    const graveId = `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, stackId, 'graveyard', graveId);
    state.events.push(event('spell_resolved', { fromId: stackId, toId: graveId, cardId: object.cardId, controllerId: object.controllerId, fizzled: false, modal: true, modeIndex: object.chosenMode }));
    return state.events.slice(before);
  }
  const legalTargets = collectLegalTargets(state, targetSpec, chosen, object.controllerId).map((entry) => entry?.id ?? null);
  const fizzled = targetSpec.length > 0 && legalTargets.every((entry) => entry === null);
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
  const graveId = `grave-${state.objectSequence++}`;
  moveObjectDirectly(state, stackId, 'graveyard', graveId);
  const resolved = event('spell_resolved', { fromId: stackId, toId: graveId, cardId: object.cardId, controllerId: object.controllerId, fizzled });
  state.events.push(resolved);
  return state.events.slice(before);
}

/**
 * Dokańcza czar wstrzymany przez blokującą decyzję (state.pendingSpell):
 * wykonuje pozostałe efekty i opuszcza stos (grób albo — po wygranym clash —
 * ręka właściciela). Wywoływane z execute po resolve_scry/resolve_surveil.
 */
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
  const legalTargets = collectLegalTargets(state, targetSpec, object.chosenTargets ?? [], object.controllerId).map((entry) => entry?.id ?? null);
  for (const effect of remainingEffects ?? []) {
    const blocked = applyEffect(state, effect, object, legalTargets);
    if (blocked) {
      // Decyzja zagnieżdżona (np. surveil po surveil) — czekamy dalej.
      state.pendingSpell = { stackId, effects: remainingEffects.slice(remainingEffects.indexOf(effect) + 1) };
      return state.events.slice(before);
    }
  }
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
  const graveId = `grave-${state.objectSequence++}`;
  moveObjectDirectly(state, stackId, 'graveyard', graveId);
  const resolved = event('spell_resolved', { fromId: stackId, toId: graveId, cardId: object.cardId, controllerId: object.controllerId, fizzled: false });
  state.events.push(resolved);
  return state.events.slice(before);
}

/** Rozstrzygnięcie czaru aury (bestow albo czystej) — patrz resolveTopOfStack. */
function resolveAuraSpell(state, stackId, object, chosen, before) {
  const targetId = chosen[0];
  // Aura „Enchant player" (Curse of the Pierced Heart): wchodzi na bitwisko
  // jako zwykły enchantment (nie 'aura') z polem `enchantedPlayerId` — gracz
  // nie opuszcza bitwiska, więc aura nie staje się osierocona (CR 704.5m
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
  const hostLegal = host && host.zone === 'battlefield' && host.kind === 'creature';
  if (!hostLegal && !object.bestow) {
    // Czysta aura przy nielegalnym celu NIE wchodzi na bitwisko — trafia
    // wprost do grobu (jak czar „fizzle", CR 608.2b + 704.5m).
    const graveId = `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, stackId, 'graveyard', graveId);
    state.events.push(event('spell_resolved', {
      fromId: stackId, toId: graveId, cardId: object.cardId,
      controllerId: object.controllerId, fizzled: true,
    }));
    return state.events.slice(before);
  }
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, stackId, 'battlefield', newId);
  if (hostLegal) {
    // Aura wchodzi załączona — od wejścia NIE jest stworem (kind 'aura');
    // attachAuraToCreature dokleja zdarzenie object_attached.
    const attached = attachAuraToCreature(state, newId, targetId);
    state.events.push(event('permanent_entered_battlefield', {
      fromId: stackId, objectId: newId, object: attached, cardId: moved.cardId,
      controllerId: moved.controllerId, attachedTo: targetId, aura: true,
    }));
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
 * Plotuje czar z ręki: płaci koszt, przenosi kartę do exile i oznacza ją jako
 * zaplotowaną. Późniejsze cast z exile nie płaci many w minimalnym modelu
 * projektu, ale nadal podlega timingowi czaru.
 */
export function plotCard(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || object.kind !== 'spell' || !object.plot) {
    throw new Error('To nie jest plotowalny czar z ręki');
  }
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (state.turn.activePlayerId !== playerId || !mainPhase || state.zones.stack.length > 0) {
    throw new Error('Plot tylko w swoją fazę main przy pustym stosie');
  }
  spendMana(state, playerId, object.plot.cost ?? 0);
  const exileId = `exile-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'exile', exileId);
  const plotted = Object.freeze({ ...moved, plotted: true });
  state.objects.set(exileId, plotted);
  const plottedEvent = event('card_plotted', {
    playerId, fromId: objectId, toId: exileId, cardId: object.cardId,
    object: plotted, cost: object.plot.cost ?? 0,
  });
  state.events.push(plottedEvent);
  return plottedEvent;
}

/**
 * Warianty rzucenia czarów dostępne graczowi (objectId × legalne cele).
 * Dla czarów bezcelowych cele to pusta tablica. Zaplotowane czary z exile
 * są castowane bez kosztu many.
 */
export function legalSpellCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  // Oferta po manie produkowalnej (pula + nietapnięte landy): czar jest dostępną
  // akcją od razu, a płatność sama do-tapuje landy (spendMana).
  const manaAvailable = producibleMana(state, playerId);
  const ids = [
    ...state.zones.hand,
    ...state.zones.exile.filter((id) => state.objects.get(id)?.controllerId === playerId && state.objects.get(id)?.plotted),
  ];
  for (const id of ids) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || object.kind !== 'spell' || !object.spell) continue;
    // Metalcraft (Stoic Rebuttal): warunkowa obniżka kosztu oceniana w chwili
    // enumeracji — przy spełnionym warunku czar pojawia się przy mniejszej puli.
    if (!object.plotted && effectiveSpellManaCost(state, object) > manaAvailable) continue;
    if (!object.plotted && !hasColorForObject(state, playerId, object)) continue;
    if (object.spell.timing === 'sorcery') {
      const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
      if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
    }
    // Modal „Choose one" (Aerith Rescue Mission): każdy tryb enumerujemy osobno.
    if (object.spell.modes) {
      for (let modeIndex = 0; modeIndex < object.spell.modes.length; modeIndex += 1) {
        for (const cast of legalModeCasts(state, playerId, id, modeIndex, object.spell.modes[modeIndex])) {
          casts.push(cast);
        }
      }
      continue;
    }
    const targetSpec = object.spell.targets ?? [];
    // Dodatkowy koszt „As an additional cost to cast this spell, sacrifice a
    // creature" (Village Rites): enumerujemy po stworach kontrolera; brak stwora
    // = czar niedostępny. Cel-poświęcenie niesie komenda (sacrificeTargetId).
    const sacrificePool = object.spell.additionalCost?.sacrificeCreature
      ? state.zones.battlefield.filter((oid) => {
        const candidate = state.objects.get(oid);
        return candidate?.zone === 'battlefield' && candidate.kind === 'creature' && candidate.controllerId === playerId;
      })
      : [null];
    if (object.spell.additionalCost?.sacrificeCreature && sacrificePool.length === 0) continue;
    if (targetSpec.length === 0) {
      for (const sacId of sacrificePool) {
        const cast = { objectId: id, targets: [] };
        if (sacId !== null) cast.sacrificeTargetId = sacId;
        casts.push(cast);
      }
      continue;
    }
    // Kandydaci dla każdej pozycji specyfikacji celów (iloczyn kartezjański —
    // czary wielocelowe jak Grave Exchange). Każdy typ jest generyczny.
    const candidatePools = targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec));
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools)) {
      for (const sacId of sacrificePool) {
        const cast = { objectId: id, targets: combo };
        if (sacId !== null) cast.sacrificeTargetId = sacId;
        casts.push(cast);
      }
    }
  }
  return casts;
}

export function legalCleaveCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  const manaAvailable = producibleMana(state, playerId);
  const ids = [
    ...state.zones.hand,
    ...state.zones.exile.filter((id) => state.objects.get(id)?.controllerId === playerId && state.objects.get(id)?.plotted),
  ];
  for (const id of ids) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || object.kind !== 'spell' || !object.spell || !object.spell.cleave) continue;
    const cleaveCost = object.spell.cleave.manaCost ?? 0;
    if (!object.plotted && cleaveCost > manaAvailable) continue;
    if (!object.plotted && !hasColorForObject(state, playerId, object)) continue;
    if (object.spell.timing === 'sorcery') {
      const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
      if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
    }
    const targetSpec = object.spell.cleave.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    const candidatePools = targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec));
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools)) {
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
function legalModeCasts(state, playerId, objectId, modeIndex, mode) {
  const casts = [];
  if (mode.variableTargets) {
    const creatures = state.zones.battlefield.filter((id) => {
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
    for (let k = min; k <= max; k += 1) {
      for (const combo of subsets(creatures, k)) {
        if (mode.stunAmongTargets) {
          for (const stunId of combo) casts.push({ objectId, targets: combo, modeIndex, stunTargetId: stunId });
        } else {
          casts.push({ objectId, targets: combo, modeIndex });
        }
      }
    }
    return casts;
  }
  const spec = mode.targets ?? [];
  if (spec.length === 0) {
    casts.push({ objectId, targets: [], modeIndex });
    return casts;
  }
  const pools = spec.map((s) => legalTargetCandidates(state, playerId, s));
  if (pools.some((p) => p.length === 0)) return casts;
  for (const combo of cartesian(pools)) casts.push({ objectId, targets: combo, modeIndex });
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
function castModalSpell(state, playerId, objectId, modeIndex, targets, stunTargetId) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || !['hand', 'exile'].includes(object.zone) || object.kind !== 'spell' || (object.zone === 'exile' && !object.plotted)) {
    throw new Error('To nie jest rzucalny czar z ręki albo zaplotowany z exile');
  }
  if (!object.spell?.modes) throw new Error('Ten czar nie jest modalny');
  const mode = object.spell.modes[modeIndex];
  if (!mode) throw new Error('Nieznany tryb czaru modalnego');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  // Opłacalność po manie produkowalnej — spendMana sam do-tapuje landy.
  if (!object.plotted && (object.manaCost ?? 0) > producibleMana(state, playerId)) throw new Error('Niewystarczająca mana');
  if (!object.plotted && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  if (object.spell.timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
      throw new Error('Czar sorcery tylko w swoją fazę main przy pustym stosie');
    }
  }
  const chosen = Array.isArray(targets) ? targets : [];
  let chosenTargets = [];
  if (mode.variableTargets) {
    for (const tId of chosen) {
      const target = state.objects.get(tId);
      if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') throw new Error(`Nielegalny cel: ${tId}`);
    }
    const min = mode.variableTargets.min ?? 1;
    const max = mode.variableTargets.max ?? chosen.length;
    if (chosen.length < min || chosen.length > max) throw new Error('Nieprawidłowa liczba celów trybu');
    if (mode.stunAmongTargets && !chosen.includes(stunTargetId)) {
      throw new Error('Cel stun musi być jednym z celowanych stworów');
    }
    chosenTargets = chosen.slice();
  } else {
    const spec = mode.targets ?? [];
    if (chosen.length !== spec.length) throw new Error('Nieprawidłowa liczba celów trybu');
    validateTargets(state, spec, chosen, playerId);
    chosenTargets = chosen.slice();
  }
  const manaSpent = object.plotted ? 0 : (object.manaCost ?? 0);
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const modeExtra = mode.stunAmongTargets ? { stunTargetId } : {};
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets, chosenMode: modeIndex, modeExtra });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: chosenTargets, modeIndex, manaSpent,
    stunTargetId: mode.stunAmongTargets ? stunTargetId : undefined,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Escape (CR 702.138, Sweet Oblivion): czar z deskryptorem spell.escape w grobie
 * można rzucić za koszt escape + wygnanie exileCount innych kart z grobu. Koszt
 * wygnania jest deterministyczny (ADR 0005): pierwsze exileCount innych kart
 * w kolejności grobu. Cel czaru wybiera gracz jak przy zwykłym rzucie.
 */
export function legalEscapeCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  // Oferta po manie produkowalnej — escape płaci spendMana (auto-tap landów).
  const manaAvailable = producibleMana(state, playerId);
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  const sorceryWindow = state.turn.activePlayerId === playerId && mainPhase && state.zones.stack.length === 0;
  const ownGraveyard = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  for (const id of ownGraveyard) {
    const object = state.objects.get(id);
    if (!object || object.kind !== 'spell' || !object.spell?.escape) continue;
    if (!sorceryWindow) continue;
    const escape = object.spell.escape;
    if ((escape.cost ?? 0) > manaAvailable) continue;
    if (!hasColorForObject(state, playerId, object)) continue;
    const others = ownGraveyard.filter((otherId) => otherId !== id);
    if (others.length < escape.exileCount) continue;
    const escapeExileIds = others.slice(0, escape.exileCount);
    const targetSpec = object.spell.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [], escapeExileIds });
      continue;
    }
    const candidatePools = targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec));
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools)) casts.push({ objectId: id, targets: combo, escapeExileIds });
  }
  return casts;
}

/**
 * Rzuca czar z grobu przez Escape (Sweet Oblivion): płaci koszt escape, wygania
 * exileCount innych kart z grobu (koszt) i kładzie czar na stos z celami.
 */
export function castEscape(state, playerId, objectId, targets, escapeExileIds) {
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
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId);
  // Walidacja kosztu wygnania PRZED mutacją (CR 601.2h).
  const ownGraveyard = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  const validExile = Array.isArray(escapeExileIds)
    && escapeExileIds.length === escape.exileCount
    && new Set(escapeExileIds).size === escapeExileIds.length
    && escapeExileIds.every((exId) => exId !== objectId && ownGraveyard.includes(exId));
  if (!validExile) throw new Error('Nieprawidłowy koszt Escape (exile)');
  // Opłacalność po manie produkowalnej — spendMana sam do-tapuje landy.
  if ((escape.cost ?? 0) > producibleMana(state, playerId)) throw new Error('Niewystarczająca mana na Escape');
  if (!hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  const manaSpent = escape.cost ?? 0;
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  for (const exId of escapeExileIds) {
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, exId, 'exile', exileId);
    state.events.push(event('object_moved', { fromId: exId, object: moved, fromZone: 'graveyard', toZone: 'exile', escape: true }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), escaped: true });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id), escaped: true, manaSpent,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

export { effectivePower, effectiveToughness };
