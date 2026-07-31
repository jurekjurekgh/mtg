import { event } from '../protocol/types.js';
import { dealDamageToPlayer } from './damage.js';

function getCreature(state, id) {
  const object = state.objects.get(id);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nieprawidłowy creature object: ${id}`);
  return object;
}

export function declareAttackers(state, playerId, attackerIds) {
  if (state.turn.phase !== 'combat' || state.turn.step !== 'declare_attackers') throw new Error('Nieprawidłowy krok deklaracji atakujących');
  const attackers = attackerIds.map((id) => getCreature(state, id));
  if (attackers.some((object) => object.controllerId !== playerId || object.tapped)) throw new Error('Nielegalny atakujący');
  state.combat = { attackers: attackerIds.slice(), blockers: new Map() };
  const e = event('attackers_declared', { playerId, attackerIds: attackerIds.slice() });
  state.events.push(e);
  return e;
}

export function declareBlockers(state, playerId, assignments) {
  if (state.turn.phase !== 'combat' || state.turn.step !== 'declare_blockers') throw new Error('Nieprawidłowy krok deklaracji blokujących');
  if (!state.combat) throw new Error('Brak deklaracji atakujących');
  const blockers = new Map();
  for (const [attackerId, blockerIds] of Object.entries(assignments)) {
    if (!state.combat.attackers.includes(attackerId)) throw new Error('Blokowanie nieistniejącego atakującego');
    const ids = blockerIds.map((id) => getCreature(state, id));
    if (ids.some((object) => object.controllerId !== playerId || object.tapped)) throw new Error('Nielegalny blokujący');
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
        const damage = event('damage_dealt', { source: attackerId, target: blockerId, amount: attacker.power ?? 0 });
        state.events.push(damage); events.push(damage);
      }
      if (blockedDamage < 0) throw new Error('Niemożliwe obrażenia combat');
    }
  }
  state.combat = null;
  return events;
}
