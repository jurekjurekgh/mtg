// Uwaga C1 właściciela z testów (2026-09-19, Merchant's Dockhand) — E4:
// UI. Kardynalna zasada właściciela: ŻADNEJ enumeracji wariantów — jeden
// przycisk „Aktywuj”, po kliknięciu uniwersalny modal wyboru: najpierw X
// (stepper +/−), potem lista nietapniętych artefaktów do zaznaczenia
// DOKŁADNIE X, „Zatwierdź”. Warstwa czysta (plan + komenda z zaznaczenia —
// kontrakt jak crewMode: UI buduje, silnik re-waliduje przy aktywacji, L48)
// i DOM kreatora (stepper X istnieje w renderMultiTargetWizard od Fireballa
// — tu dochodzi tryb tapXMode: wybór artefaktów sprzężony z licznikiem X).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tapXArtifactsPlanOf, commandForTapXSelection } from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.checked = false;
    this.disabled = false; this.name = ''; this.dataset = {};
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type) { for (const l of this.listeners[type] ?? []) l({}); }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

// Warianty oferty silnika po E2: X=0..2, prefiksy puli artefaktów.
const WARIANTY = [
  { type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0, xValue: 0, tapArtifactIds: [] },
  { type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0, xValue: 1, tapArtifactIds: ['a0'] },
  { type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0, xValue: 2, tapArtifactIds: ['a0', 'a1'] },
];

// --- tapXArtifactsPlanOf -----------------------------------------------------

test('C1-U/1: plan z grupy wariantów — stepper X 0..N i pula artefaktów', () => {
  const plan = tapXArtifactsPlanOf(WARIANTY);
  assert.ok(plan?.tapXMode, 'tryb kreatora tapX');
  assert.equal(plan.hasX, true);
  assert.equal(plan.xMin, 0, 'X=0 dostępne (CR 107.3, uwaga C1)');
  assert.equal(plan.xMax, 2);
  assert.deepEqual(plan.targets, ['a0', 'a1'], 'pula = suma wariantów, bez duplikatów');
  assert.equal(plan.objectId, 'dh');
  assert.equal(plan.abilityIndex, 0);
  assert.equal(plan.playerId, 'p1');
});

test('C1-U/2: plan odrzuca obce kształty (nic nie podszywa się pod kreator)', () => {
  assert.equal(tapXArtifactsPlanOf([]), null);
  assert.equal(tapXArtifactsPlanOf([{ type: 'cast_spell', objectId: 'dh' }]), null);
  // Grupa bez tapArtifactIds (zwykłe warianty X czaru) ≠ kreator tapX.
  assert.equal(tapXArtifactsPlanOf([
    { type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0, xValue: 1 },
    { type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0, xValue: 2 },
  ]), null);
  // Mieszane źródła ≠ jedna decyzja.
  assert.equal(tapXArtifactsPlanOf([
    WARIANTY[0],
    { ...WARIANTY[1], objectId: 'inny' },
  ]), null);
});

// --- commandForTapXSelection -------------------------------------------------

test('C1-U/3: komenda z zaznaczenia — dokładnie X artefaktów', () => {
  const plan = tapXArtifactsPlanOf(WARIANTY);
  assert.deepEqual(commandForTapXSelection(plan, ['a0', 'a1'], 2), {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 2, tapArtifactIds: ['a0', 'a1'],
  });
  assert.deepEqual(commandForTapXSelection(plan, ['a1'], 1), {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 1, tapArtifactIds: ['a1'],
  });
});

test('C1-U/4: X=0 z pustym zaznaczeniem jest legalne (aktywacja jałowa)', () => {
  const plan = tapXArtifactsPlanOf(WARIANTY);
  assert.deepEqual(commandForTapXSelection(plan, [], 0), {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 0, tapArtifactIds: [],
  });
});

test('C1-U/5: niezgodność liczby zaznaczeń z X albo obcy artefakt → brak komendy', () => {
  const plan = tapXArtifactsPlanOf(WARIANTY);
  assert.equal(commandForTapXSelection(plan, ['a0'], 2), null, 'za mało zaznaczeń');
  assert.equal(commandForTapXSelection(plan, ['a0', 'a1'], 1), null, 'za dużo zaznaczeń');
  assert.equal(commandForTapXSelection(plan, ['a0', 'a0'], 2), null, 'dublet');
  assert.equal(commandForTapXSelection(plan, ['ghost'], 1), null, 'obcy artefakt');
  assert.equal(commandForTapXSelection(plan, [], 1), null, 'X=1 bez zaznaczeń');
});

