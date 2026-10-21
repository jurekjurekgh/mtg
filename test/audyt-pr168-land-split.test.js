// Audyt PR #168/A-5: brak pipów kosztu czaru + same pipy zdolności
// powodował 0/0 i `{ W: NaN }` zamiast podstawowych źródeł many.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { abilityCostColorsOf, coloredPips, landSplit } from '../tools/generate-plan-decks.mjs';

const registry = createCardRegistry();
const card = (id) => registry.get(id);

test('A-5: talia z pipami tylko w zdolności (cycling Secluded Steppe) ma dodatnie landy', () => {
  const steppe = card('secluded-steppe');
  assert.ok(Object.values(coloredPips(steppe)).every((n) => n === 0));
  assert.deepEqual(abilityCostColorsOf(steppe), ['W']);
  assert.deepEqual(landSplit(Array(4).fill(steppe)), { W: 2 });
});

test('A-5: bez pipów druku proporcje liczy liczba kart wymagających danego koloru', () => {
  const deck = [...Array(6).fill(card('secluded-steppe')),
    ...Array(2).fill(card('panic-spellbomb'))];
  assert.deepEqual(landSplit(deck), { W: 3, R: 1 });
  assert.deepEqual(landSplit([...deck].reverse()), { W: 3, R: 1 }, 'kolejność kart nie wpływa na wynik');
});

test('A-5: gdy są drukowane pipy, nie zmieniaj dotychczasowych wag ani minimów', () => {
  // 2 pipy R w koszcie Watchera, 4 karty z pipem W tylko w zdolności.
  // Przed zmianą: minimum W = 1, pozostała proporcja R = 2.
  const deck = [card('ballista-watcher'), ...Array(4).fill(card('secluded-steppe'))];
  assert.deepEqual(landSplit(deck), { W: 1, R: 2 });
});
