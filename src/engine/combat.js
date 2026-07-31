import { event } from '../protocol/types.js';
import { dealDamageToPlayer } from './damage.js';
import { markDamage, tapObject } from './permanents.js';
import { runStateBasedActions } from './state-based.js';

function getCreature(state, id) {
  const object = state.objects.get(id);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nieprawidłowy creature object: ${id}`);
  return object;
}

export function declareAttackers(state, playerId, attackerIds) {
  if (state.turn.phase !== 'combat' || state.turn.step !== 'declare_attackers') throw new Error('Nieprawidłowy krok deklaracji atakujących');
  if (state.turn.activePlayerId !== playerId) throw new Error('Nieaktywny gracz nie deklaruje atakujących');
  if (!Array.isArray(attackerIds) || new Set(attackerIds).size !== attackerIds.length) throw new Error('Atakujący nie może wystąpić więcej niż raz');
  const attackers = attackerIds.map((id) => getCreature(state, id));
  if (attackers.some((object) => object.controllerId !== playerId || object.tapped || object.summoningSickness)) throw new Error('Nielegalny atakujący');
  for (const attacker of attackers) tapObject(state, attacker.id, playerId);
  state.combat = { attackers: attackerIds.slice(), blockers: new Map() };
  const e = event('attackers_declared', { playerId, attackerIds: attackerIds.slice() });
  state.events.push(e);
  return e;
}

export function declareBlockers(state, playerId, assignments) {
  if (state.turn.phase !== 'combat' || state.turn.step !== 'declare_blockers') throw new Error('Nieprawidłowy krok deklaracji blokujących');
  if (!state.combat) throw new Error('Brak deklaracji atakujących');
  const attackingPlayer = state.objects.get(state.combat.attackers[0])?.controllerId;
  if (attackingPlayer === playerId) throw new Error('Atakujący gracz nie deklaruje blokujących');
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

export function resolveCombatDamage(state, defendingPlayerId) {
  if (!state.combat) throw new Error('Brak combat');
  const events = [];
  for (const attackerId of state.combat.attackers) {
    const attacker = getCreature(state, attackerId);
    const blockers = state.combat.blockers.get(attackerId) ?? [];
    const blockedDamage = blockers.reduce((total, id) => total + (getCreature(state, id).power ?? 0), 0);
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
      if (blockedDamage < 0) throw new Error('Niemożliwe obrażenia combat');
    }
  }
  events.push(...runStateBasedActions(state));
  state.combat = null;
  return events;
}
