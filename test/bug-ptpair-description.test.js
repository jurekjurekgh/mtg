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

// Żywy tester 2026-11-27 (partia worek-legend vs dominaria-brg, seed 9):
// kafel Saltfield Recluse pokazywał „{T}: cel: stwór — -2/+0 do końca tury”,
// a Oracle karty mówi „Target creature gets -2/-0 until end of turn.” —
// „+0" i „-0" nie zmieniają obrony; chodzi o spójność prezentacji z Oracle.
// Znak zera idzie po KIERUNKU efektu: kary „-X/-0”, premie „+X/+0”.
test('pump karny -2/0 pokazuje „-2/-0”, nie „-2/+0” (Oracle Saltfield Recluse)', () => {
  const text = describeSpellEffects({
    effects: [{ type: 'pump', power: -2, toughness: 0 }],
  });
  assert.ok(text.includes('-2/-0'), `błąd: "${text}"`);
  assert.ok(!text.includes('-2/+0'), `błąd: "${text}"`);
});

test('pump premia +1/+0 zostaje „+1/+0” (konwencja WotC dla premii)', () => {
  const text = describeSpellEffects({
    effects: [{ type: 'pump', power: 1, toughness: 0 }],
  });
  assert.ok(text.includes('+1/+0'), `błąd: "${text}"`);
});

test('pump (0/-2) pokazuje „-0/-2” — znak zera idzie po kierunku efektu (kara)', () => {
  const text = describeSpellEffects({
    effects: [{ type: 'pump', power: 0, toughness: -2 }],
  });
  assert.ok(text.includes('-0/-2'), `błąd: "${text}"`);
});
