/**
 * Tasowanie talii.
 *
 * Zastępuje `library.sort(() => Math.random() - 0.5)` ze starej aplikacji,
 * które było jednocześnie statystycznie stronnicze i nieodtwarzalne
 * (zob. docs/AUDIT_LEGACY_APP.md §5).
 */

import { createRng } from './rng.js';

/**
 * Tasowanie Fishera-Yatesa. Nie modyfikuje wejścia.
 *
 * @template T
 * @param {readonly T[]} items
 * @param {number} seed
 * @returns {T[]} Nowa, przetasowana tablica.
 */
export function shuffle(items, seed) {
  if (!Array.isArray(items)) {
    throw new TypeError('shuffle() oczekuje tablicy');
  }
  const rng = createRng(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
