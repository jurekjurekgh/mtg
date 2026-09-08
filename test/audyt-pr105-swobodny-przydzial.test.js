// CR pobrane 2026-09-08 z https://mtg.wiki/page/Combat_damage_step
// (wydanie 2026-08-07), CR 510.1c: "If two or more creatures are blocking it,
// it assigns its combat damage to those creatures divided as its controller
// chooses among them." Źródłowy przykład 4/3 vs 2/3+1/1 dopuszcza 2+2.
// https://mtg.wiki/page/Trample, CR 702.19b: "The attacking creature’s
// controller need not assign lethal damage to all those blocking creatures
// but in that case can’t assign any damage to the player or planeswalker
// it’s attacking." Bez zmian ochrony, pełnej sumy i domyślnej polityki bota.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { validateDamageAssignment } from '../src/engine/combat.js';

function combat(trample = false) {
  const state = createGameState({ seed: 106, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const [id, controllerId, power, toughness] of [
    ['att', 'p1', 4, 4], ['spawn', 'p2', 2, 3], ['hunter', 'p2', 1, 1],
  ]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
      types: ['Creature'], colors: [], abilities: [], subtypes: [],
      keywords: id === 'att' && trample ? ['trample'] : [],
    });
  }
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['spawn', 'hunter'] } }).ok);
  return state;
}
const split = (a, b) => [{ blockerId: 'spawn', amount: a }, { blockerId: 'hunter', amount: b }];

for (const trample of [false, true]) {
  for (const reversed of [false, true]) {
    test(`C: wszystkie podziały pełnej mocy legalne (trample=${trample}, reverse=${reversed})`, () => {
      const state = combat(trample);
      for (let a = 0; a <= 4; a++) {
        const assignment = split(a, 4 - a);
        assert.equal(validateDamageAssignment(state, 'att', reversed ? assignment.reverse() : assignment), null);
      }
    });
  }
}

test('C: legalny podział 2+2 przechodzi przez execute i zadaje właśnie te obrażenia', () => {
  const state = combat();
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.ok(state.pendingDamageAssignment);
  const result = execute(state, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { att: split(2, 2) } });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(state.pendingDamageAssignment, null);
  assert.equal(state.objects.get('spawn').zone, 'battlefield');
  assert.equal(state.objects.get('spawn').damage, 2);
  assert.ok(state.zones.graveyard.some(id => state.objects.get(id)?.cardId === 'c-hunter'));
  assert.equal(state.players.find(p => p.id === 'p2').life, 20);
});

test('C: swoboda podziału nie znosi pełnej sumy, sufitu ani minimum trample dla gracza', () => {
  assert.equal(validateDamageAssignment(combat(), 'att', split(1, 2)), 'damage_must_be_fully_assigned');
  assert.equal(validateDamageAssignment(combat(), 'att', split(3, 2)), 'damage_exceeds_power');
  assert.equal(validateDamageAssignment(combat(true), 'att', split(1, 2)), 'trample_blocker_below_lethal');
  assert.equal(validateDamageAssignment(combat(), 'att', split(-1, 5)), 'illegal_damage_amount');
});
