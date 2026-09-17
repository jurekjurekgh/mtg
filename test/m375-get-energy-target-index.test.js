// M375 (znalezisko F1 audytu PR #125, ADR 0016): gałąź `get_energy`
// w `applyEffect` czytała `effectTargets[effect.targetIndex]`, a takiego
// identyfikatora w pliku NIE MA — parametr funkcji nazywa się `targets`.
// Ścieżka `targetIndex != null` była więc runtime-owym `ReferenceError`
// (martwa dziś: jedyna karta katalogu z `get_energy`, Shipwreck Moray,
// nie ustawia tego pola; każda przyszła karta „target player gets {E}"
// wywaliłaby się w silniku).
//
// Piny (kontrakt gałęzi, jak w pozostałych ~20 gałęziach efektów):
//  1. `targetIndex` wskazuje slot celu → energię dostaje KONTROLER celu,
//     nie kontroler źródła; wywołanie nie rzuca,
//  2. bez `targetIndex` energia trafia do kontrolera źródła (ścieżka kart
//     katalogu),
//  3. nieaktualny cel (id spoza obiektów) → fallback na kontrolera źródła
//     (`?? sourceObject.controllerId` — gałąź nie rzuca na starym id).
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';

const energyOf = (state, playerId) => state.players.find((p) => p.id === playerId).energy ?? 0;

/** Scena: źródło p1 (Shipwreck Moray) i syntetyczny stwór p2 jako cel. */
function scene() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'shipwreck-moray',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'creature', types: ['Creature'], name: 'Shipwreck Moray',
  });
  addObject(state, {
    id: 'beast', instanceId: 'i-beast', cardId: 'syntetyczny-zwierz',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    kind: 'creature', types: ['Creature'], name: 'Syntetyczny Zwierz',
  });
  return state;
}

test('F1/1: targetIndex wskazuje permanent innego gracza — energię dostaje jego kontroler', () => {
  const state = scene();
  assert.doesNotThrow(() => applyEffect(
    state,
    { type: 'get_energy', amount: 2, targetIndex: 0 },
    state.objects.get('src'),
    ['beast'],
  ), 'gałąź get_energy z targetIndex nie może rzucać (effectTargets → targets)');
  assert.equal(energyOf(state, 'p2'), 2, 'energia trafia do kontrolera CELU');
  assert.equal(energyOf(state, 'p1'), 0, 'kontroler źródła nie dostaje energii z cudzego celu');
});

test('F1/2: bez targetIndex energia trafia do kontrolera źródła (ścieżka kart katalogu)', () => {
  const state = scene();
  applyEffect(state, { type: 'get_energy', amount: 3 }, state.objects.get('src'), []);
  assert.equal(energyOf(state, 'p1'), 3);
  assert.equal(energyOf(state, 'p2'), 0);
});

test('F1/3: nieaktualny cel (id spoza obiektów) → fallback na kontrolera źródła', () => {
  const state = scene();
  assert.doesNotThrow(() => applyEffect(
    state,
    { type: 'get_energy', amount: 1, targetIndex: 0 },
    state.objects.get('src'),
    ['cel-ktorego-juz-nie-ma'],
  ));
  assert.equal(energyOf(state, 'p1'), 1);
  assert.equal(energyOf(state, 'p2'), 0);
});
