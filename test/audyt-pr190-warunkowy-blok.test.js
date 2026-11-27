import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { blockerDeclarationViolation } from '../src/engine/combat.js';
import { jumpToStep } from '../src/engine/turn.js';

// Syntetyczna warunkowa wersja deskryptora z Vaporkina: rzeczywista karta
// ma nieograniczoną w czasie restrykcję. Warunki statyczne są generyczne.
function scene(active) {
  const state = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  const entries = [
    ['ground', 'p2', []],
    ['block', 'p1', [{ type: 'static', canBlockOnlyKeywords: ['flying'], condition: { activePlayerIsController: !active } }]],
  ];
  for (const [id, owner, abilities] of entries) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `syntetyczny-${id}`, controllerId: owner, ownerId: owner,
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, types: ['Creature'],
      subtypes: [], colors: [], keywords: [], abilities,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['ground'] }).ok, true);
  for (let i = 0; i < 12 && state.turn.step !== 'declare_blockers'; i += 1) {
    const p = state.turn.priorityPlayerId;
    const pass = playerView(state, p).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(pass);
    assert.equal(execute(state, pass).ok, true);
  }
  assert.equal(state.turn.step, 'declare_blockers');
  return state;
}
for (const active of [false, true]) {
  const opis = active ? 'aktywna' : 'nieaktywna';
  test(`Warunkowa restrykcja blokera ${opis}: publiczny widok`, () => {
    const blocker = playerView(scene(active), 'p1').zones.battlefield.find(o => o.id === 'block');
    if (active) assert.deepEqual(blocker.canBlockOnlyKeywords, ['flying']);
    else assert.equal(blocker.canBlockOnlyKeywords, undefined);
  });
  test(`Warunkowa restrykcja blokera ${opis}: oferta`, () => {
    const choices = playerView(scene(active), 'p1').legalCommands.filter(c => c.type === 'declare_blockers');
    assert.equal(choices.some(c => (c.assignments.ground ?? []).includes('block')), !active);
  });
  test(`Warunkowa restrykcja blokera ${opis}: walidacja i wykonanie`, () => {
    const state = scene(active);
    const assignments = { ground: ['block'] };
    assert.equal(blockerDeclarationViolation(state, 'p1', assignments) === null, !active);
    assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments }).ok, !active);
  });
}
