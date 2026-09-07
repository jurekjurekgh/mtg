// E7/D1 (zgłoszenie właściciela z testów żywej gry): Frightful Delusion —
// „opcje dopłacenia 1C mają zagnieżdżony HTML w opisie: Zapłać
// <span class="ms-group">…". Sonda żywa (jsdom, build ownera ORAZ branch):
// WSZYSTKIE powierzchnie renderują etykiety `commandLabel` przez innerHTML
// (pipa many wychodzi jako znacznik, textContent = „Zapłać 1 — …"):
// panel akcji (render.js), opcje modala wyboru (choice-request.js, fix A2
// 2026-08-10), wiersze wizardów (renderPickerRow, kanał `html`, M312).
// Surowego markupu nie widzi ani przeglądarka, ani tester stołu (czyta
// textContent ze sparsowanego DOM — znaczniki znikają).
//
// Ten test jest PINEM kontraktu M104/A2: etykieta z `commandLabel` (HTML
// pipmany) MUSI iść do DOM kanałem innerHTML. Emulator DOM z kontraktem
// przeglądarki (innerHTML PARSE — znaczniki znikają z tekstu; textContent
// NIE parsuje — surowy markup zostałby w tekście) wykrywa regresję kanału.
// Komenda ma DOKŁADNY kształt silnika (sonda: resolve_counter_pay_choice
// z Frightful Delusion w Skilled Animatora).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { commandLabel, labelChoiceOptions } from '../src/table/render.js';
import { renderChoiceRequest } from '../src/table/choice-request.js';

const REGISTRY = createCardRegistry();

class DomLikeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.dataset = {}; this.listeners = {}; }
  // Kontrakt DOM: innerHTML PRZYJMUJE markup — emulujemy parsowanie
  // (znaczniki znikają z tekstu, tekst między nimi zostaje).
  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return this.text; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
}

test('E7/D1: opcje dopłaty kontry renderują pipę many znacznikiem — bez surowego HTML w tekście', () => {
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Bot' }],
    zones: {
      hand: [], battlefield: [], graveyard: [], library: [], exile: [],
      stack: [{ id: 'spell-2', cardId: 'skilled-animator', controllerId: 'p1' }],
    },
  };
  const session = {
    nameOf: (cid) => REGISTRY.get(cid)?.name ?? cid,
    cardDetails: (cid) => REGISTRY.get(cid) ?? null,
    colorsOf: (cid) => REGISTRY.get(cid)?.colors ?? [],
  };
  // Dokładny kształt komendy z silnika (sonda E7/D1).
  const opts = [
    { type: 'resolve_counter_pay_choice', playerId: 'p1', pay: true, cost: 1, sourceId: 'spell-3', targetId: 'spell-2' },
    { type: 'resolve_counter_pay_choice', playerId: 'p1', pay: false, cost: 1, sourceId: 'spell-3', targetId: 'spell-2' },
  ];
  const labels = labelChoiceOptions(opts, session, view);
  assert.ok(labels[0].includes('ms-group'), 'etykieta ŹRÓDŁOWA niesie pipę (HTML) — kontrakt M266/E');
  globalThis.document = globalThis.document ?? {};
  const oldCreate = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new DomLikeEl(tag);
  try {
    const host = new DomLikeEl('div');
    renderChoiceRequest(host, { type: 'counter_pay', options: opts }, {
      labelForOption: (option) => labels[opts.indexOf(option)] ?? commandLabel(option, session, view),
      onResponse: () => {},
    });
    const buttons = host.children.flatMap((b) => [b, ...(b.children ?? [])])
      .filter((n) => String(n.className).includes('choice-request-option'));
    assert.ok(buttons.length >= 2, 'opcje modala wyrenderowane');
    for (const b of buttons) {
      const text = b.textContent ?? '';
      assert.ok(!text.includes('<span') && !text.includes('ms-group'),
        `opcja bez surowego markupu w tekście (było: ${JSON.stringify(text.slice(0, 80))})`);
    }
    const pay = buttons.map((b) => b.textContent).find((t) => t.includes('Zapłać'));
    assert.match(pay ?? '', /Zapłać 1 — Skilled Animator zostaje na stosie/,
      'tekst opcji czytelny: koszt jako „1", nazwa czaru-celem obecna');
  } finally {
    if (oldCreate) globalThis.document.createElement = oldCreate; else delete globalThis.document.createElement;
  }
});
