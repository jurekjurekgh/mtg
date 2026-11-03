// A19: CR 107.4c: "The colorless mana symbol {C} is used to represent one
// colorless mana, and also to represent a cost that can be paid only with one
// colorless mana." Cytat: docs/plans/PLAN_2026-09-29-batch61-kolekcja-157-174.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { finishWizardPayment, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf, wizardProgress, renderManaWizard } from '../src/table/mana-wizard.js';
import { expandManaPool, producibleMana, canPayColoredCost } from '../src/engine/resources.js';
import { getSourceForObject, manaAbilityProductionOf } from '../src/engine/mana-sources.js';
import { activatableAbilities } from '../src/engine/permanents.js';
import { effectiveSpellManaCost } from '../src/engine/spells.js';
import { parseManaCost } from '../src/engine/mana-cost.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
function localFunction(name) {
  const from = source.indexOf(`  function ${name}(`), end = source.indexOf('\n  }', from);
  assert.ok(from >= 0 && end > from);
  return source.slice(from, end + 4);
}
function fixture() {
  const registry = createCardRegistry();
  const session = createSession({ seed: 348, registry, decks: new Map([
    [HUMAN_ID, Array(20).fill('basic-forest')], [BOT_ID, Array(20).fill('basic-forest')],
  ]) });
  session.apply(session.view().legalCommands.find(c => c.type === 'resolve_mulligan_choice' && c.keep));
  const state = session.state;
  state.turn = jumpToStep(state.turn, 'main1', HUMAN_ID);
  state.turn.activePlayerId = state.turn.priorityPlayerId = HUMAN_ID;
  function put(id, cardId, zone) {
    const card = registry.get(cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, zone, controllerId: HUMAN_ID, ownerId: HUMAN_ID,
      ...gameObjectDataOf(card), types: card.types, subtypes: card.subtypes, keywords: card.keywords });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  put('shriek', 'kozileks-shrieker', 'battlefield');
  put('settlement', 'holdout-settlement', 'battlefield');
  put('talisman', 'pristine-talisman', 'battlefield');
  const cmd = session.view().legalCommands.find(c => c.type === 'activate_ability' && c.objectId === 'shriek');
  assert.ok(cmd, 'rzeczywista aktywacja za {C}');
  return { session, cmd };
}
function context(session) {
  let rendered; let handlers;
  const ctx = createContext({ session, HUMAN_ID, manaWizardParents: [], manaWizardDescriptor: null,
    els: { manaWizardBody: {} }, registry: createCardRegistry(), MANA_COSTS, parseManaCost,
    effectiveSpellManaCost, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf, wizardProgress,
    getSourceForObject, manaAbilityProductionOf, activatableAbilities, expandManaPool, producibleMana, canPayColoredCost,
    renderManaWizard: (_host, model, h) => { rendered = model; handlers = h; }, wizardSourceName: source => source.id,
    finishWizardPayment, autosave: () => {}, rerender: () => {}, showBotMoves: () => {},
    showNotice: () => {}, showModal: () => {}, hideModal: () => {},
  });
  runInContext(['restrictedSpellBlockedFor', 'selfTapExclusionFor', 'manaSourcesForPlayer', 'manaWizardFor', 'refreshManaWizard']
    .map(localFunction).join('\n'), ctx);
  return { ctx, rendered: () => rendered, handlers: () => handlers };
}

test('A19: rzeczywista zdolność za {C} pokazuje bezbarwny ląd i artefakt, a nie kolorowy ląd', () => {
  const { session, cmd } = fixture();
  const card = createCardRegistry().get('basic-island');
  addObject(session.state, { id: 'island', instanceId: 'i-island', cardId: card.id,
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield', ...gameObjectDataOf(card),
    types: card.types, subtypes: card.subtypes, keywords: card.keywords });
  const { ctx, rendered, handlers } = context(session);
  runInContext(['playDirect', 'manaSourceTapPlan', 'returnToParentManaWizard', 'closeManaWizard']
    .map(localFunction).join('\n'), ctx);
  const descriptor = ctx.manaWizardFor(cmd);
  assert.ok(descriptor, 'wybór dwóch profilów otwiera kreator');
  ctx.manaWizardDescriptor = descriptor; ctx.refreshManaWizard();
  const sources = rendered().untappedSources;
  assert.ok(sources.some(s => s.id === 'settlement' && s.coversMissing), 'ląd za {C} pokrywa brak');
  assert.ok(sources.some(s => s.id === 'talisman' && s.coversMissing), 'artefakt za {C} pokrywa brak');
  assert.ok(!sources.some(s => s.id === 'island'), 'kolorowa mana nie opłaca {C}');
  handlers().onTapSource('talisman');
  assert.equal(session.state.objects.get('talisman').tapped, true);
  assert.ok(session.state.zones.stack.some(id => session.state.objects.get(id)?.activatedEntry), 'zdolność Shriekera rzeczywiście aktywowana');
});

