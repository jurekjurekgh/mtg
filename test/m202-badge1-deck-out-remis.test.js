// M202 — brązowa odznaka, znalezisko #1: CR 704.5m + CR 104.4b.
//
// Zgłoszenie: jednoczesny deck-out nie dawał remisu.
//
// CR 704.5m: „A player who attempted to draw a card from a library with no
// cards in it since the last time state-based actions were checked loses the
// game.” To AKCJA STANOWA — a nie natychmiastowy skutek efektu dobrania.
// CR 104.4b: „If the game somehow enters a state in which all remaining players
// lose simultaneously, the game is a draw.”
//
// Stan przed fixem: `drawPlayerCards` kończył partię w miejscu dobrania i
// ogłaszał zwycięzcą „drugiego gracza”, więc przy efekcie „You and target
// opponent each draw two cards” (Strike a Deal, Your Temple Is Under Attack)
// z dwiema pustymi bibliotekami wygrywał ten, kto dobierał DRUGI. Ten sam
// błąd był już naprawiony dla życia i trucizny w `runStateBasedActions`
// (komentarz przy CR 104.4b) — ścieżka dobrania go nie miała (klasa L41:
// dwie kopie tej samej reguły rozjechały się po cichu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { drawPlayerCards } from '../src/engine/effects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function stateWith({ library1 = 0, library2 = 0, life1 = 20, life2 = 20 } = {}) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const def = REGISTRY.get('hill-giant');
  const fill = (playerId, count, prefix) => {
    for (let i = 0; i < count; i += 1) {
      const id = `${prefix}${i}`;
      addObject(state, {
        id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId: playerId, ownerId: playerId,
        zone: 'library', ...gameObjectDataOf(def), types: def.types ?? [], keywords: [], subtypes: [],
      });
    }
  };
  fill('p1', library1, 'l1-');
  fill('p2', library2, 'l2-');
  state.players[0].life = life1;
  state.players[1].life = life2;
  return state;
}

test('M202/#1 (CR 104.4b): jednoczesny deck-out obu graczy = REMIS', () => {
  const state = stateWith({ library1: 0, library2: 0 });
  // „You and target opponent each draw two cards” — oba dobrania w jednym zdarzeniu
  drawPlayerCards(state, 'p1', 2, 'effect');
  drawPlayerCards(state, 'p2', 2, 'effect');
  runStateBasedActions(state);
  assert.equal(state.status, 'finished', 'partia się kończy');
  assert.equal(state.winnerId, null, 'CR 104.4b: wszyscy pozostali gracze przegrywają jednocześnie');
  assert.equal(state.isDraw, true, 'partia jest remisem');
});

test('M202/#1 (anty-over-fix): pojedynczy deck-out z efektu = przegrana tego gracza', () => {
  const state = stateWith({ library1: 0, library2: 5 });
  drawPlayerCards(state, 'p1', 1, 'effect');
  runStateBasedActions(state);
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p2', 'przegrywa gracz bez kart w bibliotece');
  assert.notEqual(state.isDraw, true, 'to nie jest remis');
});

test('M202/#1 (anty-over-fix): deck-out w kroku dobierania nadal kończy partię', () => {
  const state = stateWith({ library1: 0, library2: 5 });
  // wchodzimy w krok dobierania przez normalne przejście tury (CR 504.1)
  // tura 3 — w turze 1 gracz zaczynający pomija dobranie (CR 103.7a)
  state.turn = { ...state.turn, ...TURN_STEPS[1], stepIndex: 1, number: 3, activePlayerId: 'p1', drawnInStep: false };
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'draw', 'runda passów przeniosła grę do kroku dobierania');
  assert.equal(state.status, 'finished', 'akcja turowa kroku dobierania (CR 504.1) rozstrzyga deck-out');
  assert.equal(state.winnerId, 'p2');
});

test('M202/#1 (CR 704.5m): gracz, który dobrał część kart, przegrywa; przeciwnik wygrywa', () => {
  const state = stateWith({ library1: 1, library2: 5 });
  drawPlayerCards(state, 'p1', 3, 'effect'); // biblioteka ma 1 kartę — dobiera 1 z 3
  assert.equal(state.status, 'active', 'dobranie samo w sobie nie kończy gry — rozstrzyga akcja stanowa');
  runStateBasedActions(state);
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'p2');
});

test('M202/#1 (CR 704.5m): znacznik wygasa po przebiegu akcji stanowych', () => {
  const state = stateWith({ library1: 0, library2: 5 });
  drawPlayerCards(state, 'p1', 1, 'effect');
  runStateBasedActions(state);
  assert.equal(state.status, 'finished');
  // przebieg kasuje znacznik — kolejny nie „pamięta” starej próby dobrania
  assert.deepEqual(state.emptyLibraryDraw ?? {}, {}, 'znacznik dotyczy tylko tego przebiegu SBA');
});

test('M202/#1 (CR 104.4b): deck-out i zero życia naraz = REMIS, nie zwycięstwo z kolejności', () => {
  const state = stateWith({ library1: 0, library2: 5, life2: 0 });
  drawPlayerCards(state, 'p1', 1, 'effect');
  runStateBasedActions(state);
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, null, 'p1 bez kart i p2 bez życia przegrywają w tym samym przebiegu');
  assert.equal(state.isDraw, true);
});
