// B7 (audyt językowy 2026-09-09, backlog B5) — liczniki, rodzaj, angielszczyzna:
// log używa COUNTER_LABELS w dopełniaczu (koniec z „licznik stun/shield"),
// badge załącznika to rzeczownik („Aura:/Equipment:" zamiast imiesłowu
// żeńskiego), kafel Jyoti mówi „stwory-lądy" (nie „land creatures").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
import { COUNTER_LABELS, COUNTER_LABELS_GEN, counterLabelGen } from '../src/table/counter-labels.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderTableView } from '../src/table/render.js';

const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const helpers = {
  nameOf: (cardId) => cardId,
  nameOfObject: () => 'Stwór',
  isPlayer: (id) => NAMES[id] != null,
};

// Mapa: tarcza dopisana (silnikowy licznik spoza bazy kart).
test('B7: COUNTER_LABELS zna shield; dopełniacz ma wszystkie rzeczowniki', () => {
  assert.equal(COUNTER_LABELS.shield, 'tarcza');
  for (const key of ['flying', 'deathtouch', 'lifelink', 'finality', 'stun', 'level', 'loyalty', 'point', 'shield']) {
    assert.ok(COUNTER_LABELS_GEN[key], `dopełniacz dla ${key}`);
  }
});

test('B7: counterLabelGen — dopełniacz, symbole i fallbacki', () => {
  assert.equal(counterLabelGen('stun'), 'ogłuszenia');
  assert.equal(counterLabelGen('flying'), 'Latania');
  assert.equal(counterLabelGen('shield'), 'tarczy');
  assert.equal(counterLabelGen('+1/+1'), '+1/+1');
  assert.equal(counterLabelGen('oil'), 'oil');
  assert.equal(counterLabelGen('nieznany'), 'nieznany');
});

// Log: dopełniacz zamiast surowego sluga.
test('B7: log — „licznik ogłuszenia/tarczy/Latania", symbole bez zmian', () => {
  const added = (counter) => describeGameEvent(
    { type: 'counter_added', objectId: 'o', counter, amount: 1, total: 1 }, helpers, NAMES,
  );
  assert.match(added('stun'), /dostaje \+1 licznik ogłuszenia/);
  assert.match(added('shield'), /dostaje \+1 licznik tarczy/);
  assert.match(added('flying'), /dostaje \+1 licznik Latania/);
  assert.match(added('+1/+1'), /dostaje \+1 licznik \+1\/\+1/);
  assert.match(added('oil'), /dostaje \+1 licznik oil/);
  const removed = describeGameEvent(
    { type: 'counter_removed', objectId: 'o', counter: 'shield', amount: 1, total: 0 }, helpers, NAMES,
  );
  assert.match(removed, /traci 1 licznik tarczy/);
});

// Tarcza: bez angielskiego nawiasu (nazwa jest w COUNTER_LABELS).
test('B7: log — „zużywa tarczę" bez „(shield)"', () => {
  const text = describeGameEvent({ type: 'shield_consumed', objectId: 'o' }, helpers, NAMES);
  assert.equal(text, 'Stwór zużywa tarczę');
});

// --- kafle (harness jak batch53) ---

const REGISTRY = createCardRegistry();

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.listeners = {}; this.style = {}; this.dataset = {}; this.hidden = false; this.type = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  setAttribute(name, value) { this.dataset[name] = value; }
  createTextNode(v) { return new MiniEl('#text'); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
const doc = { createElement: (tag) => new MiniEl(tag), createTextNode: () => new MiniEl('#text') };
globalThis.document = globalThis.document ?? doc;

function bfText(battlefield) {
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile: [], library: [], hand: [], battlefield },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (id) => REGISTRY.get(id)?.name ?? id ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'handEnemy', 'handEnemyLabel', 'actions', 'log',
    'graveOwnWrap', 'exileZoneWrap', 'graveEnemyWrap']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  return els.bfOwn.textContent;
}

// Badge załącznika: rzeczownik bez rodzaju (gospodarz męski — Highland Game to Elk).
test('B7: gospodarz pokazuje „Aura:"/„Equipment:" (nie imiesłów żeński)', () => {
  const text = bfText([
    { id: 'host', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield', kind: 'creature', summoningSickness: false, damage: 0 },
    { id: 'aura', cardId: 'curiosity', controllerId: 'p1', zone: 'battlefield', kind: 'aura', attachedTo: 'host', aura: { enchant: 'creature' } },
    { id: 'equip', cardId: 'cloak-of-the-bat', controllerId: 'p1', zone: 'battlefield', kind: 'artifact', attachedTo: 'host' },
  ]);
  assert.ok(text.includes('Aura: Curiosity'), `kafel: ${text}`);
  assert.ok(text.includes('Equipment: Cloak of the Bat'), `kafel: ${text}`);
  assert.ok(!text.includes('zaczarowana:'), `kafel: ${text}`);
  assert.ok(!text.includes('wyposażona:'), `kafel: ${text}`);
});

// Tarcza: badge i linia „wchodzi z" po polsku.
test('B7: tarcza — „1x tarcza" i „Wchodzi z 1 licznikiem tarczy"', () => {
  const badge = bfText([
    { id: 'o1', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield', kind: 'creature', summoningSickness: false, damage: 0, counters: { shield: 1 } },
  ]);
  assert.ok(badge.includes('1x tarcza'), `kafel: ${badge}`);
  const enters = bfText([
    { id: 'o2', cardId: 'voice-of-the-vermin', controllerId: 'p1', zone: 'battlefield', kind: 'creature', summoningSickness: false, damage: 0 },
  ]);
  assert.ok(enters.includes('Wchodzi z 1 licznikiem tarczy'), `kafel: ${enters}`);
});

// Jyoti: „stwory-lądy" jak w logu mass buffa.
test('B7: Jyoti — „dla stworów-lądów", nie „land creatures"', () => {
  const text = bfText([
    { id: 'o1', cardId: 'jyoti-moag-ancient', controllerId: 'p1', zone: 'battlefield', kind: 'creature', summoningSickness: false, damage: 0 },
  ]);
  assert.ok(text.includes('dla stworów-lądów'), `kafel: ${text}`);
  assert.ok(!text.includes('land creatures'), `kafel: ${text}`);
});
