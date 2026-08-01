import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardInstance, createGameObject, defineCardIdentity, moveGameObject } from '../src/engine/identity.js';
import { ZONES, moveToZone } from '../src/engine/zones.js';

test('definicja, egzemplarz i obiekt gry mają odrębne tożsamości', () => {
  const card = defineCardIdentity({ id: 'test-creature', name: 'Test Creature' });
  const instance = createCardInstance({ id: 'i-1', cardId: card.id, ownerId: 'p1' });
  const object = createGameObject({ id: 'o-1', instanceId: instance.id, cardId: card.id, controllerId: 'p1', zone: 'hand' });
  assert.notEqual(card.id, instance.id);
  assert.notEqual(instance.id, object.id);
  assert.equal(object.instanceId, instance.id);
});

test('zmiana strefy tworzy nowy obiekt i nie mutuje starego', () => {
  const object = createGameObject({ id: 'o-1', instanceId: 'i-1', cardId: 'c-1', controllerId: 'p1', zone: 'hand' });
  const moved = moveGameObject(object, { id: 'o-2', zone: 'battlefield' });
  assert.equal(object.zone, 'hand');
  assert.equal(moved.zone, 'battlefield');
  assert.equal(moved.instanceId, object.instanceId);
  assert.notEqual(moved.id, object.id);
});

test('strefy są jawne, a nieprawidłowa strefa jest odrzucana', () => {
  assert.deepEqual(ZONES, ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'stack']);
  const object = { id: 'o-1', zone: 'hand' };
  assert.equal(moveToZone(object, 'graveyard', 'o-2').zone, 'graveyard');
  assert.throws(() => moveToZone(object, 'unknown', 'o-2'), RangeError);
});
