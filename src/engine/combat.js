import { event } from '../protocol/types.js';
import { dealDamageToPlayer } from './damage.js';
import { markDamage, tapObject } from './permanents.js';
import { runStateBasedActions } from './state-based.js';

function getCreature(state, id) {
  const object = state.objects.get(id);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nieprawidłowy creature object: ${id}`);
  return object;
}

function isLegalAttacker(object, playerId) {
  return object?.controllerId === playerId && object.kind === 'creature' && !object.tapped && !object.summoningSickness;
}

export function declareAttackers(state, playerId, attackerIds) {
  if (state.turn.phase !== 'combat' || state.turn.step !== 'declare_attackers') throw new Error('Nieprawidłowy krok deklaracji atakujących');
  if (state.turn.activePlayerId !== playerId) throw new Error('Nieaktywny gracz nie deklaruje atakujących');
  if (!Array.isArray(attackerIds) || new Set(attackerIds).size !== attackerIds.length) throw new Error('Atakujący nie może wystąpić więcej niż raz');
  const attackers = attackerIds.map((id) => getCreature(state, id));
  if (attackers.some((object) => !isLegalAttacker(object, playerId))) throw new Error('Nielegalny atakujący');
  for (const attacker of attackers) tapObject(state, attacker.id, playerId);
  state.combat = { attackingPlayerId: playerId, attackers: attackerIds.slice(), blockers: new Map() };
  const e = event('attackers_declared', { playerId, attackerIds: attackerIds.slice() });
  state.events.push(e);
  return e;
}

export function declareBlockers(state, playerId, assignments) {
  if (state.turn.phase !== 'combat' || state.turn.step !== 'declare_blockers') throw new Error('Nieprawidłowy krok deklaracji blokujących');
  if (!state.combat) throw new Error('Brak deklaracji atakujących');
  if (state.combat.attackingPlayerId === playerId) throw new Error('Atakujący gracz nie deklaruje blokujących');
  const blockers = new Map();
  const usedBlockers = new Set();
  for (const [attackerId, blockerIds] of Object.entries(assignments)) {
    if (!state.combat.attackers.includes(attackerId)) throw new Error('Blokowanie nieistniejącego atakującego');
    const ids = blockerIds.map((id) => getCreature(state, id));
    if (ids.some((object) => object.controllerId !== playerId || object.tapped)) throw new Error('Nielegalny blokujący');
    if (ids.some((object) => usedBlockers.has(object.id))) throw new Error('Blocker jest użyty więcej niż raz');
    for (const object of ids) usedBlockers.add(object.id);
    blockers.set(attackerId, blockerIds.slice());
  }
  state.combat.blockers = blockers;
  const e = event('blockers_declared', { playerId, assignments });
  state.events.push(e);
  return e;
}

/**
 * Rozstrzyga obrażenia combat. Uproszczenie syntetyczne: atakujący zadaje
 * pełną siłę KAŻDEMU blokującemu zamiast rozdzielać obrażenia w kolejności
 * (CR 510.1c). Zostanie zastąpione, gdy pierwsza karta tego wymaga.
 */
export function resolveCombatDamage(state, defendingPlayerId) {
  if (!state.combat) throw new Error('Brak combat');
  const events = [];
  for (const attackerId of state.combat.attackers) {
    const attacker = getCreature(state, attackerId);
    const blockers = state.combat.blockers.get(attackerId) ?? [];
    if (blockers.length === 0) events.push(...dealDamageToPlayer(state, attackerId, defendingPlayerId, attacker.power ?? 0));
    else {
      for (const blockerId of blockers) {
        const blocker = getCreature(state, blockerId);
        const damageToBlocker = attacker.power ?? 0;
        markDamage(state, blockerId, damageToBlocker);
        const damage = event('damage_dealt', { source: attackerId, target: blockerId, amount: damageToBlocker });
        state.events.push(damage); events.push(damage);
        markDamage(state, attackerId, blocker.power ?? 0);
      }
    }
  }
  events.push(...runStateBasedActions(state));
  state.combat = null;
  return events;
}

/**
 * Ograniczenie enumeracji opcji w PlayerView: kompletne podzbiory podawane
 * są tylko dla małych pul, przy większych planszach widok oferuje warianty
 * pusty/pojedyncze/pełny. Walidacja w execute pozostaje niezależna i pełna.
 */
export const COMBAT_OPTION_CAP = 32;

function boundedSubsets(ids, cap) {
  if (ids.length === 0) return [[]];
  if (2 ** ids.length <= cap) {
    const all = [[]];
    for (const id of ids) {
      const extended = all.map((subset) => [...subset, id]);
      all.push(...extended);
    }
    return all;
  }
  return [[], ...ids.map((id) => [id]), ids.slice()];
}

/** Wszystkie zbiory atakujących, które gracz może teraz legalnie zadeklarować. */
export function legalAttackerOptions(state, playerId, cap = COMBAT_OPTION_CAP) {
  const legal = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (object && object.zone === 'battlefield' && isLegalAttacker(object, playerId)) legal.push(id);
  }
  return boundedSubsets(legal, cap);
}

/** Wszystkie legalne przypisania blokujących dla bieżącego combat. */
export function legalBlockerOptions(state, playerId, cap = COMBAT_OPTION_CAP) {
  const attackers = state.combat?.attackers ?? [];
  const blockers = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (object && object.zone === 'battlefield' && object.controllerId === playerId && object.kind === 'creature' && !object.tapped) blockers.push(id);
  }
  if ((attackers.length + 1) ** blockers.length <= cap) {
    const all = [{}];
    for (const blockerId of blockers) {
      const extended = [];
      for (const assignment of all) {
        for (const attackerId of attackers) {
          extended.push({ ...assignment, [attackerId]: [...(assignment[attackerId] ?? []), blockerId] });
        }
      }
      all.push(...extended);
    }
    return all;
  }
  const options = [{}];
  for (const attackerId of attackers) {
    for (const blockerId of blockers) options.push({ [attackerId]: [blockerId] });
  }
  const free = blockers.slice();
  const greedy = {};
  for (const attackerId of attackers) {
    const blockerId = free.shift();
    if (blockerId === undefined) break;
    greedy[attackerId] = [blockerId];
  }
  if (Object.keys(greedy).length > 0) options.push(greedy);
  return options;
}
