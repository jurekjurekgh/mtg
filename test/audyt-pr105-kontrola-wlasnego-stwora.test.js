// Audyt PR #105/A, źródło pobrane 2026-09-08:
// https://mtg.wiki/page/Combat_phase (CR 2026-08-07).
// CR 506.4: "A permanent is removed from combat ... if its controller or
// protector changes ...". CR 506.4b: "Tapping or untapping a creature that’s
// already been declared as an attacker or blocker doesn’t remove it from
// combat and doesn’t prevent its combat damage."
// Oracle Awaken/rulings pobrane w audycie (rulings data: []). Nośnik to
// syntetyczny instant z tym samym generycznym efektem — bez zmian katalogu.
// Pełna ścieżka oferty, rzutu, passów i SBA, nie sam applyEffect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
function scenario(target, caster) {
  const state = createGameState({ seed: 106, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const [id, playerId, power] of [['att', 'p1', 4], ['blk', 'p2', 2]]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId: playerId,
      ownerId: playerId, zone: 'battlefield', kind: 'creature', power,
      toughness: 6, manaCost: 2, types: ['Creature'], colors: [],
      abilities: [], keywords: [], subtypes: [],
    });
  }
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: 'probe-control',
    controllerId: caster, ownerId: caster, zone: 'hand', kind: 'spell',
    manaCost: 0, types: ['Instant'], colors: [], abilities: [], keywords: [], subtypes: [],
    spell: { timing: 'instant', targets: [{ type: 'creature' }],
      effects: [{ type: 'gain_control_until_end_of_turn' }] },
  });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // D: okno po deklaracji (CR 508.2)
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } }).ok);
  if (state.turn.priorityPlayerId !== caster) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  const cast = playerView(state, caster).legalCommands.find(c =>
    c.type === 'cast_spell' && c.objectId === 'spell' && c.targets?.[0] === target);
  assert.ok(cast, 'syntetyczny instant jest legalnie oferowany');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 2; i++) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.objects.get(target).controllerId, caster);
  return state;
}

for (const [target, caster] of [['att', 'p1'], ['blk', 'p2']]) {
  test(`A: własny ${target} pozostaje w walce po efekcie kontroli`, () => {
    const state = scenario(target, caster);
    assert.deepEqual(state.combat.attackers, ['att']);
    assert.deepEqual(state.combat.blockers.get('att'), ['blk']);
    assert.equal(state.objects.get(target).tapped, false, 'untap nadal działa');
    assert.ok(state.objects.get(target).keywordGrants.includes('haste'), 'haste nadal działa');
    assert.equal(state.events.filter(e => e.type === 'control_changed').length, 0,
      'kontroler się nie zmienił — brak fałszywego zdarzenia');
    assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
    assert.equal(state.objects.get('att').damage, 2);
    assert.equal(state.objects.get('blk').damage, 4, 'oba stwory zadały obrażenia');
  });
}
for (const [target, caster] of [['att', 'p2'], ['blk', 'p1']]) {
  test(`A: cudzy ${target} nadal wypada z walki (anty-over-fix)`, () => {
    const state = scenario(target, caster);
    if (target === 'att') assert.deepEqual(state.combat.attackers, []);
    else {
      assert.deepEqual(state.combat.blockers.get('att'), []);
      assert.ok(state.combat.blockedAttackers.has('att'), 'usunięcie blokera nie odblokowuje atakującego');
    }
    assert.equal(state.events.filter(e => e.type === 'control_changed').length, 1);
    assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
    assert.equal(state.objects.get('att').damage, 0);
    assert.equal(state.objects.get('blk').damage, 0);
    assert.equal(state.players.find(p => p.id === 'p2').life, 20);
  });
}
