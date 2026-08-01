import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITY_TYPE, createAbility, isActivated, isTriggered, isStatic } from '../src/engine/abilities.js';

test('framework abilities rozpoznaje trzy typy', () => {
  const act = createAbility({ type: ABILITY_TYPE.activated, cost: { tap: true }, effect: { pump: { power: 1, toughness: 1 } } });
  const trig = createAbility({ type: ABILITY_TYPE.triggered, trigger: { event: 'enter_battlefield' }, effect: { draw: 1 } });
  const stat = createAbility({ type: ABILITY_TYPE.static, effect: { boost: 'creatures' } });
  assert.ok(isActivated(act));
  assert.ok(isTriggered(trig));
  assert.ok(isStatic(stat));
  assert.equal(act.cost.tap, true);
  assert.equal(trig.trigger.event, 'enter_battlefield');
});

test('nieprawidłowy typ jest odrzucony', () => {
  assert.throws(() => createAbility({ type: 'nieznany' }), TypeError);
});
