/**
 * Deterministyczne, seedowane źródło losowości.
 *
 * Cała losowość w grze przechodzi przez to API (ADR 0005). Nigdzie w engine
 * nie wolno użyć `Math.random()` — inaczej partia przestaje być odtwarzalna.
 *
 * Algorytm: mulberry32. Wybrany, bo mieści się w kilku linijkach, nie wymaga
 * bibliotek i daje powtarzalny strumień dla danego ziarna.
 */

/**
 * @typedef {() => number} RandomFn
 *   Zwraca liczbę z przedziału [0, 1).
 */

/**
 * @param {number} seed Ziarno. Ta sama wartość daje ten sam strumień liczb.
 * @returns {RandomFn}
 */
export function createRng(seed) {
  if (!Number.isInteger(seed)) {
    throw new TypeError(`Ziarno RNG musi być liczbą całkowitą, otrzymano: ${seed}`);
  }
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
