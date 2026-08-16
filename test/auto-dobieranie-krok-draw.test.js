// M101/A — zgłoszenie właściciela (2026-08-15): „Dobranie karty w kroku draw
// nie jest opcjonalne (CR 504.1) — wymaganie kliknięcia »Dobierz kartę« jest
// bez sensu; ma być automatyczne."
//
// CR 504.1: „First, the active player draws a card. This turn-based action
// doesn't use the stack." Akcja turowa dzieje się SAMA, gdy krok się zaczyna —
// dokładnie jak odkręcanie w untap stepie (CR 502.1), które silnik od zawsze
// wykonuje automatycznie w beginTurn. Dobieranie było jedyną akcją turową
// wystawioną jako opcjonalna komenda gracza (`draw_card` w legalCommands),
// przez co dawało się ją POMINĄĆ passem — gracz przechodził do fazy głównej
// bez dobranej karty, co jest niemożliwe w prawdziwym MtG.
//
// Wyjątki, które muszą zostać zachowane:
//  - CR 103.7a: gracz rozpoczynający grę nie dobiera w swojej pierwszej turze;
//  - CR 104.3c: próba dobrania z pustej biblioteki przegrywa partię.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

function makeState({ libraryCards = 5 } = {}) {
  const state = createGameState({ players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Bot' }], seed: 1 });
  for (let i = 0; i < libraryCards; i += 1) {
    for (const p of ['p1', 'p2']) {
      addObject(state, {
        id: `lib-${p}-${i}`, instanceId: `i-${p}-${i}`, cardId: 'plains', controllerId: p, ownerId: p,
        zone: 'library', kind: 'land', power: null, toughness: null, manaCost: 0,
        abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: [],
      });
    }
  }
  return state;
}

const handOf = (state, playerId) => state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);

test('M101/A: wejście w krok dobierania samo dobiera kartę (CR 504.1)', () => {
  const state = makeState();
  // Stoimy w upkeep tury 3 (nie pierwszej — CR 103.7a).
  state.turn = jumpToStep({ ...state.turn, number: 3, activePlayerId: 'p1' }, 'upkeep', 'p1');
  const before = handOf(state, 'p1').length;

  // Runda passów przenosi grę do kroku dobierania.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  assert.equal(state.turn.step, 'draw', 'powinniśmy być w kroku dobierania');
  assert.equal(handOf(state, 'p1').length, before + 1, 'karta ma zostać dobrana automatycznie');
  assert.equal(state.turn.drawnInStep, true, 'znacznik akcji turowej ustawiony');
});

test('M101/A: „Dobierz kartę" nie jest już akcją do kliknięcia', () => {
  const state = makeState();
  state.turn = jumpToStep({ ...state.turn, number: 3, activePlayerId: 'p1' }, 'upkeep', 'p1');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  const view = playerView(state, 'p1');
  assert.ok(
    !view.legalCommands.some((c) => c.type === 'draw_card'),
    'krok dobierania nie może oferować ręcznej komendy dobrania — to akcja turowa',
  );
});

test('M101/A: passa w kroku dobierania NIE da się już zagrać bez dobrania', () => {
  const state = makeState();
  state.turn = jumpToStep({ ...state.turn, number: 3, activePlayerId: 'p1' }, 'upkeep', 'p1');
  const before = handOf(state, 'p1').length;
  // Cała runda: upkeep → draw → main. Gracz tylko passuje, jak w zgłoszeniu.
  for (let i = 0; i < 4; i += 1) {
    const who = state.turn.priorityPlayerId;
    execute(state, { type: 'pass_priority', playerId: who });
    if (state.turn.step === 'main') break;
  }
  assert.equal(state.turn.phase, 'precombat_main', 'doszliśmy do fazy głównej');
  assert.equal(handOf(state, 'p1').length, before + 1, 'karta z kroku dobierania musi być w ręce');
});

test('M101/A: CR 103.7a — gracz rozpoczynający nie dobiera w pierwszej turze', () => {
  const state = makeState();
  // Tura 1, aktywny = gracz rozpoczynający (players[0]).
  state.turn = jumpToStep({ ...state.turn, number: 1, activePlayerId: 'p1' }, 'upkeep', 'p1');
  const before = handOf(state, 'p1').length;
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'draw');
  assert.equal(handOf(state, 'p1').length, before, 'pierwsza tura rozpoczynającego — bez dobrania');
});

test('M101/A: CR 104.3c — automatyczne dobranie z pustej biblioteki przegrywa partię', () => {
  const state = makeState({ libraryCards: 0 });
  state.turn = jumpToStep({ ...state.turn, number: 3, activePlayerId: 'p1' }, 'upkeep', 'p1');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.status, 'finished', 'pusta biblioteka = przegrana przy dobieraniu');
  assert.equal(state.winnerId, 'p2');
});
