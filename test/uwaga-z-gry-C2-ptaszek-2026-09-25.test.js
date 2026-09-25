import test from 'node:test';
import assert from 'node:assert/strict';
import { installPressActivation, PRESS_EXEMPT_ATTRIBUTE } from '../src/table/gestures.js';
import { renderPickerRow } from '../src/table/picker.js';

/**
 * UWAGA C2 (zgłoszenie właściciela 2026-09-25f, KRYTYCZNE — ciąg C):
 *   „Nie działa zaptaszkowanie zdolności, która ma nie przerywać auto-passa.
 *    Po najechaniu na pole do zaptaszkowania pojawia się w hoverze informacja
 *    'Zaznacz: ta opcja nie przerywa autopassu', ale kliknięcie nie zaznacza
 *    jej tylko rzuca czar/zdolność."
 *
 * Dlaczego C1–C7 (ten sam dzień) przechodzą, a błąd występuje — zmierzone w
 * prawdziwym Chromium 153 na realnych modułach + realnym CSS (scenarios.mjs):
 * stub wysyła `pointerup` z `target` wskazującym węzeł pod kursorem, a
 * przeglądarka robi DWIE rzeczy, których stub nie modelował:
 *
 *  (1) RETARGET PRZECHWYCENIA: press startuje na etykiecie tekstu opcji →
 *      `setPointerCapture` na przycisku → `pointerup` (i `click`) MA
 *      `target = BUTTON`, fizycznie nad ptaszkiem. Warunek na `event.target`
 *      nie widzi wyspy → `activate()` → rzut. (To jest prawdziwe C5 —
 *      stare C5 wysyłało up z `target = input`, co zamykało test tylko na
 *      papierze.)
 *
 *  (2) CLICK NA WSPÓLNYM PRZODKU: press startuje NA ptaszku, palec zejdzie z
 *      wąskiego wiersza (mierzony realny CSS: `label.action-ignore` = 40×28 px
 *      przy ~865 px etykiety tekstu) i zwolnienie wypada na tekście →
 *      przeglądarka generuje `click` na wspólnym przodku = `button`
 *      (minijacja `stopPropagation` z wiersza!) → ścieżka click aktywuje
 *      opcję, a `input` się nie przełącza (click nie trafił w input).
 *
 * Testy modelują KOLEJNOŚĆ i targety zmierzone w Chromium: `elementFromPoint`
 * (uczciwe trafienie), retargetowanego `up` oraz `click` na wspólnym przodku.
 * RED przed fixem, GREEN po (gestures.js: uczciwe trafienie + press z wyspy
 * nigdy nie aktywuje opcji — L170: bramka w module gesturów).
 */

class MiniEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.listeners = {};
    this.checked = false;
    this.disabled = false;
    this.className = '';
  }

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

  /** Semantyka DOM: węzeł jest swoim własnym potomkiem. */
  contains(node) {
    let current = node ?? null;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

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

  /**
   * Natywne zachowanie kliknięcia (jak w Chromium):
   *  - `input[type=checkbox]`: przełącza `checked`, potem `click` (bubbluje) i `change`;
   *  - `label`: aktywacja kieruje klik do sparowanego `input` w wierszu.
   */
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

  /** Symuluje zdarzenie z bubblowaniem i `stopPropagation` (jak w przeglądarce). */
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
      // Wiersz-ptaszek wiesza `stopPropagation` na click — jak w przeglądarce
      // zdarzenie nie schodzi wtedy do przycisku-rodzica.
      if (event._stopped) break;
      node = node.parentNode;
    }
  }
}

/**
 * Świat testu z `document.elementFromPoint` — jak w przeglądarce zwraca węzeł
 * POD podanymi współrzędnymi (Mapa sterowana przez test), a `null`, gdy test
 * nie ustawił trafienia (fallback do `event.target`).
 */
function withWorld(run) {
  const previous = globalThis.document;
  const hits = new Map();
  globalThis.document = {
    createElement: (tag) => new MiniEl(tag),
    elementFromPoint: (x, y) => hits.get(`${Math.round(x)},${Math.round(y)}`) ?? null,
  };
  try {
    return run({
      /** Ustala, co fizycznie leży pod punktem (współrzędne zaokrąglone). */
      hitAt(x, y, node) { hits.set(`${Math.round(x)},${Math.round(y)}`, node); },
    });
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

/** Montuje opcję panelu akcji DOKŁADNIE jak render.js (ptaszek + press). */
function mountActionRow() {
  const button = new MiniEl('button');
  const text = new MiniEl('span');
  text.className = 'action-label';
  button.appendChild(text);
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
    stopRowPropagation: true,
    onToggle: (on) => toggles.push(on),
  });
  return { button, text, handle, played, toggles };
}

