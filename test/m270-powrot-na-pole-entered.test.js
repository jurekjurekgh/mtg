import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

/**
 * M270 błąd #6 (CR 400.7) — permanent, który opuszcza pole bitwy i WRACA na
 * nie, jest NOWYM obiektem, więc „wszedł na pole bitwy" w bieżącej turze.
 * Ścieżki składające obiekt RĘCZNIE (transform z wygnaniem i powrotem,
 * craft) omijały `moveObjectDirectly` i przenosiły `enteredOnTurn` sprzed
 * wygnania — a to pole steruje warunkiem „as long as it entered this turn"
 * (Crew Captain: indestructible) oraz `onlyIfTargetEnteredThisTurn`.
 * Strażnik KLASOWY: sprawdza kontrakt „wejście na pole bitwy stempluje turę",
 * wspólny dla wszystkich ścieżek (ADR 0002).
 */
function stan(cardId, { tura, wszedlWTurze }) {
  const registry = createCardRegistry();
  const descriptor = registry.get(cardId);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.number = tura;
  addObject(state, {
    id: 'src', instanceId: 'i1', cardId,
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor),
    types: descriptor.types, subtypes: descriptor.subtypes,
    keywords: descriptor.keywords,
    transformTo: descriptor.transformTo, frontFaceId: descriptor.frontFaceId ?? cardId,
  });
  state.objects.set('src', Object.freeze({
    ...state.objects.get('src'), enteredOnTurn: wszedlWTurze,
  }));
  return state;
}

const naPolu = (state) => [...state.objects.values()].find((o) => o.zone === 'battlefield');

test('choke point: wejście na pole bitwy stempluje BIEŻĄCĄ turę', () => {
  const state = stan('jill-shivas-dominant', { tura: 5, wszedlWTurze: 1 });
  const moved = moveObjectDirectly(state, 'src', 'graveyard', 'g1');
  assert.equal(moved.enteredOnTurn, null, 'poza polem bitwy: brak tury wejścia');
  const wrocil = moveObjectDirectly(state, 'g1', 'battlefield', 'b1');
  assert.equal(wrocil.enteredOnTurn, 5, 'powrót = wejście w tej turze');
});

test('transform z wygnaniem i powrotem stempluje turę wejścia', () => {
  const state = stan('jill-shivas-dominant', { tura: 5, wszedlWTurze: 1 });
  applyEffect(state, { type: 'exile_return_transformed' }, state.objects.get('src'), []);
  const wrocil = naPolu(state);
  assert.ok(wrocil, 'permanent wrócił na pole bitwy');
  assert.equal(
    wrocil.enteredOnTurn, 5,
    'nowy obiekt na polu bitwy wszedł w tej turze, nie w turze sprzed wygnania',
  );
});

test('permanent po powrocie spełnia warunek „entered this turn"', () => {
  const state = stan('jill-shivas-dominant', { tura: 7, wszedlWTurze: 2 });
  applyEffect(state, { type: 'exile_return_transformed' }, state.objects.get('src'), []);
  const wrocil = naPolu(state);
  // Dokładnie ten predykat czyta staticConditionHolds dla { enteredThisTurn: true }
  // (Crew Captain — „has indestructible as long as it entered this turn").
  assert.equal(wrocil.enteredOnTurn === state.turn.number, true);
});

test('obiekt, który NIE zmieniał strefy, zachowuje swoją turę wejścia', () => {
  const state = stan('jill-shivas-dominant', { tura: 5, wszedlWTurze: 1 });
  assert.equal(state.objects.get('src').enteredOnTurn, 1, 'kontrola negatywna');
});
