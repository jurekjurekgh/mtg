// E9/F4 (wyzwanie wyłapywacza błędów II): SEARCH → BATTLEFIELD BEZ CHOROBY
// PRZYWOŁANIA (CR 302.6). `resolve_search_choice` przy destination
// battlefield ustawia wyłącznie `tapped` (entersTapped) — brak
// `summoningSickness`. Ta sama klasa co E9/F1 (Disa), inny moduł: ścieżka
// w game-state.js jest generyczna i dziś obsługuje tylko lądy (katalog),
// ale kolejny batch z „search for a creature card ... put it onto the
// battlefield" wyszedłby zepsuty. Fix u źródła nie zmienia landów
// (choroba dotyczy wyłącznie stworów).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';

test('E9/F4: stwór postawiony przez resolve_search_choice dostaje chorobę przywołania', () => {
  const state = createGameState({ seed: 6, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'found', instanceId: 'i-found', cardId: 'c-searched', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', kind: 'creature', power: 3, toughness: 3, manaCost: 3,
    types: ['Creature'], colors: ['G'], abilities: [], keywords: [], subtypes: [],
  });
  // Kolejka oczekującego szukania — dokładnie taki kształt, jaki buduje
  // queueSearchChoice (effects.js) dla destination 'battlefield'.
  state.pendingSearchChoice = {
    playerId: 'p1',
    qualifier: {},
    destination: 'battlefield',
    entersTapped: false,
    mandatory: true,
  };
  const result = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'found' });
  assert.equal(result.ok, true, 'search rozstrzygnięty: ' + (result.events?.[0]?.reason ?? ''));
  const placed = [...state.objects.values()].find((o) => o.cardId === 'c-searched');
  assert.ok(placed && placed.zone === 'battlefield', 'stwór na polu bitwy');
  assert.equal(placed.summoningSickness, true,
    'choroba przywołania ustawiona (było: brak — stwór mógłby atakować od razu)');
});
