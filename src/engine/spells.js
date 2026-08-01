import { event } from '../protocol/types.js';
import { spendMana } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { effectivePower, effectiveToughness } from './permanents.js';
import { applyEffect } from './effects.js';

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
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || object.kind !== 'spell') {
    throw new Error('To nie jest rzucalny czar z ręki');
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
export function validateTargets(state, targetSpec, chosen) {
  return chosen.map((targetId, index) => {
    const spec = targetSpec[index];
    const object = state.objects.get(targetId);
    if (spec?.type === 'creature') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    throw new Error(`Nieznany typ celu: ${spec?.type}`);
  });
}

/** Rzuca czar: płaci koszt, kładzie obiekt na stos z wybranymi celami. */
export function castSpell(state, playerId, objectId, targets) {
  const { object, targetSpec, chosen } = requireSpell(state, playerId, objectId, targets);
  const targetObjects = validateTargets(state, targetSpec, chosen);
  spendMana(state, playerId, object.manaCost ?? 0);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice() });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id),
  });
  state.events.push(e);
  return e;
}

/**
 * Ponowna walidacja celów w momencie rozstrzygania (CR 608.2b w uproszczeniu):
 * cele, które przestały być legalne, są pomijane; czar bez żadnego
 * legalnego celu rozstrzyga się bez efektów („fizzle").
 */
function collectLegalTargets(state, targetSpec, chosen) {
  const legal = [];
  for (let i = 0; i < chosen.length; i += 1) {
    try {
      legal.push(validateTargets(state, [targetSpec[i]], [chosen[i]])[0]);
    } catch {
      // cel przestał być legalny — pomijany
    }
  }
  return legal;
}

/**
 * Rozstrzyga wierzchni czar stosu (LIFO): efekty, potem obiekt do graveyard.
 * Zwraca pełny przyrost zdarzeń z rozstrzygnięcia (w tym damage_dealt,
 * stats_modified, token_created), żeby trafiły do strumienia wynikowego komendy
 * i logu UI — nie tylko do state.events.
 */
export function resolveTopOfStack(state) {
  if (state.zones.stack.length === 0) throw new Error('Stos jest pusty');
  const before = state.events.length;
  const stackId = state.zones.stack[state.zones.stack.length - 1];
  const object = state.objects.get(stackId);
  const targetSpec = object.spell.targets ?? [];
  const chosen = object.chosenTargets ?? [];
  const legalTargets = collectLegalTargets(state, targetSpec, chosen).map((entry) => entry.id);
  const fizzled = targetSpec.length > 0 && legalTargets.length === 0;
  if (!fizzled) {
    for (const effect of object.spell.effects) applyEffect(state, effect, object, legalTargets);
  }
  const graveId = `grave-${state.objectSequence++}`;
  moveObjectDirectly(state, stackId, 'graveyard', graveId);
  const resolved = event('spell_resolved', { fromId: stackId, toId: graveId, cardId: object.cardId, controllerId: object.controllerId, fizzled });
  state.events.push(resolved);
  return state.events.slice(before);
}

/**
 * Warianty rzucenia czarów dostępne graczowi (objectId × legalne cele).
 * Dla czarów bezcelowych cele to pusta tablica.
 */
export function legalSpellCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || object.kind !== 'spell' || !object.spell) continue;
    if ((object.manaCost ?? 0) > (player.mana ?? 0)) continue;
    if (object.spell.timing === 'sorcery') {
      const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
      if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
    }
    const targetSpec = object.spell.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    // Obecny desktop: wszystkie specyfikacje celów to pojedynczy 'creature'.
    const candidates = state.zones.battlefield.filter((objectId) => {
      const target = state.objects.get(objectId);
      return target?.kind === 'creature' && target.zone === 'battlefield';
    });
    if (targetSpec.length === 1) {
      for (const targetId of candidates) casts.push({ objectId: id, targets: [targetId] });
    }
  }
  return casts;
}

export { effectivePower, effectiveToughness };
