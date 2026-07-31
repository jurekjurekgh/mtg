import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest, choiceResponse, command, event } from '../src/protocol/types.js';

test('protokół tworzy zamrożone komendy, wybory i zdarzenia', () => {
  const cmd = command('pass_priority', 'p1');
  const choice = choiceRequest({ id: 'choice-1', type: 'target', options: ['a', 'b'] });
  const emitted = event('priority_passed', { playerId: 'p1' });
  assert.equal(Object.isFrozen(cmd), true);
  assert.equal(Object.isFrozen(choice), true);
  assert.equal(emitted.type, 'priority_passed');
  assert.deepEqual(choiceResponse(choice, 'a'), { requestId: 'choice-1', value: 'a' });
  assert.throws(() => choiceResponse(choice, 'x'), RangeError);
  assert.throws(() => command('cheat', 'p1'), TypeError);
  assert.throws(() => choiceRequest({ id: 'x', type: 'x', options: 'not-array' }), TypeError);
});
