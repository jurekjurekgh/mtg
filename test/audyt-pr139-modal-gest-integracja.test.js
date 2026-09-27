import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import { renderChoiceRequest } from '../src/table/choice-request.js';

/**
 * Pętla jakości 2026-09-25g, uwaga §4.1 z AUDYT_PR139: C2/10 (regex na źródło)
 * jest JEDYNYM pinem wiążącym modal wyboru z bramką gestu — mutacja M-B
 * (choice-request.js ze stanu 3f1af5e, goły `click`) czerwieni tylko C2/10,
 * a testy C2/5–C2/7 montują press bezpośrednio i regresji nie widzą.
 *
 * Te testy idą przez PRAWDZIWY `renderChoiceRequest` (ptaszek z prawdziwego
 * `renderPickerRow`, press z prawdziwego `installPressActivation`) i grają
 * sekwencje C2 zmierzone w Chromium: cofnięcie modala do gołego clicka ma
 * czerwienić Q1/Q2 ZACHOWANIEM (wysłana odpowiedź), nie regexem.
 * Harness: stub DOM bez zależności (repo bez jsdomu), jak C2.
 */

class MiniEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.type = '';
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
  }

  set textContent(value) { this.text = String(value); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this.html = String(value); this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) {
    if (child.parentNode) {
      const idx = child.parentNode.children.indexOf(child);
      if (idx >= 0) child.parentNode.children.splice(idx, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  contains(node) {
    let current = node ?? null;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

  matches(selector) {
    const m = /^\[([^\]]+)\]$/.exec(selector);
    if (!m) return false;
    return this.getAttribute(m[1]) !== null;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  setPointerCapture() {}

  /** Natywne zachowanie kliknięcia (jak w Chromium — por. harness C2). */
  click() {
    if (this.tagName === 'LABEL') {
      const input = this.children.find((c) => c.tagName === 'INPUT');
      if (input) { input.click(); return; }
    }
    if (this.tagName === 'INPUT' && !this.disabled) {
      this.checked = !this.checked;
      this.dispatch('click');
      this.dispatch('change');
      return;
    }
    this.dispatch('click');
  }

  /** Zdarzenie z bubblowaniem i `stopPropagation` (jak w przeglądarce). */
  dispatch(type, payload = {}) {
    const event = {
      target: this,
      type,
      ...payload,
      _stopped: false,
      stopPropagation() { this._stopped = true; },
    };
    let node = this;
    while (node) {
      for (const fn of node.listeners[type] ?? []) fn(event);
      if (event._stopped) break;
      node = node.parentNode;
    }
  }
}

function withWorld(run) {
  const previous = globalThis.document;
  const hits = new Map();
  globalThis.document = {
    createElement: (tag) => new MiniEl(tag),
    elementFromPoint: (x, y) => hits.get(`${Math.round(x)},${Math.round(y)}`) ?? null,
  };
  try {
    return run({
      hitAt(x, y, node) { hits.set(`${Math.round(x)},${Math.round(y)}`, node); },
    });
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

function findInput(node) {
  if (node.tagName === 'INPUT') return node;
  for (const child of node.children) {
    const found = findInput(child);
    if (found) return found;
  }
  return null;
}

/** Prawdziwy modal wyboru celu z opcją ignorowalną (ptaszek wyciszenia). */
function mountRealChoiceModal() {
  const host = new MiniEl('div');
  const option = Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: ['creature-a'] });
  const request = choiceRequest({ id: 'choice-q', type: 'target', options: [option] });
  const responses = [];
  const toggles = [];
  renderChoiceRequest(host, request, {
    labelForOption: (opt) => `Cel ${opt.targets[0]}`,
    onResponse: (response) => responses.push(response),
    onToggleIgnoredOption: (key) => toggles.push(key),
  });
  const optionsBox = host.children[1];
  assert.equal(optionsBox.children.length, 1, 'modal ma dokładnie jedną opcję');
  const button = optionsBox.children[0];
  const input = findInput(button);
  assert.ok(input, 'opcja ignorowalna niesie ptaszek (input w drzewie modala)');
  return { button, input, responses, toggles };
}

test('Q1: prawdziwy modal — press z etykiety zwolniony nad ptaszkiem (retarget capture): bez odpowiedzi, ptaszek przełączony', () => {
  withWorld((world) => {
    const { button, input, responses, toggles } = mountRealChoiceModal();
    button.dispatch('pointerdown', { clientX: 50, clientY: 20, button: 0, pointerId: 11 });
    // Retarget capture: `up` wskazuje przycisk, fizycznie kursor nad ptaszkiem.
    world.hitAt(51, 20, input);
    input.dispatch('pointerup', { clientX: 51, clientY: 20, target: button });
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(responses, [],
      'zwolnienie nad ptaszkiem w modalu nie odsyła odpowiedzi (goły click by ją wysłał)');
    assert.equal(toggles.length, 1, 'ptaszek w modalu się zaznacza');
    assert.equal(input.checked, true, 'natywny stan checkboxa przełączony');
  });
});

test('Q2: prawdziwy modal — press z ptaszka, mikro-zejście na tekst: bez odpowiedzi, ptaszek przełączony', () => {
  withWorld((world) => {
    const { button, input, responses, toggles } = mountRealChoiceModal();
    input.dispatch('pointerdown', { clientX: 100, clientY: 10, button: 0, pointerId: 12 });
    world.hitAt(108, 13, button);
    button.dispatch('pointerup', { clientX: 108, clientY: 13, target: button });
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(responses, [],
      'click ze wspólnego przodku po zejściu z wyspy nie odsyła odpowiedzi');
    assert.equal(toggles.length, 1, 'mikro-ślizg w slop dalej zaznacza ptaszek');
  });
});

test('Q3: prawdziwy modal — zwykły press na opcji odpowiada DOKŁADNIE raz (brak regresji)', () => {
  withWorld((world) => {
    const { button, responses } = mountRealChoiceModal();
    button.dispatch('pointerdown', { clientX: 50, clientY: 20, button: 0, pointerId: 13 });
    world.hitAt(52, 21, button);
    button.dispatch('pointerup', { clientX: 52, clientY: 21, target: button });
    button.dispatch('click', { detail: 1 });
    assert.equal(responses.length, 1, 'jeden press = jedna odpowiedź');
    assert.equal(responses[0].requestId, 'choice-q');
  });
});

test('Q4: prawdziwy modal — klawiatura (click bez pointerów) nadal odpowiada', () => {
  withWorld(() => {
    const { button, responses } = mountRealChoiceModal();
    button.dispatch('click', { detail: 0 });
    assert.equal(responses.length, 1, 'Enter/Spacja na opcji modala działa');
  });
});