test('A19: alternatywna płatność lądem też aktywuje zdolność', () => {
  const { session, cmd } = fixture();
  const { ctx, rendered, handlers } = context(session);
  runInContext(['playDirect', 'manaSourceTapPlan', 'returnToParentManaWizard', 'closeManaWizard']
    .map(localFunction).join('\n'), ctx);
  const descriptor = ctx.manaWizardFor(cmd);
  assert.ok(descriptor);
  ctx.manaWizardDescriptor = descriptor; ctx.refreshManaWizard();
  assert.ok(rendered().untappedSources.some(s => s.id === 'settlement' && s.coversMissing));
  handlers().onTapSource('settlement');
  assert.equal(session.state.objects.get('settlement').tapped, true);
  assert.equal(session.state.objects.get('talisman').tapped, false);
  assert.ok(session.state.zones.stack.some(id => session.state.objects.get(id)?.activatedEntry));
});

test('A19: generyczna część jest opłacona — do {C} nadaje się tylko bezbarwne źródło', () => {
  const view = { players: [{ id: HUMAN_ID, mana: 1 }] };
  const desc = { totalNeeded: 2, requirements: [['C']] };
  const sources = [{ id: 'colorless', colors: [] }, { id: 'blue', colors: ['U'] }];
  const progress = wizardProgress(view, HUMAN_ID, desc, sources, [['U']]);
  assert.deepEqual(progress.untappedSources.map(s => [s.id, s.coversMissing]), [['colorless', true]]);
  assert.deepEqual(progress.missingColors, ['C']);
});

test('A19: po pokryciu {C} do części generycznej wolno użyć kolorowego źródła', () => {
  const view = { players: [{ id: HUMAN_ID, mana: 1 }] };
  const desc = { totalNeeded: 2, requirements: [['C']] };
  const sources = [{ id: 'blue', colors: ['U'] }, { id: 'colorless', colors: [] }];
  const progress = wizardProgress(view, HUMAN_ID, desc, sources, [[]]);
  assert.deepEqual(progress.untappedSources.map(s => s.id), ['blue', 'colorless']);
  assert.equal(progress.done, false);
});

test('A19: bezbarwne źródło nie pokrywa pipu niebieskiego', () => {
  const view = { players: [{ id: HUMAN_ID, mana: 0 }] };
  const desc = { totalNeeded: 1, requirements: [['U']] };
  const sources = [{ id: 'colorless', colors: [] }, { id: 'blue', colors: ['U'] }];
  const progress = wizardProgress(view, HUMAN_ID, desc, sources, []);
  assert.deepEqual(progress.untappedSources.map(s => [s.id, s.coversMissing]), [['blue', true]]);
});

test('A19: wiersz bezbarwnego źródła ma ikonę pokrywanego {C}', () => {
  class MiniEl {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.className = ''; this.value = ''; }
    set textContent(value) { this.value = String(value); this.children = []; }
    get textContent() { return this.value + this.children.map(c => c.textContent).join(''); }
    set innerHTML(value) { this.value = String(value); this.children = []; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new MiniEl(tag) };
  try {
    const host = new MiniEl('div');
    renderManaWizard(host, { costStr: '{C}', remainingTotal: 1,
      requirements: [{ colors: ['C'], covered: false }], missingColors: ['C'],
      untappedSources: [{ id: 'c', name: 'Bezbarwne', colors: [], amount: 1, coversMissing: true }] }, {});
    const walk = (el) => [el, ...el.children.flatMap(walk)];
    const row = walk(host).find(el => /mana-wizard-source/.test(el.className) && el.listeners.click);
    assert.ok(row);
    assert.match(row.textContent, /pokrywa.*ms-c/);
  } finally { globalThis.document = previous; }
});
