import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineCard, createRegistry } from '../src/cards/registry.js';
import { ABILITY_TYPE, createAbility } from '../src/engine/abilities.js';

test('karta może zawierać abilities', () => {
  const card = defineCard({
    id: 'test-ability', name: 'Test Ability', set: 'TEST', types: ['Creature'], colors: ['B'],
    abilities: [createAbility({ type: ABILITY_TYPE.activated, cost: { tap: true }, effect: { draw: 1 } })],
    support: { status: 'limited' },
  });
  assert.equal(card.abilities.length, 1);
  assert.equal(card.abilities[0].type, ABILITY_TYPE.activated);
  const reg = createRegistry([card]);
  assert.ok(reg.get('test-ability').abilities);
});
