import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitPlanByColors,
  needsSplit,
  SPLIT_THRESHOLD,
  MIN_NONLAND,
} from '../tools/split-deck-colors.mjs';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * M228 (ADR 0024): podział kolorystyczny talii planowej ≥30 kart nielandowych.
 * Testy: progi, poprawność podziału na syntetycznych zbiorach ORAZ na realnych
 * planach katalogu (dowód, że reguła działa na tym, co mamy).
 */

const card = (id, colors) => ({ id, colors, types: ['Creature'] });

test('needsSplit: próg to 30 kart nielandowych', () => {
  assert.equal(needsSplit(29), false);
  assert.equal(needsSplit(30), true);
  assert.equal(needsSplit(35), true);
  assert.equal(SPLIT_THRESHOLD, 30);
  assert.equal(MIN_NONLAND, 15);
});

test('podział czysty: 15 białych + 15 zielonych → W | G', () => {
  const cards = [
    ...Array.from({ length: 15 }, (_, i) => card(`w${i}`, ['W'])),
    ...Array.from({ length: 15 }, (_, i) => card(`g${i}`, ['G'])),
  ];
  const r = splitPlanByColors(cards);
  assert.ok(r, 'podział musi istnieć');
  assert.equal(r.a.length, 15);
  assert.equal(r.b.length, 15);
  assert.equal(r.leak, 0, 'brak kart rozdartych między strony');
  // Sufiksy rozłączne i odpowiadają kolorom.
  assert.ok([...r.suffixA].every((c) => !r.suffixB.includes(c)), 'sufiksy rozłączne');
  const suffixes = [r.suffixA, r.suffixB].sort();
  assert.deepEqual(suffixes, ['g', 'w']);
});

test('każda karta trafia do DOKŁADNIE jednej strony (singleton zachowany)', () => {
  const cards = [
    ...Array.from({ length: 16 }, (_, i) => card(`u${i}`, ['U'])),
    ...Array.from({ length: 16 }, (_, i) => card(`r${i}`, ['R'])),
  ];
  const r = splitPlanByColors(cards);
  const ids = [...r.a.map((c) => c.id), ...r.b.map((c) => c.id)];
  assert.equal(new Set(ids).size, cards.length, 'brak duplikatów');
  assert.equal(ids.length, cards.length, 'brak zgubionych kart');
});

test('bezkolorowe (artefakty) balansują mniejszą stronę', () => {
  const cards = [
    ...Array.from({ length: 18 }, (_, i) => card(`w${i}`, ['W'])),
    ...Array.from({ length: 6 }, (_, i) => card(`b${i}`, ['B'])),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `art${i}`, colors: [], types: ['Artifact'] })),
  ];
  const r = splitPlanByColors(cards);
  assert.ok(r, 'podział musi istnieć (filler dobalansuje stronę B do ≥15)');
  assert.ok(r.a.length >= MIN_NONLAND && r.b.length >= MIN_NONLAND);
  assert.equal(r.a.length + r.b.length, cards.length);
});

test('plan mocno jednokolorowy → null (fallback: zostaw jedną talię)', () => {
  // 28 zielonych + 2 czerwone: żaden podział nie da dwóch stron ≥15.
  const cards = [
    ...Array.from({ length: 28 }, (_, i) => card(`g${i}`, ['G'])),
    ...Array.from({ length: 2 }, (_, i) => card(`r${i}`, ['R'])),
  ];
  assert.equal(splitPlanByColors(cards), null);
});

test('wynik jest deterministyczny (ADR 0005)', () => {
  const cards = [
    ...Array.from({ length: 18 }, (_, i) => card(`w${i}`, ['W'])),
    ...Array.from({ length: 17 }, (_, i) => card(`b${i}`, ['B'])),
  ];
  const a = splitPlanByColors(cards);
  const b = splitPlanByColors(cards);
  assert.deepEqual(a.a.map((c) => c.id), b.a.map((c) => c.id));
  assert.deepEqual(a.suffixA, b.suffixA);
});

// --- Realne plany katalogu: dowód, że reguła działa na tym, co mamy ---
const registry = createCardRegistry();
const planNonland = (plan) => registry.all().filter((c) => c.support?.status === 'supported'
  && c.plan === plan && !c.id.startsWith('basic-') && !(c.types ?? []).includes('Land'));

for (const plan of ['Innistrad', 'Tarkir', 'Mirrodin', 'Dominaria', 'Warhammer Fantasy']) {
  test(`realny plan ${plan} (≥30) dzieli się na dwie talie ≥15`, () => {
    const cards = planNonland(plan);
    assert.ok(needsSplit(cards.length), `${plan} ma ${cards.length} — powinno przekraczać próg`);
    const r = splitPlanByColors(cards);
    assert.ok(r, `${plan} musi dać się podzielić`);
    assert.ok(r.a.length >= MIN_NONLAND, `strona A ${r.a.length} >= 15`);
    assert.ok(r.b.length >= MIN_NONLAND, `strona B ${r.b.length} >= 15`);
    assert.equal(r.a.length + r.b.length, cards.length, 'żadna karta nie zginęła');
    const ids = new Set([...r.a.map((c) => c.id), ...r.b.map((c) => c.id)]);
    assert.equal(ids.size, cards.length, 'brak duplikatów (singleton)');
    assert.ok([...r.suffixA].every((c) => !r.suffixB.includes(c)), 'sufiksy kolorów rozłączne');
  });
}
