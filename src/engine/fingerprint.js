/**
 * Stabilna, czytelna reprezentacja stanu do porównywania replayów.
 * Nie jest mechanizmem bezpieczeństwa ani skrótem kryptograficznym.
 */
export function stateFingerprint(state) {
  const objects = [...state.objects.values()]
    .map(({ id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, tapped, summoningSickness, damage, powerModifier, toughnessModifier, chosenTargets }) => ({
      id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, tapped, summoningSickness, damage, powerModifier, toughnessModifier, chosenTargets,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const zones = Object.fromEntries(Object.entries(state.zones).map(([zone, ids]) => [zone, [...ids]]));
  const combat = state.combat
    ? {
      attackingPlayerId: state.combat.attackingPlayerId,
      attackers: [...state.combat.attackers],
      blockers: [...state.combat.blockers.entries()].map(([attackerId, blockerIds]) => [attackerId, [...blockerIds]]),
    }
    : null;
  return JSON.stringify({
    seed: state.seed,
    status: state.status,
    winnerId: state.winnerId,
    players: state.players,
    turn: state.turn,
    combat,
    zones,
    objects,
  });
}
