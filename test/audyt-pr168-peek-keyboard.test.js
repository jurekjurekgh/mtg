// Audyt PR #168/A-7: pełnoekranowy podgląd opcji pozostaje klikalną NAZWĄ
// karty bez ikony (decyzja właściciela), ale musi mieć natywny fokus/Enter/Spację.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPeekButton } from '../src/table/choice-request.js';

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.type = ''; }
  set textContent(text) { this.text = String(text); }
  get textContent() { return this.text ?? ''; }
  appendChild(el) { this.children.push(el); return el; }
  addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
  click() {
    let bubbled = true;
    for (const fn of this.listeners.click ?? []) fn({ preventDefault() {}, stopPropagation() { bubbled = false; } });
    return bubbled;
  }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

test('A-7: podgląd to tekstowy button type=button — natywna klawiatura bez ręcznego keydown', () => {
  const opened = [];
  const peek = renderPeekButton(new MiniEl('div'), {
    cardId: 'tuskguard-captain', label: 'Tuskguard Captain', onOpen: (id) => opened.push(id),
  });
  assert.equal(peek.tagName, 'button', 'span nie jest osiągalny przez Tab ani aktywowany Enter/Space');
  assert.equal(peek.type, 'button', 'wewnątrz formularza nie wolno przypadkowo wysłać submit');
  assert.equal(peek.textContent, 'Tuskguard Captain', 'nazwa karty zamiast ikony lub opisu technicznego');
  assert.ok(String(peek.className).includes('picker-name'));
  assert.equal(peek.dataset.previewCardId, 'tuskguard-captain');
  assert.equal(peek.click(), false, 'podgląd nie zatwierdza wiersza wyboru');
  assert.deepEqual(opened, ['tuskguard-captain']);
  assert.equal(peek.listeners.keydown?.length ?? 0, 0, 'Enter/Space obsługuje natywny button, bez duplikatów zdarzeń');
});

test('A-7: przycisk wygląda jak klikalna nazwa, a fokus klawiatury jest widoczny', () => {
  const css = readFileSync('src/table/index.html', 'utf8');
  assert.match(css, /button\.choice-request-peek\s*\{[^}]*background:\s*(?:none|transparent)[^}]*\}/s,
    'bez tła/ramki przycisku akcji i bez ikony');
  assert.match(css, /button\.choice-request-peek:focus-visible\s*\{[^}]*outline:/s,
    'po Tab czytelny obrys fokusu (nie outline:none)');
});
