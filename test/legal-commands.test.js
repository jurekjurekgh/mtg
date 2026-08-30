import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';

/**
 * Kontrakt legalCommands: każda komenda oferowana w widoku gracza musi być
 * zaakceptowana przez execute, a lista nie może zawierać duplikatów.
 * Sprawdzane na reprezentatywnych stanach każdego kroku tury.
 */

function freshState() {
  // M257-r5b/B: seed 7 = starter p1 (testy pliku operują turą p1; pełna runda
  // na końcu asercją kończy na turze p2).
  return createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhaseState() {
  const state = freshState();
  state.turn = { ...state.turn, phase: 'precombat_main', step: 'main', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  addObject(state, { id: 'l-hand', instanceId: 'il1', cardId: 'L1', controllerId: 'p1', zone: 'hand', kind: 'land' });
  addObject(state, { id: 'l-field', instanceId: 'il2', cardId: 'L2', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  addObject(state, { id: 'c-hand', instanceId: 'ic1', cardId: 'C1', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 1 });
  addObject(state, {
    id: 's-hand', instanceId: 'is1', cardId: 'S1', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1,
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] },
  });
  addObject(state, { id: 'c-enemy', instanceId: 'ic2', cardId: 'C2', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  return state;
}

function combatState() {
  const state = freshState();
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  addObject(state, { id: 'a1', instanceId: 'ia1', cardId: 'A1', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  addObject(state, { id: 'a2', instanceId: 'ia2', cardId: 'A2', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  addObject(state, { id: 'b1', instanceId: 'ib1', cardId: 'B1', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 3 });
  return state;
}

function drawState() {
  const state = freshState();
  addObject(state, { id: 'top', instanceId: 'it', cardId: 'X', controllerId: 'p1', zone: 'library' });
  state.turn = { ...state.turn, phase: 'beginning', step: 'draw', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  return state;
}

function assertOfferedCommandsAccepted(state, playerId, label) {
  const view = playerView(state, playerId);
  const seen = new Set();
  for (const cmd of view.legalCommands) {
    const key = JSON.stringify(cmd);
    assert.equal(seen.has(key), false, `${label}: duplikat komendy ${key}`);
    seen.add(key);
    const clone = structuredClone(state);
    const result = execute(clone, cmd);
    assert.equal(result.ok, true, `${label}: ${key} odrzucona: ${result.events[0]?.reason}`);
  }
}

function assertEveryStepOffersLegalCommands(state, playerId, label) {
  const view = playerView(state, playerId);
  assert.ok(view.legalCommands.length > 0, `${label}: widok ${playerId} nie oferuje żadnej komendy`);
  assertOfferedCommandsAccepted(state, playerId, label);
}

test('widok startowy oferuje wyłącznie akceptowane komendy dla obu graczy', () => {
  const state = freshState();
  assertOfferedCommandsAccepted(state, 'p1', 'start p1');
  assertOfferedCommandsAccepted(state, 'p2', 'start p2');
});

test('main phase oferuje legalny land drop i zagranie stwora od razu (auto-tap lądów)', () => {
  const state = mainPhaseState();
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'play_land'));
  // tap_for_mana nie jest już oferowany jako osobna akcja: dostępną akcją
  // jest rzut/zagranie, a płatność sama tapuje landy (spendMana).
  assert.equal(view.legalCommands.some((c) => c.type === 'tap_for_mana'), false);
  // cast_permanent i cast_spell są oferowane mimo pustej puli many —
  // koszt pokrywa nietapnięty land (mana produkowalna).
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_permanent'));
  // Czar instant z jawnym celem: wariant objectId × stwór na battlefield.
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 's-hand' && c.targets?.[0] === 'c-enemy'));
  // Wykonanie zagrania z pustą puli: engine sam zatapuje land na koszt.
  const cast = execute(state, view.legalCommands.find((c) => c.type === 'cast_permanent'));
  assert.equal(cast.ok, true, cast.events[0]?.reason);
  assert.equal(state.objects.get('l-field').tapped, true, 'płatność automatycznie zatapnęła land');
  assert.equal(state.players[0].mana, 0);
  assertOfferedCommandsAccepted(state, 'p1', 'main p1');
  assertOfferedCommandsAccepted(state, 'p2', 'main p2');
});

test('combat: każda oferowana opcja ataku, bloku i rozstrzygnięcia jest akceptowana', () => {
  const attacking = combatState();
  assertEveryStepOffersLegalCommands(attacking, 'p1', 'attackers p1');
  assertOfferedCommandsAccepted(attacking, 'p2', 'attackers p2');

  const blocking = combatState();
  execute(blocking, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] });
  assertEveryStepOffersLegalCommands(blocking, 'p2', 'blockers p2');
  assertOfferedCommandsAccepted(blocking, 'p1', 'blockers p1');

  const damage = combatState();
  execute(damage, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] });
  execute(damage, { type: 'declare_blockers', playerId: 'p2', assignments: { a1: ['b1'] } });
  assertEveryStepOffersLegalCommands(damage, 'p1', 'combat_damage p1');
  assertOfferedCommandsAccepted(damage, 'p2', 'combat_damage p2');
});

test('krok dobierania oferuje wyłącznie akceptowane komendy', () => {
  const state = drawState();
  assertOfferedCommandsAccepted(state, 'p1', 'draw p1');
  assertOfferedCommandsAccepted(state, 'p2', 'draw p2');
});

test('każdy krok tury oferuje co najmniej jedną legalną komendę', () => {
  const state = freshState();
  // M257 r4/A (uwaga właściciela): bez kreatur krok `declare_attackers` jest
  // przechodzony AUTOMATYCZNYM przejściem (CR 508.1 — deklaracja pusta,
  // decyzja nie istnieje), więc w pętli pass-only nie „istnieje" na starcie
  // żadnej iteracji. Stwór u aktywnego gracza tury 1 sprawia, że krok jest
  // krokiem DECYZJI (oferta ataku) i automat go odwiedza.
  addObject(state, { id: 'c-p1', instanceId: 'icp1', cardId: 'C-P1', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  const visited = new Set();
  // Pełna runda passów obu graczy przez wszystkie 12 kroków automatu.
  for (let i = 0; i < 24; i += 1) {
    visited.add(`${state.turn.phase}:${state.turn.step}`);
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    assert.ok(view.legalCommands.length >= 1, `brak legalnych komend w ${state.turn.step}`);
    execute(state, { type: 'pass_priority', playerId: holder });
  }
  assert.equal(visited.size, 12, `automat nie odwiedził wszystkich kroków: ${[...visited].join(', ')}`);
  assert.equal(state.turn.number, 2);
  assert.equal(state.turn.activePlayerId, 'p2');
});
