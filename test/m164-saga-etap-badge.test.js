// M164 — pytanie właściciela (2026-08-20): „W jaki sposób oznaczony jest etap
// Sagi na karcie? Myślę, że powinien być opisany tekstowo na badge na karcie
// (analogicznie do aur, enchantmentów, equipmentów, counterów)."
//
// Stan przed: jedynym znacznikiem postępu Sagi na kaflu był GENERYCZNY
// licznik „lore×N" (COUNTER_LABELS) + pełna lista rozdziałów w rulesText
// (M159/Z4). Brak tekstowego badge'a AKTYWNEGO rozdziału.
//
// Fix: badge na nakładce kafla — „Rozdział II (2/3)" (licznik lore = numer
// rozdziału, CR 714.3); generyczny licznik lore nie dubluje się przy Sagach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStateOverlay, rulesText } from '../src/table/render.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = '';
    this.text = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}

globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const CHAPTERS = [
  [{ type: 'scry', amount: 2 }],
  [{ type: 'draw_cards', amount: 1 }],
  [{ type: 'next_spell_discount', amount: 2, subtype: 'Giant' }],
];

function sagaInfo(lore, extra = {}) {
  return {
    isBattlefield: true,
    kind: 'enchantment',
    saga: { chapters: CHAPTERS },
    counters: lore > 0 ? { lore } : {},
    ...extra,
  };
}

function badgeTexts(visual) {
  return visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge'))
    .map((el) => el.textContent);
}

test('S1: Saga na polu bitwy niesie badge AKTYWNEGO rozdziału (lore=2)', () => {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, sagaInfo(2));
  const badges = badgeTexts(visual);
  assert.ok(badges.some((t) => t === 'Rozdział II (2/3)'),
    `badge etapu „Rozdział II (2/3)", a badge'e: [${badges}]`);
});

test('S2: generyczny licznik „lore×N" NIE dubluje się przy Sadze', () => {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, sagaInfo(2));
  const badges = badgeTexts(visual);
  assert.ok(!badges.some((t) => t.includes('lore')), `bez dublującego licznika lore: [${badges}]`);
  // Inne liczniki (jeśli były) zostają.
  const withOil = new MiniEl('div');
  buildStateOverlay(withOil, sagaInfo(1, { counters: { lore: 1, oil: 2 } }));
  const texts = badgeTexts(withOil);
  assert.ok(texts.some((t) => t === 'Rozdział I (1/3)'), `badge etapu: [${texts}]`);
  assert.ok(texts.some((t) => t.includes('oil')), `inne liczniki zostają: [${texts}]`);
});

test('S3: pierwszy i ostatni rozdział; Saga bez licznika lore (0)', () => {
  const first = new MiniEl('div');
  buildStateOverlay(first, sagaInfo(1));
  assert.ok(badgeTexts(first).includes('Rozdział I (1/3)'));
  const last = new MiniEl('div');
  buildStateOverlay(last, sagaInfo(3));
  assert.ok(badgeTexts(last).includes('Rozdział III (3/3)'));
  const none = new MiniEl('div');
  buildStateOverlay(none, sagaInfo(0));
  const texts = badgeTexts(none);
  assert.ok(texts.some((t) => t === 'Saga — 3 rozdz.'), `bez lore: opis całości: [${texts}]`);
});

test('S4: obiekt NIE-będący Sagą z licznikiem lore zachowuje stary licznik', () => {
  // Lore counter teoretycznie może wylądować na nie-Sadze (np. efekty
  // przenoszące liczniki) — wtedy zostaje generyczny licznik (bez badge'u
  // rozdziału, bo nie ma rozdziałów).
  const visual = new MiniEl('div');
  buildStateOverlay(visual, { isBattlefield: true, kind: 'creature', saga: null, counters: { lore: 2 } });
  const texts = badgeTexts(visual);
  assert.ok(texts.some((t) => t.includes('lore×2')), `licznik lore bez Sagi: [${texts}]`);
  assert.ok(!texts.some((t) => t.includes('Rozdział')), `bez badge'u rozdziału: [${texts}]`);
});

test('S5: CSS badge etapu Sagi istnieje (klasa .ovl-badge.saga)', () => {
  const html = readFileSync(new URL('../src/table/index.html', import.meta.url), 'utf8');
  assert.match(html, /\.ovl-badge\.saga\s*\{[^}]*background:/,
    'badge etapu Sagi ma własną klasę CSS (fiolet, tożsamość Sag)');
});

test('S6: rulesText nadal listuje rozdziały (M159/Z4 bez regresji)', () => {
  const text = rulesText({ kind: 'enchantment', saga: { chapters: CHAPTERS }, abilities: [] });
  assert.ok(text.includes('Saga — I:') && text.includes('II:') && text.includes('III:'),
    `lista rozdziałów w rulesText: ${text}`);
});
