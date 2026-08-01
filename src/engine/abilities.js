import { event } from '../protocol/types.js';
import { tapObject } from './permanents.js';
import { spendMana } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { addCounter } from './counters.js';
import { applyEffect } from './effects.js';

/**
 * Framework activated / triggered / static abilities.
 *
 * Część danych (definicje zdolności, deskryptory) jest we frameworku,
 * a część wykonawcza (aktywacja w stanie gry) tu. Typy zdolności i fabryki
 * definicji pozostają wielokrotnego użytku; efekt zdolności używa tego samego
 * deskryptora co czary (damage / pump / create_token / gain_life / liczniki),
 * więc interpretację zapewnia wspólny `applyEffect`.
 */
export const ABILITY_TYPE = Object.freeze({ activated: 'activated', triggered: 'triggered', static: 'static' });

export function createAbility({ type, cost = null, effect, trigger, keyword = null }) {
  if (!Object.values(ABILITY_TYPE).includes(type)) throw new TypeError('Nieprawidłowy typ zdolności');
  const effects = Array.isArray(effect)
    ? Object.freeze(effect.map((entry) => Object.freeze({ ...entry })))
    : Object.freeze(effect ?? {});
  return Object.freeze({
    type,
    keyword: keyword ?? null,
    cost: cost ? Object.freeze({ ...cost }) : null,
    effect: effects,
    trigger: trigger ? Object.freeze(trigger) : null,
  });
}

export function isActivated(ability) { return ability?.type === ABILITY_TYPE.activated; }
export function isTriggered(ability) { return ability?.type === ABILITY_TYPE.triggered; }
export function isStatic(ability) { return ability?.type === ABILITY_TYPE.static; }

/**
 * Legalne aktywacje dla gracza: każda zdolność aktywowana na kontrolowanym
 * permanencie, której koszt da się opłacić. Zwraca { objectId, abilityIndex, ability }.
 *
 * Dwa szczególne przypadki:
 * - **Ninjutsu** — zdolność aktywowana karty w RĘCE; dostępna w oknie combat
 *   (krok combat_damage, przed rozstrzygnięciem), gdy gracz kontroluje
 *   nieblokowanego atakującego. Zwraca dodatkowo `attackerId` do zwrotu.
 * - **Megamorph** — zdolność aktywowana face-down permanentu (obrócenie
 *   twarzą do góry za koszt megamorph); wpięta w obiekt przy zagraniu
 *   twarzą w dół (resources.castPermanent).
 */
export function legalActivatedAbilities(state, playerId) {
  const out = [];
  const player = state.players.find((p) => p.id === playerId);
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
      const ability = object.abilities[index];
      if (ability?.type !== ABILITY_TYPE.activated) continue;
      // Ninjutsu działa wyłącznie z ręki — na bitwisku nie ma czego aktywować.
      if (ability.keyword === 'ninjutsu') continue;
      // Megamorph (obrócenie twarzą do góry) działa tylko, póki permanent
      // leży twarzą w dół; po obrocie zdolność wygasa.
      if (ability.keyword === 'megamorph' && !object.faceDown) continue;
      if (ability.cost?.tap && object.tapped) continue;
      if ((ability.cost?.mana ?? 0) > (player?.mana ?? 0)) continue;
      out.push({ objectId: id, abilityIndex: index, ability });
    }
  }
  const ninjutsuWindow = state.turn.step === 'combat_damage' && state.combat
    && state.turn.activePlayerId === playerId && state.turn.priorityPlayerId === playerId;
  if (ninjutsuWindow) {
    const unblocked = state.combat.attackers.filter((id) => {
      const object = state.objects.get(id);
      return object?.controllerId === playerId && !state.combat.blockers.has(id);
    });
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId !== playerId || object.kind !== 'creature') continue;
      for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
        const ability = object.abilities[index];
        if (ability?.type !== ABILITY_TYPE.activated || ability.keyword !== 'ninjutsu') continue;
        if ((ability.cost?.mana ?? 0) > (player?.mana ?? 0)) continue;
        for (const attackerId of unblocked) out.push({ objectId: id, abilityIndex: index, attackerId });
      }
    }
  }
  return out;
}

/**
 * Aktywuje zdolność: płaci koszt (tap / mana) i wykonuje efekt na sobie
 * (lub na jawnych celach, gdy deskryptor je niesie). Rzuca błąd przy
 * nielegalnym obiekcie lub nieopłacalnym koszcie — execute zamienia go na
 * maszynowe odrzucenie. `attackerId` jest wymagany wyłącznie dla Ninjutsu.
 */
export function activateAbility(state, playerId, objectId, abilityIndex, attackerId) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId) throw new Error('Nielegalny obiekt zdolności');
  const ability = (object.abilities ?? [])[abilityIndex];
  if (!ability || ability.type !== ABILITY_TYPE.activated) throw new Error('Nieznana zdolność aktywowana');

  if (ability.keyword === 'ninjutsu') {
    return activateNinjutsu(state, playerId, object, abilityIndex, ability, attackerId);
  }

  if (object.zone !== 'battlefield') throw new Error('Zdolność wymaga permanenta na bitwisku');
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

/**
 * Ninjutsu: wróć nieblokowanego atakującego do ręki właściciela, a kartę
 * z ręki połóż na battlefield zatapniętą i atakującą (CR 702.48 w minimalnym
 * wymiarze: okno aktywacji to krok combat_damage przed rozstrzygnięciem).
 */
function activateNinjutsu(state, playerId, cardObject, abilityIndex, ability, attackerId) {
  if (cardObject.zone !== 'hand') throw new Error('Ninjutsu aktywuje się z ręki');
  if (state.turn.step !== 'combat_damage' || !state.combat || state.turn.activePlayerId !== playerId || state.turn.priorityPlayerId !== playerId) {
    throw new Error('Ninjutsu tylko w oknie combat po blokach');
  }
  const attacker = state.objects.get(attackerId);
  if (!attacker || attacker.zone !== 'battlefield' || attacker.controllerId !== playerId || attacker.kind !== 'creature') {
    throw new Error('Nielegalny atakujący do ninjutsu');
  }
  if (!state.combat.attackers.includes(attackerId) || state.combat.blockers.has(attackerId)) {
    throw new Error('Ninjutsu wymaga nieblokowanego atakującego');
  }
  spendMana(state, playerId, ability.cost?.mana ?? 0);
  // Atakujący znika z combat PRZED zmianą strefy, żeby inwariant combat
  // (odwołania tylko do battlefield) był spełniony w trakcie ruchu.
  state.combat.attackers = state.combat.attackers.filter((id) => id !== attackerId);
  const handId = `hand-${state.objectSequence++}`;
  moveObjectDirectly(state, attackerId, 'hand', handId);
  const bfId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, cardObject.id, 'battlefield', bfId);
  const permanent = Object.freeze({ ...moved, tapped: true, summoningSickness: true });
  state.objects.set(bfId, permanent);
  state.combat.attackers.push(bfId);
  if (permanent.entersWithCounters) {
    for (const [name, amount] of Object.entries(permanent.entersWithCounters)) {
      addCounter(state, bfId, name, amount);
    }
  }
  const activated = event('ability_activated', { playerId, objectId: cardObject.id, abilityIndex, attackerId });
  state.events.push(activated);
  return activated;
}
