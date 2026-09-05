import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderTableView } from '../src/table/render.js';

/**
 * Audyt Żywym Testerem 2026-09-05 (PR #98, partia zendikar×srodziemie):
 * kafel Kor Sanctifiers obiecywał „Gdy wejdzie na pole bitwy: zniszcz cel” —
 * bez warunku kickera (intervening-if, CR 603.4) i bez ograniczenia celu
 * (artefakt/enchantment). Oś 2 audytu (kompletność informacji na stole).
 *
 * Naprawa: wspólny `triggerConditionClause` (render.js) dla gałęzi
 * enter_battlefield/dies/attacks/end_step + typ celu z targetTypeLabel
 * w ETB. Ten plik pinnie rodzinę (L28: nie jedną kartę).
 */

// Minimalny DOM dla renderTableView (harness jak audit-m80-tester).
const _registry = new Map();
function _el(id) { if (!_registry.has(id)) _registry.set(id, new MiniEl(id)); return _registry.get(id); }
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  getElementById: (id) => _el(id),
  addEventListener() {},
};
globalThis.window = { confirm: () => false };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

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

function miniview(battlefield) {
  return {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile: [], library: [], hand: [], battlefield },
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
function bfTileText(registry, cardId) {
  const view = miniview([{ id: 'o1', cardId, controllerId: 'p1', zone: 'battlefield', kind: 'creature', summoningSickness: false, damage: 0 }]);
  const els = { banner: new MiniEl('x'), status: new MiniEl('x'), stackZone: new MiniEl('x'), bfEnemy: new MiniEl('x'), bfOwn: new MiniEl('x'), graveEnemy: new MiniEl('x'), graveOwn: new MiniEl('x'), exileZone: new MiniEl('x'), hand: new MiniEl('x'), actions: new MiniEl('x'), log: new MiniEl('x') };
  for (const key of Object.keys(els)) _registry.set(key, els[key]);
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  return els.bfOwn.textContent;
}

test('PR98: ETB z warunkiem i typem celu — Kor Sanctifiers mówi o kickerze i celu', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'kor-sanctifiers');
  assert.match(text, /Gdy wejdzie na pole bitwy \(gdy opłacono kicker\): zniszcz cel \(artefakt lub enchantment\)\./, text.slice(0, 250));
});

test('PR98: ETB ifCast — Geological Appraiser mówi „rzuciłeś tę kartę"', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'geological-appraiser');
  assert.match(text, /\(gdy rzuciłeś tę kartę\)/, text.slice(0, 250));
});

test('PR98: ETB offspring — Rust-Shield Rampager mówi o koszcie offspring', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'rust-shield-rampager');
  assert.match(text, /\(gdy opłacono koszt offspring\)/, text.slice(0, 250));
});

test('PR98: dies z warunkiem — Guildsworn Prowler mówi „nie blokował"', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'guildsworn-prowler');
  assert.match(text, /Gdy ta karta umrze \(gdy nie blokował\):/, text.slice(0, 250));
});

test('PR98: attacks z warunkiem — Stampeding Elk Herd mówi o sile 8+', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'stampeding-elk-herd');
  assert.match(text, /Gdy atakuje \(gdy łączna siła kontrolowanych stworów ≥ 8\):/, text.slice(0, 250));
});

test('PR98 anty-over-fix: ETB damage bez sufiksu typu (mylące przy drugim skutku) — Forge Devil', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'forge-devil');
  assert.match(text, /zada 1 obrażenie celowi i 1 obrażenie kontrolerowi\./, text.slice(0, 250));
});

test('PR98 anty-over-fix: ETB bez warunku i bez celu — tekst bez zmian', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'kor-cartographer');
  assert.match(text, /Gdy wejdzie na pole bitwy: szukaj w bibliotece na pole bitwy\./, text.slice(0, 250));
  assert.ok(!text.includes('(gdy'), `nieoczekiwany nawias warunku: ${text.slice(0, 250)}`);
});

test('PR98: end_step dalej renderuje klauzulę (refaktor na wspólny helper)', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'frontline-war-rager');
  assert.match(text, /Na początku kroku końca \(gdy kontrolujesz 2\+ zatapnięte stwory\):/, text.slice(0, 250));
});
