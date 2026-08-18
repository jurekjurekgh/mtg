// ptPair — buff FX powinny pokazywać +X/+Y, nie +X gdy obie wartości równe
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSpellEffects } from '../src/table/render.js';

test('ptPair: buff_creatures_you_control 1/1 pokazuje "+1/+1", nie "+1"', () => {
  const text = describeSpellEffects({
    effects: [{ type: 'buff_creatures_you_control', power: 1, toughness: 1 }],
  });
  assert.ok(text.includes('+1/+1'), `bład: "${text}"`);
});

test('ptPair: buff_creatures_you_control 0/2 pokazuje "0/+2"', () => {
  const text = describeSpellEffects({
    effects: [{ type: 'buff_creatures_you_control', power: 0, toughness: 2 }],
  });
  assert.ok(text.includes('0/+2'), `bład: "${text}"`);
});

test('ptPair: Jyoti z source_power dla obu pokazuje "moc źródła" raz', () => {
  const text = describeSpellEffects({
    effects: [{ type: 'buff_land_creatures', power: 'source_power', toughness: 'source_power' }],
  });
  const matches = text.match(/moc źródła/g);
  assert.equal(matches?.length ?? 0, 1, `dublet: "${text}"`);
});