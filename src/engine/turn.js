/** Minimalny automat tury; kolejność jest jawna i testowalna. */
export const TURN_STEPS = Object.freeze([
  Object.freeze({ phase: 'beginning', step: 'untap' }),
  Object.freeze({ phase: 'beginning', step: 'upkeep' }),
  Object.freeze({ phase: 'beginning', step: 'draw' }),
  Object.freeze({ phase: 'precombat_main', step: 'main1' }),
  Object.freeze({ phase: 'combat', step: 'beginning_of_combat' }),
  Object.freeze({ phase: 'combat', step: 'declare_attackers' }),
  Object.freeze({ phase: 'combat', step: 'declare_blockers' }),
  Object.freeze({ phase: 'combat', step: 'combat_damage' }),
  Object.freeze({ phase: 'combat', step: 'end_of_combat' }),
  Object.freeze({ phase: 'postcombat_main', step: 'main2' }),
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
  // M200/L (CR 514.2): turewcze ograniczenie zakazu blokowania (Ruthless
  // Invasion) wygasa z nową turą — obiekt tury jest rozprzestrzeniany
  // (powyżej), więc zerujemy je tutaj, w jedynym punkcie tworzenia tury.
  return clearStepVolatiles({ ...turn, ...TURN_STEPS[0], stepIndex: 0, number: turn.number + 1, activePlayerId: nextPlayer, priorityPlayerId: nextPlayer, passes: 0, cantBlockRestrictions: undefined });
}

/**
 * Przesuwa automat tury do wskazanego kroku bieżącej tury — używane przez
 * komendy combat, które przechodzą kroki deklaracją zamiast pełną rundą passy.
 * Aktualizuje spójnie phase, step, stepIndex i licznik passów, żeby kolejne
 * pass_priority kontynuowały automat od właściwego miejsca.
 */
export function jumpToStep(turn, stepName, priorityPlayerId = turn.activePlayerId) {
  // M212/3 (uwaga właściciela): obie fazy główne nazywały się `main`, więc
  // `findIndex` zawsze trafiał w PIERWSZĄ — do drugiej fazy głównej nie dało
  // się skoczyć w ogóle (cichy błąd: skok „do main2" cofał turę do main1).
  // Kroki nazywają się teraz `main1`/`main2`; samo `main` zostaje aliasem
  // zgodności: rozwiązuje się na fazę główną WŁAŚCIWĄ dla bieżącego miejsca
  // w turze (po combacie → main2), a nie na pierwszą z brzegu.
  const wanted = stepName === 'main'
    ? (TURN_STEPS[turn.stepIndex ?? 0]?.phase === 'postcombat_main'
      || (turn.stepIndex ?? 0) >= TURN_STEPS.findIndex((entry) => entry.step === 'end_of_combat')
      ? 'main2' : 'main1')
    : stepName;
  const index = TURN_STEPS.findIndex((entry) => entry.step === wanted);
  if (index === -1) throw new RangeError(`Nieznany krok tury: ${stepName}`);
  return clearStepVolatiles({ ...turn, ...TURN_STEPS[index], stepIndex: index, priorityPlayerId, passes: 0 });
}

/**
 * M212/3: czy krok jest FAZĄ GŁÓWNĄ (dowolną z dwóch). Kod pytający „czy
 * wolno zagrać land / rzucić czar sorcery-speed" interesuje się rodzajem
 * kroku, nie tym, która to faza główna — bez tego pomocnika każde miejsce
 * musiałoby wypisywać `step === 'main1' || step === 'main2'` i o którymś
 * z nich prędzej czy później ktoś zapomni (klasa L14: dwie kopie reguły).
 */
export function isMainStep(step) {
  return step === 'main1' || step === 'main2';
}
