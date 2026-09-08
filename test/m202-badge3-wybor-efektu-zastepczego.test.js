// B54 korekta M202: CR122.1c dopuszcza shield przy destroy EFEKTEM,
// nie przy lethal SBA. Dawne testy błędnie stawiały wybór w SBA.
// https://mtg.wiki/page/Shield_counter, CR2026-08-07, fetched2026-09-08:
// “If this permanent would be destroyed as the result of an effect,
// instead remove a shield counter from it”. Testy nie legalizują starego błędu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { runStateBasedActions, addRegenerationShield } from '../src/engine/state-based.js';
import { addCounter } from '../src/engine/counters.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function stateWith({ shield = 0, regeneration = false, damage = 5, toughness = 3, controller = 'p1' } = {}) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, number: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const def = REGISTRY.get('hill-giant');
  addObject(state, {
    id: 'c1', instanceId: 'i-c1', cardId: 'hill-giant', controllerId: controller, ownerId: controller,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], keywords: [], subtypes: [],
    power: 3, toughness,
  });
  state.objects.set('c1', Object.freeze({ ...state.objects.get('c1'), summoningSickness: false, damage }));
  if (shield > 0) addCounter(state, 'c1', 'shield', shield);
  if (regeneration) addRegenerationShield(state, 'c1');
  return state;
}

const offers = (state, playerId = 'p1') => playerView(state, playerId).legalCommands
  .filter((c) => c.type === 'resolve_replacement_choice');


for (const controller of ['p1', 'p2']) test(`M202/B54: lethal SBA bez fałszywego wyboru, controller=${controller}`, () => {
  const state = stateWith({ shield: 1, regeneration: true, controller });
  runStateBasedActions(state);
  assert.equal(state.pendingReplacementChoice, null);
  assert.equal(offers(state, 'p1').length, 0); assert.equal(offers(state, 'p2').length, 0);
  assert.equal(state.objects.get('c1').damage, 0);
  assert.equal(state.objects.get('c1').tapped, true);
  assert.equal(state.objects.get('c1').counters.shield, 1);
  assert.deepEqual(state.regenerationShields, []);
});
for (const shield of [0, 1, 2]) test(`M202/B54: lethal SBA bez regeneracji, shield=${shield}`, () => {
  const state = stateWith({ shield }); runStateBasedActions(state);
  assert.equal(state.pendingReplacementChoice, null);
  assert.notEqual(state.objects.get('c1')?.zone, 'battlefield');
  assert.equal(state.events.some(e => e.type === 'shield_consumed'), false);
});
test('M202/B54: sama regeneracja nadal chroni przed lethal', () => {
  const state = stateWith({ regeneration: true }); runStateBasedActions(state);
  assert.equal(state.objects.get('c1').zone, 'battlefield');
  assert.equal(state.objects.get('c1').tapped, true); assert.equal(state.objects.get('c1').damage, 0);
});
test('M202/B54: zero toughness omija obie ochrony', () => {
  const state = stateWith({ shield: 1, regeneration: true, damage: 0 });
  state.objects.set('c1', Object.freeze({ ...state.objects.get('c1'), toughnessModifier: -5 }));
  runStateBasedActions(state); assert.equal(state.pendingReplacementChoice, null);
  assert.notEqual(state.objects.get('c1')?.zone, 'battlefield');
  assert.equal(state.events.some(e => e.type === 'permanent_regenerated' || e.type === 'shield_consumed'), false);
});
test('M202/B54: obrażenia poniżej lethal nie zużywają ochrony', () => {
  const state = stateWith({ shield: 1, regeneration: true, damage: 2 }); runStateBasedActions(state);
  assert.equal(state.objects.get('c1').damage, 2);
  assert.equal(state.objects.get('c1').counters.shield, 1);
  assert.deepEqual(state.regenerationShields, ['c1']); assert.equal(state.pendingReplacementChoice, null);
});
