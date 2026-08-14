// M91 — uwaga B właściciela (2026-08-14): „Karta Village Rites (instant) nie ma
// okienka do zaptaszkowania (pomiń w auto-pass), to samo Bone Splinters —
// pewnie wszystkie czary modalne (z opcjami) nie mają możliwości
// zaptaszkowania do pomijania pauzy w auto-pass."
//
// Root cause: panel akcji rysuje ptaszek wyciszenia TYLKO dla wpisów bez
// `entry.request` (`render.js`: `if (onToggleIgnoredOption && !entry.request
// && OPTION_IGNORABLE_TYPES.includes(cmd.type))`). Czar z wariantami
// (Village Rites — wybór poświęcanego stwora; Bone Splinters — wybór celu;
// każdy czar modalny) jest w panelu JEDNYM przyciskiem „Wybierz: …", który
// otwiera wizard — i ten przycisk ptaszka nie dostawał. Gracz mógł wyciszyć
// taki czar dopiero PO otwarciu modala, co przeczy sensowi funkcji (chce
// pomijać właśnie bez otwierania).
//
// Fix u root cause: przycisk grupy też dostaje ptaszek, a wyciszenie działa
// na CAŁĄ grupę (wszystkie warianty czaru), nie na pojedynczy wariant —
// inaczej wyciszenie jednego celu nadal przerywałoby auto-pass przy innym.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderTableView } from '../src/table/render.js';

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

/** Panel akcji dla podanych legalCommands; zwraca przyciski i toggle'e. */
function renderActions(legalCommands, { ignoredOptionKeys = new Set(), onToggleIgnoredOption = () => {} } = {}) {
  const creature = {
    id: 'my-creature', cardId: 'goblin-piker', controllerId: 'p1', kind: 'creature',
    power: 2, toughness: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], tapped: false,
  };
  const view = {
    playerId: 'p1', status: 'active',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    turn: { number: 3, phase: 'precombat_main', step: 'main', activePlayerId: 'p1', priorityPlayerId: 'p1' },
    zones: { battlefield: [creature], hand: [], graveyard: [], exile: [], stack: [], library: [] },
    legalCommands,
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 1 },
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
    onChoiceRequest: () => {}, ignoredOptionKeys, onToggleIgnoredOption,
  });
  return els.actions.children.filter((c) => (c.className ?? '').includes('action'));
}

function toggleOf(button) {
  const label = (button.children ?? []).find((c) => c.className === 'action-ignore');
  return label ? (label.children ?? []).find((c) => c.className === 'action-ignore-input') : null;
}

// Village Rites: „sacrifice a creature" → engine enumeruje wariant na stwora.
// Z DWOMA stworami powstają dwa warianty = grupa (jeden przycisk „Wybierz:").
const villageRitesVariants = [
  { type: 'cast_spell', playerId: 'p1', objectId: 'rites', sacrificeTargetId: 'my-creature' },
  { type: 'cast_spell', playerId: 'p1', objectId: 'rites', sacrificeTargetId: 'other-creature' },
];

test('B: przycisk grupy wariantów (Village Rites) MA ptaszek pomijania', () => {
  const buttons = renderActions(villageRitesVariants);
  const groupButton = buttons.find((b) => (b.className ?? '').includes('choice-request-trigger'));
  assert.ok(groupButton, 'warianty czaru muszą być zgrupowane w jeden przycisk wizarda');
  assert.ok(toggleOf(groupButton),
    'przycisk grupy wariantów MUSI mieć ptaszek pomijania (auto-pass) — bez niego gracz nie wycisza czaru z panelu');
});

test('B: ptaszek grupy wycisza WSZYSTKIE warianty czaru, nie jeden', async () => {
  const ignored = new Set();
  const buttons = renderActions(villageRitesVariants, {
    ignoredOptionKeys: ignored,
    onToggleIgnoredOption: (key) => { if (ignored.has(key)) ignored.delete(key); else ignored.add(key); },
  });
  const groupButton = buttons.find((b) => (b.className ?? '').includes('choice-request-trigger'));
  const toggle = toggleOf(groupButton);
  assert.ok(toggle, 'grupa musi mieć ptaszek');
  toggle.emit('change');

  // Po wyciszeniu grupy KAŻDY wariant czaru musi być uznany za wyciszony —
  // sprawdzamy kontraktem sesji (commandOptionKey na wariantach).
  assert.ok(ignored.size > 0, 'przełączenie ptaszka musi zapisać klucz wyciszenia');
  const { commandOptionKey } = await import('../src/table/session.js');
  const covered = villageRitesVariants.every((cmd) => ignored.has(commandOptionKey(cmd)));
  assert.ok(covered,
    'wyciszenie grupy MUSI obejmować wszystkie warianty czaru (inaczej auto-pass nadal przerwie na innym wariancie)');
});

test('B: ponowny render pokazuje grupę jako już wyciszoną', async () => {
  const { commandOptionKey } = await import('../src/table/session.js');
  const ignored = new Set(villageRitesVariants.map((cmd) => commandOptionKey(cmd)));
  const buttons = renderActions(villageRitesVariants, { ignoredOptionKeys: ignored });
  const groupButton = buttons.find((b) => (b.className ?? '').includes('choice-request-trigger'));
  const toggle = toggleOf(groupButton);
  assert.ok(toggle, 'grupa musi mieć ptaszek');
  assert.equal(toggle.checked, true, 'wyciszona grupa musi mieć zaznaczony ptaszek po ponownym renderze');
});

test('B: obowiązkowe decyzje (grupa resolve_*) NIE dostają ptaszka', () => {
  const buttons = renderActions([
    { type: 'resolve_scry', playerId: 'p1', bottomIds: [] },
    { type: 'resolve_scry', playerId: 'p1', bottomIds: ['card-a'] },
  ]);
  const groupButton = buttons.find((b) => (b.className ?? '').includes('choice-request-trigger'));
  assert.ok(groupButton, 'scry powinno być zgrupowane');
  assert.equal(toggleOf(groupButton), null,
    'obowiązkowej decyzji (scry) nie wolno wyciszać — brak ptaszka');
});
