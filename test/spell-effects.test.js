import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';

const SHOCK = { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] };
const MIGHT = { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'pump', power: 2, toughness: 2 }] };

function duel() {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  addMana(state, 'p1', 3);
  addMana(state, 'p2', 1);
  addObject(state, { id: 'rat', instanceId: 'ir', cardId: 'Rat', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  addObject(state, { id: 'wolf', instanceId: 'iw', cardId: 'Wolf', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 3, toughness: 3 });
  addObject(state, { id: 'shock', instanceId: 'is', cardId: 'Shock', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1, spell: SHOCK });
  addObject(state, { id: 'might', instanceId: 'im', cardId: 'Might', controllerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 1, spell: MIGHT });
  return state;
}

function passRoundResolving(state) {
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
}

test('shock zabija małego stwora state-based action po rozstrzygnięciu', () => {
  const state = duel();
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['wolf'] });
  passRoundResolving(state);
  assert.equal(state.objects.get('wolf').damage, 2);
  assert.equal(state.objects.get('wolf').zone, 'battlefield');
  // Rat z 1 wytrzymałością nie przeżyłby; wolf 3/3 z 2 obrażeniami żyje.
  assert.equal(state.zones.graveyard.length, 1); // sam czar
});

test('pump ratuje stwora przed śmiertelnymi obrażeniami (efektywna wytrzymałość)', () => {
  const state = duel();
  // p1 rzuca shock w rat p1… nie: w wolfa; p2 odpowiada pump na wolfa (stos: shock pod spodem).
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['rat'] });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'might', targets: ['rat'] });
  passRoundResolving(state); // rozstrzyga się Might (LIFO): rat 3/3
  assert.equal(effectiveToughness(state.objects.get('rat')), 3);
  passRoundResolving(state); // rozstrzyga się Shock: 2 < 3, rat żyje
  assert.equal(state.objects.get('rat').zone, 'battlefield');
  assert.equal(state.objects.get('rat').damage, 2);
});

test('pump zwiększa efektywną siłę w combat, a modyfikatory gasną w cleanup', () => {
  const state = duel();
  addMana(state, 'p1', 1);
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, { id: 'might1', instanceId: 'im1', cardId: 'Might', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1, spell: MIGHT });
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'might1', targets: ['rat'] });
  passRoundResolving(state); // rat 3/3
  assert.equal(effectivePower(state.objects.get('rat')), 3);

  // Combat: rat atakuje niebroniony — p2 traci 3 życia, nie 1.
  for (let i = 0; i < 4; i += 1) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.equal(state.turn.step, 'declare_attackers');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['rat'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(state.players[1].life, 17);

  // Cleanup: modyfikatory gasną jak „do końca tury".
  for (let i = 0; i < 6; i += 1) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.equal(state.turn.step, 'cleanup');
  assert.equal(effectivePower(state.objects.get('rat')), 1);
  assert.equal(state.objects.get('rat').powerModifier, 0);
});