/** Montuje opcję modala wyboru JAK PO FIXIE (choice-request.js). */
function mountChoiceOption() {
  const button = new MiniEl('button');
  const text = new MiniEl('span');
  text.className = 'action-label';
  button.appendChild(text);
  const responses = [];
  installPressActivation(button, () => responses.push('response'));
  const toggles = [];
  const handle = renderPickerRow(button, {
    kind: 'checkbox',
    variant: 'inline',
    rowClassName: 'action-ignore',
    toggleClassName: 'action-ignore-input',
    label: null,
    title: 'Zaznacz: ta opcja nie przerywa auto-passu',
    checked: false,
    stopRowPropagation: true,
    onToggle: (on) => toggles.push(on),
  });
  return { button, text, handle, responses, toggles };
}

// ---------------------------------------------------------------------------
// (2) Click na wspólnym przodku — ZGŁOSZENIE WŁAŚCICIELA
// ---------------------------------------------------------------------------

test('C2/1: press z ptaszku, mikro-zejście na tekst (≤ slop) — nie gra, ptaszek przełączony', () => {
  withWorld((world) => {
    const { button, handle, played, toggles } = mountActionRow();
    // Palec startuje NA polu do zaptaszkowania…
    handle.input.dispatch('pointerdown', { clientX: 100, clientY: 10, button: 0, pointerId: 1 });
    // …zejdźuje 8 px (≤ slop 12) na tekst etykiety i tam zwalnia:
    // przeglądarka (zmierzone) generuje click na wspólnym przodku = button.
    world.hitAt(108, 13, button.children[0]);
    button.dispatch('pointerup', { clientX: 108, clientY: 13, target: button.children[0] });
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(played, [],
      'click po zejściu z wyspy nie ma prawa zagrać opcji (właściciel: „kliknięcie rzuca czar")');
    assert.deepEqual(toggles, [true],
      'mikro-ślizg w obrębie slop dalej zaznacza ptaszek — użytkownik wycelował w pole');
  });
});

test('C2/1b: press z ptaszku, duże zejście na tekst (> slop) — cisza zamiast rzutu', () => {
  withWorld((world) => {
    const { button, handle, played, toggles } = mountActionRow();
    handle.input.dispatch('pointerdown', { clientX: 100, clientY: 10, button: 0, pointerId: 2 });
    // 35 px — palec zszedł z wąskiego wiersza (40 px) daleko na tekst:
    world.hitAt(135, 10, button.children[0]);
    button.dispatch('pointerup', { clientX: 135, clientY: 10, target: button.children[0] });
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(played, [],
      'duże zejście z pola to anulowanie gestu — nigdy rzut opcji');
    assert.deepEqual(toggles, [],
      'przeciągnięcie poza pole nie przełącza (jak natywny input przy drag-off)');
  });
});

// ---------------------------------------------------------------------------
// (1) Retarget setPointerCapture — PRAWDZIWE C5
// ---------------------------------------------------------------------------

test('C2/2: press z etykiety, zwolnienie fizycznie nad ptaszkiem (up kłamie przez capture) — nie gra, ptaszek przełączony', () => {
  withWorld((world) => {
    const { button, handle, played, toggles } = mountActionRow();
    button.dispatch('pointerdown', { clientX: 300, clientY: 10, button: 0, pointerId: 3 });
    // Kursor nad ptaszkiem: uczciwe trafienie = input, ale target zdarzenia
    // wskazuje PRZECHWYTUJĄCY przycisk (retarget capture w Chromium).
    world.hitAt(301, 10, handle.input);
    handle.input.dispatch('pointerup', { clientX: 301, clientY: 10, target: button });
    // Chrome po capture wysyła też click na przycisk:
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(played, [],
      'zwolnienie nad wyspą nie aktywuje opcji mimo retargetu (prawdziwe C5)');
    assert.deepEqual(toggles, [true],
      'tap nad ptaszkiem zaznacza go — press z etykiety kończy się na polu');
  });
});

