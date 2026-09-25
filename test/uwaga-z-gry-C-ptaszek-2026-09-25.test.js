import test from 'node:test';
import assert from 'node:assert/strict';
import { installPressActivation, markPressExempt, PRESS_EXEMPT_ATTRIBUTE } from '../src/table/gestures.js';
import { renderPickerRow } from '../src/table/picker.js';

/**
 * UWAGA C (zgłoszenie właściciela 2026-09-25, KRYTYCZNE):
 *   „Nie działa »zaptaszkowanie« zdolności, która ma nie przerywać auto-passu.
 *    Po zmianie w UI w poprzednim PR przesunęły się obiekty i teraz klikanie w
 *    pole wyboru nie powoduje zaznaczenia go, tylko aktywuje czar/zdolność/ofertę."
 *
 * Root cause (zmierzone, nie zgadywane): `installPressActivation`
 * (src/table/gestures.js) aktywuje opcję na `pointerup`, a wspólne wiersze
 * ptaszków (src/table/picker.js, `stopRowPropagation`) blokowały WYŁĄCZNIE
 * `click` — więc wskaźnik startujący w checkboxie/labelu DOBIZAŁ do przycisku
 * i odpalił `play(cmd)`. Naprawa jest gestem, nie CSS-em: wyspa interakcji
 * nosi markę `data-press-exempt`, a press pyta o nią celu w `pointerdown`,
 * `pointerup` i `click` (też klawiatura). Testy są na DOM-owym stubie (repo nie
 * ma żadnych zależności — ADR: zero deps), więc symulują KOLEJNOŚĆ zdarzeń
 * przeglądarki, a nie wygląd.
 */

class MiniEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.listeners = {};
    this.checked = false;
    this.className = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  /** Prosty selektor atrybutowy — wystarczy do `[data-press-exempt]`. */
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

  /** Symuluje zdarzenie z bubblowaniem (kolejność jak w przeglądarce). */
  dispatch(type, payload = {}) {
    let node = this;
    while (node) {
      for (const fn of node.listeners[type] ?? []) {
        fn({ target: this, type, ...payload });
      }
      node = node.parentNode;
    }
  }
}

