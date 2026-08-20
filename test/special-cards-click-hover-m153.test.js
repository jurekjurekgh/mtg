// M153/C — karty specjalne Day/Night i Undercity mają być klikalne (pełny
// ekran) i mieć hover z powiększoną wersją, jak basic landy. Wcześniej
// Day/Night nie miało ani kliku, ani hovera; Undercity miało klik, ale nie
// hover.

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDayNight, renderUndercity } from '../src/table/render.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.src = '';
    this.alt = '';
    this.hidden = false;
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  emit(type, payload = {}) { for (const fn of this.listeners[type] ?? []) fn(payload); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  findAll(p) { return this.descendants().filter(p); }
}

globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const noop = () => {};
const hover = { start: noop, end: noop, cycle: noop };

function makeEls() {
  return { daynight: new MiniEl('div'), undercity: new MiniEl('div') };
}

function cardEl(host, cls) {
  return host.findAll((el) => (el.className || '').includes(cls))[0];
}

test('C: Day/Night jest klikalny (pełny ekran) i ma hover', () => {
  const els = makeEls();
  let opened = 0;
  let hovered = 0;
  const h = {
    start: () => { hovered += 1; },
    end: noop, cycle: noop,
  };
  const view = { dayNight: 'night' };
  renderDayNight(els, { nameOf: (id) => id }, view, { onClick: () => { opened += 1; }, hover: h });
  assert.equal(els.daynight.hidden, false, 'karta widoczna');
  const card = cardEl(els.daynight, 'daynight-card');
  assert.ok(card, 'daynight-card');
  assert.ok((card.className || '').includes('clickable'), 'klikalna (fullscreen)');
  card.emit('click', { stopPropagation: noop });
  assert.equal(opened, 1, 'klik otwiera pełny ekran');
  // Hover: mouseenter uruchamia powiększenie.
  assert.ok(hovered >= 0); // hover.start wywoływane przy mouseenter
  assert.equal(typeof card.listeners.mouseenter, 'object', 'mouseenter podpięty');
  card.emit('mouseenter', { clientX: 10, clientY: 10 });
  assert.equal(hovered, 1, 'hover po najechaniu');
});

test('C: Undercity ma hover (a klik już działał)', () => {
  const els = makeEls();
  let hovered = 0;
  const h = {
    start: () => { hovered += 1; },
    end: noop, cycle: noop,
  };
  const view = { undercityProgress: { p1: 1 }, initiativePlayerId: 'p1' };
  renderUndercity(els, {}, view, { onClick: noop, hover: h });
  assert.equal(els.undercity.hidden, false, 'karta widoczna');
  const card = cardEl(els.undercity, 'undercity-card');
  assert.ok(card, 'undercity-card');
  assert.ok((card.className || '').includes('clickable'), 'klikalna');
  card.emit('mouseenter', { clientX: 10, clientY: 10 });
  assert.equal(hovered, 1, 'hover po najechaniu');
});
