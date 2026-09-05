// Audyt Batch53/B1 — kafel plotu pokazywał goły koszt generyczny
// („Plot {2}"), gubiąc pipy kolorów (Sheriff of Safe Passage: Plot {1}{W}).
// Ten sam rozkład generic + kolory co equip (M257 r3).
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

function tileText(cardId, kind) {
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [], hand: [],
      battlefield: [{
        id: 'o1', cardId, controllerId: 'p1', zone: 'battlefield', kind,
        summoningSickness: false, damage: 0,
      }],
    },
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

test('kafel plotu pokazuje pipy kolorów: Sheriff „Plot {1, W}" (B1)', () => {
  const text = tileText('sheriff-of-safe-passage', 'creature');
  assert.ok(text.includes('Plot {1, W}'), `kafel: ${text}`);
});

test('kafel plotu bez kolorów bez zmian: „Plot {2}"', () => {
  // Tumbleweed Rising ma Plot {2}{G}... tu negatyw: karta z plotem
  // generycznym (jeśli istnieje) albo sam format bez pipów.
  const generic = REGISTRY.all().find((c) => c.plot && (c.plot.colors ?? []).length === 0);
  if (!generic) return; // brak plotu w pełni generycznego — nic do pinowania
  const text = tileText(generic.id, 'creature');
  assert.ok(text.includes(`Plot {${generic.plot.cost}}`), `kafel: ${text}`);
});

test('kafel Rampagera: „stwórz kopię" (B4) + ewazja widoczna (B5)', async () => {
  const text = tileText('rust-shield-rampager', 'creature');
  assert.ok(text.includes('stwórz kopię (Offspring)'), `kafel: ${text}`);
  assert.ok(!text.includes('stwórz kopia '), `kafel: ${text}`);
  assert.ok(text.includes('nie może być blokowany przez stwory o mocy ≤2'), `kafel: ${text}`);
});

test('etykieta rzutu Offspring różni się od zwykłej (B6)', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [], battlefield: [],
      hand: [{
        id: 'ram', cardId: 'rust-shield-rampager', controllerId: 'p1',
        zone: 'hand', kind: 'card', manaCost: 4, offspring: { cost: 2, colors: [] },
      }],
    },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (id) => REGISTRY.get(id)?.name ?? id ?? '?',
    nameOfObject: (objectId) => (objectId === 'ram' ? 'Rust-Shield Rampager' : objectId),
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
  const plain = commandLabel({ type: 'cast_permanent', playerId: 'p1', objectId: 'ram' }, session, view);
  const off = commandLabel({ type: 'cast_permanent', playerId: 'p1', objectId: 'ram', offspring: true }, session, view);
  assert.ok(!plain.includes('offspring'), `zwykły: ${plain}`);
  assert.ok(off.includes('+ offspring'), `offspring: ${off}`);
  assert.notEqual(plain, off);
});
