import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDeckSupported, createRegistry, defineCard } from '../src/cards/registry.js';

const supported = defineCard({ id: 'bolt', name: 'Lightning Bolt', set: 'TST', plan: 'test', types: ['Instant'], support: { status: 'supported' } });
const draft = defineCard({ id: 'future', name: 'Future Card', support: { status: 'in-development' } });

test('registry przechowuje status wsparcia i metadane Set/Plan', () => {
  const registry = createRegistry([supported, draft]);
  assert.equal(registry.supported()[0].id, 'bolt');
  assert.equal(registry.get('bolt').set, 'TST');
  assert.equal(registry.get('bolt').plan, 'test');
  assert.equal(registry.get('future').support.status, 'in-development');
});

test('talia odrzuca kartę bez statusu supported', () => {
  const registry = createRegistry([supported, draft]);
  assert.equal(assertDeckSupported(['bolt'], registry), true);
  assert.throws(() => assertDeckSupported(['future'], registry), /nieobsługiwane/);
  assert.throws(() => assertDeckSupported(['missing'], registry), /nieobsługiwane/);
});

test('registry odrzuca duplikat definicji', () => {
  assert.throws(() => createRegistry([supported, supported]), /Duplikat/);
});
