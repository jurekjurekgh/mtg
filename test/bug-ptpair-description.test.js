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

// PMSSB-62/F7 (żywy tester): battle cry (CR 702.91a) daje +1/+0 INNYM
// atakującym — kafelek musi to powiedzieć, bo inaczej obiecuje premię samemu
// atakującemu (Thunderstaff bez `excludeSource` zachowuje dawny opis).
test('battle cry: excludeSource mówi „innym atakującym", bez flagi zostaje ogólnie', () => {
  const battleCry = describeSpellEffects({
    effects: [{ type: 'buff_attacking_creatures', power: 1, toughness: 0, excludeSource: true }],
  });
  assert.ok(battleCry.includes('innych atakujących'), `bład: "${battleCry}"`);
  const thunderstaff = describeSpellEffects({
    effects: [{ type: 'buff_attacking_creatures', power: 1, toughness: 0 }],
  });
  assert.ok(thunderstaff.includes('dla atakujących stworów') && !thunderstaff.includes('innych'),
    `bład: "${thunderstaff}"`);
});
