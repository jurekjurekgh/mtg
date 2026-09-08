// E9/F3 — REFUTACJA (2026-09-08, po weryfikacji właściciela): explore DAJE
// WYBÓR. CR 701.44a (dawniej 701.54a): „Otherwise, that player puts a +1/+1
// counter on the exploring permanent and may put the revealed card into their
// graveyard"; reminder text: „then put the card back on top or into your
// graveyard". Oryginalna maszyna pendingExplore (blokująca decyzja
// resolve_explore_choice „wierzch albo grób") była POPRAWNA — „fix" a7ae267
// usunął legalny wybór i został cofnięty. Ten test blokuje przyszłe
// „uproszczenia" tego miejsca (w tym owo sfalszowane znalezisko E9/F3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';

const COMPASS = Object.freeze({ id: 'src', cardId: 'guidestone-compass', controllerId: 'p1', ownerId: 'p1' });

function stateWithTop(extra = {}) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'top', instanceId: 'i-top', cardId: 'c-bear', controllerId: 'p1', ownerId: 'p1',
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

test('E9/F3 refutacja: explore nie-landu — licznik + DECYZJA wierzch/grób (CR 701.44a)', () => {
  const state = stateWithTop();
  applyEffect(state, { type: 'explore' }, COMPASS, ['expl']);
  assert.ok(state.pendingExplore, 'kolejkowana decyzja resolve_explore_choice');
  assert.equal(state.pendingExplore.playerId, 'p1');
  const explorer = state.objects.get('expl');
  assert.equal((explorer.counters?.['+1/+1'] ?? 0) >= 1, true, 'licznik +1/+1 położony PRZED decyzją');
  // Wybór A: „zostaw na wierzchu" — karta NIE znika z biblioteki.
  const result = execute(state, { type: 'resolve_explore_choice', playerId: 'p1', putInGraveyard: false });
  assert.equal(result.ok, true, 'decyzja przyjęta: ' + (result.reason ?? ''));
  assert.equal(state.pendingExplore ?? null, null, 'decyzja rozstrzygnięta');
  assert.equal(state.objects.get('top')?.zone, 'library', 'karta zostaje na wierzchu biblioteki');
});

test('E9/F3 refutacja: wybór „do grobu" wysyła odsłoniętą kartę na cmentarz', () => {
  const state = stateWithTop();
  applyEffect(state, { type: 'explore' }, COMPASS, ['expl']);
  const result = execute(state, { type: 'resolve_explore_choice', playerId: 'p1', putInGraveyard: true });
  assert.equal(result.ok, true, 'decyzja przyjęta: ' + (result.reason ?? ''));
  const buried = [...state.objects.values()].find((o) => o.cardId === 'c-bear');
  assert.equal(buried?.zone, 'graveyard', 'karta w grobie na życzenie gracza');
});

test('E9/F3 refutacja: explore landu — do ręki natychmiast, bez decyzji', () => {
  const state = stateWithTop({ cardId: 'c-plain', kind: 'land', types: ['Land'], power: undefined, toughness: undefined });
  applyEffect(state, { type: 'explore' }, COMPASS, ['expl']);
  assert.equal(state.pendingExplore ?? null, null, 'land nie kolejkuje decyzji');
  const drawn = [...state.objects.values()].find((o) => o.cardId === 'c-plain');
  assert.equal(drawn?.zone, 'hand', 'land idzie do ręki');
});