// --- DOM kreatora ------------------------------------------------------------

const WIZ_VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: {
    battlefield: [
      { id: 'dh', cardId: 'merchants-dockhand', controllerId: 'p1' },
      { id: 'a0', cardId: 'angels-feather', controllerId: 'p1' },
      { id: 'a1', cardId: 'angels-feather', controllerId: 'p1' },
    ],
  },
};
const WIZ_SESSION = { nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId };

function renderTapX({ onComplete = () => {}, onCancel = () => {} } = {}) {
  const plan = tapXArtifactsPlanOf(WARIANTY);
  assert.ok(plan, 'plan kreatora');
  const host = new MiniEl('div');
  renderMultiTargetWizard(host, {
    view: WIZ_VIEW, session: WIZ_SESSION, plan, commands: WARIANTY,
    intro: 'Aktywuj: Merchant’s Dockhand — wybierz X, potem zaznacz dokładnie X artefaktów do tapnięcia:',
    onOpenCard: () => {}, onComplete, onCancel,
  });
  return host;
}
const xCount = (host) => Number(host.byClass('multi-target-x-count')[0]?.textContent ?? -1);

test('C1-U/6: kreator ma stepper X (0..N) i listę artefaktów; start X=0 gotowy do zatwierdzenia', () => {
  const host = renderTapX();
  assert.ok(host.byClass('multi-target-x').length > 0, 'wiersz steppera X istnieje');
  assert.ok(host.byClass('multi-target-x-minus')[0], 'przycisk −1');
  assert.ok(host.byClass('multi-target-x-plus')[0], 'przycisk +1');
  assert.equal(xCount(host), 0, 'start od X=0');
  assert.equal(host.byClass('multi-target-toggle').length, 2, 'wiersz na każdy artefakt puli');
  // X=0 bez zaznaczeń to legalna (jałowa) aktywacja — Zatwierdź aktywne.
  assert.equal(host.byClass('multi-target-confirm')[0].disabled, false);
});

test('C1-U/7: pełny przepływ — X w górę, dokładnie X zaznaczeń, komenda z Zatwierdź', () => {
  let completed = null;
  const host = renderTapX({ onComplete: (cmd) => { completed = cmd; } });
  const plus = host.byClass('multi-target-x-plus')[0];
  const confirm = () => host.byClass('multi-target-confirm')[0];
  const status = () => host.byClass('multi-target-status')[0].textContent;
  const toggles = host.byClass('multi-target-toggle');
  // X=2: samo podbicie X bez zaznaczeń NIE puszcza bramki.
  plus.click(); plus.click();
  assert.equal(xCount(host), 2);
  assert.equal(confirm().disabled, true, 'X=2 bez zaznaczeń — wybór niekompletny');
  assert.match(status(), /2/, 'status mówi, ile artefaktów brakuje');
  toggles[0].checked = true; toggles[0].emit('change');
  assert.equal(confirm().disabled, true, 'jeden z dwóch — dalej brak');
  toggles[1].checked = true; toggles[1].emit('change');
  assert.equal(confirm().disabled, false, 'dokładnie X zaznaczeń — gotowe');
  confirm().click();
  assert.deepEqual(completed, {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 2, tapArtifactIds: ['a0', 'a1'],
  });
});

test('C1-U/8: zmiana X w dół po zaznaczeniu nadwyżki — bramka liczy zgodność', () => {
  const host = renderTapX();
  const plus = host.byClass('multi-target-x-plus')[0];
  const minus = host.byClass('multi-target-x-minus')[0];
  const confirm = () => host.byClass('multi-target-confirm')[0];
  const toggles = host.byClass('multi-target-toggle');
  plus.click(); plus.click();
  toggles[0].checked = true; toggles[0].emit('change');
  toggles[1].checked = true; toggles[1].emit('change');
  assert.equal(confirm().disabled, false);
  minus.click(); // X=1, zaznaczone 2 → niezgodne
  assert.equal(xCount(host), 1);
  assert.equal(confirm().disabled, true, 'nadwyżka zaznaczeń ponad X blokuje');
});
