import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBotMoves, createScryfallHover } from '../src/table/render.js';

/**
 * M257 r5 (uwagi z testów, runda 5) — trzy znaleziska właściciela:
 *
 * A — hover (powiększona karta ze Scryfall, bez trybów FOT/KON) na
 *     miniaturkach w warstwie „Rozgrywka”, analogicznie jak na stole;
 * B — bot nie blokował 3/3 kreaturą 2/2 przy 5 życiach (wycena bloku
 *     nie znała presji życia);
 * C — Bone Splinters: modal pokazywał WSEYSTKIE kombinacje (cel ×
 *     poświęcenie) zamiast osobnych wyborów „ptaszkiem” (cel czaru +
 *     stwór do poświęcenia).
 *
 * Plan: docs/plans/PLAN_2026-08-30-m257r5-uwagi-testow.md.
 */

// ---------------------------------------------------------------------------
// Minimalny DOM (wzorzec z m195/m172) — render jest czysty, bez jsdom.
// ---------------------------------------------------------------------------
function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.style = {};
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() { for (const l of this.listeners.click ?? []) l({}); }
    fire(type, e = {}) { for (const l of this.listeners[type] ?? []) l(e); }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    find(pred) { return this.all().find(pred); }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const old = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try { return run(new MiniEl('div')); } finally {
    if (old) globalThis.document.createElement = old; else delete globalThis.document.createElement;
  }
}

const DETAILS = {
  id: 'basic-island', name: 'Island', colors: ['U'], types: ['Basic Land', 'Island'],
  subtypes: ['Island'], keywords: [], manaCost: 0, power: null, toughness: null,
  imageUri: 'https://cards.scryfall.io/large/front/x.jpg?1', artId: 42,
};
const SESSION = {
  nameOf: (id) => id ?? '?',
  nameOfObject: (id) => id ?? '?',
  cardDetails: (cardId) => (cardId === 'basic-island' ? DETAILS : null),
};

// ---------------------------------------------------------------------------
// A — hover na miniaturkach w „Rozgrywce”
// ---------------------------------------------------------------------------

test('r5/A: createScryfallHover daje hover ze stałym torem (start/end), null bez warstwy', () => {
  const hover = createScryfallHover({ hoverPreview: { className: 'hover-preview' } });
  assert.ok(hover, 'na desktopie hover istnieje');
  assert.equal(typeof hover.start, 'function');
  assert.equal(typeof hover.end, 'function');
  assert.equal(hover.cycle, undefined, 'bez cyklowania trybów (FOT/KON poza zakresem)');
  assert.equal(createScryfallHover({}), null, 'bez warstwy preview — null');
});

test('r5/A: najechanie na miniaturkę w „Rozgrywce” uruchamia hover z danymi karty', () => {
  withMiniDom((host) => {
    const calls = [];
    const hover = {
      start: (info, e) => calls.push(['start', info?.cardId ?? info?.id ?? info?.name, e]),
      end: () => calls.push(['end']),
    };
    renderBotMoves(host, [{ cardId: 'basic-island', text: 'Nieprzyjaciel zagrywa Island' }], SESSION, { hover });
    const art = host.find((n) => String(n.className).includes('bot-move-card'));
    assert.ok(art, 'miniaturka (bot-move-card) wyrenderowana');
    assert.ok(art.findAll((n) => String(n.className).includes('cardvis')).length > 0,
      'w środku wizual karty (cardvis)');
    art.fire('mouseenter', { clientX: 10, clientY: 20 });
    art.fire('mouseleave');
    assert.deepEqual(calls.map((c) => c[0]), ['start', 'end'], 'mouseenter → start, mouseleave → end');
    const startedInfo = calls[0][1];
    assert.ok(startedInfo === 'basic-island' || startedInfo === 'Island',
      `hover start dostał dane karty: ${JSON.stringify(startedInfo)}`);
  });
});

test('r5/A: bez hovera miniaturka nie dostaje listenerów (dotyk — tap otwiera pełny ekran)', () => {
  withMiniDom((host) => {
    renderBotMoves(host, [{ cardId: 'basic-island', text: 'Nieprzyjaciel zagrywa Island' }], SESSION, {});
    const art = host.find((n) => String(n.className).includes('cardvis'));
    assert.ok(art);
    assert.equal(art.listeners.mouseenter, undefined, 'brak mouseenter bez hovera');
    assert.equal(art.listeners.mouseleave, undefined, 'brak mouseleave bez hovera');
  });
});
