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

/**
 * Pola ulotne istniejące wyłącznie w obrębie jednego kroku (np. drawnInStep).
 * Każde przejście kroku musi je wyczyścić — spread poprzedniego turn by je
 * skopiował.
 */
function clearStepVolatiles(turn) {
  const { drawnInStep, ...rest } = turn;
  return rest;
}

export function nextTurnStep(turn, players) {
  const index = turn.stepIndex + 1;
  if (index < TURN_STEPS.length) return clearStepVolatiles({ ...turn, ...TURN_STEPS[index], stepIndex: index, priorityPlayerId: turn.activePlayerId, passes: 0 });
  const active = players.findIndex((p) => p.id === turn.activePlayerId);
  const nextPlayer = players[(active + 1) % players.length].id;
  return clearStepVolatiles({ ...turn, ...TURN_STEPS[0], stepIndex: 0, number: turn.number + 1, activePlayerId: nextPlayer, priorityPlayerId: nextPlayer, passes: 0 });
}

/**
 * Przesuwa automat tury do wskazanego kroku bieżącej tury — używane przez
 * komendy combat, które przechodzą kroki deklaracją zamiast pełną rundą passy.
 * Aktualizuje spójnie phase, step, stepIndex i licznik passów, żeby kolejne
 * pass_priority kontynuowały automat od właściwego miejsca.
 */
export function jumpToStep(turn, stepName, priorityPlayerId = turn.activePlayerId) {
  const index = TURN_STEPS.findIndex((entry) => entry.step === stepName);
  if (index === -1) throw new RangeError(`Nieznany krok tury: ${stepName}`);
  return clearStepVolatiles({ ...turn, ...TURN_STEPS[index], stepIndex: index, priorityPlayerId, passes: 0 });
}
