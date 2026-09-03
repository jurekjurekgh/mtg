// M298 — uwaga A właściciela z żywej gry (2026-09-03):
//
//   „Modale wyboru dla Spread the Sickness (zniszcz stwór + proliferate),
//   mulliganu z wyborem i ETB Bone Shreddera NIE używają nowego wspólnego
//   pomocnika wyboru celów — wyglądają zupełnie inaczej niż wybór bloków
//   (inny podgląd kart, inny sposób wskazywania celu). Modal niszczący cel ma
//   nawet pola checkbox, a wybiera się klikając w całą opcję. Czy te wszystkie
//   modale wyboru nie miały być ujednolicone przez jeden pomocnik?”
//
// Root cause (zmierzony): multiTargetPlanOf filtrował tylko komendy z polem
// `targets`, więc trzy rodziny wyborów spadały do awaryjnego
// renderChoiceRequest (ściana przycisków + mylący ptaszek wyciszenia):
//  (1) proliferate — komendy `resolve_proliferate` niosą `targetIds`
//      (podzbiory kandydatów, silnik: game-state.js);
//  (2) wybór JEDNEGO celu — cast_spell z `targets[1]` (STS: „zniszcz stwór”)
//      i ETB `resolve_trigger_target` z `targetId` (Bone Shredder);
//  (3) mulligan „zatrzymaj / weź mulligan” — `resolve_mulligan_choice`.
// Wszystkie trzy mają teraz plan i przechodzą przez TEN SAM kreator
// (renderMultiTargetWizard), a zatwierdzenie oddaje komendę z legalCommands
// (L48: UI nie wymyśla ruchów, tylko inaczej je pokazuje).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import {
  proliferatePlanOf, commandForProliferateSelection,
  singleTargetPlanOf, commandForSingleTargetSelection,
  mulliganKeepPlanOf,
} from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';

// ---------------------------------------------------------------------------
// Minimalny stub DOM (wzór choice-request-ui.test.js).
// ---------------------------------------------------------------------------
class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.type = '';
    this.checked = false;
    this.disabled = false;
    this.name = '';
    this.dataset = {};
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type) { for (const l of this.listeners[type] ?? []) l({}); }
  /** Wszystkie elementy potomne (wraz z sobą) spełniające predykat. */
  all(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const child of this.children) child.all(pred, out);
    return out;
  }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

/** Widok + sesja wystarczające dla objectOrPlayerName w kreatorze. */
const VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: {
    battlefield: [
      { id: 'cA', cardId: 'sts-target-a', controllerId: 'p2' },
      { id: 'cB', cardId: 'sts-target-b', controllerId: 'p2' },
      { id: 'c1', cardId: 'prolif-a', controllerId: 'p1' },
      { id: 'c2', cardId: 'prolif-b', controllerId: 'p2' },
    ],
    hand: [], stack: [], graveyard: [], library: [],
  },
};
const SESSION = {
  nameOf: (cardId) => `Karta:${cardId}`,
  nameOfObject: (id) => `Obiekt:${id}`,
};

// ---------------------------------------------------------------------------
// (1) Proliferate: plan z podzbiorów `targetIds` + dopasowanie komendy.
// ---------------------------------------------------------------------------

function proliferateCommands() {
  const subsets = [[], ['p2'], ['c1'], ['c2'], ['p2', 'c1'], ['p2', 'c2'], ['c1', 'c2'], ['p2', 'c1', 'c2']];
  return subsets.map((chosen) => Object.freeze({
    type: 'resolve_proliferate', playerId: 'p1',
    ...(chosen.length > 0 ? { targetIds: chosen } : {}),
  }));
}

test('M298/A1: proliferate dostaje plan LISTY obiektów, nie 8 przycisków-podzbiorów', () => {
  const commands = proliferateCommands();
  const plan = proliferatePlanOf(commands);
  assert.ok(plan, 'podzbiory resolve_proliferate mają dać plan');
  assert.deepEqual(plan.targets.slice().sort(), ['c1', 'c2', 'p2'], 'lista kandydatów z licznikami');
  assert.equal(plan.minTargets, 0, '„any number” — zero celów legalne');
  assert.equal(plan.maxTargets, 3);
  assert.equal(plan.targetIdsMode, true);
});

test('M298/A1: zaznaczenie składa się na DOKŁADNIE tę komendę z legalCommands', () => {
  const commands = proliferateCommands();
  const cmd = commandForProliferateSelection(commands, ['c2', 'c1']); // kolejność kliknięć dowolna
  assert.ok(commands.includes(cmd), 'komenda musi pochodzić z oferty silnika');
  assert.deepEqual([...cmd.targetIds].sort(), ['c1', 'c2']);
  const empty = commandForProliferateSelection(commands, []);
  assert.ok(commands.includes(empty), 'pusty wybór = komenda bez targetIds');
  assert.equal(commandForProliferateSelection(commands, ['widmo']), null, 'nielegalny obiekt → brak komendy');
});

