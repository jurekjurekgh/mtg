// PMSSB-65 (batch 68) — prowess Bloodfire Experta w rzucie stworzenia: wycena ze STANU, nie płaska.
// Przed: `anticipatedTailValue` dawał płaskie like 0.5 × (p·2+t) = Δ 1.35 niezależnie od ręki
// (PR2/PR3 w sondzie). Po: payoff pumpu z czarów nie-stworzeń zagrywalnych w następnej turze
// (`temporaryPumpPayoff` × `boardPayoffWeight`, budżet many = lądy). Sonda: tools/pmssb65-prowess-sonda.mjs.
// Skala: wynik rzutu = Σ wag × 0.9 (rodzina `cast`). Jeden pump w oknie bez blokera = 0.5 × 4 × 0.9 = 1.8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROWESS_SCENARIOS, prowessScore, putSynthCreature } from '../tools/pmssb65-prowess-sonda.mjs';

const sc = (prefix) => PROWESS_SCENARIOS.find((s) => s.id.startsWith(prefix));

function check(prefix) {
  const s = sc(prefix);
  const a = prowessScore({ ...s.a })[0];
  const b = prowessScore({ ...s.b })[0];
  return { a, b, ok: s.oczekuje(a, b) };
}

test('PMSSB-65/PR1 jeden czar w ręce → jeden pump w oknie: Δ = 0.5 × 4 × 0.9 = 1.8', () => {
  const r = check('PR1');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
  assert.ok(Math.abs(r.a - r.b - 1.8) < 0.01, `Δ=${r.a - r.b}`);
});

test('PMSSB-65/PR2 dwa czary w ręce → dwa pumpy: wyżej o kolejne 1.8 (stan, nie płaska stała)', () => {
  const r = check('PR2');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
  assert.ok(Math.abs(r.a - r.b - 1.8) < 0.01, `Δ=${r.a - r.b}`);
});

test('PMSSB-65/PR3 bez czarów w ręce prowess nie ma wartości (płaska wersja dawała 1.35)', () => {
  assert.equal(check('PR3').ok, true);
});

test('PMSSB-65/PR4 anty-over-fix: bez wyzwalacza czary w ręce nie zmieniają wyniku', () => {
  assert.equal(check('PR4').ok, true);
});

test('PMSSB-65/PR5 zero lądów: czary nie są zagrywalne w następnej turze → brak wartości', () => {
  assert.equal(check('PR5').ok, true);
});

test('PMSSB-65/PR6 blokujący wróg obniża wartość pumpu (pump 4/2 nie przełamuje bloku 2/2)', () => {
  // Ten sam stół dla obu wariantów (prowess vs noAbility z tym samym blokerem): mierzymy tylko Δ
  // od zdolności — inaczej wpływ ciała wroga na inne człony zafałszowałby wynik (anty-over-fix).
  const blk = (s) => putSynthCreature(s, 'ev', 'p1', { power: 2, toughness: 2, mv: 2 });
  const dBlk = prowessScore({ handSpells: ['shock'], board: blk })[0] - prowessScore({ noAbility: true, handSpells: ['shock'], board: blk })[0];
  const dOpen = prowessScore({ handSpells: ['shock'] })[0] - prowessScore({ noAbility: true, handSpells: ['shock'] })[0];
  assert.ok(Math.abs(dBlk - 0.9) < 0.01, `Δ z blokerem=${dBlk}`);
  assert.ok(Math.abs(dOpen - 1.8) < 0.01, `Δ bez blokera=${dOpen}`);
  assert.ok(dBlk < dOpen, 'blokowany prowess wart mniej niż niezablokowany');
});
