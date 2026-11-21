import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderTableView } from '../src/table/render.js';

/**
 * Audyt PR #187 — pętla jakości Żywego Testera (2026-11-21): karta
 * „Blitz of the Thunder-Raptor" (IKO) ma efekt `{ type: 'damage',
 * amount: 'instants_and_sorceries_in_your_graveyard' }`. Przed poprawką kafel
 * karty na stole drukował SUROWY slug `instants_and_sorceries_in_your_graveyard`
 * zamiast treści (detektor „Surowy slug w kafle karty" w tools/table-tester).
 *
 * Root cause: `DYNAMIC_AMOUNT_NOUNS` nie miało wpisu dla tego slugu, więc
 * `describeEffect` (gałąź obrażeń) wracała do `dynamicAmount`, które zwraca
 * surowy ciąg. Poprawka: wpis w `DYNAMIC_AMOUNT_NOUNS` (src/table/render.js).
 *
 * Test bez DOM-u/przeglądarki — minimalny globalny DOM jak w audytach stołu
 * (wzorzec audit-m80-tester.test.js).
 */

const _registry = new Map();
function _el(id) { if (!_registry.has(id)) _registry.set(id, new MiniEl(id)); return _registry.get(id); }
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  getElementById: (id) => _el(id),
  addEventListener() {},
};
globalThis.window = { confirm: () => false };
globalThis.localStorage = {
  getItem: () => null, setItem() {}, removeItem() {}, clear() {},
};

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.style = {}; this.dataset = {}; this.className = ''; this.text = ''; this.html = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  addEventListener() {}
  click() {}
}

function miniview(zones) {
  return {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile: [], library: [], hand: zones.hand ?? [], battlefield: zones.battlefield ?? [] },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
}
function minisession(registry, view) {
  return {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
}
function miniels() {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) els[key] = new MiniEl(`#${key}`);
  return els;
}

// Renderuje kartę w RĘCE (Blitz to instant) i zwraca tekst kafla ręki.
function handTileText(registry, cardId) {
  const view = miniview({ hand: [{ id: 'h1', cardId, controllerId: 'p1', zone: 'hand', kind: 'instant' }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  return els.hand.textContent;
}

test('PR187: Blitz of the Thunder-Raptor — brak surowego slugu w kaflu (tylko czytelna fraza)', () => {
  const registry = createCardRegistry();
  const text = handTileText(registry, 'blitz-of-the-thunder-raptor');
  // Regresja: kafel nie może drukować surowego slugu zamiast treści.
  assert.ok(!text.includes('instants_and_sorceries_in_your_graveyard'),
    `surowy slug w kaflu: ${text.slice(0, 240)}`);
  // Pozytywna weryfikacja: dynamiczna kwota opisana czytelnie (wzorzec NOUNS).
  assert.match(text, /tyle obrażeń, ile instants i sorcery w twoim grobie/,
    `brak czytelnej frazy: ${text.slice(0, 240)}`);
});