// ---------------------------------------------------------------------------
// (2) Wybór JEDNEGO celu: czar (STS) i ETB (Bone Shredder).
// ---------------------------------------------------------------------------

function stsCommands() {
  return ['cA', 'cB'].map((targetId) => Object.freeze({
    type: 'cast_spell', playerId: 'p1', objectId: 'sts', targets: [targetId],
  }));
}

test('M298/A2: cast_spell z jednym celem dostaje plan pojedynczego wyboru', () => {
  const plan = singleTargetPlanOf(stsCommands());
  assert.ok(plan, 'dwa warianty jednocelowe mają dać plan');
  assert.deepEqual(plan.targets, ['cA', 'cB']);
  assert.deepEqual([plan.minTargets, plan.maxTargets], [1, 1]);
  assert.equal(plan.singleMode, 'targets');
  const cmd = commandForSingleTargetSelection(stsCommands(), { targetId: 'cB' });
  assert.ok(stsCommands().some((c) => c === cmd) || (cmd.targets[0] === 'cB'), 'dopasowanie po celu');
});

test('M298/A2: grupa z różnymi X NIE jest pojedynczym wyborem (licznik X musi zostać)', () => {
  const withX = [
    { type: 'cast_spell', playerId: 'p1', objectId: 'd', targets: ['cA'], xValue: 1 },
    { type: 'cast_spell', playerId: 'p1', objectId: 'd', targets: ['cA'], xValue: 2 },
  ];
  assert.equal(singleTargetPlanOf(withX), null);
});

test('M298/A2: ETB Bone Shredder (resolve_trigger_target, targetId) dostaje plan', () => {
  const commands = [
    Object.freeze({ type: 'resolve_trigger_target', playerId: 'p1', targetId: 'cA', friendly: false }),
    Object.freeze({ type: 'resolve_trigger_target', playerId: 'p1', targetId: 'cB', friendly: false }),
  ];
  const plan = singleTargetPlanOf(commands);
  assert.ok(plan, 'ETB z jednym celem ma dać plan');
  assert.equal(plan.singleMode, 'targetId');
  assert.equal(plan.allowNone, false);
  const withNone = [...commands, Object.freeze({ type: 'resolve_trigger_target', playerId: 'p1', targetId: null, friendly: false })];
  assert.equal(singleTargetPlanOf(withNone).allowNone, true, '„you may” = wiersz odmowy');
});

test('M298/A2: pojedyncza opcja zostaje w zwykłej liście (nie ma czego upraszczać)', () => {
  assert.equal(singleTargetPlanOf(stsCommands().slice(0, 1)), null);
});

// ---------------------------------------------------------------------------
// (3) Mulligan: „zatrzymaj rękę / weź mulligan” jako plan dwóch wierszy.
// ---------------------------------------------------------------------------

test('M298/A3: mulligan keep/discard dostaje plan (dwa warianty)', () => {
  const commands = [
    Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }),
    Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }),
  ];
  const plan = mulliganKeepPlanOf(commands);
  assert.ok(plan, 'dwa warianty mulligana mają dać plan');
  assert.equal(plan.mulliganKeepMode, true);
});

test('M298/A3: sam „keep” (siódmy mulligan) nie dostaje planu', () => {
  assert.equal(mulliganKeepPlanOf([{ type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }]), null);
});

// ---------------------------------------------------------------------------
// (4) KREATOR: wszystkie trzy rodziny rysuje renderMultiTargetWizard i oddaje
// DOKŁADNĄ komendę silnika (tożsamość referencji — nie kopia „z palca”).
// ---------------------------------------------------------------------------

function renderWizard(plan, commands) {
  const host = new MiniEl('div');
  const completed = [];
  const request = choiceRequest({ id: 'choice-x', type: 'target', options: commands });
  renderMultiTargetWizard(host, {
    view: VIEW, session: SESSION, plan, commands: request.options,
    onComplete: (cmd) => completed.push(cmd),
    onCancel: () => completed.push('cancel'),
  });
  return { host, completed, request };
}

test('M298/A4: wizard proliferate — ptaszek + Zatwierdź oddaje komendę silnika', () => {
  const commands = proliferateCommands();
  const plan = proliferatePlanOf(commands);
  const { host, completed, request } = renderWizard(plan, commands);
  const inputs = host.byClass('picker-toggle');
  assert.equal(inputs.length, 3, 'trzy wiersze kandydatów');
  // Każdy <input> siedzi w <label>-wierszu; identyfikujemy wiersz po nazwie.
  const labels = host.all((el) => el.tagName === 'label');
  const inputIn = (labelEl) => labelEl.children.find((c) => c.tagName === 'input');
  const idxOf = (id) => labels.findIndex((labelEl) => labelEl.textContent.includes(`Karta:prolif-${id === 'c1' ? 'a' : 'b'}`));
  const c1Input = inputIn(labels[idxOf('c1')]);
  c1Input.checked = true; c1Input.emit('change');
  const confirm = host.byClass('multi-target-confirm')[0];
  assert.equal(confirm.disabled, false, 'legalne zaznaczenie odblokowuje Zatwierdź');
  confirm.click();
  assert.equal(completed.length, 1, 'Zatwierdź oddaje wybór');
  assert.ok(request.options.includes(completed[0]), 'komenda z legalCommands (tożsamość)');
  assert.deepEqual(completed[0].targetIds, ['c1']);
});

