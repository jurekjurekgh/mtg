// M202/C — Żywy Tester (ravnica vs innistrad, seed 42, 2026-08-24), oś 2 audytu
// (czytelność informacji na stole).
//
// Kafel Chronic Flooding obiecywał: „Trigger zatapnięcie zaczarowanego
// permanentu: mieli 3 karty (do grobu)”. Etykiety w `TRIGGER_EVENT_LABELS` są
// FRAZAMI RZECZOWNIKOWYMI („śmierć stworu”, „atak”, „zatapnięcie …”), a szablon
// brzmiał `Trigger <etykieta>: <skutek>` — czyli zdanie nie po polsku, z
// zapożyczeniem „Trigger” zamiast opisu.
//
// M80 już uznał ten wzorzec za błąd i przypilnował go testem — ale na RĘCZNEJ
// liście siedmiu kart (`test/audit-m80-tester.test.js`), więc każda późniejsza
// karta korzystająca z generycznego fallbacku zostawała z tym samym defektem
// (klasa L26: strażnik z ręczną listą nie jest strażnikiem). Ten plik jest
// brakującym strażnikiem: skanuje CAŁY katalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderTableView } from '../src/table/render.js';

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

function miniview(battlefield) {
  return {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile: [], library: [], hand: [], battlefield },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
}

function minisession(view) {
  return {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
}

function tileText(cardId, kind) {
  const view = miniview([{
    id: 'o1', cardId, controllerId: 'p1', zone: 'battlefield', kind,
    summoningSickness: false, damage: 0,
  }]);
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'handEnemy', 'handEnemyLabel', 'waitingZone', 'waitingWrap', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session: minisession(view), play: () => {}, onCardClick: () => {} });
  return els.bfOwn.textContent;
}

/** Karty ze zdolnością triggerowaną — każda musi mieć opis bez „Trigger …”. */
function triggeredCards() {
  return REGISTRY.all().filter((card) => (card.abilities ?? []).some((a) => a?.type === 'triggered'));
}

test('M202/C (strażnik katalogu): żaden kafel nie pokazuje „Trigger <etykieta>”', () => {
  const cards = triggeredCards();
  assert.ok(cards.length > 50, `oczekiwano szerokiego katalogu, jest ${cards.length}`);
  const problems = [];
  for (const card of cards) {
    const kind = (card.types ?? []).includes('Creature') ? 'creature'
      : (card.types ?? []).includes('Enchantment') ? 'enchantment'
        : (card.types ?? []).includes('Artifact') ? 'artifact' : 'land';
    const text = tileText(card.id, kind);
    if (text.includes('Trigger ')) problems.push(`${card.id}: ${text.slice(0, 160)}`);
  }
  assert.deepEqual(problems, [],
    `Kafle z surowym „Trigger <etykieta>” (etykieta jest frazą rzeczownikową, więc\n`
    + `szablon dawał zdanie nie po polsku — patrz M202/C i M80):\n${problems.join('\n')}`);
});

test('M202/C (strażnik katalogu): do gracza nie wycieka surowy slug zdarzenia triggera', () => {
  const problems = [];
  for (const card of triggeredCards()) {
    const kind = (card.types ?? []).includes('Creature') ? 'creature'
      : (card.types ?? []).includes('Enchantment') ? 'enchantment'
        : (card.types ?? []).includes('Artifact') ? 'artifact' : 'land';
    const text = tileText(card.id, kind);
    // snake_case slug (np. enchanted_permanent_tapped) zamiast polskiej etykiety
    if (/[a-z]+_[a-z_]+/.test(text)) problems.push(`${card.id}: ${text.slice(0, 160)}`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('M202/C (zgłoszenie): Chronic Flooding opisuje skutek po polsku', () => {
  const text = tileText('chronic-flooding', 'enchantment');
  assert.ok(!text.includes('Trigger '), `surowy wzorzec M80: ${text}`);
  assert.match(text, /zatapnięcie/i, 'etykieta zdarzenia zostaje (fraza rzeczownikowa)');
  assert.match(text, /mieli 3 karty/, 'skutek jest opisany');
});
