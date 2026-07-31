import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';
import { shuffle } from '../src/engine/shuffle.js';

test('to samo ziarno daje ten sam strumień liczb', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('różne ziarna dają różne strumienie', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a(), b());
});

test('wartości mieszczą się w przedziale [0, 1)', () => {
  const rng = createRng(999);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `poza zakresem: ${v}`);
  }
});

test('nieprawidłowe ziarno jest odrzucane', () => {
  assert.throws(() => createRng('abc'), TypeError);
  assert.throws(() => createRng(1.5), TypeError);
});

test('tasowanie jest odtwarzalne dla tego samego ziarna', () => {
  const deck = Array.from({ length: 60 }, (_, i) => i);
  assert.deepEqual(shuffle(deck, 42), shuffle(deck, 42));
});

test('tasowanie nie modyfikuje oryginału', () => {
  const deck = [1, 2, 3, 4, 5];
  const copy = deck.slice();
  shuffle(deck, 7);
  assert.deepEqual(deck, copy);
});

test('tasowanie zachowuje wszystkie karty', () => {
  const deck = Array.from({ length: 60 }, (_, i) => i);
  const shuffled = shuffle(deck, 7);
  assert.equal(shuffled.length, deck.length);
  assert.deepEqual([...shuffled].sort((x, y) => x - y), deck);
});

test('tasowanie faktycznie zmienia kolejność', () => {
  const deck = Array.from({ length: 60 }, (_, i) => i);
  assert.notDeepEqual(shuffle(deck, 7), deck);
});

test('tasowanie nie jest stronnicze — każda karta trafia na każdą pozycję', () => {
  // Regresja wobec sort(() => Math.random() - 0.5) ze starej aplikacji.
  const deck = [0, 1, 2, 3];
  const positions = new Map(deck.map((c) => [c, new Set()]));
  for (let seed = 0; seed < 400; seed += 1) {
    shuffle(deck, seed).forEach((card, idx) => positions.get(card).add(idx));
  }
  for (const [card, seen] of positions) {
    assert.equal(seen.size, deck.length, `karta ${card} nie odwiedziła wszystkich pozycji`);
  }
});
