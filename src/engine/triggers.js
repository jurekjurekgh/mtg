import { event } from '../protocol/types.js';
import { applyEffect } from './effects.js';
import { hasCounter } from './counters.js';

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
 *   (np. Kappa Tech-Wrecker). Trigger z `requiresTarget` odpala się tylko,
 *   gdy istnieje legalny cel — to deterministyczna wersja opcjonalnego
 *   „you may" (gdy celu brak, opcja jest odrzucona, licznik zostaje).
 *
 * Świadome ograniczenia (udokumentowane w ENGINE_MILESTONES.md): brak
 * kaskadowania triggerów (efekty jednego triggera nie odpalaają kolejnych
 * w tej samej komendzie) i brak triggera „dies" dla źródła, które w tej
 * samej komendzie opuściło battlefield i nie zostało rozpoznane po toId.
 */

function toEffectList(ability) {
  return Array.isArray(ability?.effect) ? ability.effect : [ability?.effect].filter(Boolean);
}

function isPlayerId(state, id) {
  return state.players.some((p) => p.id === id);
}

/** Znajduje legalny cel triggera; null, gdy brak (trigger nie odpala). */
function findTriggerTarget(state, spec, damagedPlayerId) {
  if (spec?.type === 'artifact_or_enchantment' && spec.controlledBy === 'damaged_player') {
    const id = state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.controllerId === damagedPlayerId
        && (object.kind === 'artifact' || object.kind === 'enchantment');
    });
    return id ?? null;
  }
  return null;
}

/** Czy któryś efekt wymaga zdjęcia licznika ze źródła (warunek odpalenia). */
function requiresCounter(ability, counterName) {
  return toEffectList(ability).some((effect) => effect.type === 'remove_counter' && effect.counter === counterName);
}

function fireTrigger(state, ability, source, targets, events) {
  // Efekty triggera zapisują swoje zdarzenia (life_changed, counter_added,
  // object_moved…) do state.events — zbieramy cały przyrost, żeby trafił
  // też do strumienia wynikowego komendy i logu UI.
  const before = state.events.length;
  for (const effect of toEffectList(ability)) {
    applyEffect(state, effect, source, targets);
  }
  const e = event('ability_triggered', { objectId: source.id, cardId: source.cardId, trigger: ability.trigger?.event });
  state.events.push(e);
  events.push(...state.events.slice(before));
}

/**
 * Przetwarza triggery dla zdarzeń bieżącej komendy; zwraca nowe zdarzenia
 * (i dopisuje je do state.events). Wywoływana PO state-based actions, żeby
 * śmierć w wyniku obrażeń zdążyła wygenerować creature_destroyed.
 */
export function processTriggers(state, recentEvents) {
  const events = [];
  for (const ev of recentEvents) {
    if (ev.type === 'creature_destroyed' || (ev.type === 'object_moved' && ev.fromZone === 'battlefield' && ev.toZone === 'graveyard')) {
      const died = state.objects.get(ev.toId ?? ev.object?.id);
      if (!died) continue;
      for (const ability of died.abilities ?? []) {
        if (ability?.type !== 'triggered' || ability.trigger?.event !== 'dies') continue;
        fireTrigger(state, ability, died, [], events);
      }
    }
    if (ev.type === 'damage_dealt' && isPlayerId(state, ev.target)) {
      const source = state.objects.get(ev.source);
      // Uproszczenie: źródło musi wciąż być na bitwisku (trigger „z grobu"
      // dla źródła, które zginęło w tej samej komendzie, nie jest obsługiwany).
      if (!source || source.zone !== 'battlefield') continue;
      for (const ability of source.abilities ?? []) {
        if (ability?.type !== 'triggered' || ability.trigger?.event !== 'combat_damage_to_player') continue;
        const trigger = ability.trigger ?? {};
        if (trigger.requiresTarget) {
          const targetId = findTriggerTarget(state, trigger.requiresTarget, ev.target);
          if (!targetId) continue;
          if (requiresCounter(ability, 'deathtouch') && !hasCounter(source, 'deathtouch')) continue;
          fireTrigger(state, ability, source, [targetId], events);
          continue;
        }
        fireTrigger(state, ability, source, [], events);
      }
    }
  }
  if (events.length > 0) state.events.push(...events);
  return events;
}
