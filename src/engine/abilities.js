import { event } from '../protocol/types.js';
import { tapObject } from './permanents.js';
import { spendMana } from './resources.js';
import { applyEffect } from './effects.js';

/**
 * Framework activated / triggered / static abilities.
 *
 * Część danych (definicje zdolności, deskryptory) jest we frameworku,
 * a część wykonawcza (aktywacja w stanie gry) tu. Typy zdolności i fabryki
 * definicji pozostają wielokrotnego użytku; efekt zdolności używa tego samego
 * deskryptora co czary (damage / pump / create_token), więc interpretację
 * zapewnia wspólny `applyEffect`.
 */
export const ABILITY_TYPE = Object.freeze({ activated: 'activated', triggered: 'triggered', static: 'static' });

export function createAbility({ type, cost = null, effect, trigger }) {
  if (!Object.values(ABILITY_TYPE).includes(type)) throw new TypeError('Nieprawidłowy typ zdolności');
  return Object.freeze({ type, cost: cost ? Object.freeze({ ...cost }) : null, effect: Object.freeze(effect ?? {}), trigger: trigger ? Object.freeze(trigger) : null });
}

export function isActivated(ability) { return ability?.type === ABILITY_TYPE.activated; }
export function isTriggered(ability) { return ability?.type === ABILITY_TYPE.triggered; }
export function isStatic(ability) { return ability?.type === ABILITY_TYPE.static; }

/**
 * Legalne aktywacje dla gracza: każda zdolność aktywowana na kontrolowanym
 * permanencie, której koszt da się opłacić. Zwraca { objectId, abilityIndex, ability }.
 */
export function legalActivatedAbilities(state, playerId) {
  const out = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
      const ability = object.abilities[index];
      if (ability?.type !== ABILITY_TYPE.activated) continue;
      if (ability.cost?.tap && object.tapped) continue;
      if ((ability.cost?.mana ?? 0) > (state.players.find((p) => p.id === playerId)?.mana ?? 0)) continue;
      out.push({ objectId: id, abilityIndex: index, ability });
    }
  }
  return out;
}

/**
 * Aktywuje zdolność: płaci koszt (tap / mana) i wykonuje efekt na sobie
 * (lub na jawnych celach, gdy deskryptor je niesie). Rzuca błąd przy
 * nielegalnym obiekcie lub nieopłacalnym koszcie — execute zamienia go na
 * maszynowe odrzucenie.
 */
export function activateAbility(state, playerId, objectId, abilityIndex) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) throw new Error('Nielegalny obiekt zdolności');
  const ability = (object.abilities ?? [])[abilityIndex];
  if (!ability || ability.type !== ABILITY_TYPE.activated) throw new Error('Nieznana zdolność aktywowana');

  const cost = ability.cost ?? {};
  if (cost.tap) {
    tapObject(state, objectId, playerId);
  }
  if ((cost.mana ?? 0) > 0) {
    spendMana(state, playerId, cost.mana);
  }

  // Bez jawnej listy celów zdolność działa na samym permanencie (np. {T}: +1/+1).
  const targets = Array.isArray(ability.effect?.targets) ? ability.effect.targets : [objectId];
  applyEffect(state, ability.effect, object, targets);
  const activated = event('ability_activated', { playerId, objectId, abilityIndex });
  state.events.push(activated);
  return activated;
}
