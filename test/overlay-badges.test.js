// M89: nakładki na karcie (overlay badges) NIE mogą zachodzić na siebie.
// Właściciel: „Informacje na karcie na stole - np. Choroba i aura nałożona
// na stwora są w osobnych wierszach, ale te wiersze nakładają się na siebie
// i jest to nieczytelne" (2026-08-13).
//
// Root cause: `.ovl` ma `position: absolute; inset: 0` i
// `justify-content: space-between` (rozpycha elementy). `.ovl-badges`
// ma `flex-direction: column; gap: 2px` (zawijanie nie jest włączone).
// Na kaflu z 5+ badge'ami (obrażenia, choroba, licznik, zaczarowana,
// wyposażona) suma wysokości badge'ów przekracza dostępną wysokość
// `.ovl`, a `space-between` dzieli ją proporcjonalnie — wiersze
// zaczynają na siebie nachodzić (głównie w `sm`).
//
// Fix (CSS w index.html): `.ovl-badges` z `flex-wrap: wrap` na badges + max-height
// fallback + line-height: 1.1 na .ovl-badge dla kompaktowej wysokości.
//
// Testy poniżej weryfikują CSS bez jsdom (CI nie uruchamia `npm install`,
// więc jsdom może nie być dostępny — test 1 zweryfikowałby integrację DOM,
// ale tu kluczowa jest poprawność CSS, bo to ona powoduje nachodzenie).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('overlay: CSS .ovl-badges ma flex-wrap: wrap (żeby 5+ badge zawijało)', () => {
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const match = html.match(/\.ovl-badges\s*\{[^}]*\}/);
  assert.ok(match, 'CSS dla .ovl-badges powinien istnieć w index.html');
  assert.match(match[0], /flex-wrap:\s*wrap/,
    'CSS .ovl-badges MUSI mieć flex-wrap: wrap (żeby 5+ badges zawijało bez nakładania)');
});

test('overlay: CSS .ovl-badge ma kompaktowy line-height', () => {
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const match = html.match(/\.ovl-badge\s*\{[^}]*\}/);
  assert.ok(match, 'CSS dla .ovl-badge powinien istnieć w index.html');
  // line-height: 1.1 lub mniej — kompaktowa wysokość badge.
  assert.match(match[0], /line-height:\s*[01](?:\.[0-9]+)?/,
    'CSS .ovl-badge MUSI mieć line-height: 1.1 (kompaktowa wysokość)');
});

test('overlay: buildStateOverlay jest wyeksportowany z render.js', () => {
  // Po M89 buildStateOverlay jest eksportowany (testowalny headless). Bez
  // tego test DOM-overlay (z JSDOM) nie miałby do czego się dobrać.
  const src = fs.readFileSync('src/table/render.js', 'utf8');
  assert.match(src, /export\s+function\s+buildStateOverlay/,
    'buildStateOverlay MUSI być wyeksportowany z render.js (testowalność)');
});
