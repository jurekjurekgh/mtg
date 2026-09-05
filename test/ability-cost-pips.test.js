import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * Strażnik klasowy audytu PR #96/F1 (Óin the Brave): pipy w koszcie zdolności
 * AKTYWOWANEJ (`cost.colors`) muszą mieć pokrycie w tekście Oracle karty —
 * `{1}` to koszt generyczny, nie `{R}` (L23 dla kosztów zaklęć; tu odpowiednik
 * dla kosztów aktywacji).
 *
 * Metoda: z Oracle (po zdjęciu reminder text w nawiasach) zbieramy multizbiory
 * pipów z (a) nagłówków kosztu przed `:` oraz (b) linii „Keyword {koszt}”
 * (ninjutsu/cycling/equip/… — bez dwukropka). Każdy koszt z pipami musi
 * pasować do co najmniej jednego multizbioru z własnej karty.
 *
 * Ograniczenia: dopasowanie na poziomie karty (nie zdolności) — karta z dwoma
 * zdolnościami o różnych pipach przejdzie, gdy OBA multizbiory występują
 * w tekście; deskryptory dopłat (kicker/offspring) mają inny kształt i są
 * poza strażnikiem.
 */
const PIP_RE = /\{([WUBRG])\}/g;
const pipsOf = (s) => [...s.matchAll(PIP_RE)].map((m) => m[1]).sort().join('');

function oraclePipSets(oracleText) {
  const clean = String(oracleText ?? '').replace(/\([^()]*\)/g, '');
  const sets = new Set();
  for (const m of clean.matchAll(/(\{[^{}]*\}[^:\n]*?):/g)) sets.add(pipsOf(m[1]));
  for (const line of clean.split('\n')) {
    if (line.includes(':')) continue;
    const kw = line.trim().match(/^[A-Z][A-Za-z’', ]*?\d?\s*[—–-]?\s*((?:\{[^{}]+\}\s*)+)$/);
    if (kw) sets.add(pipsOf(kw[1]));
  }
  return sets;
}

test('koszty aktywacji: pipy (cost.colors) mają pokrycie w Oracle karty (F1)', () => {
  const registry = createCardRegistry();
  const misses = [];
  let checked = 0;
  for (const card of registry.all()) {
    if (card.support?.status !== 'supported') continue;
    const sets = oraclePipSets(card.oracleText);
    for (const [index, ability] of (card.abilities ?? []).entries()) {
      const colors = ability.cost?.colors ?? [];
      if (colors.length === 0) continue;
      checked += 1;
      const want = [...colors].sort().join('');
      if (!sets.has(want)) misses.push(`${card.id}#${index} [${want}]`);
    }
  }
  assert.ok(checked > 0, 'strażnik objął co najmniej jedną zdolność z pipami');
  assert.deepEqual(misses, [], `pip bez pokrycia w Oracle: ${misses.join(', ')}`);
});
