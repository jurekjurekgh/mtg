import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute } from '../src/engine/game-state.js';

// M101/A (CR 504.1): dobranie w kroku dobierania jest akcją turową, więc
// deck-out zdarza się SAM — gracz nie musi (i nie może) klikać „Dobierz kartę".
// CR 104.3c: przegrywa gracz, który próbuje dobrać z pustej biblioteki.

test('dobieranie z pustej biblioteki kończy partię przegraną aktywnego gracza', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Obie biblioteki są puste. CR 103.7a zwalnia z dobierania TYLKO gracza
  // rozpoczynającego (p1) i tylko w turze 1, więc pierwszym graczem, który
  // musi dobrać, jest p2 na starcie tury 2 — i to on przegrywa.
  for (let i = 0; i < 60 && state.status === 'active'; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p1', 'p2 przegrywa w swoim kroku dobierania (tura 2)');
  const lost = state.events.filter((e) => e.type === 'player_lost');
  assert.ok(lost.some((e) => e.playerId === 'p2' && e.reason === 'empty_library'),
    `oczekiwano player_lost/empty_library dla p1: ${JSON.stringify(lost)}`);
});
