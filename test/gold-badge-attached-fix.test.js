import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

/**
 * Złota odznaka (2026-08-11): testy regresyjne dla bugów UX z audytu
 * żywym testerem stołu — object_attached hostCardId i duplicate equip event.
 */

const MOCK_NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

function nameOf(cardId) {
  const map = {
    'hunters-blowgun': "Hunter's Blowgun",
    'leafcrown-dryad': 'Leafcrown Dryad',
    'dawntreader-elk': 'Dawntreader Elk',
    'serras-embrace': "Serra's Embrace",
    'angel-of-the-dawn': 'Angel of the Dawn',
    'kappa-tech-wrecker': 'Kappa Tech-Wrecker',
  };
  return map[cardId] ?? cardId ?? '?';
}

function nameOfObject(objectId) {
  // Simulate stale ID → '?'
  if (objectId === 'stale-id') return '?';
  const map = {
    'bf-1': 'Leafcrown Dryad',
    'bf-2': 'Dawntreader Elk',
    'bf-3': "Hunter's Blowgun",
    'bf-4': "Serra's Embrace",
    'bf-5': 'Angel of the Dawn',
    'bf-6': 'Kappa Tech-Wrecker',
  };
  return map[objectId] ?? '?';
}

describe('Gold badge: object_attached hostCardId', () => {
  it('bestow — uses hostCardId for host name', () => {
    const e = {
      type: 'object_attached',
      objectId: 'bf-1',
      hostId: 'stale-id', // stale — nameOfObject would give '?'
      cardId: 'leafcrown-dryad',
      hostCardId: 'dawntreader-elk', // correct LKI
      via: undefined, // default = bestow
    };
    const result = describeGameEvent(e, { nameOf, nameOfObject, isPlayer: () => false }, MOCK_NAMES);
    assert.ok(result.includes('Dawntreader Elk'), `Expected host name, got: ${result}`);
    assert.ok(!result.includes('do ?'), `Should not contain '?'`);
  });

  it('equip — uses hostCardId for host name', () => {
    const e = {
      type: 'object_attached',
      objectId: 'bf-3',
      hostId: 'stale-id',
      cardId: 'hunters-blowgun',
      hostCardId: 'kappa-tech-wrecker',
      via: 'equip',
    };
    const result = describeGameEvent(e, { nameOf, nameOfObject, isPlayer: () => false }, MOCK_NAMES);
    assert.ok(result.includes('Kappa Tech-Wrecker'), `Expected host name, got: ${result}`);
    assert.ok(result.includes('wyposaża'), `Expected equip label, got: ${result}`);
    assert.ok(!result.includes('do ?'), `Should not contain '?'`);
  });

  it('aura — uses hostCardId for host name', () => {
    const e = {
      type: 'object_attached',
      objectId: 'bf-4',
      hostId: 'stale-id',
      cardId: 'serras-embrace',
      hostCardId: 'angel-of-the-dawn',
      via: 'aura',
    };
    const result = describeGameEvent(e, { nameOf, nameOfObject, isPlayer: () => false }, MOCK_NAMES);
    assert.ok(result.includes('Angel of the Dawn'), `Expected host name, got: ${result}`);
    assert.ok(result.includes('zaczarowuje'), `Expected aura label, got: ${result}`);
    assert.ok(!result.includes('do ?'), `Should not contain '?'`);
  });

  it('bestow — falls back to nameOfObject when hostCardId is null', () => {
    const e = {
      type: 'object_attached',
      objectId: 'bf-1',
      hostId: 'bf-2', // live object — nameOfObject works
      cardId: 'leafcrown-dryad',
      hostCardId: null,
      via: undefined,
    };
    const result = describeGameEvent(e, { nameOf, nameOfObject, isPlayer: () => false }, MOCK_NAMES);
    assert.ok(result.includes('Dawntreader Elk'), `Expected host name from fallback, got: ${result}`);
  });
});