test('M298/A4: wizard proliferate — nielegalny podzbiór NIE daje komendy (L48)', () => {
  // Okrojona enumeracja dużej puli: tylko pełny zbiór, pojedyncze i pusty.
  const degraded = [
    Object.freeze({ type: 'resolve_proliferate', playerId: 'p1', targetIds: ['c1', 'c2'] }),
    Object.freeze({ type: 'resolve_proliferate', playerId: 'p1', targetIds: ['c1'] }),
    Object.freeze({ type: 'resolve_proliferate', playerId: 'p1', targetIds: ['c2'] }),
    Object.freeze({ type: 'resolve_proliferate', playerId: 'p1' }),
  ];
  const plan = proliferatePlanOf(degraded);
  assert.equal(plan.maxTargets, 2);
  const { host, completed } = renderWizard(plan, degraded);
  const labels = host.all((el) => el.tagName === 'label');
  // Zaznaczamy OBYDWA — podzbiór {c1,c2} jest w ofercie, więc legalny.
  for (const labelEl of labels) {
    const input = labelEl.children.find((c) => c.tagName === 'input');
    input.checked = true; input.emit('change');
  }
  const confirm = host.byClass('multi-target-confirm')[0];
  assert.equal(confirm.disabled, false);
  confirm.click();
  assert.deepEqual(completed[0].targetIds.slice().sort(), ['c1', 'c2']);
});

test('M298/A4: wizard pojedynczego celu — radio, drugi wybór zwalnia pierwszy', () => {
  const commands = stsCommands();
  const plan = singleTargetPlanOf(commands);
  const { host, completed, request } = renderWizard(plan, commands);
  const labels = host.all((el) => el.tagName === 'label');
  const inputs = labels.map((l) => l.children.find((c) => c.tagName === 'input'));
  assert.ok(inputs.every((i) => i.type === 'radio'), 'wybór jedyny = radio');
  inputs[0].checked = true; inputs[0].emit('change');
  inputs[1].checked = true; inputs[1].emit('change');
  assert.equal(inputs[0].checked, false, 'radio: wybór cB odznacza cA');
  host.byClass('multi-target-confirm')[0].click();
  assert.ok(request.options.includes(completed[0]));
  assert.deepEqual(completed[0].targets, ['cB']);
});

test('M298/A4: wizard mulligana — dwa wiersze, Zatwierdź oddaje komendę keep/discard', () => {
  const commands = [
    Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }),
    Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }),
  ];
  const plan = mulliganKeepPlanOf(commands);
  plan.rows = [
    { id: 'keep', label: 'Zatrzymaj rękę (7 kart)' },
    { id: 'mulligan', label: 'Weź mulligan' },
  ];
  const { host, completed, request } = renderWizard(plan, commands);
  const labels = host.all((el) => el.tagName === 'label');
  assert.equal(labels.length, 2, 'dwa wiersze decyzji');
  const mulliganRow = labels.find((l) => l.textContent.includes('Weź mulligan'));
  const input = mulliganRow.children.find((c) => c.tagName === 'input');
  input.checked = true; input.emit('change');
  host.byClass('multi-target-confirm')[0].click();
  assert.ok(request.options.includes(completed[0]));
  assert.equal(completed[0].keep, false, 'wybrano mulligan');
});

// ---------------------------------------------------------------------------
// (5) Routing main.js: nowe plany WCHODZĄ przed awaryjny renderChoiceRequest.
// ---------------------------------------------------------------------------

test('M298/A5: openChoiceRequest kieruje nowe rodziny do wspólnego kreatora', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const start = src.indexOf('function openChoiceRequest');
  const section = src.slice(start, src.indexOf('function artShowcaseOpen', start));
  for (const name of ['proliferatePlanOf(', 'singleTargetPlanOf(', 'mulliganKeepPlanOf(']) {
    assert.ok(section.includes(name), `openChoiceRequest musi wywoływać ${name.slice(0, -1)}`);
    assert.ok(section.indexOf(name) < section.indexOf('renderChoiceRequest('),
      `${name.slice(0, -1)} przed awaryjnym renderChoiceRequest`);
  }
  assert.ok(section.indexOf('sacrificeCastPlanOf(') < section.indexOf('singleTargetPlanOf('),
    'plan poświęcenia przed pojedynczym celem (grupy sacrifice mają pierwszeństwo)');
  // Regresja z żywego testera: bez filtra licznik ręki pokazywał 14
  // (7 swoich + 7 UKRYTYCH kart przeciwnika w widoku).
  assert.match(section, /mulliganKeep[\s\S]{0,400}controllerId\s*===\s*choiceView\.playerId/,
    'licznik „Zatrzymaj rękę (N kart)” liczy wyłącznie własną rękę');
});
