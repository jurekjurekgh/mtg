// Epic Experiment: choose the legal exiled card first, then its target(s).
// The engine keeps complete legalCommands for bots; the table must not show the
// card×target product as one modal, and each confirmation returns an offered cmd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { choiceRequest } from '../src/protocol/types.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import * as choicePlans from '../src/table/multi-target.js';

const REGISTRY = createCardRegistry();
const MAIN = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
const OPEN_FROM = MAIN.indexOf('  function openChoiceRequest(');
const OPEN_TO = MAIN.indexOf('\n  }', OPEN_FROM) + 4;
assert.ok(OPEN_FROM > 0 && OPEN_TO > OPEN_FROM, 'finds the production openChoiceRequest adapter');

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
    this.dataset = {};
    this.name = '';
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return this.textContent; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = []; for (const node of nodes.flat()) this.appendChild(node); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() {
    for (const listener of this.listeners.click ?? []) {
      listener({ preventDefault() {}, stopPropagation() {} });
    }
  }
  emit(type) {
    for (const listener of this.listeners[type] ?? []) listener({});
  }
  all(predicate, out = []) {
    if (predicate(this)) out.push(this);
    for (const child of this.children) child.all(predicate, out);
    return out;
  }
  byClass(cls) {
    return this.all((element) => String(element.className).split(/\s+/).includes(cls));
  }
}

