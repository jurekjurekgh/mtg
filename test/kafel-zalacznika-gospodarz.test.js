// M102/U7 — kafel aury/ekwipunku na STOLE nie mówi, do kogo jest przypięty.
//
// Objaw: na polu bitwy leży „Warrior's Sword" przypięty do „Ainok Tracker".
// Kafel GOSPODARZA poprawnie pokazuje badge „wyposażona: Warrior's Sword",
// ale kafel samego MIECZA nie pokazuje niczego — gracz nie widzi, kogo ten
// ekwipunek wzmacnia. Przy dwóch stworach i dwóch ekwipunkach powiązania są
// nie do odczytania bez klikania w każdą kartę.
//
// Root cause: `buildFace` (render.js) MA gałąź „wyposaża → <gospodarz>" /
// „aura → <gospodarz>", ale jest ona pod warunkiem `!skipLiveState`.
// Kafle stołu (`tile()` :1885 i `renderCardInto` :1955) wołają
// `buildCardVisual(..., { skipLiveState: true })`, bo żywy stan ma być na
// nakładce — więc ta gałąź na stole NIGDY się nie wykonuje.
// `buildStateOverlay` z kolei świadomie jej nie dubluje, opierając się na
// komentarzu „przypięcie pokazuje buildFace" — który dla kafli stołu jest
// nieprawdziwy. Efekt: informacja znika z obu ścieżek naraz.
//
// Kontrakt: nazwa gospodarza idzie przez `session.nameOfObject`, więc zakryty
// gospodarz (morph) pozostaje zamaskowany zgodnie z CR 708.2 (M102/U6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

// --- minimalna atrapa DOM (kontrakt jak w test/table-ui.test.js) ------------
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.style = {};
    this.dataset = {}; this.className = ''; this.text = ''; this.html = '';
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }

  get innerHTML() { return this.html; }

  appendChild(c) { this.children.push(c); return c; }

  append(...cs) { cs.forEach((c) => this.children.push(c)); }

  querySelector() { return null; }

  querySelectorAll() { return []; }

  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }

  setAttribute(k, v) { this.dataset[k] = v; }

  getAttribute(k) { return this.dataset[k]; }

  removeAttribute() {}

  get classList() {
    const self = this;
    return {
      add(...c) {
        self.className = [...new Set([...String(self.className).split(/\s+/).filter(Boolean), ...c])].join(' ');
      },
      remove(...c) {
        self.className = String(self.className).split(/\s+/).filter((x) => x && !c.includes(x)).join(' ');
      },
      contains(c) { return String(self.className).split(/\s+/).includes(c); },
      toggle() {},
    };
  }

  removeChild(c) { this.children = this.children.filter((x) => x !== c); }

  closest() { return null; }

  remove() {}
}

globalThis.document = {
  createElement: (t) => new MiniEl(t),
  createTextNode: (t) => { const e = new MiniEl('#text'); e.text = String(t); return e; },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  body: new MiniEl('body'),
};
globalThis.window = {
  addEventListener() {},
  requestAnimationFrame: (cb) => cb(),
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};

const { renderTableView } = await import('../src/table/render.js');
const REGISTRY = createCardRegistry();

function miniels() {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn',
    'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  return els;
}

/** Renderuje pole bitwy i zwraca tekst własnej strefy. */
function renderBattlefield(battlefield, { nameOfObject } = {}) {
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [], hand: [], battlefield,
    },
    turn: {
      number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main',
    },
    legalCommands: [],
  };
  const byId = new Map(battlefield.map((o) => [o.id, o]));
  const session = {
    view: () => view,
    log: [],
    reasoning: [],
    state: { seed: 13 },
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: nameOfObject ?? ((objectId) => {
      const o = byId.get(objectId);
      return o ? (REGISTRY.get(o.cardId)?.name ?? o.cardId) : objectId;
    }),
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
  const els = miniels();
  renderTableView({
    els, session, play: () => {}, onCardClick: () => {}, onChoiceRequest: () => {},
  });
  return els.bfOwn.textContent;
}

const HOST = {
  id: 'host', cardId: 'ainok-tracker', controllerId: 'p1', zone: 'battlefield',
  kind: 'creature', tapped: false, summoningSickness: false, damage: 0,
};
const SWORD = {
  id: 'sword', cardId: 'warriors-sword', controllerId: 'p1', zone: 'battlefield',
  kind: 'artifact', tapped: false, damage: 0, attachedTo: 'host', equipment: {},
};

test('U7: kafel EKWIPUNKU na stole mówi, kogo wyposaża', () => {
  const text = renderBattlefield([HOST, SWORD]);
  assert.ok(text.includes('wyposaża'),
    `kafel ekwipunku musi pokazać, do kogo jest przypięty; render:\n${text}`);
  assert.ok(/wyposaża\s*→?\s*Ainok Tracker/.test(text),
    `badge ma nazywać gospodarza („wyposaża → Ainok Tracker"); render:\n${text}`);
});

test('U7: kafel GOSPODARZA nadal pokazuje przypięty ekwipunek (regresja)', () => {
  const text = renderBattlefield([HOST, SWORD]);
  assert.ok(text.includes("wyposażona: Warrior's Sword"),
    `gospodarz musi pokazywać badge załącznika; render:\n${text}`);
});

test('U7: kafel AURY na stole mówi, kogo zaczarowuje', () => {
  const aura = {
    id: 'aura1', cardId: 'vow-of-wildness', controllerId: 'p1', zone: 'battlefield',
    kind: 'aura', tapped: false, damage: 0, attachedTo: 'host', aura: {},
  };
  const text = renderBattlefield([HOST, aura]);
  assert.ok(/aura\s*→?\s*Ainok Tracker/.test(text),
    `kafel aury ma nazywać gospodarza („aura → Ainok Tracker"); render:\n${text}`);
});

test('U7: zakryty gospodarz (morph) pozostaje zamaskowany na kaflu załącznika (CR 708.2)', () => {
  // Gospodarz przeciwnika leży zakryty — nazwa NIE może wyciec przez badge
  // załącznika. Nazwa idzie przez nameOfObject, które maskuje face-down.
  const foeHost = {
    id: 'foe-host', cardId: null, controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', tapped: false, damage: 0, faceDown: true,
  };
  const myAura = {
    id: 'aura2', cardId: 'vow-of-wildness', controllerId: 'p1', zone: 'battlefield',
    kind: 'aura', tapped: false, damage: 0, attachedTo: 'foe-host', aura: {},
  };
  const text = renderBattlefield([foeHost, myAura], {
    nameOfObject: (id) => (id === 'foe-host' ? 'morph' : id),
  });
  assert.ok(!text.includes('Woolly Loxodon'),
    `nazwa zakrytego gospodarza nie może wyciec; render:\n${text}`);
  assert.ok(/aura\s*→?\s*morph/.test(text),
    `kafel aury ma pokazać zamaskowanego gospodarza („aura → morph"); render:\n${text}`);
});

test('U7: nieprzypięty ekwipunek nie dostaje badge gospodarza', () => {
  const loose = { ...SWORD, attachedTo: undefined };
  const text = renderBattlefield([HOST, loose]);
  assert.ok(!text.includes('wyposaża →'),
    `luźny ekwipunek nie ma gospodarza; render:\n${text}`);
});
