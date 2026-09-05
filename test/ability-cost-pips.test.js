import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * Strażnik klasowy audytu PR #96/F1 (Óin the Brave): pipy w koszcie zdolności
 * AKTYWOWANEJ (`cost.colors`) muszą mieć pokrycie w tekście Oracle karty —
 * `{1}` to koszt generyczny, nie `{R}` (L23 dla kosztów zaklęć; tu odpowiednik
 * dla kosztów aktywacji).
 *
 * Metoda: z Oracle (po zdjęciu reminder text w nawiasach) zbieramy WYSTĄPIENIA
 * multizbiorów pipów z (a) nagłówków kosztu przed `:` oraz (b) linii
 * „Keyword {koszt}” (ninjutsu/cycling/equip/… — bez dwukropka). Każda zdolność
 * z pipami KONSUMUJE jedno wystąpienie swojego multizbioru.
 *
 * Podniesienie O5 (audyt PR #97, handoff 2026-09-05b): dopasowanie żyło na
 * poziomie KARTY (zbiór unikalnych multizbiorów) — karta z dwiema aktywacjami
 * o tych samych pipach przechodziła nawet, gdy Oracle ma tylko JEDNO
 * wystąpienie. Pierwsza karta z dwiema kolorowymi aktywacjami już jest
 * (death-hood-cobra: 2× {1}{G} gains reach/deathtouch), więc strażnik liczy
 * WYSTĄPIENIA i rozlicza je per zdolność.
 *
 * Ograniczenia (jawne): deskryptory dopłat (kicker/offspring) mają inny kształt
 * i są poza strażnikiem; ROZRÓŻNIENIE WARTOŚCI pipów między zdolnościami tej
 * samej karty (przestawka {R}/{G} vs {G}/{R}) pozostaje poza zasięgiem —
 * tekst Oracle nie niesie mapowania nagłówek→zdolność (patrz test
 * „przestawka pozostaje poza zasięgiem”).
 */
const PIP_RE = /\{([WUBRG])\}/g;
const pipsOf = (s) => [...s.matchAll(PIP_RE)].map((m) => m[1]).sort().join('');

/** Multizbiór wystąpień pipów w nagłówkach kosztów Oracle: multizbiór → liczba. */
function oraclePipCounts(oracleText) {
  const clean = String(oracleText ?? '').replace(/\([^()]*\)/g, '');
  const counts = new Map();
  const bump = (key) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const m of clean.matchAll(/(\{[^{}]*\}[^:\n]*?):/g)) bump(pipsOf(m[1]));
  for (const line of clean.split('\n')) {
    if (line.includes(':')) continue;
    const kw = line.trim().match(/^[A-Z][A-Za-z’', ]*?\d?\s*[—–-]?\s*((?:\{[^{}]+\}\s*)+)$/);
    if (kw) bump(pipsOf(kw[1]));
  }
  return counts;
}

/**
 * Missy pipów aktywacji jednej karty: zdolność bez żadnego wystąpienia
 * swojego multizbioru w Oracle oraz NADMIAROWE konsumpcje (popyt zdolności
 * przekracza liczbę wystąpieów w tekście — luka O5).
 */
function abilityPipMisses(card) {
  const available = oraclePipCounts(card.oracleText);
  const misses = [];
  for (const [index, ability] of (card.abilities ?? []).entries()) {
    const colors = ability.cost?.colors ?? [];
    if (colors.length === 0) continue;
    const want = [...colors].sort().join('');
    if ((available.get(want) ?? 0) <= 0) {
      misses.push(`${card.id}#${index} [${want}] brak w Oracle`);
      continue;
    }
    available.set(want, available.get(want) - 1); // konsumpcja wystąpienia
  }
  return misses;
}

test('koszty aktywacji: pipy (cost.colors) mają pokrycie w Oracle karty (F1)', () => {
  const registry = createCardRegistry();
  const misses = [];
  let checked = 0;
  let multiActivationCards = 0;
  for (const card of registry.all()) {
    if (card.support?.status !== 'supported') continue;
    const colored = (card.abilities ?? []).filter((a) => (a.cost?.colors ?? []).length > 0).length;
    if (colored >= 2) multiActivationCards += 1;
    checked += colored;
    misses.push(...abilityPipMisses(card));
  }
  assert.ok(checked > 0, 'strażnik objął co najmniej jedną zdolność z pipami');
  assert.ok(multiActivationCards > 0, 'w katalogu jest karta z 2+ kolorowymi aktywacjami (warunek podniesienia O5)');
  assert.deepEqual(misses, [], `pip bez pokrycia w Oracle: ${misses.join(', ')}`);
});

test('O5 podniesienie: dwie aktywacje {G} konsumują DWA wystąpienia — jedno w Oracle to miss', () => {
  // Syntetyk kształtu death-hood-cobra, ale okradziony z drugiego nagłówka:
  // stary strażnik (zbiór unikalnych multizbiorów) to przepuszczał — popyt
  // obu zdolności zaspokaja jedno wystąpienie „G” w zbiorze.
  const card = {
    id: 'test-cobra-okrojona', oracleText: '{1}{G}: This creature gains deathtouch until end of turn.',
    abilities: [
      { type: 'activated', cost: { mana: 2, colors: ['G'] } },
      { type: 'activated', cost: { mana: 2, colors: ['G'] } },
    ],
  };
  assert.deepEqual(abilityPipMisses(card), ['test-cobra-okrojona#1 [G] brak w Oracle']);
});

test('O5 podniesienie anty-over-fix: prawidłowe dwie aktywacje {G} przy dwóch wystąpieniach przechodzą', () => {
  const card = {
    id: 'test-cobra-dobra', oracleText: '{1}{G}: Reach.\n{1}{G}: Deathtouch.',
    abilities: [
      { type: 'activated', cost: { mana: 2, colors: ['G'] } },
      { type: 'activated', cost: { mana: 2, colors: ['G'] } },
    ],
  };
  assert.deepEqual(abilityPipMisses(card), []);
});

test('O5 ograniczenie udokumentowane: przestawka WARTOŚCI pipów między zdolnościami pozostaje poza zasięgiem', () => {
  // Oracle ma {R}: i {G}:, deskryptory mają przestawione wartości (R↔G).
  // Tekst nie niesie mapowania nagłówek→zdolność, więc multizbiory się
  // zgadzają i strażnik milczy — to jawne ograniczenie nagłówka, nie błąd
  // podniesienia. Test pinnie tę świadomość (gdyby ktoś „naprawił” milczenie
  // przez odrzucanie takich kart, zepsuje fałszywie poprawne karty).
  const card = {
    id: 'test-przestawka', oracleText: '{R}: First ability.\n{G}: Second ability.',
    abilities: [
      { type: 'activated', cost: { mana: 0, colors: ['G'] } },
      { type: 'activated', cost: { mana: 0, colors: ['R'] } },
    ],
  };
  assert.deepEqual(abilityPipMisses(card), []);
});
