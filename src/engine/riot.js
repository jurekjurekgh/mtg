import { event } from '../protocol/types.js';
import { addCounter } from './counters.js';

// Audyt PR #168/A-2 — CR 702.136a: riot to statyczny efekt zastępujący WEJŚCIE,
// nie zdolność wyzwalana po wejściu. Tryby są wspólnymi danymi dla silnika
// i bota (L41), a nie regułą zakodowaną po nazwie karty (ADR 0002).
export const RIOT_MODES = Object.freeze([
  Object.freeze({ name: 'Licznik +1/+1', targets: Object.freeze([]),
    effects: Object.freeze([Object.freeze({ type: 'add_counter', counter: '+1/+1', amount: 1 })]) }),
  Object.freeze({ name: 'Pośpiech (haste)', targets: Object.freeze([]),
    effects: Object.freeze([Object.freeze({ type: 'grant_keyword_permanent', keyword: 'haste' })]) }),
]);

/** Każde wystąpienie riot daje osobny wybór; zakrycie/strip je usuwa. */
export function riotCountOf(object) {
  if (!object || object.faceDown || object.abilitiesStripped
    || (object.kind !== 'creature' && !(object.types ?? []).includes('Creature'))) return 0;
  return (object.keywords ?? []).filter((keyword) => keyword === 'riot').length;
}

/**
 * Wstrzymuje operację jeszcze przed przesunięciem stwora na pole bitwy.
 * `continuation` jest zwykłym serializowalnym opisem (odcisk/replay), NIE
 * zamknięciem/wywołaniem kart po nazwie. Wznowienie obsługuje game-state.js.
 */
export function queueRiotEntry(state, object, continuation) {
  const count = riotCountOf(object);
  if (count === 0) return false;
  const playerId = continuation.playerId ?? object.controllerId;
  state.pendingRiotChoice = {
    ...continuation, playerId, cardId: object.cardId, sourceId: object.id,
    count, choices: [], restorePriorityTo: continuation.restorePriorityTo ?? state.turn.priorityPlayerId,
  };
  state.turn.priorityPlayerId = playerId;
  state.events.push(event('riot_choice_required', {
    playerId, sourceId: object.id, cardId: object.cardId, count,
  }));
  return true;
}

export function validRiotChoices(object, choices) {
  const count = riotCountOf(object);
  return Array.isArray(choices) && choices.length === count
    && choices.every((index) => Number.isInteger(index) && index >= 0 && index < RIOT_MODES.length);
}

/**
 * Zmienia JUŻ utworzony obiekt pola bitwy, zanim JAKIKOLWIEK event wejścia
 * ujawni go graczom / triggerom i zanim zadziałają SBA. Jedna implementacja
 * dla rzutu, reanimacji i wejść z innych stref (L41).
 */
export function applyRiotOnEntry(state, permanentId, choices, fromId) {
  if (!choices?.length) return state.objects.get(permanentId);
  const object = state.objects.get(permanentId);
  state.events.push(event('riot_choice_resolved', {
    playerId: object.controllerId, sourceId: fromId, cardId: object.cardId, choices: [...choices],
  }));
  const granted = choices.flatMap((index) => RIOT_MODES[index].effects
    .filter((effect) => effect.type === 'grant_keyword_permanent').map((effect) => effect.keyword));
  if (granted.length) {
    state.objects.set(permanentId, Object.freeze({
      ...object, keywordGrants: Object.freeze([...new Set([...(object.keywordGrants ?? []), ...granted])]),
    }));
  }
  for (const index of choices) {
    for (const effect of RIOT_MODES[index].effects) {
      if (effect.type === 'add_counter') addCounter(state, permanentId, effect.counter, effect.amount);
    }
  }
  return state.objects.get(permanentId);
}

/**
 * Wspólna bramka dla jednoobiektowych efektów „put onto battlefield".
 * Efekt odtwarzamy po wyborze z tym samym opisem i dodatkowymi `riotChoice`;
 * dla zwykłych kart nic się nie zmienia. Nie wolno używać dla efektu, który
 * przed wejściem wykonał już nieodwracalne działania (np. odsłonił N kart).
 */
export function riotForEffectEntry(state, object, effect, sourceObject, targets, context = {}, enteringControllerId = object?.controllerId) {
  if (riotCountOf(object) === 0) return { pending: false, choices: null };
  if (context.riotChoice?.sourceId === object.id) {
    if (!validRiotChoices(object, context.riotChoice.choices)) throw new Error('Nieprawidłowy wybór riot przy efekcie');
    return { pending: false, choices: context.riotChoice.choices };
  }
  queueRiotEntry(state, object, {
    entryKind: 'effect', playerId: enteringControllerId, fromZone: object.zone,
    effect, sourceObject, targets: [...(targets ?? [])], context,
  });
  return { pending: true, choices: null };
}
