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
 *   (Kappa Tech-Wrecker); `requiresTarget` daje deterministyczną wersję
 *   opcjonalnego „you may" (gdy celu brak, opcja jest odrzucona);
 * - `enter_battlefield` — permanent wchodzi na bitwisko (Zoraline);
 * - `attacks` — stwór zostaje zadeklarowany jako atakujący (Zoraline);
 * - `bat_attacks` — „whenever a Bat you control attacks" (tribał Zoraline);
 * - `upkeep` — początek kroku upkeep z warunkiem na liczbę czarów
 *   w poprzedniej turze (transform wilkołaków).
 *
 * Opcjonalny koszt triggera: `payMana` / `payLife` w deskryptorze — trigger
 * odpala się tylko, gdy kontroler może zapłacić (deterministyczne „you may").
 */

function toEffectList(ability) {
  return Array.isArray(ability?.effect) ? ability.effect : [ability?.effect].filter(Boolean);
}

function isPlayerId(state, id) {
  return state.players.some((p) => p.id === id);
}

/** Czy warunek triggera (np. „no spells were cast last turn") jest spełniony. */
function conditionHolds(trigger, state) {
  const condition = trigger?.condition ?? {};
  if (condition.noSpellsLastTurn) return state.lastTurnSpellsCast === 0;
  if (condition.minSpellsLastTurn != null) return state.lastTurnSpellsCast >= condition.minSpellsLastTurn;
  return true;
}

/** Czy kontroler triggera może opłacić opcjonalny koszt (mana / życie). */
function canPayTrigger(state, controllerId, trigger) {
  const player = state.players.find((p) => p.id === controllerId);
  if (!player) return false;
  if ((trigger?.payMana ?? 0) > (player.mana ?? 0)) return false;
  // Płatność życia może zejść do 0, ale nie poniżej (CR 118.4).
  if ((trigger?.payLife ?? 0) > player.life) return false;
  return true;
}

/** Znajduje legalny cel triggera; null, gdy brak (trigger nie odpala). */
function findTriggerTarget(state, spec, sourceObject, damagedPlayerId) {
  if (!spec) return null;
  if (spec.type === 'artifact_or_enchantment' && spec.controlledBy === 'damaged_player') {
    const id = state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.controllerId === damagedPlayerId
        && (object.kind === 'artifact' || object.kind === 'enchantment');
    });
    return id ?? null;
  }
  if (spec.type === 'permanent_card_in_graveyard' && spec.controlledBy === 'controller') {
    const id = state.zones.graveyard.find((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.controllerId !== sourceObject.controllerId) return false;
      if (object.kind === 'land' || object.kind === 'spell') return false;
      return (object.manaCost ?? 0) <= (spec.maxManaValue ?? Number.POSITIVE_INFINITY);
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

/** Odpala trigger z opcjonalnym kosztem; zwraca true, gdy się odpalił. */
function tryFire(state, ability, source, targets, events, extra = {}) {
  const trigger = ability?.trigger ?? {};
  if (ability?.type !== 'triggered') return false;
  if (!conditionHolds(trigger, state)) return false;
  if (trigger.requiresTarget) {
    const targetId = findTriggerTarget(state, trigger.requiresTarget, source, extra.damagedPlayerId);
    if (!targetId) return false;
    if (requiresCounter(ability, 'deathtouch') && !hasCounter(source, 'deathtouch')) return false;
    if (!canPayTrigger(state, source.controllerId, trigger)) return false;
    fireTrigger(state, ability, source, [targetId], events);
    return true;
  }
  if (!canPayTrigger(state, source.controllerId, trigger)) return false;
  fireTrigger(state, ability, source, [], events);
  return true;
}

/**
 * Przetwarza triggery dla zdarzeń bieżącej komendy; zwraca nowe zdarzenia
 * (i dopisuje je do state.events). Wywoływana PO state-based actions, żeby
 * śmierć w wyniku obrażeń zdążyła wygenerować creature_destroyed.
 */
export function processTriggers(state, recentEvents) {
  const events = [];
  for (const ev of recentEvents) {
    if (ev.type === 'creature_destroyed') {
      // Finality (exile) NIE uruchamia triggera „dies".
      if (ev.toZone === 'exile') continue;
      const died = state.objects.get(ev.toId);
      if (!died) continue;
      for (const ability of died.abilities ?? []) {
        if (ability?.trigger?.event === 'dies') fireTrigger(state, ability, died, [], events);
      }
    }
    if (ev.type === 'object_moved' && ev.fromZone === 'battlefield' && ev.toZone === 'graveyard') {
      const died = state.objects.get(ev.object?.id);
      if (!died) continue;
      for (const ability of died.abilities ?? []) {
        if (ability?.trigger?.event === 'dies') fireTrigger(state, ability, died, [], events);
      }
    }
    if (ev.type === 'damage_dealt' && isPlayerId(state, ev.target)) {
      const source = state.objects.get(ev.source);
      // Uproszczenie: źródło musi wciąż być na bitwisku (trigger „z grobu"
      // dla źródła, które zginęło w tej samej komendzie, nie jest obsługiwany).
      if (!source || source.zone !== 'battlefield') continue;
      for (const ability of source.abilities ?? []) {
        if (ability?.trigger?.event === 'combat_damage_to_player') {
          tryFire(state, ability, source, [], events, { damagedPlayerId: ev.target });
        }
      }
    }
    // Wejście na bitwisko (zagranie z ręki lub powrót z grobu).
    if (ev.type === 'permanent_cast' || (ev.type === 'object_moved' && ev.toZone === 'battlefield')) {
      const entered = state.objects.get(ev.object?.id);
      if (!entered) continue;
      for (const ability of entered.abilities ?? []) {
        if (ability?.trigger?.event === 'enter_battlefield') tryFire(state, ability, entered, [], events);
      }
    }
    // Deklaracja atakujących: triggery „attacks" (na atakującym) i tribał
    // „bat_attacks" (na kontrolowanych permanentach — np. Zoraline).
    if (ev.type === 'attackers_declared') {
      for (const attackerId of ev.attackerIds ?? []) {
        const attacker = state.objects.get(attackerId);
        if (!attacker || attacker.zone !== 'battlefield') continue;
        for (const ability of attacker.abilities ?? []) {
          if (ability?.trigger?.event === 'attacks') tryFire(state, ability, attacker, [], events);
        }
        if ((attacker.subtypes ?? []).includes('Bat')) {
          for (const object of state.objects.values()) {
            if (object.zone !== 'battlefield' || object.controllerId !== attacker.controllerId) continue;
            for (const ability of object.abilities ?? []) {
              if (ability?.trigger?.event === 'bat_attacks') tryFire(state, ability, object, [], events);
            }
          }
        }
      }
    }
    // Początek upkeepu: triggery z warunkiem na liczbę czarów w poprzedniej
    // turze (transform wilkołaków).
    if (ev.type === 'step_advanced' && ev.step === 'upkeep') {
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield') continue;
        for (const ability of object.abilities ?? []) {
          if (ability?.trigger?.event === 'upkeep') tryFire(state, ability, object, [], events);
        }
      }
    }
  }
  if (events.length > 0) state.events.push(...events);
  return events;
}
