import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAttachment, detach } from '../src/engine/attachments.js';

test('załącznik łączy dwa obiekty', () => {
  const a = createAttachment({ parentId: 'p1', childId: 'c1', kind: 'aura' });
  assert.equal(a.parentId, 'p1');
  assert.equal(a.attached, true);
});

test('detach usuwa powiązanie', () => {
  const a = createAttachment({ parentId: 'p', childId: 'c' });
  assert.equal(detach(a).attached, false);
});
