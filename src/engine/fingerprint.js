/**
 * Stabilna, czytelna reprezentacja stanu do porównywania replayów.
 * Nie jest mechanizmem bezpieczeństwa ani skrótem kryptograficznym.
 */
export function stateFingerprint(state) {
  const objects = [...state.objects.values()]
    .map(({ id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, plot, plotted, tapped, summoningSickness, damage, powerModifier, toughnessModifier, chosenTargets, counters, faceDown, keywords, keywordGrants, abilityGrants, typeGrant, subtypes, transformTo, untapLockedBy, types, entersTapped, attachedTo, baseKind, bestow, aura, equipment, backup, colors, phyrexianManaCost, goaded, hexproofUntilTurn }) => ({
      id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, plot, plotted, tapped, summoningSickness, damage, powerModifier, toughnessModifier, chosenTargets,
      abilities: abilities ?? [],
      counters: { ...(counters ?? {}) }, faceDown: Boolean(faceDown),
      keywords: [...(keywords ?? [])], keywordGrants: [...(keywordGrants ?? [])], abilityGrants: abilityGrants ?? [], typeGrant: typeGrant ? { subtypes: [...typeGrant.subtypes] } : null, subtypes: [...(subtypes ?? [])],
      types: [...(types ?? [])], entersTapped: Boolean(entersTapped),
      attachedTo: attachedTo ?? null, baseKind: baseKind ?? null,
      bestow: bestow ? { cost: bestow.cost } : null,
      aura: aura ? { keywords: [...(aura.keywords ?? [])] } : null,
      equipment: equipment ? { equip: equipment.equip } : null,
      backup: backup ? { counters: backup.counters } : null,
      transformTo: transformTo ? { cardId: transformTo.cardId, power: transformTo.power, toughness: transformTo.toughness } : null,
      untapLockedBy: [...(untapLockedBy ?? [])],
      colors: [...(colors ?? [])], phyrexianManaCost: phyrexianManaCost ?? 0,
      goaded: Boolean(goaded), hexproofUntilTurn: hexproofUntilTurn ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const zones = Object.fromEntries(Object.entries(state.zones).map(([zone, ids]) => [zone, [...ids]]));
  const combat = state.combat
    ? {
      attackingPlayerId: state.combat.attackingPlayerId,
      attackers: [...state.combat.attackers],
      blockers: [...state.combat.blockers.entries()].map(([attackerId, blockerIds]) => [attackerId, [...blockerIds]]),
      blockedAttackers: [...(state.combat.blockedAttackers ?? [])],
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
    pendingScry: state.pendingScry ? { playerId: state.pendingScry.playerId, objectIds: [...state.pendingScry.objectIds] } : null,
    pendingSurveil: state.pendingSurveil ? { playerId: state.pendingSurveil.playerId, objectIds: [...state.pendingSurveil.objectIds] } : null,
    pendingSpell: state.pendingSpell ? { stackId: state.pendingSpell.stackId, effects: (state.pendingSpell.effects ?? []).length } : null,
    pendingClash: state.pendingClash ? {
      choices: [...state.pendingClash.choices],
      cards: { ...state.pendingClash.cards },
      won: state.pendingClash.won,
    } : null,
    initiativePlayerId: state.initiativePlayerId ?? null,
    undercityProgress: { ...(state.undercityProgress ?? {}) },
    descendedThisTurn: { ...(state.descendedThisTurn ?? {}) },
    delayedTriggers: (state.delayedTriggers ?? []).map((entry) => ({ ...entry })),
    pendingBackups: (state.pendingBackups ?? []).map((pending) => ({
      playerId: pending.playerId, sourceId: pending.sourceId, counters: pending.counters,
    })),
  });
}