test('C2/3: press z etykiety, dalekie przeciągnięcie zakończone NA ptaszku — ptaszek wygrywa, opcja nie gra', () => {
  withWorld((world) => {
    const { button, handle, played, toggles } = mountActionRow();
    button.dispatch('pointerdown', { clientX: 300, clientY: 10, button: 0, pointerId: 4 });
    world.hitAt(340, 40, handle.input); // palec przejechał daleko i zwalnia NA polu
    handle.input.dispatch('pointerup', { clientX: 340, clientY: 40, target: button });
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(played, [], 'zwolnienie nad wyspą nigdy nie gra opcji, niezależnie od dystansu');
    assert.deepEqual(toggles, [true],
      'zwolnzenie fizycznie NA ptaszku = ptaszek się zaznacza (reguła właściciela)');
  });
});

// ---------------------------------------------------------------------------
// Kontrakt bez regresji — press NA OPCJI dalej działa
// ---------------------------------------------------------------------------

test('C2/4: press i zwolnienie na tekście opcji (bez wyspy) dalej gra — kontrakt K', () => {
  withWorld((world) => {
    const { button, played } = mountActionRow();
    button.dispatch('pointerdown', { clientX: 300, clientY: 10, button: 0, pointerId: 5 });
    world.hitAt(302, 11, button.children[0]);
    button.dispatch('pointerup', { clientX: 302, clientY: 11, target: button.children[0] });
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(played, ['play'], 'klik w treść opcji to nadal zagranie opcji (dokładnie raz)');
  });
});

// ---------------------------------------------------------------------------
// Modal wyboru — ta sama bramka gestu (po instalacji press na opcji modala)
// ---------------------------------------------------------------------------

test('C2/5: modal — press z etykiety zwolniony nad ptaszkiem: bez odpowiedzi, ptaszek przełączony', () => {
  withWorld((world) => {
    const { button, handle, responses, toggles } = mountChoiceOption();
    button.dispatch('pointerdown', { clientX: 50, clientY: 20, button: 0, pointerId: 6 });
    world.hitAt(51, 20, handle.input);
    handle.input.dispatch('pointerup', { clientX: 51, clientY: 20, target: button });
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(responses, [],
      'zwolnienie nad ptaszkiem w modalu nie może odesłać odpowiedzi (rzutu)');
    assert.deepEqual(toggles, [true], 'a ptaszek w modalu się zaznacza');
  });
});

test('C2/6: modal — zwykły press na opcji odpowiada DOKŁADNIE raz (press + click bez podwójnej odpowiedzi)', () => {
  withWorld((world) => {
    const { button, responses } = mountChoiceOption();
    button.dispatch('pointerdown', { clientX: 50, clientY: 20, button: 0, pointerId: 7 });
    world.hitAt(52, 21, button.children[0]);
    button.dispatch('pointerup', { clientX: 52, clientY: 21, target: button.children[0] });
    button.dispatch('click', { detail: 1 });
    assert.deepEqual(responses, ['response'], 'jeden press = jedna odpowiedź');
  });
});

test('C2/7: modal — klawiatura (click bez pointerów) nadal odpowiada', () => {
  withWorld(() => {
    const { button, responses } = mountChoiceOption();
    button.dispatch('click', { detail: 0 });
    assert.deepEqual(responses, ['response'], 'Enter/Spacja na opcji modala działa');
  });
});

test('C2/8: wyspa bez `elementFromPoint` (środowiska bez pomiaru) nie traci ochrony — target dalej decyduje', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    const { button, handle, played } = mountActionRow();
    // Brak elementFromPoint → fallback do event.target (jak stare C5):
    handle.input.dispatch('pointerdown', { clientX: 40, clientY: 10, button: 0, pointerId: 8 });
    handle.input.dispatch('pointerup', { clientX: 40, clientY: 10 });
    button.dispatch('click', { detail: 1, target: handle.input });
    assert.deepEqual(played, [], 'brak pomiaru = brak aktywacji, gdy target jest wyspą (L24)');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('C2/9: kontrakt — wiersz i input noszą markę wyspy (picker nadaje, gestures nie zna klas)', () => {
  withWorld(() => {
    const { handle } = mountActionRow();
    assert.equal(handle.row.getAttribute(PRESS_EXEMPT_ATTRIBUTE), '1', 'wiersz = wyspa');
    assert.equal(handle.input.getAttribute(PRESS_EXEMPT_ATTRIBUTE), '1', 'input = wyspa');
  });
});
