// E9/F3 (wyzwanie wyłapywacza błędów II): EXPLORE BEZ WYBORU (CR 701.54b).
// Reguła explore: „reveal the top card ... If it's a land card, put it into
// your hand. Otherwise, put a +1/+1 counter on that creature, THEN PUT THE
// REVEALED CARD INTO ITS OWNER'S GRAVEYARD" — bez żadnego wyboru. Silnik
// kolejkował decyzję resolve_explore_choice „wierzch albo grób" — darmowy
// strict-upgrade (gracz podgląda bibliotekę, odkładając kartę na wierzch).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';

const COMPASS = Object.freeze({ id: 'src', cardId: 'guidestone-compass', controllerId: 'p1', ownerId: 'p1' });

function stateWithTop(cardId, extra = {}) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'top', instanceId: 'i-top', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'library', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['G'], abilities: [], keywords: [], subtypes: [], ...extra,
  });
  addObject(state, {
    id: 'expl', instanceId: 'i-expl', cardId: 'c-explorer', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 1,
    types: ['Creature'], colors: ['G'], abilities: [], keywords: [], subtypes: [],
  });
  return state;
}

test('E9/F3: explore nie-landu — licznik +1/+1 i karta DO GROBU bez decyzji', () => {
  const state = stateWithTop('c-bear');
  applyEffect(state, { type: 'explore' }, COMPASS, ['expl']);
  assert.equal(state.pendingExplore ?? null, null,
    'brak oczekującej decyzji wierzch/grób (było: resolve_explore_choice — strict-upgrade poza CR)');
  const bear = [...state.objects.values()].find((o) => o.cardId === 'c-bear');
  assert.equal(bear.zone, 'graveyard', 'odsłonięty nie-land trafia do grobu (CR 701.54b)');
  const explorer = state.objects.get('expl');
  assert.equal((explorer.counters?.['+1/+1'] ?? 0) >= 1, true, 'licznik +1/+1 położony');
});

test('E9/F3: explore landu — do ręki, bez licznika (bez zmian)', () => {
  const state = stateWithTop('c-forest', { kind: 'land', types: ['Land'], subtypes: ['Forest'], toughness: 0 });
  applyEffect(state, { type: 'explore' }, COMPASS, ['expl']);
  const forest = [...state.objects.values()].find((o) => o.cardId === 'c-forest');
  assert.equal(forest.zone, 'hand', 'land idzie do ręki');
  const explorer = state.objects.get('expl');
  assert.equal(explorer.counters?.['+1/+1'] ?? 0, 0, 'bez licznika');
  assert.equal(state.pendingExplore ?? null, null);
});
