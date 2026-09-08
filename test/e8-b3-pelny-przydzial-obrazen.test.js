// E8/B3 (wyzwanie wyłapywacza błędów): BEZ TRAMPLE stwór zadaje w walce
// obrażenia RÓWNE swojej mocy (CR 510.1a) — przydzielając je blokerom
// (CR 510.1c), kontroler MUSI rozdysponować CAŁOŚĆ; „niedopri-dzielonej"
// części nie wolno zniknąć. Dotąd:
//  - `validateDamageAssignment` przyjmowało sumę < moc (dozwolona była
//    tylko nadwyżka — „damage_exceeds_power"),
//  - `defaultDamageAssignment` (lethal-first) GUBIŁ resztę przy wielu
//    blokerach (6 mocy vs 2/2 i 3/3 → 2+3=4, 2 obrażenia przepadły),
//    choć bez trample reszta ma iść do OSTATNIEGO blokera w kolejności,
//  - wizard przydziału bramkował sumę wyłącznie dla trample.
// Z trample nadwyżka LEGALNIE idzie na obrońcę (CR 702.19b) — ten test pinuje
// też, że ścieżka trample nie została zepsuta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { validateDamageAssignment } from '../src/engine/combat.js';

function creature(state, id, controllerId, power, toughness, keywords = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 3,
    types: ['Creature'], colors: ['G'], abilities: [], keywords, subtypes: [],
  });
  return state.objects.get(id);
}

function combatAttackerVsTwoBlockers(state, attackerKeywords = []) {
  const attacker = creature(state, 'att', 'p1', 6, 6, attackerKeywords);
  creature(state, 'b1', 'p2', 2, 2);
  creature(state, 'b2', 'p2', 3, 3);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1'; state.turn.passes = 0;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['b1', 'b2'] } }).ok);
  return { attacker, b1: state.objects.get('b1'), b2: state.objects.get('b2') };
}

test('E8/B3: bez trample suma < moc jest NIELEGALNA (całość musi być przydzielona)', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  combatAttackerVsTwoBlockers(state);
  const partial = [
    { blockerId: 'b1', amount: 2 },
    { blockerId: 'b2', amount: 2 }, // suma 4 < 6 — 2 obrażenia „znikają"
  ];
  const reason = validateDamageAssignment(state, 'att', partial);
  assert.equal(reason, 'damage_must_be_fully_assigned',
    `niedopri-dzielone obrażenia bez trample odrzucone (było: ${JSON.stringify(reason)})`);
});

test('E8/B3: domyślny przydział dolewa resztę do OSTATNIEGO blokera (bez trample)', async () => {
  const { defaultDamageAssignmentFor } = await import('./helpers/e8-damage-harness.js');
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  combatAttackerVsTwoBlockers(state);
  const out = defaultDamageAssignmentFor(state, 'att', ['b1', 'b2'], 6);
  assert.deepEqual(out.map((e) => e.amount), [2, 4],
    `lethal-first + reszta do ostatniego (było: ${JSON.stringify(out.map((e) => e.amount))} — reszta przepadała)`);
});

test('E8/B3: z trample nadwyżka NADAL legalnie idzie na obrońcę (regresja ścieżki trample)', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  combatAttackerVsTwoBlockers(state, ['trample']);
  const withTrample = [
    { blockerId: 'b1', amount: 2 },
    { blockerId: 'b2', amount: 3 }, // lethal wszędzie, 1 obrażenie nadwyżki → gracz
  ];
  assert.equal(validateDamageAssignment(state, 'att', withTrample), null,
    'trample: lethal na blokerach + nadwyżka dla gracza to legalny przydział');
});
