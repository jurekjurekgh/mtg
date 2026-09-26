import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiPanel } from '../src/table/ai-panel.js';

class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.scrollTop = 0;
    this.scrollHeight = 100;
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; this.text = ''; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({}); }
  query(cls) {
    const out = [];
    const walk = (el) => {
      if (el.className?.split(' ').includes(cls)) out.push(el);
      for (const c of el.children) walk(c);
    };
    walk(this);
    return out;
  }
}
const fakeDocument = () => ({ createElement: (tag) => new FakeEl(tag) });
const slot = (over = {}) => ({
  id: 1, attempt: 1, prompt: 'p', modelId: 'm/m:free',
  meta: { turn: 7, modelLabel: 'm' }, result: null, ...over,
});

test('AI-E1 panel: widoczność + pending z pulsowaniem', () => {
  const wrap = new FakeEl('div');
  const log = new FakeEl('div');
  const panel = createAiPanel({ document: fakeDocument(), wrapEl: wrap, logEl: log });
  panel.setVisible(false);
  assert.equal(wrap.hidden, true);
  panel.setVisible(true);
  assert.equal(wrap.hidden, false);
  panel.slotPending(slot());
  assert.equal(panel.entryCount(), 1);
  const waits = log.query('ai-pending');
  assert.equal(waits.length, 1);
  assert.ok(waits[0].textContent.includes('Czekam na odpowiedź modelu'));
});

test('AI-E1 panel: odpowiedź podmienia „Czekam" (textContent, nie HTML)', () => {
  const wrap = new FakeEl('div');
  const log = new FakeEl('div');
  const panel = createAiPanel({ document: fakeDocument(), wrapEl: wrap, logEl: log });
  panel.slotPending(slot());
  panel.slotResolved(slot({ result: { ok: true, text: 'Lore: <b>mgła</b> & „magią”.' } }));
  assert.equal(log.query('ai-pending').length, 0);
  const texts = log.query('ai-text');
  assert.equal(texts.length, 1);
  assert.ok(texts[0].textContent.includes('<b>mgła</b>'));
});

test('AI-E1 panel: błąd + przycisk ponowienia woła onRetry z id', () => {
  const wrap = new FakeEl('div');
  const log = new FakeEl('div');
  let retried = null;
  const panel = createAiPanel({ document: fakeDocument(), wrapEl: wrap, logEl: log, onRetry: (id) => { retried = id; } });
  panel.slotPending(slot({ id: 3 }));
  panel.slotResolved(slot({ id: 3, result: { ok: false, error: 'boom' } }));
  assert.equal(log.query('ai-error').length, 1);
  const btns = log.query('ai-retry');
  assert.equal(btns.length, 1);
  assert.ok(btns[0].textContent.includes('Ponów odpytanie AI'));
  btns[0].click();
  assert.equal(retried, 3);
  // Retry wraca do „Czekam" w TYM SAMYM wpisie (jeden entry).
  panel.slotPending(slot({ id: 3, attempt: 2 }));
  assert.equal(panel.entryCount(), 1);
  assert.equal(log.query('ai-pending').length, 1);
});

test('AI-E1 panel: clear czyści wpisy (nowa partia)', () => {
  const wrap = new FakeEl('div');
  const log = new FakeEl('div');
  const panel = createAiPanel({ document: fakeDocument(), wrapEl: wrap, logEl: log });
  panel.slotPending(slot({ id: 1 }));
  panel.slotPending(slot({ id: 2 }));
  assert.equal(panel.entryCount(), 2);
  panel.clear();
  assert.equal(panel.entryCount(), 0);
  assert.equal(log.children.length, 0);
});
