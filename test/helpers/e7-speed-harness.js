// Wspólny harness testów E7 dla klasy Start Your Engines / speed.
// Syntetyki budujemy z ORACLE (gameObjectDataOf) — zero nazwanych kart
// w asercjach (ADR 0002 / ADR 0029).
import { addObject, playerView, execute } from '../../src/engine/game-state.js';
import { addMana } from '../../src/engine/resources.js';
import { gameObjectDataOf } from '../../src/cards/materialize.js';
import { jumpToStep } from '../../src/engine/turn.js';

export function putStartEnginesCreature(state, registry, controllerId) {
  const def = registry.get('glitch-ghost-surveyor');
  const id = `se-${state.objectSequence++}`;
  addObject(state, {
    id, instanceId: `i-${id}`,
    cardId: 'glitch-ghost-surveyor', controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types ?? [], subtypes: def.subtypes ?? [], abilities: def.abilities ?? [],
    keywords: [...(def.keywords ?? []), 'haste'],
  });
  return state.objects.get(id);
}

// Atak bez bloku → combat damage w obrońcę (utrata życia) → trigger klasy
// „whenever one or more creatures you control deal combat damage to a player”.
export function attackWithCreatureForLifeLoss(state, attackerId, defenderId) {
  const attacker = state.objects.get(attackerId);
  const controllerId = attacker.controllerId;
  state.turn = jumpToStep(state.turn, 'declare_attackers', controllerId);
  state.turn.activePlayerId = controllerId;
  state.turn.priorityPlayerId = controllerId;
  state.turn.passes = 0;
  if (!execute(state, { type: 'declare_attackers', playerId: controllerId, attackerIds: [attackerId] }).ok) return false;
  execute(state, { type: 'pass_priority', playerId: controllerId }); // D: okno po deklaracji (CR 508.2)
  execute(state, { type: 'pass_priority', playerId: defenderId });
  execute(state, { type: 'declare_blockers', playerId: defenderId, assignments: {} });
  execute(state, { type: 'pass_priority', playerId: defenderId });
  const r = execute(state, { type: 'resolve_combat', playerId: controllerId, defendingPlayerId: defenderId });
  return Boolean(r?.ok);
}
