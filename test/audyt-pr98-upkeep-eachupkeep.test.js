/**
 * Audyt PR #98 — kontynuacja (handoff 2026-09-05b pkt 2): gałąź `upkeep`
 * describeTriggered nie korzystała ze wspólnego `triggerConditionClause`
 * — renderowała WYŁĄCZNIE `noSpellsLastTurn`, z hardkodowanym fallbackiem
 * „gdy rzucono 2+ czary" dla WSZYSTKIEGO innego. Skutki na kaflach:
 * - wilkołaki (eachUpkeep + noSpells/minSpellsLastTurn) nie mówiły, że
 *   trigger odpala się w KAŻDYM upkeep (obu graczy — day/night),
 * - „minSpellsLastTurn" działało tylko dlatego, że 2 == hardkod,
 * - karty z upkeep BEZ warunku (Veiled Ascension „At the beginning of
 *   your upkeep") dostawały FAŁSZYWY warunek „gdy rzucono 2+ czary".
 *
 * Naprawa: gałąź upkeep liczy klauzulę przez triggerConditionClause
 * (jedno miejsce prawdy — klasa L28/L41), a strona czasu („każdego" /
 * „twojego" upkeep) wynika z pól eachUpkeep/braku condition.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderTableView } from '../src/table/render.js';

// Minimalny DOM dla renderTableView (harness jak audyt-pr98-warunki-triggerow-na-kaflich).
const _registry = new Map();
function _el(id) { if (!_registry.has(id)) _registry.set(id, new MiniEl(id)); return _registry.get(id); }
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  getElementById: (id) => _registry.get(id),
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

test('PR98/upkeep: wilkołak „day" — każdy upkeep + brak czarów w poprzedniej turze', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'grizzled-outcasts');
  assert.match(text, /Na początku każdego upkeep \(gdy w poprzedniej turze nie rzucano czarów\): transform \(obróć kartę\)\./, text.slice(0, 300));
});

test('PR98/upkeep: wilkołak „night" — każdy upkeep + 2+ czarów z deskryptora', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'krallenhorde-wantons');
  assert.match(text, /Na początku każdego upkeep \(gdy w poprzedniej turze rzucano 2\+ czary\): transform \(obróć kartę\)\./, text.slice(0, 300));
});

test('PR98/upkeep anty-over-fix: „your upkeep" BEZ warunku nie dostaje fałszywego „gdy rzucono 2+ czary"', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'veiled-ascension');
  assert.match(text, /Na początku twojego upkeep:/, text.slice(0, 300));
  assert.ok(!text.includes('gdy rzucono 2+ czary'), `fałszywy warunek na kaflu: ${text.slice(0, 300)}`);
});