function withDocument(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    return run();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

/** Montuje przycisk akcji z ptaszkiem wyciszenia DOKŁADNIE jak panel akcji. */
function mountActionRow({ stopRowPropagation = true } = {}) {
  const button = new MiniEl('button');
  button.innerHTML = '<span class="action-label">Rzuć: Test</span>';
  const played = [];
  installPressActivation(button, () => played.push('play'));
  const toggles = [];
  const handle = renderPickerRow(button, {
    kind: 'checkbox',
    variant: 'inline',
    rowClassName: 'action-ignore',
    toggleClassName: 'action-ignore-input',
    label: null,
    title: 'Zaznacz: ta opcja nie przerywa auto-passu',
    checked: false,
    stopRowPropagation,
    onToggle: (on) => toggles.push(on),
  });
  return { button, handle, played, toggles };
}

test('C1: press w ptaszek (input) NIE aktywuje przycisku akcji', () => {
  withDocument(() => {
    const { button, handle, played, toggles } = mountActionRow();
    handle.input.dispatch('pointerdown', { clientX: 40, clientY: 10, button: 0, pointerId: 1 });
    handle.input.dispatch('pointerup', { clientX: 40, clientY: 10 });
    assert.deepEqual(played, [], 'pointerdown+up znad checkboxa nie wolno grać opcji');
    handle.input.checked = true;
    handle.input.dispatch('change');
    handle.input.dispatch('click');
    assert.deepEqual(played, [], 'nawet gdy click dojdzie do przycisku, wyspa go blokuje');
    assert.deepEqual(toggles, [true], 'ptaszek nadal przełącza (to jest jego jedyne zadanie)');
  });
});

test('C2: press w LABEL (padding dookoła pola) tez nie gra opcji', () => {
  withDocument(() => {
    const { button, handle, played } = mountActionRow();
    handle.row.dispatch('pointerdown', { clientX: 60, clientY: 12, button: 0, pointerId: 2 });
    handle.row.dispatch('pointerup', { clientX: 60, clientY: 12 });
    handle.row.dispatch('click');
    assert.deepEqual(played, [], 'label z paddingiem jest częścią wyspy (większy cel dotyku)');
    assert.equal(handle.row.getAttribute(PRESS_EXEMPT_ATTRIBUTE), '1',
      'wiersz z `stopRowPropagation` nosi markę wyspy — marker nadaje picker, nie render.js');
  });
});

test('C3: klawiatura (click detail=0) na ptaszku nie gra opcji, na reszcie przycisku gra', () => {
  withDocument(() => {
    const { handle, button, played } = mountActionRow();
    handle.input.dispatch('click', { detail: 0 });
    assert.deepEqual(played, [], 'spacja/enter na checkboxie = przełączenie, nie zagranie');
    button.dispatch('click', { detail: 0 });
    assert.deepEqual(played, ['play'], 'klawiatura na samym przycisku działa jak dotąd');
  });
});

test('C4: reszta przycisku (poza ptaszkiem) nadal gra opcję — bez regresji gestu', () => {
  withDocument(() => {
    const { button, played } = mountActionRow();
    button.dispatch('pointerdown', { clientX: 300, clientY: 10, button: 0, pointerId: 3 });
    button.dispatch('pointerup', { clientX: 302, clientY: 11 });
    assert.deepEqual(played, ['play'], 'press w etykietę odpala akcję (kontrakt K 2026-09-23)');
    played.length = 0;
    button.dispatch('pointerdown', { clientX: 300, clientY: 10, button: 0, pointerId: 4 });
    button.dispatch('pointerup', { clientX: 420, clientY: 10 });
    assert.deepEqual(played, [], 'przesunięcie > slopPx to scroll/swipe, nie klik');
  });
});

test('C5: press zaczniety na etykiecie, zwolniony nad ptaszkiem — bez gry (pointer capture)', () => {
  withDocument(() => {
    const { button, handle, played } = mountActionRow();
    button.dispatch('pointerdown', { clientX: 300, clientY: 10, button: 0, pointerId: 5 });
    handle.input.dispatch('pointerup', { clientX: 301, clientY: 10 });
    assert.deepEqual(played, [],
      'release znad wyspy nie aktywuje (capture przycisku nie może obeścić ptaszka)');
  });
});

test('C6: bez `stopRowPropagation` wyspy nie ma — licencję na blokowanie gestu daje wywołujący', () => {
  withDocument(() => {
    const { handle, played } = mountActionRow({ stopRowPropagation: false });
    assert.equal(handle.input.getAttribute(PRESS_EXEMPT_ATTRIBUTE), null,
      'marka tylko dla wierszy, które same się zgłosiły jako wyspy');
    const ghost = new MiniEl('div');
    const fired = [];
    installPressActivation(ghost, () => fired.push(1));
    markPressExempt(ghost);
    ghost.dispatch('pointerdown', { clientX: 0, clientY: 0, button: 0, pointerId: 6 });
    ghost.dispatch('pointerup', { clientX: 0, clientY: 0 });
    assert.deepEqual(fired, [], 'znacznik działa niezależnie od rodziny klas (reguła generyczna)');
    assert.deepEqual(played, [], 'tu nic nie zostało zagrane — po prostu nie było przycisku-rodzica');
  });
});

test('C7: odporność — zdarzenia bez targetu i węzły bez `closest` nie wyłączają pressu', () => {
  withDocument(() => {
    const el = new MiniEl('div');
    const fired = [];
    installPressActivation(el, () => fired.push(1));
    el.dispatch('pointerdown', { clientX: 5, clientY: 5, button: 0, pointerId: 7 });
    // stub bez `closest` w targetie (starsze środowiska / testy stubowe):
    el.listeners.pointerup.forEach((fn) => fn({ clientX: 5, clientY: 5, target: {} }));
    assert.deepEqual(fired, [1], 'brak możliwości oceny = NIE tłumimy akcji (L24)');
  });
});
