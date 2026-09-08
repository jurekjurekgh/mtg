// E9/F1 (wyzwanie wyłapywacza błędów II): POWRÓT Z GROBU BEZ CHOROBY
// PRZYWOŁANIA (CR 302.6). `put_graveyard_card_onto_battlefield` (Disa the
// Restless — „put it onto the battlefield") wchodzi przez moveObjectDirectly,
// ale NIE ustawia `summoningSickness` — ożywiony stwór atakuje w TEJ SAMEJ
// turze. Każda ścieżka-rodzeństwo (reanimate_under_your_control,
// return_with_counter, return_to_battlefield_tapped, pyxis, throne) ustawia
// chorobę jawnie, bo CR 400.7 buduje obiekt „od zera".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { initialTurn, jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';

const STEAL_SOURCE = Object.freeze({ id: 'src', cardId: 'disa-the-restless', controllerId: 'p1', ownerId: 'p1' });

function stateWithLhurgoyfInGraveyard() {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'gojf', instanceId: 'i-gojf', cardId: 'c-lhurgoyf', controllerId: 'p1', ownerId: 'p1',
    zone: 'graveyard', kind: 'creature', power: 4, toughness: 5, manaCost: 4,
    types: ['Creature'], colors: ['G'], abilities: [], keywords: [], subtypes: ['Lhurgoyf'],
  });
  return state;
}

test('E9/F1: ożywiony stwór dostaje chorobę przywołania (CR 302.6)', () => {
  const state = stateWithLhurgoyfInGraveyard();
  applyEffect(state, { type: 'put_graveyard_card_onto_battlefield' }, STEAL_SOURCE, ['gojf'],
    { graveyardCardId: 'gojf' });
  const revived = [...state.objects.values()].find((o) => o.cardId === 'c-lhurgoyf');
  assert.ok(revived && revived.zone === 'battlefield', 'stwór wrócił na pole bitwy');
  assert.equal(revived.summoningSickness, true,
    'choroba przywołania ustawiona (było: brak — atakował od razu)');
});

test('E9/F1: ożywiony stwór NIE MOŻE zaatakować w tej samej turze (CR 302.6)', () => {
  const state = stateWithLhurgoyfInGraveyard();
  applyEffect(state, { type: 'put_graveyard_card_onto_battlefield' }, STEAL_SOURCE, ['gojf'],
    { graveyardCardId: 'gojf' });
  const revived = [...state.objects.values()].find((o) => o.cardId === 'c-lhurgoyf');
  state.turn = jumpToStep({ ...initialTurn('p1') }, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1'; state.turn.passes = 0;
  const attack = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [revived.id] });
  assert.equal(attack.ok, false,
    'atak ożywionego w tej turze odrzucony (było: dopuszczony — bug)');
});
