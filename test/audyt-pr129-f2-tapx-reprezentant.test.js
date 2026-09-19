// Audyt PR #129 — znalezisko F-2 (niskie): brak pinu dla reprezentanta grupy
// „Tap X artefaktów” w `data-option-key`.
//
// Render (render.js ~4694–4708) wybiera do klucza sondy wariant o NAJWIĘKSZYM
// X, bo pierwszy wariant oferty to od E2 legalna, ale jałowa aktywacja X=0
// (CR 107.3). Sonda „oferta bez skutku” Żywego Testera (L15) mierzy klucz
// przycisku, więc wystawienie X=0 zgłaszałoby fałszywe alarmy w każdej partii
// (L12: szum przykrywa znaleziska). Mutacja M10 audytu (usunięcie wyboru
// reprezentanta) nie czerwieniła żadnego testu — ten pin to domyka.
//
// Harness: Mini-DOM jak w choice-group-ignore.test.js / choice-request-ui.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderTableView } from '../src/table/render.js';
import { commandOptionKey } from '../src/table/session.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.title = '';
    this.type = '';
  }

  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html || this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  emit(type, value) { for (const fn of this.listeners[type] ?? []) fn(value ?? {}); }
}

globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const REGISTRY = createCardRegistry();

/** Warianty kosztu „Tap X artefaktów” Merchant's Dockhand: X = 0..2. */
function tapXVarianty(xMax = 2) {
  const out = [];
  for (let x = 0; x <= xMax; x += 1) {
    out.push({
      type: 'activate_ability', playerId: 'p1', objectId: 'dockhand', abilityIndex: 0,
      xValue: x, tapArtifactIds: ['art0', 'art1'].slice(0, x),
    });
  }
  return out;
}

function renderActions(legalCommands) {
  const dockhandDef = REGISTRY.get('merchants-dockhand');
  const dockhand = {
    id: 'dockhand', cardId: 'merchants-dockhand', controllerId: 'p1', kind: 'artifact',
    power: 1, toughness: 2, tapped: false, types: ['Artifact', 'Creature'], subtypes: ['Construct'],
    keywords: [], abilities: dockhandDef.abilities,
  };
  const artefakt = (id) => ({
    id, cardId: 'angels-feather', controllerId: 'p1', kind: 'artifact', tapped: false,
    types: ['Artifact'], subtypes: [], keywords: [],
  });
  const view = {
    playerId: 'p1', status: 'active',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    turn: { number: 3, phase: 'precombat_main', step: 'main', activePlayerId: 'p1', priorityPlayerId: 'p1' },
    zones: {
      battlefield: [dockhand, artefakt('art0'), artefakt('art1')],
      hand: [], graveyard: [], exile: [], stack: [], library: [],
    },
    legalCommands,
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 1, objects: new Map() },
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (objectId) => objectId,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({
    els, session, play: () => {}, onCardClick: () => {},
    onChoiceRequest: () => {}, ignoredOptionKeys: new Set(), onToggleIgnoredOption: () => {},
  });
  return els.actions.children.filter((c) => (c.className ?? '').includes('action'));
}

test('F-2/1: klucz sondy grupy tapX to wariant o NAJWIĘKSZYM X, nie pierwszy (X=0)', () => {
  const warianty = tapXVarianty(2);
  const buttons = renderActions(warianty);
  const group = buttons.find((b) => (b.className ?? '').includes('choice-request-trigger'));
  assert.ok(group, 'warianty tapX grupują się w jeden przycisk kreatora');
  const maxX = warianty.find((c) => c.xValue === 2);
  assert.equal(group.dataset.optionKey, commandOptionKey(maxX),
    'reprezentantem grupy jest wariant max-X (sonda mierzy realny skutek, nie jałowy X=0)');
  assert.notEqual(group.dataset.optionKey, commandOptionKey(warianty[0]),
    'klucz X=0 byłby pomiarem jałowej aktywacji — dokładnie to wybiera ten pin');
});

test('F-2/2: grupa bez kształtu tapX zachowuje dotychczasowego reprezentanta (pierwsza opcja)', () => {
  const warianty = [
    { type: 'activate_ability', playerId: 'p1', objectId: 'dockhand', abilityIndex: 0, targets: ['art0'] },
    { type: 'activate_ability', playerId: 'p1', objectId: 'dockhand', abilityIndex: 0, targets: ['art1'] },
  ];
  const buttons = renderActions(warianty);
  const group = buttons.find((b) => (b.className ?? '').includes('choice-request-trigger'));
  assert.ok(group, 'grupa celów istnieje');
  assert.equal(group.dataset.optionKey, commandOptionKey(warianty[0]),
    'wybór reprezentanta max-X dotyczy WYŁĄCZNIE kształtu tapX (kontrola przeciw nadmiarowi)');
});

test('F-2/3: oferta z jednym wariantem tapX (X=0) nie udaje grupy z kreatorem', () => {
  const buttons = renderActions([{ type: 'activate_ability', playerId: 'p1', objectId: 'dockhand', abilityIndex: 0, xValue: 0, tapArtifactIds: [] }]);
  const button = buttons.find((b) => (b.className ?? '').includes('action'));
  assert.ok(button, 'pojedynczy wariant bez X>0 to zwykła akcja panelu');
  assert.equal(button.dataset.optionKey, commandOptionKey({ type: 'activate_ability', playerId: 'p1', objectId: 'dockhand', abilityIndex: 0, xValue: 0, tapArtifactIds: [] }));
});
