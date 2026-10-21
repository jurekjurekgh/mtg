// Audyt PR #168/A-3 — CR 726.2 i CR 726.5 (wydanie 2026-09-25): aktualny posiadacz
// inicjatywy może ją ponownie objąć; nadal uruchamia venture do Undercity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';

const source = { id: 'initiative-source', controllerId: 'p1', cardId: 'underdark-explorer' };
const game = () => createGameState({ seed: 169, players: [{ id: 'p1' }, { id: 'p2' }] });

test('A-3: ponowne objęcie inicjatywy przez posiadacza otwiera kolejny pokój (bez kradzieży)', () => {
  const state = game();
  state.initiativePlayerId = 'p1';
  state.undercityProgress = { p1: 1 }; // Secret Entrance → Forge albo Lost Well
  applyEffect(state, { type: 'take_initiative' }, source, []);
  const taken = state.events.find((e) => e.type === 'initiative_taken');
  assert.equal(taken?.previousPlayerId, 'p1', 'inicjatywa nie zmieniła posiadacza');
  assert.equal(taken?.firstTime, false, 'to nie pierwsze wejście do Undercity');
  assert.equal(state.initiativePlayerId, 'p1');
  assert.ok(state.pendingUndercityRoute, 'venture czeka na wybór drogi po Secret Entrance');
  const route = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_undercity_route' && c.roomName === 'Forge');
  assert.ok(route, 'legalny wybór kolejnego pokoju');
  assert.equal(execute(state, route).ok, true);
  assert.equal(state.undercityProgress.p1, 2, 'awans do Forge');
  assert.equal(state.initiativePlayerId, 'p1', 'nadal ten sam posiadacz');
});

test('A-3 kontrola: bez inicjatywy pierwsze objęcie wchodzi do pokoju 1', () => {
  const state = game();
  applyEffect(state, { type: 'take_initiative' }, source, []);
  assert.equal(state.initiativePlayerId, 'p1');
  assert.equal(state.undercityProgress.p1, 1);
  assert.equal(state.events.find((e) => e.type === 'initiative_taken')?.firstTime, true);
});
