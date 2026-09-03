// M303 — domknięcie „jednego miejsca” zmian UI modali (pytanie właściciela
// 2026-09-03):
//
//   „A tych: scry/surveil/index, walka, podział obrażeń, escape, mana-wizard
//   nie można by przerobić pod ten helper (rozszerzając jego opcje o niezbędne
//   funkcjonalności)? Żeby zmiany UI były w jednym miejscu?"
//
// Pomiar: te wizardy JUŻ stoją na jednym fundamencie — jeden modal
// (#choice-request), jeden moduł (choice-request.js), wspólne wiersze
// (renderPickerRow z picker.js: radio/checkbox/przycisk/stepper — 8 miejsc
// w choice-request.js + 2 w mana-wizard.js), wspólne intro/stopka/Anuluj/
// status (choice-request-intro/-options/-actions, ghost-btn, picker-status),
// jeden podgląd kart (openCardFullscreenByCardId + delegacja „log-card”),
// cały CSS w jednym arkuszu. Różne są TYLKO maszyny stanów interakcji
// (sekwencja kart, kwoty, sorter) — to „opcje/parametry” helpera, nie
// osobne stosy UI; łączenie ich w jedną mega-funkcję to regresja, nie
// unifikacja.
//
// Jedyne faktyczne dublowanie: przycisk podglądu 🔍 lepiony ręcznie w dwóch
// miejscach (siatka bezpieczeństwa renderChoiceRequest + tryb przyciskowy).
// M303 wydziela go do JEDNEGO komponentu renderPeekButton — przyszła zmiana
// ikony/etykiety podglądu to jedna linia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPeekButton } from '../src/table/choice-request.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.dataset = {};
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click(eventOverrides = {}) {
    let propagated = true;
    const event = {
      preventDefault() {},
      stopPropagation() { propagated = false; },
      ...eventOverrides,
    };
    for (const l of this.listeners.click ?? []) l(event);
    return propagated;
  }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

test('M303/1: renderPeekButton — jeden komponent podglądu (klasa, cardId, klik otwiera kartę)', () => {
  const host = new MiniEl('div');
  const opened = [];
  const peek = renderPeekButton(host, { cardId: 'k-x', onOpen: (id) => opened.push(id) });
  assert.ok(peek, 'komponent zwraca przycisk');
  assert.ok(String(peek.className).includes('choice-request-peek'), 'wspólna klasa podglądu');
  assert.ok(String(peek.className).includes('ghost-btn'), 'wspólna rodzina przycisków');
  assert.equal(peek.dataset.previewCardId, 'k-x', 'cardId dla mostka debug/sond');
  peek.click();
  assert.deepEqual(opened, ['k-x'], 'klik otwiera podgląd karty');
});

test('M303/2: renderPeekButton — klik NIE zatwierdza wyboru (stopPropagation do rodzica)', () => {
  const host = new MiniEl('div');
  const row = new MiniEl('div');
  host.appendChild(row);
  let rowClicked = false;
  row.addEventListener('click', () => { rowClicked = true; });
  const peek = renderPeekButton(row, { cardId: 'k-y', onOpen: () => {} });
  const stillPropagated = peek.click();
  assert.equal(stillPropagated, false, 'podgląd zatrzymuje propagację — nie klika wiersza-wyboru');
});

test('M303/3: strażnik „jednego miejsca” — etykieta podglądu zdefiniowana RAZ w źródle', () => {
  const src = readFileSync(new URL('../src/table/choice-request.js', import.meta.url), 'utf8');
  const hits = src.split('Podgląd karty').length - 1;
  assert.equal(hits, 1,
    'etykieta/ikona podglądu ma żyć w jednym komponencie (renderPeekButton) — '
    + `znaleziono ${hits} wystąpień`);
  assert.ok(src.includes('export function renderPeekButton'), 'komponent jest wydzielony i eksportowany');
});
