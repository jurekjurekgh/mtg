import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderTableView } from '../src/table/render.js';

/**
 * Audyt żywym testerem stołu (M80) — naprawy tego, co WIDAĆ na stole:
 * czytelne opisy triggerów i efektów, rozróżnialne wybory, poprawna liczba
 * kart po mulliganie, brak szumowego modala „Brak ataku\".
 *
 * Nie testujemy engine (reguły), tylko WARSTWĘ WYŚWIETLANIA i etykiet —
 * to, co widzi gracz.
 */

// Minimalny globalny DOM dla renderTableView / choice-request (jak table-ui).
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
function miniels() {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) els[key] = new MiniEl(`#${key}`);
  return els;
}

function bfTileText(registry, cardId) {
  const view = miniview([{ id: 'o1', cardId, controllerId: 'p1', zone: 'battlefield', kind: 'creature', summoningSickness: false, damage: 0 }]);
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  return els.bfOwn.textContent;
}

test('M80: czytelne opisy triggerów na kaflach (zamiast „Trigger <event>\")', () => {
  const registry = createCardRegistry();
  const cases = [
    ['skyclave-geopede', /Landfall — gdy land wchodzi pod twoją kontrolą:/],
    ['nightshade-harvester', /Gdy land wchodzi pod kontrolą przeciwnika:/],
    ['frontline-war-rager', /Na początku kroku końca \(gdy kontrolujesz 2\+ zatapnięte stwory\):/],
    ['silumgar-butcher', /Gdy ten stwór exploituje:/],
    ['spectral-prison', /Gdy zaczarowany stwór staje się celem czaru:/],
    ['illvoi-operative', /Gdy rzucisz drugi czar w turze:/],
    ['jeskai-windscout', /Gdy rzucisz czar niebędący stworem:/],
  ];
  for (const [cardId, re] of cases) {
    const text = bfTileText(registry, cardId);
    assert.match(text, re, `${cardId}: ${text.slice(0, 200)}`);
    assert.ok(!text.includes('Trigger '), `${cardId} ma surowy „Trigger ...\": ${text.slice(0, 200)}`);
  }
});

test('M80: Forge Devil — celowany ETB z obrażeniami opisany jako „zada ... celowi\"', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'forge-devil');
  assert.match(text, /zada 1 obrażenie celowi/, text.slice(0, 200));
  assert.match(text, /1 obrażenie kontrolerowi/, text.slice(0, 200));
});

test('M80: Reclusive Artificer — dynamiczne obrażenia czytelnie („tyle obrażeń, ile artefaktów kontrolujesz\")', () => {
  const registry = createCardRegistry();
  const text = bfTileText(registry, 'reclusive-artificer');
  assert.ok(!text.includes('za każdy twój artefakt obrażeń'), text.slice(0, 200));
  assert.match(text, /tyle obrażeń, ile artefaktów kontrolujesz/, text.slice(0, 200));
});

test('M80: commandLabel — szukanie w bibliotece rozróżnia karty i rezygnację', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const view = miniview([{ id: 'o1', cardId: 'dawntreader-elk', controllerId: 'p1', zone: 'battlefield', kind: 'creature' }]);
  const session = minisession(registry, view);
  // Wynik znaleziony — nazwa karty w etykiecie.
  const found = commandLabel({ type: 'resolve_search_choice', playerId: 'p1', found: 'lib-forest' }, session, view);
  assert.match(found, /^Szukanie:/, found);
  assert.ok(found.includes('Szukanie: '), found);
  // Rezygnacja (fail to find).
  const none = commandLabel({ type: 'resolve_search_choice', playerId: 'p1', found: null }, session, view);
  assert.match(none, /nie znajduj karty/, none);
});

test('M80: mulligan — finalna ręka po London mulliganie (7−N)', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const view = miniview([]);
  const session = minisession(registry, view);
  session.state.mulliganCounts = {};
  const label = commandLabel({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }, session, view);
  assert.ok(!label.includes('nowa ręka 7 kart'), label);
  assert.match(label, /odłóż 1 kartę na spód/, label);
  assert.match(label, /zostanie 6/, label);
});

test('M80: wizard rozdzielania obrażeń — „śmiertelne N\" (nie angielskie lethal)', async () => {
  // Sprawdzane na renderDamageWizard przez renderTableView z pending damage.
  const { renderDamageWizard } = await import('../src/table/choice-request.js');
  const host = new MiniEl('div');
  const registry = createCardRegistry();
  const view = miniview([]);
  const session = minisession(registry, view);
  const pending = {
    entries: [{ attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: false, blockers: [{ id: 'b1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 }] }],
  };
  renderDamageWizard(host, { view, session, pending, defaultCommand: null, onComplete: () => {} });
  assert.match(host.textContent, /śmiertelne 3/, host.textContent.slice(0, 200));
  assert.ok(!host.textContent.includes('lethal'), host.textContent.slice(0, 200));
});

test('M80: Tumbleweed Rising — dynamiczne P/T tokena bez surowego slug (greatest_power_you_control)', () => {
  const registry = createCardRegistry();
  const view = miniview([{ id: 'o1', cardId: 'tumbleweed-rising', controllerId: 'p1', zone: 'battlefield', kind: 'spell' }]);
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const text = els.hand.textContent + els.bfOwn.textContent + els.actions.textContent;
  assert.ok(!text.includes('greatest_power_you_control'), `surowy slug: ${text.slice(0, 200)}`);
});
