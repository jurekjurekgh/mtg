/** Minimalny automat tury; kolejność jest jawna i testowalna. */
export const TURN_STEPS = Object.freeze([
  Object.freeze({ phase: 'beginning', step: 'untap' }),
  Object.freeze({ phase: 'beginning', step: 'upkeep' }),
  Object.freeze({ phase: 'beginning', step: 'draw' }),
  Object.freeze({ phase: 'precombat_main', step: 'main' }),
  Object.freeze({ phase: 'combat', step: 'beginning_of_combat' }),
  Object.freeze({ phase: 'combat', step: 'declare_attackers' }),
  Object.freeze({ phase: 'combat', step: 'declare_blockers' }),
  Object.freeze({ phase: 'combat', step: 'combat_damage' }),
  Object.freeze({ phase: 'combat', step: 'end_of_combat' }),
  Object.freeze({ phase: 'postcombat_main', step: 'main' }),
  Object.freeze({ phase: 'ending', step: 'end' }),
  Object.freeze({ phase: 'ending', step: 'cleanup' }),
]);

export function initialTurn(playerId) {
  return { number: 1, activePlayerId: playerId, priorityPlayerId: playerId, stepIndex: 0, ...TURN_STEPS[0], passes: 0 };
}

export function nextTurnStep(turn, players) {
  const index = turn.stepIndex + 1;
  if (index < TURN_STEPS.length) return { ...turn, ...TURN_STEPS[index], stepIndex: index, priorityPlayerId: turn.activePlayerId, passes: 0 };
  const active = players.findIndex((p) => p.id === turn.activePlayerId);
  const nextPlayer = players[(active + 1) % players.length].id;
  return { ...turn, ...TURN_STEPS[0], stepIndex: 0, number: turn.number + 1, activePlayerId: nextPlayer, priorityPlayerId: nextPlayer, passes: 0 };
}
