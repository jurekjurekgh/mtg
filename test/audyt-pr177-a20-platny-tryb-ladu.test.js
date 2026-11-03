import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { finishWizardPayment, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf, wizardProgress, countPaymentVariants, renderManaWizard } from '../src/table/mana-wizard.js';
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
  put('raiders', 'goblin-deathraiders', 'hand');
  put('heap', 'heap-gate', 'battlefield');
  put('mountain', 'basic-mountain', 'battlefield');
  put('forest', 'basic-forest', 'battlefield');
  put('swamp', 'basic-swamp', 'battlefield');
  put('dismal', 'dismal-backwater', 'battlefield');
  const cmd = session.view().legalCommands.find(c => c.type === 'cast_permanent' && c.objectId === 'raiders');
  assert.ok(cmd, 'silnik legalnie oferuje Deathraiders z Heap Gate');
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

test('A20: Heap Gate jako konwerter dostępny w kreatorze', () => {
  const { session, cmd } = fixture();
  const { ctx, rendered } = context(session);
  const descriptor = ctx.manaWizardFor(cmd);
  assert.ok(descriptor, 'gracz może sfinansować zdolność Heap Gate z Wyspy lub Lasu');
  ctx.manaWizardDescriptor = descriptor; ctx.refreshManaWizard();
  assert.ok(rendered().untappedSources.some(s => s.id === 'heap' && s.command?.abilityIndex === 1), 'kolorowy tryb Heap Gate z kosztem aktywacji');
});

test('A20: wybór kosztowego trybu Heap Gate otwiera podrzędny kreator i kończy rzut', () => {
  const { session, cmd } = fixture();
  const { ctx, rendered, handlers } = context(session);
  runInContext(['playDirect', 'manaSourceTapPlan', 'openNestedManaWizard', 'returnToParentManaWizard', 'closeManaWizard']
    .map(localFunction).join('\n'), ctx);
  ctx.manaWizardDescriptor = ctx.manaWizardFor(cmd);
  assert.ok(ctx.manaWizardDescriptor);
  ctx.refreshManaWizard();
  const heap = rendered().untappedSources.find(s => s.id === 'heap' && s.command?.abilityIndex === 1);
  assert.ok(heap, 'rzeczywista kosztowa zdolność Heap Gate');
  handlers().onTapSource('heap', heap.command);
  assert.equal(ctx.manaWizardDescriptor.cmd.objectId, 'heap', 'koszt płacony podrzędnie');
  assert.ok(rendered().untappedSources.some(s => s.id === 'forest'));
  handlers().onTapSource('forest');
  assert.equal(session.state.objects.get('heap').tapped, true);
  assert.equal(ctx.manaWizardDescriptor.cmd.objectId, 'raiders');
  handlers().onTapSource('mountain');
  assert.notEqual(session.state.objects.get('raiders')?.zone, 'hand', 'czar naprawdę rzucony');
  assert.equal(session.state.objects.get('swamp').tapped, false);
});

test('A20: solver nie tapuje obu trybów tej samej bramy', () => {
  const sources = [
    { id: 'heap', kind: 'land', colors: [], amount: 1 },
    { id: 'heap', kind: 'ability', colors: ['B'], amount: 1, activationCost: { generic: 1, colors: [] } },
    { id: 'forest', kind: 'land', colors: ['G'], amount: 1 },
  ];
  assert.equal(countPaymentVariants(sources, 0, 2, [['B']]), 0);
});

test('A20: tryby jednej bramy mają osobne wpisy, ale wspólną rezerwację', () => {
  const { session } = fixture();
  const { ctx } = context(session);
  const both = ctx.manaSourcesForPlayer(null).filter(s => s.id === 'heap');
  assert.equal(both.length, 2);
  assert.ok(both.some(s => s.command.type === 'tap_for_mana'));
  assert.ok(both.some(s => s.command.type === 'activate_ability' && s.command.abilityIndex === 1));
  assert.equal(ctx.manaSourcesForPlayer(['heap']).filter(s => s.id === 'heap').length, 0);
});

test('A20: solver liczy legalny wariant przy dwóch trybach jednej bramy', () => {
  const sources = [
    { id: 'heap', kind: 'land', colors: [], amount: 1 },
    { id: 'heap', kind: 'ability', colors: ['B'], amount: 1, activationCost: { generic: 1, colors: [] } },
    { id: 'forest', kind: 'land', colors: ['G'], amount: 1 },
    { id: 'mountain', kind: 'land', colors: ['R'], amount: 1 },
  ];
  assert.equal(countPaymentVariants(sources, 0, 2, [['B']]), 1);
});

test('A20: render przekazuje właściwy tryb wybranego wiersza', () => {
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
    const host = new MiniEl('div'); const received = [];
    const free = { type: 'tap_for_mana', objectId: 'heap' };
    const paid = { type: 'activate_ability', objectId: 'heap', abilityIndex: 1 };
    renderManaWizard(host, { costStr: '{2}', remainingTotal: 2, requirements: [], missingColors: [],
      untappedSources: [
        { id: 'heap', name: 'Heap Gate', colors: [], amount: 1, command: free },
        { id: 'heap', name: 'Heap Gate', colors: ['B'], amount: 1, command: paid, activationCost: { generic: 1, colors: [] } },
      ] }, { onTapSource: (id, command) => received.push([id, command]) });
    const walk = el => [el, ...el.children.flatMap(walk)];
    const rows = walk(host).filter(el => /mana-wizard-source/.test(el.className) && el.listeners.click);
    assert.equal(rows.length, 2);
    rows[0].listeners.click[0]({}); rows[1].listeners.click[0]({});
    assert.deepEqual(received, [['heap', free], ['heap', paid]]);
  } finally { globalThis.document = previous; }
});
