// M201/O1 (obserwacja z audytu M200, WERYFIKACJA U ŹRÓDŁA — L57):
// „nadwyżka trample BLOKERA nie idzie w gracza, którego bloker broni
// (CR 702.19)” — teza z poprzedniej sesji okazała się BŁĘDNA.
//
// CR 702.19a: „Trample is a static ability that modifies the rules for
// assigning an ATTACKING creature's combat damage. The ability HAS NO EFFECT
// when a creature with trample is BLOCKING or is dealing noncombat damage.”
//
// Czyli obecne zachowanie silnika (bloker z tramplem oddaje całą moc
// atakującemu, nic nie idzie w gracza) jest POPRAWNE. Zamiast wdrażać
// zgłoszoną „naprawę”, pinujemy regułę testem — żeby kolejna sesja nie
// wróciła do tego pomysłu (L57 §2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

function creature(state, id, controllerId, power, toughness, keywords = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness,
    types: ['Creature'], subtypes: [], abilities: [], keywords,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

test('M201/O1: trample BLOKERA nie zadaje nadwyżki graczowi (CR 702.19a)', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  const idx = 5; // declare_attackers
  state.turn = { ...initialTurn('p2'), ...TURN_STEPS[idx], stepIndex: idx, activePlayerId: 'p2', priorityPlayerId: 'p2', passes: 0 };
  creature(state, 'atk', 'p2', 1, 1);            // atakujący 1/1
  creature(state, 'blk', 'p1', 6, 6, ['trample']); // bloker 6/6 z tramplem

  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { atk: ['blk'] } }).ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok, true);

  const attackerLife = state.players.find((p) => p.id === 'p2').life;
  assert.equal(attackerLife, 20,
    'CR 702.19a: trample nie działa, gdy stwór BLOKUJE — atakujący gracz nie dostaje nadwyżki');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20, 'broniący też bez obrażeń');
});

test('M201/O1: anty-over-fix — trample ATAKUJĄCEGO nadal przelewa nadwyżkę', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  const idx = 5;
  state.turn = { ...initialTurn('p2'), ...TURN_STEPS[idx], stepIndex: idx, activePlayerId: 'p2', priorityPlayerId: 'p2', passes: 0 };
  creature(state, 'atk', 'p2', 6, 6, ['trample']);
  creature(state, 'blk', 'p1', 1, 1);
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { atk: ['blk'] } }).ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok, true);
  // Trample atakującego wymaga decyzji o podziale obrażeń (CR 510.1c/d) —
  // bierzemy domyślny wariant z oferty silnika (lethal-first).
  if (state.pendingDamageAssignment) {
    const assign = playerView(state, state.pendingDamageAssignment.playerId).legalCommands
      .find((c) => c.type === 'resolve_damage_assignment');
    assert.ok(assign, 'oferta podziału obrażeń');
    assert.equal(execute(state, assign).ok, true);
  }
  assert.equal(state.players.find((p) => p.id === 'p1').life, 15,
    'CR 702.19b: 6 mocy − 1 lethal na blokera = 5 obrażeń w broniącego gracza');
});
