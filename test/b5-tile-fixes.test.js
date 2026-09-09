// B5 (audyt stołu 2026-09-09, partie G1–G4 żywym testerem) — regresje KAFli:
// G: osad object.spell na kaflu aury w ręce („efekt (attach_aura) · cel:"),
// Disa: brak filtra Lhurgoyf w glosie triggera, Glint-Sleeve: zdublowany
// opis fabricate, Emissary Escort: „mana value" w glosie markera.
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

function zoneTexts({ hand = [], battlefield = [], exile = [] }) {
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile, library: [], hand, battlefield },
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
  return { hand: els.hand.textContent, bfOwn: els.bfOwn.textContent, exile: els.exileZone.textContent };
}

// Osad po castAuraSpell: instancja czaru z runtime'owym attach_aura, niesiona
// przez strefy (choke moveObjectDirectly nie resetuje `spell`).
const STALE_AURA_SPELL = {
  timing: 'sorcery', aura: true, enchantPlayer: false,
  targets: [{ type: 'creature' }], effects: [{ type: 'attach_aura' }],
};

// G: kafel aury w ręce nie czyta osadu instancji czaru.
test('B5/G: ręka — aura po rzucie bez „efekt (attach_aura) · cel:"', () => {
  const { hand } = zoneTexts({
    hand: [{
      id: 'h1', cardId: 'containment-membrane', controllerId: 'p1', zone: 'hand',
      kind: 'enchantment', spell: STALE_AURA_SPELL,
    }],
  });
  assert.ok(hand.includes('Containment Membrane'), `kafel: ${hand}`);
  assert.ok(!hand.includes('attach_aura'), `kafel: ${hand}`);
  assert.ok(!hand.includes('cel:'), `kafel: ${hand}`);
  assert.ok(hand.includes('nie odkręca'), `linia aury musi zostać: ${hand}`);
});

// G: świeża aura w ręce — kontrola negatywna (bez zmian).
test('B5/G: ręka — świeża aura bez linii czaru', () => {
  const { hand } = zoneTexts({
    hand: [{
      id: 'h1', cardId: 'containment-membrane', controllerId: 'p1', zone: 'hand', kind: 'enchantment',
    }],
  });
  assert.ok(!hand.includes('cel:'), `kafel: ${hand}`);
});

// G: glosa zapasowa — gdyby instancja dotarła do kafle (wygnanie pozwala na
// żywy deskryptor), slug nie przechodzi.
test('B5/G: wygnanie — instancja czaru aury mówi „zaczaruj", nie slugiem', () => {
  const { exile } = zoneTexts({
    exile: [{
      id: 'x1', cardId: 'containment-membrane', controllerId: 'p1', zone: 'exile',
      kind: 'enchantment', spell: STALE_AURA_SPELL,
    }],
  });
  assert.ok(exile.includes('zaczaruj'), `kafel: ${exile}`);
  assert.ok(!exile.includes('attach_aura'), `kafel: ${exile}`);
});

// Disa: filtr podtypu + „twój cmentarz" (jak wymaga matcher w triggers.js).
test('B5/Disa: kafel Disy nazywa Lhurgoyf i twój cmentarz', () => {
  const { bfOwn } = zoneTexts({
    battlefield: [{
      id: 'o1', cardId: 'disa-the-restless', controllerId: 'p1', zone: 'battlefield',
      kind: 'creature', summoningSickness: false, damage: 0,
    }],
  });
  assert.ok(bfOwn.includes('Lhurgoyf'), `kafel: ${bfOwn}`);
  assert.ok(bfOwn.includes('twój cmentarz'), `kafel: ${bfOwn}`);
  assert.ok(!bfOwn.includes('Gdy karta trafi'), `kafel: ${bfOwn}`);
});

// Glint-Sleeve: jeden opis fabricate (zdolność), bez linii słowa kluczowego.
test('B5/fabricate: kafel bez zdublowanego opisu', () => {
  const { bfOwn } = zoneTexts({
    battlefield: [{
      id: 'o1', cardId: 'glint-sleeve-artisan', controllerId: 'p1', zone: 'battlefield',
      kind: 'creature', summoningSickness: false, damage: 0,
    }],
  });
  assert.ok(bfOwn.includes('Gdy wejdzie na pole bitwy'), `kafel: ${bfOwn}`);
  assert.ok(!bfOwn.includes('Fabricate ('), `kafel: ${bfOwn}`);
});

// Emissary Escort: glosa markera po polsku.
test('B5/marker: „wartość many innych artefaktów", nie „mana value"', () => {
  const { bfOwn } = zoneTexts({
    battlefield: [{
      id: 'o1', cardId: 'emissary-escort', controllerId: 'p1', zone: 'battlefield',
      kind: 'creature', summoningSickness: false, damage: 0,
    }],
  });
  assert.ok(bfOwn.includes('wartość many'), `kafel: ${bfOwn}`);
  assert.ok(!bfOwn.includes('mana value'), `kafel: ${bfOwn}`);
});
