import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { validateDamageAssignment } from '../src/engine/combat.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * M101/B6 (CR 702.19b): „The controller of an attacking creature with trample
 * first assigns damage to the creature(s) blocking it. Once all those
 * blocking creatures are assigned lethal damage, any remaining damage is
 * assigned as its controller chooses among those blocking creatures and the
 * defending player."
 *
 * Nadmiar przechodzi na gracza DOPIERO, gdy KAŻDY bloker ma przydzielone
 * co najmniej lethal. Silnik walidował tylko sumę (<= moc) i kolejność
 * (CR 510.1d), więc atakujący z trample mógł przydzielić blokerom 0 i wpakować
 * całą moc w gracza — bloker przeżywał, a obrońca dostawał obrażenia,
 * przed którymi właśnie się bronił.
 *
 * Bez trample nadmiar nie ma dokąd pójść, więc niedobór jest legalny
 * (obrażenia po prostu przepadają) — reguła dotyczy wyłącznie trample.
 */

function combatState({ attackerPower = 5, trample = true, blockers = [{ id: 'blk', power: 2, toughness: 2 }] } = {}) {
  const state = createGameState({ players: [{ id: 'p1' }, { id: 'p2' }], seed: 1 });
  addObject(state, {
    id: 'att', instanceId: 'i-att', cardId: 'x-att', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: attackerPower, toughness: 5,
    types: ['Creature'], keywords: trample ? ['trample'] : [],
  });
  for (const b of blockers) {
    addObject(state, {
      id: b.id, instanceId: `i-${b.id}`, cardId: 'x-blk', controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind: 'creature', power: b.power, toughness: b.toughness, types: ['Creature'],
    });
  }
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p2',
    assignments: { att: blockers.map((b) => b.id) },
  }).ok);
  return state;
}

test('trample: przydział 0 blokerowi jest nielegalny (CR 702.19b)', () => {
  const state = combatState();
  const reason = validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 0 }]);
  assert.equal(reason, 'trample_blocker_below_lethal');
});

test('trample: przydział poniżej lethal jest nielegalny (CR 702.19b)', () => {
  const state = combatState();
  // Bloker 2/2 wymaga 2; 1 to za mało, żeby nadmiar poszedł na gracza.
  const reason = validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 1 }]);
  assert.equal(reason, 'trample_blocker_below_lethal');
});

test('trample: dokładnie lethal blokerowi jest legalne — reszta na gracza', () => {
  const state = combatState();
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 2 }]), null);
});

test('trample: cała moc na blokera też jest legalna (CR 702.19b — "as its controller chooses")', () => {
  const state = combatState();
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 5 }]), null);
});

test('trample: WSZYSCy blokerzy muszą mieć lethal, zanim nadmiar pójdzie na gracza', () => {
  const state = combatState({
    attackerPower: 6,
    blockers: [{ id: 'b1', power: 2, toughness: 2 }, { id: 'b2', power: 3, toughness: 3 }],
  });
  // b1 lethal (2), b2 tylko 1 z wymaganych 3 → nadmiar nie może iść na gracza.
  assert.equal(
    validateDamageAssignment(state, 'att', [{ blockerId: 'b1', amount: 2 }, { blockerId: 'b2', amount: 1 }]),
    'trample_blocker_below_lethal',
  );
  // 2 + 3 = 5 z 6; szósty punkt trafia na gracza — legalne.
  assert.equal(
    validateDamageAssignment(state, 'att', [{ blockerId: 'b1', amount: 2 }, { blockerId: 'b2', amount: 3 }]),
    null,
  );
});

test('trample: deathtouch obniża lethal do 1 (CR 702.2b + 702.19b)', () => {
  const state = combatState();
  state.objects.set('att', Object.freeze({
    ...state.objects.get('att'), keywords: ['trample', 'deathtouch'],
  }));
  // Z deathtouch 1 punkt to już lethal — reszta (4) może iść na gracza.
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 1 }]), null);
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 0 }]), 'trample_blocker_below_lethal');
});

test('trample: obrażenia już na blokerze zmniejszają wymagane lethal (CR 510.1c)', () => {
  const state = combatState();
  state.objects.set('blk', Object.freeze({ ...state.objects.get('blk'), damage: 1 }));
  // 2/2 z 1 obrażeniem — lethal to już tylko 1.
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 1 }]), null);
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 0 }]), 'trample_blocker_below_lethal');
});

test('BEZ trample niedobór jest legalny — nadmiar nie ma dokąd pójść', () => {
  const state = combatState({ trample: false, blockers: [{ id: 'b1', power: 2, toughness: 2 }, { id: 'b2', power: 2, toughness: 2 }] });
  // Atakujący bez trample może „zmarnować" obrażenia; CR 702.19b nie działa.
  assert.equal(
    validateDamageAssignment(state, 'att', [{ blockerId: 'b1', amount: 0 }, { blockerId: 'b2', amount: 0 }]),
    null,
  );
});

test('E2E: gracz nie przepchnie trample przez żywego blokera', () => {
  const state = combatState();
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.ok(state.pendingDamageAssignment, 'trample wymaga decyzji przydziału');

  const cheat = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { att: [{ blockerId: 'blk', amount: 0 }] },
  });
  assert.equal(cheat.ok, false, 'przydział 0 blokerowi musi zostać odrzucony');
  assert.match(cheat.events[0].reason, /trample_blocker_below_lethal/);
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore, 'obrońca nie stracił życia');

  // Legalny przydział: 2 na blokera (ginie), 3 na gracza.
  const legal = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { att: [{ blockerId: 'blk', amount: 2 }] },
  });
  assert.ok(legal.ok, legal.events?.[0]?.reason);
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore - 3, 'na gracza poszedł tylko nadmiar');
  assert.notEqual(state.objects.get('blk')?.zone, 'battlefield', 'bloker zginął od lethal');
});
