import { event } from '../protocol/types.js';
import { spendMana } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { effectivePower, effectiveToughness } from './permanents.js';
import { applyEffect } from './effects.js';
import { attachAuraToCreature } from './attachments.js';

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

function requireSpell(state, playerId, objectId, targets) {
  const object = state.objects.get(objectId);
  const plotted = object?.zone === 'exile' && object.plotted;
  if (!object || object.controllerId !== playerId || (!['hand', 'exile'].includes(object.zone)) || object.kind !== 'spell' || (object.zone === 'exile' && !plotted)) {
    throw new Error('To nie jest rzucalny czar z ręki albo zaplotowany z exile');
  }
  if (!object.spell || !object.spell.effects?.length) throw new Error('Obiekt nie ma deskryptora czaru');
  const { timing, targets: targetSpec } = object.spell;
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
  return { object, targetSpec: targetSpec ?? [], chosen };
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
    // Cel „any target" (Release the Ants): gracz albo stwór — oba są legalne.
    if (spec?.type === 'any_target') {
      if (state.players.some((player) => player.id === targetId)) return { id: targetId, kind: 'player', controllerId: targetId };
      if (object && object.zone === 'battlefield' && object.kind === 'creature') return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
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
    throw new Error(`Nieznany typ celu: ${spec?.type}`);
  });
}

/** Rzuca czar: płaci koszt, kładzie obiekt na stos z wybranymi celami. */
export function castSpell(state, playerId, objectId, targets) {
  const { object, targetSpec, chosen } = requireSpell(state, playerId, objectId, targets);
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId);
  spendMana(state, playerId, object.plotted ? 0 : (object.manaCost ?? 0));
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice() });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id), plotted: Boolean(object.plotted),
    // Kolory rzucanego czaru (publiczne) — trigger „a player casts a white
    // spell" (Angel's Feather) filtruje po nich generycznie.
    colors: [...(object.colors ?? [])],
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
    case 'land_you_control': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        const isLand = object && (object.kind === 'land' || (object.types ?? []).includes('Land'));
        return isLand && object.zone === 'battlefield' && object.controllerId === playerId;
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
  const targetSpec = object.spell.targets ?? [];
  const chosen = object.chosenTargets ?? [];
  if (object.spell.aura && (object.bestow || object.aura)) {
    return resolveAuraSpell(state, stackId, object, chosen, before);
  }
  const legalTargets = collectLegalTargets(state, targetSpec, chosen, object.controllerId).map((entry) => entry?.id ?? null);
  const fizzled = targetSpec.length > 0 && legalTargets.every((entry) => entry === null);
  if (!fizzled) {
    const effects = object.spell.effects;
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
  const targetSpec = object.spell.targets ?? [];
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
  const ids = [
    ...state.zones.hand,
    ...state.zones.exile.filter((id) => state.objects.get(id)?.controllerId === playerId && state.objects.get(id)?.plotted),
  ];
  for (const id of ids) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || object.kind !== 'spell' || !object.spell) continue;
    if (!object.plotted && (object.manaCost ?? 0) > (player.mana ?? 0)) continue;
    if (object.spell.timing === 'sorcery') {
      const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
      if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
    }
    const targetSpec = object.spell.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    // Kandydaci dla każdej pozycji specyfikacji celów (iloczyn kartezjański —
    // czary wielocelowe jak Grave Exchange). Każdy typ jest generyczny.
    const candidatePools = targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec));
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools)) casts.push({ objectId: id, targets: combo });
  }
  return casts;
}

export { effectivePower, effectiveToughness };
