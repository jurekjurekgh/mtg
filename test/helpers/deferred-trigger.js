// Etap F (PR #135, CR 603.5): zdolności wyzwalane z wyborem „may" / „you may
// pay" / „unless" idą na stos ZAWSZE, a wybór zapada przy ich rozstrzyganiu.
// Testy, które dotąd oczekiwały decyzji w chwili odpalenia, najpierw
// rozstrzygają stos aż do pojawienia się tej decyzji.
import { execute } from '../../src/engine/game-state.js';

/**
 * Passuje priorytet (rundy passów rozstrzygają wierzch stosu), aż `until(state)`
 * zwróci prawdę, stos się opróżni albo pass zostanie odrzucony. Warunek jest
 * sprawdzany PRZED każdym passem — pass przy otwartym „you may" oznacza odmowę
 * (F1), więc helper nigdy nie passuje ponad decyzję. Zwraca `until(state)`.
 */
export function resolveUntilDecision(state, until, max = 16) {
  for (let i = 0; i < max; i += 1) {
    if (until(state)) return true;
    if (state.zones.stack.length === 0) break;
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
  return Boolean(until(state));
}

export const optionalPayOpen = (state) => Boolean(state.pendingOptionalPay);
export const optionalTriggerOpen = (state) => Boolean(state.pendingOptionalTrigger);
export const payOrSacrificeOpen = (state) => Boolean(state.pendingPayOrSacrifice);
export const triggerTargetOpen = (state) => (state.pendingTriggerTargets?.length ?? 0) > 0;
