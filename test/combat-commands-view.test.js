import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';

function combatState() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers' };
  addObject(state, { id: 'ready', instanceId: 'i1', cardId: 'R', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  addObject(state, { id: 'sick', instanceId: 'i2', cardId: 'S', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  state.objects.set('sick', Object.freeze({ ...state.objects.get('sick'), summoningSickness: true }));
  addObject(state, { id: 'b1', instanceId: 'i3', cardId: 'B', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 1, toughness: 4 });
  return state;
}

test('legalCommands pomija chorych i tapniętych atakujących oraz obejmuje pusty atak', () => {
  const state = combatState();
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'declare_attackers');
  assert.equal(offers.length, 2);
  assert.ok(offers.some((c) => c.attackerIds.length === 0));
  assert.ok(offers.some((c) => c.attackerIds.length === 1 && c.attackerIds[0] === 'ready'));
  assert.equal(offers.some((c) => c.attackerIds.includes('sick')), false);
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'declare_attackers'), false);
});

test('blokujące opcje oferowane są wyłącznie broniącemu graczowi', () => {
  const state = combatState();
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ready'] });
  const defender = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'declare_blockers');
  assert.equal(defender.length, 2);
  assert.ok(defender.some((c) => Object.keys(c.assignments).length === 0));
  assert.ok(defender.some((c) => JSON.stringify(c.assignments) === JSON.stringify({ ready: ['b1'] })));
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'declare_blockers'), false);
});

test('wielu atakujących daje wieloblok, a blocker nie powtarza się w opcjach', () => {
  const state = combatState();
  state.objects.set('sick', Object.freeze({ ...state.objects.get('sick'), summoningSickness: false }));
  addObject(state, { id: 'b2', instanceId: 'i4', cardId: 'B2', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ready', 'sick'] });
  const defender = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'declare_blockers');
  const multi = defender.find((c) => JSON.stringify(c.assignments) === JSON.stringify({ ready: ['b1', 'b2'] }));
  assert.ok(multi, 'brak wielobloku w ofercie');
  assert.equal(defender.some((c) => JSON.stringify(c.assignments) === JSON.stringify({ ready: ['b1'], sick: ['b1'] })), false);
});

test('resolve_combat jest oferowany aktywnemu atakującemu, a pass jest wtedy zablokowany', () => {
  const state = combatState();
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ready'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // M172/C: okno obrońcy po blokach (CR 509.4)
  const view = playerView(state, 'p1');
  const resolve = view.legalCommands.filter((c) => c.type === 'resolve_combat');
  assert.equal(resolve.length, 1);
  assert.equal(resolve[0].defendingPlayerId, 'p2');
  assert.equal(view.legalCommands.some((c) => c.type === 'pass_priority'), false);
  const rejected = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.events[0].reason, 'combat_unresolved');
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p2' }).ok, false);
});

test('po komendach combat pass kontynuuje automat od end_of_combat bez cofania', () => {
  const state = combatState();
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ready'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { ready: ['b1'] } });
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // M172/C: okno obrońcy po blokach (CR 509.4)
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(state.turn.step, 'end_of_combat');
  assert.equal(state.turn.stepIndex, 8);
  for (let i = 0; i < 2; i += 1) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  // M212/3: druga faza główna nazywa się `main2` (wcześniej obie nazywały
  // się `main`, przez co nie dało się jej odróżnić ani do niej skoczyć).
  assert.equal(state.turn.step, 'main2');
  assert.equal(state.turn.phase, 'postcombat_main');
  assert.equal(state.combat, null);
});
