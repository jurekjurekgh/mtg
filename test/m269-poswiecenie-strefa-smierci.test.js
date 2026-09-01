import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addCounter } from '../src/engine/counters.js';
import { deathZoneFor } from '../src/engine/permanents.js';

/**
 * M269 błąd #5 — poświęcenie JEST śmiercią (CR 701.17a), więc strefę docelową
 * musi wyznaczać wspólny `deathZoneFor`: licznik finality (CR 122.1e,
 * „If it would die, exile it instead") i naznaczenie `exileIfDiesThisTurn`
 * kierują permanent do wygnania. Cztery ścieżki poświęcenia (koszt dodatkowy,
 * exploit, devour, wybór ofiary / Food) szły na sztywno do CMENTARZA, więc
 * stwór z licznikiem finality dawał się reanimować drugi raz.
 * Strażnik KLASOWY: porównuje ścieżki między sobą, nie karty (ADR 0002).
 */
function stanZFinality() {
  const registry = createCardRegistry();
  const descriptor = registry.get('giant-spider');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'vic', instanceId: 'i1', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor), types: descriptor.types,
  });
  addCounter(state, 'vic', 'finality', 1);
  return state;
}

const strefaOfiary = (state) => [...state.objects.values()]
  .find((o) => o.cardId === 'giant-spider').zone;

test('deathZoneFor kieruje permanent z licznikiem finality do wygnania', () => {
  const state = stanZFinality();
  assert.equal(deathZoneFor(state, state.objects.get('vic')), 'exile');
});

test('ścieżka referencyjna (efekt sacrifice_permanent) wygania', () => {
  const state = stanZFinality();
  applyEffect(state, { type: 'sacrifice_permanent' }, state.objects.get('vic'), ['vic']);
  assert.equal(strefaOfiary(state), 'exile');
});

test('resolve_sacrifice_choice wygania tak samo jak ścieżka referencyjna', () => {
  const state = stanZFinality();
  state.pendingSacrifice = { playerId: 'p1', candidateIds: ['vic'], restorePriorityTo: 'p1' };
  const wynik = execute(state, { type: 'resolve_sacrifice_choice', playerId: 'p1', targetId: 'vic' });
  assert.equal(wynik.ok, true);
  assert.equal(strefaOfiary(state), 'exile', 'wybór ofiary nie omija finality');
});

test('exploit wygania ofiarę z licznikiem finality', () => {
  const state = stanZFinality();
  state.pendingExploits = [{ playerId: 'p1', sourceId: 'vic', candidateIds: ['vic'] }];
  execute(state, { type: 'resolve_exploit_choice', playerId: 'p1', targetId: 'vic' });
  assert.equal(strefaOfiary(state), 'exile');
});

test('bez licznika finality poświęcenie idzie normalnie do cmentarza', () => {
  const registry = createCardRegistry();
  const descriptor = registry.get('giant-spider');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'vic', instanceId: 'i1', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor), types: descriptor.types,
  });
  state.pendingSacrifice = { playerId: 'p1', candidateIds: ['vic'], restorePriorityTo: 'p1' };
  execute(state, { type: 'resolve_sacrifice_choice', playerId: 'p1', targetId: 'vic' });
  assert.equal(strefaOfiary(state), 'graveyard', 'kontrola negatywna');
});
