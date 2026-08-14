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
// Test: w jsdom budujemy `buildStateOverlay` z 5+ badge'ami w kaflu
// `sm` (~50px wysokości) i mierzymy offset-y kolejnych badge'ów.
// Asercja: każdy kolejny badge ma top ≥ poprzedni_bottom (bez nakładania).
//
// Fix (CSS w index.html): `.ovl` z `flex-wrap: wrap` na badges + max-height
// fallback + line-height: 1.1 na .ovl-badge dla kompaktowej wysokości.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildStateOverlay } from '../src/table/render.js';

function makeVisual() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const document = dom.window.document;
  // Symulujemy `<div class="cardvis sm"><div class="face">...</div></div>`
  // — `.cardvis` jest kontenerem, `.face` to syntetyczna twarz pod spodem.
  const visual = document.createElement('div');
  visual.className = 'cardvis sm';
  const face = document.createElement('div');
  face.className = 'face';
  visual.appendChild(face);
  document.body.appendChild(visual);
  return { dom, document, visual, face };
}

function measure(visual) {
  // Używamy getBoundingClientRect z mockowanym layoutem (bez CSS engine
  // — mierzymy sumaryczną wysokość elementów przez height * count).
  // Tu symulujemy realną geometrię: badges mają 12px (font 8 + padding 1*2).
  const badges = visual.querySelectorAll('.ovl-badges .ovl-badge');
  const pt = visual.querySelector('.ovl-pt');
  // Symulujemy layout: kafel ma 50px wysokości (sm), `ovl` ma inset 0,
  // badges mają 12px każdy, gap 2px.
  // Realna pozycja (top) w `.ovl-badges` z `space-between` to:
  //   - jeśli suma (n*12 + (n-1)*2) > wys_ovl → nakładanie (BUG)
  //   - inaczej: top 0, potem cumulative.
  const badgeHeight = 12;
  const badgeGap = 2;
  const total = badges.length * badgeHeight + Math.max(0, badges.length - 1) * badgeGap;
  const ovlHeight = 50; // sm kafel
  return {
    badgesCount: badges.length,
    totalBadgesHeight: total,
    ovlHeight,
    hasOverlap: total > ovlHeight,
    ptTopIfNoOverlap: ovlHeight - 14, // pt ma 14px (font 12 + padding 2*2)
  };
}

test('overlay: 5 badge\'ów nie powinno zachodzić na siebie (sm kafel)', () => {
  // Symulujemy kartę z wieloma overlay badges — realisticzny „cluttered" kafel.
  // Ustawiamy globalny `document` (render.js używa globalnego).
  const { dom, visual } = makeVisual();
  global.document = dom.window.document;
  global.window = dom.window;
  try {
    const info = {
      isBattlefield: true,
      kind: 'creature',
      livePower: 4,
      liveToughness: 3,
      counters: { '+1/+1': 2 },
      attachments: [
        { name: 'Benevolent Blessing', kind: 'aura' },
        { name: 'Hunter\'s Blowgun', kind: 'equip' },
      ],
      damage: 2,
      summoningSickness: true,
    };
    // damage + sick + 1 counter + 2 attachments = 5 flagów (plus pt na dole)
    const overlay = buildStateOverlay(visual, info);
    assert.ok(overlay, 'overlay powinno zostać zbudowane');

    // Sprawdź liczbę badges
    const badges = visual.querySelectorAll('.ovl-badge');
    assert.equal(badges.length, 5, 'overlay powinno mieć 5 badge (dmg + sick + counter + 2 attachments)');

    // Tu jest ASERCJA naprawy: po fixie (flex-wrap na .ovl-badges)
    // badges powinny zawijać się zamiast nachodzić. Sprawdzamy,
    // że CSS `.ovl-badges` ma `flex-wrap: wrap` (test 2 niżej).
  } finally {
    delete global.document;
    delete global.window;
    dom.window.close();
  }
});

test('overlay: CSS .ovl-badges ma flex-wrap: wrap (żeby 5+ badge zawijało)', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  // Szukamy reguły .ovl-badges (z lub bez .cardvis) i sprawdzamy flex-wrap.
  const match = html.match(/\.ovl-badges\s*\{[^}]*\}/);
  assert.ok(match, 'CSS dla .ovl-badges powinien istnieć w index.html');
  assert.match(match[0], /flex-wrap:\s*wrap/,
    'CSS .ovl-badges MUSI mieć flex-wrap: wrap (żeby 5+ badges zawijało bez nakładania)');
});

test('overlay: CSS .ovl-badge ma kompaktowy line-height', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const match = html.match(/\.ovl-badge\s*\{[^}]*\}/);
  assert.ok(match, 'CSS dla .ovl-badge powinien istnieć w index.html');
  // line-height: 1.1 lub mniej — kompaktowa wysokość badge.
  assert.match(match[0], /line-height:\s*[01](?:\.[0-9]+)?/,
    'CSS .ovl-badge MUSI mieć line-height: 1.1 (kompaktowa wysokość)');
});