function scene({ exile = ['shock-exiled', 'turn-exiled'], cardIds = ['shock', 'turn-the-tide'], creatures = true, hand = [] } = {}) {
  const state = createGameState({ seed: 1791, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];

  const put = (id, cardId, zone, playerId = 'p1') => {
    const definition = REGISTRY.get(cardId);
    assert.ok(definition, `${cardId} exists in the card registry`);
    addObject(state, {
      ...gameObjectDataOf(definition),
      id,
      instanceId: `i-${id}`,
      cardId,
      controllerId: playerId,
      ownerId: playerId,
      zone,
      types: definition.types ?? [],
      subtypes: definition.subtypes ?? [],
      keywords: definition.keywords ?? [],
      spell: definition.spell,
    });
  };

  exile.forEach((id, index) => put(id, cardIds[index], 'exile'));
  hand.forEach(([id, cardId]) => put(id, cardId, 'hand'));
  const creatureObjects = creatures === true
    ? ['target-own', 'target-opponent']
    : (Array.isArray(creatures) ? creatures : []);
  if (creatureObjects.includes('target-own')) put('target-own', 'goblin-piker', 'battlefield', 'p1');
  if (creatureObjects.includes('target-opponent')) put('target-opponent', 'hill-giant', 'battlefield', 'p2');
  state.pendingEpicExperiment = {
    playerId: 'p1',
    sourceCardId: 'epic-experiment',
    exileIds: exile,
    maxMV: 2,
    restorePriorityTo: 'p1',
  };

  const session = {
    state,
    view: () => playerView(state, 'p1'),
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    nameOfObject: (id) => {
      const object = state.objects.get(id);
      return REGISTRY.get(object?.cardId)?.name ?? id;
    },
    cardDetails: (id) => REGISTRY.get(id) ?? null,
  };
  return { state, session, commands: session.view().legalCommands.filter((cmd) => cmd.type === 'resolve_epic_choice') };
}

function openProductionChoice({ session, host, previews, submitted, modals }) {
  const context = createContext({
    ...choicePlans,
    session,
    els: { choiceRequestBody: host },
    renderMultiTargetWizard,
    choiceRequest,
    choiceGroupTitle: () => 'Wygnane czary — który rzucić bez kosztu many?',
    commandLabel: (cmd) => (cmd.done ? 'Zakończ darmowe rzuty' : `Rzuć bez kosztu — ${session.nameOfObject(cmd.cardId)}`),
    labelChoiceOptions: (options) => options.map((cmd) => cmd.done ? 'Zakończ' : session.nameOfObject(cmd.cardId)),
    renderChoiceRequest: () => { throw new Error('permutation fallback should never render Epic choices'); },
    openCardFullscreen: (objectId) => previews.objects.push(objectId),
    openCardFullscreenByCardId: (cardId) => previews.cards.push(cardId),
    showModal: () => { modals.shown += 1; },
    hideModal: () => { modals.hidden += 1; },
    play: (cmd) => submitted.push(cmd),
    polishPluralCount: (count, one, few, many) => count === 1 ? one : count < 5 ? few : many,
  });
  return runInContext(MAIN.slice(OPEN_FROM, OPEN_TO) + '\nopenChoiceRequest;', context);
}

function toggleChoice(host, index) {
  const toggles = host.byClass('multi-target-toggle');
  assert.ok(toggles[index], `choice toggle ${index} exists`);
  toggles[index].checked = true;
  toggles[index].emit('change');
}

function withDocument(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try { return run(); }
  finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('Epic Experiment offers one row per legal card, then a legal target picker with full-screen previews', () => {
  const { state, session, commands } = scene();
  const request = choiceRequest({ id: 'epic', type: 'command', options: commands });
  const cardPlan = choicePlans.epicChoiceCardPlanOf(commands);
  assert.ok(cardPlan, 'Epic request is recognized as a card-first choice');
  assert.equal(cardPlan.cardChoices.length, 2, 'one card row per exiled card, not one row per target');
  assert.equal(cardPlan.commands.length, 3, 'two cards plus the finish option');

  const perCard = commands.filter((cmd) => !cmd.done && cmd.cardId === 'shock-exiled');
  const targetPlan = choicePlans.epicChoiceTargetPlanOf(perCard);
  assert.ok(targetPlan, 'the selected spell has its own target step');
  assert.equal(targetPlan.targets.length, 4, 'only the four legal targets appear in this step');
  assert.equal(choicePlans.commandForSingleTargetSelection(perCard, { targetId: 'not-legal' }), null,
    'a target outside legalCommands cannot enable confirmation');

  const host = new MiniEl('div');
  const previews = { cards: [], objects: [] };
  const submitted = [];
  const modals = { shown: 0, hidden: 0 };
  const openChoiceRequest = openProductionChoice({ session, host, previews, submitted, modals });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    openChoiceRequest(request);
    assert.equal(modals.shown, 1, 'the card-selection modal is shown');
    assert.equal(host.byClass('multi-target-row').length, 3, 'card step has two cards plus finish');
    assert.match(host.textContent, /Shock/);
    assert.match(host.textContent, /Turn the Tide/);
    assert.equal(host.byClass('multi-target-confirm')[0].disabled, true, 'nothing is confirmed initially');

    const cardName = host.byClass('picker-name').find((name) => name.dataset.cardId === 'shock');
    assert.ok(cardName, 'the card choice has a full-screen preview link');
    cardName.click();
    assert.deepEqual(previews.cards, ['shock'], 'clicking the selected card opens its full-screen preview');

    toggleChoice(host, 0); // Shock is first in the engine's exile order.
    host.byClass('multi-target-confirm')[0].click();
    assert.equal(submitted.length, 0, 'choosing a targeted card does not cast before target selection');
    assert.equal(modals.shown, 2, 'the target step replaces the card step');
    assert.match(host.textContent, /Shock.*Wskaż legalny cel/s, 'the selected card remains previewable in the target step');
    assert.equal(host.byClass('choice-request-peek').length, 1, 'the target-step header previews the chosen spell');
    host.byClass('choice-request-peek')[0].click();
    assert.deepEqual(previews.cards, ['shock', 'shock'], 'the chosen spell can be previewed again in step two');

    const targetNames = host.byClass('picker-name');
    const targetName = targetNames.find((name) => name.dataset.cardId === 'target-opponent');
    assert.ok(targetName, 'a legal target card has a full-screen preview link');
    targetName.click();
    assert.deepEqual(previews.objects, ['target-opponent'], 'clicking the target opens that target full screen');

    const confirm = host.byClass('multi-target-confirm')[0];
    assert.equal(confirm.disabled, true, 'target confirmation is disabled until a legal target is selected');
    const legalTargets = [...new Set(perCard.map((cmd) => cmd.targets[0]))];
    toggleChoice(host, legalTargets.indexOf('target-opponent'));
    assert.equal(confirm.disabled, false, 'a target from legalCommands enables confirmation');
    confirm.click();

    const chosen = submitted.at(-1);
    const expected = commands.find((cmd) => cmd.type === 'resolve_epic_choice'
      && cmd.cardId === 'shock-exiled' && cmd.targets?.[0] === 'target-opponent');
    assert.strictEqual(chosen, expected, 'confirmation returns the exact legal engine command');
    assert.ok(execute(state, chosen).ok, 'the selected legal target is accepted by the engine');
    const stackedShock = state.zones.stack.map((id) => state.objects.get(id))
      .find((object) => object?.cardId === 'shock');
    assert.deepEqual(stackedShock?.chosenTargets, ['target-opponent']);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('Epic Experiment still requires an explicit target step when only one target is legal', () => {
  const { state, session, commands } = scene({
    exile: ['brute-exiled', 'turn-exiled'],
    cardIds: ['brute-force', 'turn-the-tide'],
    creatures: ['target-own'],
  });
  const targetOptions = commands.filter((cmd) => cmd.cardId === 'brute-exiled' && !cmd.done);
  assert.equal(targetOptions.length, 1);
  assert.equal(choicePlans.epicChoiceTargetPlanOf(targetOptions).targets.length, 1);

  const host = new MiniEl('div');
  const previews = { cards: [], objects: [] };
  const submitted = [];
  const modals = { shown: 0, hidden: 0 };
  const openChoiceRequest = openProductionChoice({ session, host, previews, submitted, modals });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    openChoiceRequest(choiceRequest({ id: 'epic-one-target', type: 'command', options: commands }));
    toggleChoice(host, 0);
    host.byClass('multi-target-confirm')[0].click();
    assert.equal(modals.shown, 2, 'choosing the card does not skip the sole-target step');
    assert.equal(host.byClass('multi-target-row').length, 1);
    const confirm = host.byClass('multi-target-confirm')[0];
    assert.equal(confirm.disabled, true, 'the legal target is not auto-selected');
    toggleChoice(host, 0);
    assert.equal(confirm.disabled, false);
    confirm.click();
    assert.strictEqual(submitted[0], targetOptions[0]);
    assert.ok(execute(state, submitted[0]).ok);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('Epic Experiment keeps targetless cards and “finish” legal in the first step', () => {
  const { session, commands } = scene();
  const host = new MiniEl('div');
  const submitted = [];
  const previews = { cards: [], objects: [] };
  const modals = { shown: 0, hidden: 0 };
  const openChoiceRequest = openProductionChoice({ session, host, previews, submitted, modals });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    openChoiceRequest(choiceRequest({ id: 'epic', type: 'command', options: commands }));
    toggleChoice(host, 1); // Turn the Tide is targetless and has exactly one legal command.
    host.byClass('multi-target-confirm')[0].click();
    const targetless = commands.find((cmd) => cmd.cardId === 'turn-exiled' && !cmd.done);
    assert.strictEqual(submitted[0], targetless, 'targetless card selection returns its exact legal offer');
    assert.equal(modals.shown, 1, 'no target modal is invented for a card with no targets');

    // Re-open the same legal request and confirm the explicit finish option.
    const host2 = new MiniEl('div');
    const submitted2 = [];
    const openAgain = openProductionChoice({ session, host: host2, previews, submitted: submitted2, modals });
    openAgain(choiceRequest({ id: 'epic', type: 'command', options: commands }));
    toggleChoice(host2, 2); // “Zakończ” is last, after legal cards.
    host2.byClass('multi-target-confirm')[0].click();
    assert.strictEqual(submitted2[0], commands.find((cmd) => cmd.done), 'finish is the engine legal command');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('Epic Experiment chooses a spell mode before its target', () => {
  const { state, session, commands } = scene({
    exile: ['charm-exiled'],
    cardIds: ['selesnya-charm'],
  });
  const cardOptions = commands.filter((cmd) => !cmd.done);
  const modePlan = choicePlans.epicChoiceModePlanOf(cardOptions);
  assert.ok(modePlan, 'legal modes are recognized as a separate Epic choice');
  assert.deepEqual(modePlan.modes, [0, 2]);

  const host = new MiniEl('div');
  const previews = { cards: [], objects: [] };
  const submitted = [];
  const modals = { shown: 0, hidden: 0 };
  const openChoiceRequest = openProductionChoice({ session, host, previews, submitted, modals });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    openChoiceRequest(choiceRequest({ id: 'epic-mode', type: 'command', options: commands }));
    toggleChoice(host, 0); // select Selesnya Charm
    host.byClass('multi-target-confirm')[0].click();
    assert.equal(modals.shown, 2, 'the mode picker follows the card picker');
    assert.equal(host.byClass('multi-target-row').length, 2, 'only legal modes are shown, not mode×target rows');
    assert.match(host.textContent, /Wzmocnienie/);
    assert.match(host.textContent, /Rycerz/);
    assert.equal(host.byClass('multi-target-confirm')[0].disabled, true);
    host.byClass('multi-target-toggle')[0].checked = true;
    host.byClass('multi-target-toggle')[0].emit('change');
    host.byClass('multi-target-confirm')[0].click();

    assert.equal(modals.shown, 3, 'the selected targeted mode opens a third, target-only step');
    assert.match(host.textContent, /Wskaż legalny cel/);
    assert.equal(host.byClass('multi-target-row').length, 2, 'the target step lists the legal creatures only');
    const targetNames = host.byClass('picker-name');
    assert.ok(targetNames.find((name) => name.dataset.cardId === 'target-own'));
    assert.ok(targetNames.find((name) => name.dataset.cardId === 'target-opponent'));
    assert.equal(host.byClass('multi-target-confirm')[0].disabled, true);
    toggleChoice(host, 0);
    host.byClass('multi-target-confirm')[0].click();

    const expected = commands.find((cmd) => cmd.modeIndex === 0 && cmd.targets?.[0] === 'target-own');
    assert.strictEqual(submitted[0], expected, 'the final confirmation returns the exact legal mode-and-target command');
    assert.ok(execute(state, submitted[0]).ok, 'the chosen legal mode and target are accepted by the engine');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('Epic Experiment does not enumerate additional discard-cost combinations either', () => {
  const hand = [['h1', 'basic-island'], ['h2', 'basic-mountain'], ['h3', 'basic-forest']];
  const { state, session, commands } = scene({
    exile: ['reunion-exiled'],
    cardIds: ['cathartic-reunion'],
    creatures: false,
    hand,
  });
  const offers = commands.filter((cmd) => !cmd.done);
  assert.equal(offers.length, 3, 'engine legally offers all three ways to discard two of three cards');

  const host = new MiniEl('div');
  const previews = { cards: [], objects: [] };
  const submitted = [];
  const modals = { shown: 0, hidden: 0 };
  const openChoiceRequest = openProductionChoice({ session, host, previews, submitted, modals });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    openChoiceRequest(choiceRequest({ id: 'epic-discard', type: 'command', options: commands }));
    toggleChoice(host, 0); // choose the card, not any of its discard permutations
    host.byClass('multi-target-confirm')[0].click();
    assert.equal(modals.shown, 2, 'the second step is the required additional-cost choice');
    assert.equal(host.byClass('multi-target-row').length, 3, 'the step shows three cards, not three combinations');
    assert.equal(host.byClass('multi-target-confirm')[0].disabled, true, 'two legal discards are required');

    const spellPreview = host.byClass('choice-request-peek')[0];
    assert.ok(spellPreview, 'the chosen spell remains previewable during its cost choice');
    spellPreview.click();
    assert.deepEqual(previews.cards, ['cathartic-reunion']);
    const handPreview = host.byClass('picker-name').find((name) => name.dataset.cardId === 'h3');
    assert.ok(handPreview, 'each discarded card has a full-screen preview link');
    handPreview.click();
    assert.deepEqual(previews.objects, ['h3']);

    toggleChoice(host, 0);
    toggleChoice(host, 2);
    const confirm = host.byClass('multi-target-confirm')[0];
    assert.equal(confirm.disabled, false, 'two cards from a legal engine offer enable confirmation');
    confirm.click();
    const chosen = submitted[0];
    const expected = offers.find((cmd) => cmd.discardCardIds.includes('h1') && cmd.discardCardIds.includes('h3'));
    assert.strictEqual(chosen, expected, 'cost confirmation returns the exact legal engine command');
    const result = execute(state, chosen);
    assert.ok(result.ok, 'the selected legal additional cost is accepted by the engine');
    assert.deepEqual(result.events.filter((event) => event.type === 'card_discarded').map((event) => event.fromId), ['h1', 'h3']);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

function productionPlanFor(options) {
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: { hand: [], battlefield: [], graveyard: [], exile: [] },
    pendingTriggerTarget: null,
  };
  const session = {
    state: { objects: new Map() },
    view: () => view,
    nameOf: (id) => id,
    nameOfObject: (id) => id,
    cardDetails: () => null,
  };
  let routedPlan = null;
  const context = createContext({
    ...choicePlans,
    session,
    els: { choiceRequestBody: {} },
    lookWizardKindOf: () => null,
    renderMultiTargetWizard: (_host, spec) => { routedPlan = spec.plan; },
    renderChoiceRequest: () => { throw new Error('unsafe raw option-list modal reached'); },
    renderLookWizard: () => {},
    choiceRequest,
    choiceGroupTitle: () => 'wybór testowy',
    commandLabel: () => 'opcja',
    labelChoiceOptions: (items) => items.map(() => 'opcja'),
    showModal: () => {},
    hideModal: () => {},
    openCardFullscreen: () => {},
    openCardFullscreenByCardId: () => {},
    play: () => {},
    polishPluralCount: (count, one, few, many) => count === 1 ? one : count < 5 ? few : many,
  });
  const open = runInContext(MAIN.slice(OPEN_FROM, OPEN_TO) + '\nopenChoiceRequest;', context);
  open(choiceRequest({ id: 'sentinel', type: 'command', options }));
  return routedPlan;
}

test('modal anti-permutation sentinel covers the shared router, not just Epic Experiment', () => {
  const start = MAIN.indexOf('  function openChoiceRequest(');
  const end = MAIN.indexOf('\n  }', start) + 4;
  const router = MAIN.slice(start, end);
  const genericButtons = router.indexOf('buttonsPlanOf(request.options');
  const rawFallback = router.indexOf('renderChoiceRequest(els.choiceRequestBody');
  assert.ok(genericButtons > 0 && rawFallback > genericButtons, 'there is one final generic path after specialized plans');

  // This list is intentionally cross-family: card×target (Epic), all-target
  // subsets, multi-target sets, and ordinary one-target choices. A future
  // modal branch inserted after the generic path or a lost picker routes
  // directly to one-row-per-command and makes this sentinel red.
  for (const planName of [
    'epicChoiceCardPlanOf',
    'epicChoiceModePlanOf',
    'epicChoiceTargetPlanOf',
    'epicChoiceDiscardPlanOf',
    'upToTargetsPlanOf',
    'multiTargetPlanOf',
    'singleTargetPlanOf',
    'discardPlanOf',
    'sacrificeCastPlanOf',
  ]) {
    const planAt = router.indexOf(`${planName}(`);
    assert.ok(planAt >= 0 && planAt < genericButtons,
      `${planName} must be considered before generic button modals`);
  }

  assert.equal((router.match(/renderChoiceRequest\(els\.choiceRequestBody/g) ?? []).length, 1,
    'all ordinary ChoiceRequests share the guarded final fallback');
  assert.equal((router.match(/buttonsPlanOf\(request\.options/g) ?? []).length, 1,
    'there is a single generic one-row-per-option route to guard');

  // Route real production requests (not just plan helpers) for several
  // independent combinatorial families. The generic raw renderer throws, so
  // any one-row-per-command permutation list makes this test red.
  const candidates = ['a', 'b', 'c', 'd'];
  const upToOptions = [[]];
  for (const a of candidates) upToOptions.push([a]);
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) upToOptions.push([candidates[i], candidates[j]]);
  }
  const upToPlan = productionPlanFor(upToOptions.map((targetIds) => ({
    type: 'resolve_trigger_target', playerId: 'p1', targetIds,
  })));
  assert.ok(upToPlan?.targetIdsMode, 'all 11 “up to two” subsets route to the candidate picker');
  assert.equal(upToPlan.targets.length, 4, 'the modal shows four targets, not eleven subsets');

  const pairs = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) pairs.push([candidates[i], candidates[j]]);
  }
  const multiPlan = productionPlanFor(pairs.map((targets) => ({
    type: 'cast_spell', objectId: 'pair-spell', playerId: 'p1', targets,
  })));
  assert.ok(multiPlan && !multiPlan.buttonsMode, 'six two-target combinations route to a multi-target picker');
  assert.equal(multiPlan.targets.length, 4, 'the modal shows four candidates, not six pairs');

  const epicMultiPlan = productionPlanFor(pairs.map((targets) => ({
    type: 'resolve_epic_choice', cardId: 'exiled-spell', playerId: 'p1', targets,
  })));
  assert.ok(epicMultiPlan?.epicChoiceTargetMode, 'Epic multi-target offers also route to the sequential target picker');
  assert.equal(epicMultiPlan.targets.length, 4, 'Epic shows four targets, not six target combinations');

  const singlePlan = productionPlanFor(candidates.map((targetId) => ({
    type: 'cast_spell', objectId: 'single-spell', playerId: 'p1', targets: [targetId],
  })));
  assert.equal(singlePlan?.singleMode, 'targets', 'ordinary one-target requests route to the target picker');
  assert.equal(singlePlan.targets.length, 4);

  const modalOptions = [
    { type: 'cast_spell', objectId: 'modal-spell', playerId: 'p1', modeIndex: 0, targets: [] },
    ...candidates.map((targetId) => ({
      type: 'cast_spell', objectId: 'modal-spell', playerId: 'p1', modeIndex: 1, targets: [targetId],
    })),
  ];
  const modePlan = productionPlanFor(modalOptions);
  assert.ok(modePlan?.castModeMode, 'mode×target requests split into a mode step before target choices');
  assert.equal(modePlan.rows.length, 2, 'the first modal has two modes, not five mode-target variants');
});
