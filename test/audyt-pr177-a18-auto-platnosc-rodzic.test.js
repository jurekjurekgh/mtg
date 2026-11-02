import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { finishWizardPayment, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf, wizardProgress } from '../src/table/mana-wizard.js';
import { addMana, expandManaPool, producibleMana } from '../src/engine/resources.js';
import { getSourceForObject, manaAbilityProductionOf } from '../src/engine/mana-sources.js';
import { activatableAbilities } from '../src/engine/permanents.js';
import { effectiveSpellManaCost } from '../src/engine/spells.js';
import { parseManaCost } from '../src/engine/mana-cost.js';
import { animatePermanentUntilEndOfTurn } from '../src/engine/permanents.js';
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
  put('kavu', 'kavu-primarch', 'hand');
  put('reserved', 'basic-island', 'battlefield');
  animatePermanentUntilEndOfTurn(state, 'reserved', {power: 2, toughness: 2, typesAdd: ['Creature']});
  for (let i = 0; i < 3; i++) { put(`island-${i}`, 'basic-island', 'battlefield'); animatePermanentUntilEndOfTurn(state, `island-${i}`, {power: 2, toughness: 2, typesAdd: ['Creature']}); }
  put('druid', 'druid-of-the-cowl', 'battlefield');
  put('wiz', 'apprentice-wizard', 'battlefield');
  const cmd = session.view().legalCommands.find(c => c.type === 'cast_permanent'
    && c.objectId === 'kavu' && c.convokePayments?.length === 1
    && c.convokePayments[0].creatureId === 'reserved' && c.convokePayments[0].color === 'generic');
  assert.ok(cmd, 'faktyczna oferta convoke wybiera ożywioną Wyspę');
  return { session, cmd };
}
function context(session) {
  let rendered; let handlers;
  const ctx = createContext({ session, HUMAN_ID, manaWizardParents: [], manaWizardDescriptor: null,
    els: { manaWizardBody: {} }, registry: createCardRegistry(), MANA_COSTS, parseManaCost,
    effectiveSpellManaCost, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf, wizardProgress,
    getSourceForObject, manaAbilityProductionOf, activatableAbilities, expandManaPool, producibleMana,
    renderManaWizard: (_host, model, h) => { rendered = model; handlers = h; }, wizardSourceName: source => source.id,
    finishWizardPayment, autosave: () => {}, rerender: () => {}, showBotMoves: () => {},
    showNotice: () => {}, showModal: () => {}, hideModal: () => {},
  });
  runInContext(['restrictedSpellBlockedFor', 'selfTapExclusionFor', 'manaSourcesForPlayer', 'manaWizardFor', 'refreshManaWizard']
    .map(localFunction).join('\n'), ctx);
  return { ctx, rendered: () => rendered, handlers: () => handlers };
}

test('A18: podrzędna aktywacja nie tapuje lądu-stwora zarezerwowanego do convoke', () => {
  const { session, cmd } = fixture();
  const { ctx, rendered, handlers } = context(session);
  runInContext(['playDirect', 'manaSourceTapPlan', 'openNestedManaWizard', 'returnToParentManaWizard', 'closeManaWizard']
    .map(localFunction).join('\n'), ctx);
  const parent = ctx.manaWizardFor(cmd);
  assert.ok(parent, 'kreator rodzica ma wybór');
  ctx.manaWizardDescriptor = parent; ctx.refreshManaWizard();
  assert.ok(rendered().untappedSources.some(s => s.id === 'wiz'));
  handlers().onTapSource('wiz');
  assert.equal(session.state.objects.get('reserved').tapped, false, 'convoke rodzica pozostaje nietknięte');
  assert.equal(ctx.manaWizardDescriptor.cmd.objectId, 'wiz', 'otwarto podrzędny kreator');
  assert.ok(rendered().untappedSources.some(s => s.id === 'island-0'));
  assert.ok(!rendered().untappedSources.some(s => s.id === 'reserved'));
  handlers().onTapSource('island-0');
  assert.equal(session.state.objects.get('wiz').tapped, true);
  assert.equal(session.state.objects.get('reserved').tapped, false);
  assert.equal(ctx.manaWizardDescriptor.cmd.objectId, 'kavu');
  handlers().onTapSource('druid');
  assert.notEqual(session.state.objects.get('kavu')?.zone, 'hand', 'czar faktycznie rzucony');
  assert.equal(session.state.objects.get('reserved').tapped, true, 'land-stwór zapłacił convoke');
});

function wizardCommand(session) {
  const command = session.view().legalCommands.find(c => c.type === 'activate_ability' && c.objectId === 'wiz');
  assert.ok(command, 'rzeczywista oferta Apprentice');
  return command;
}

test('A18: jednoznaczna płatność bez rezerwacji rodzica nie otwiera kreatora', () => {
  const { session } = fixture();
  const { ctx } = context(session);
  assert.equal(ctx.manaWizardFor(wizardCommand(session), { guardParentReservations: true }), null);
});

test('A18: pula {U} wystarcza — rezerwacja nie wymusza zbędnego kreatora', () => {
  const { session, cmd } = fixture();
  const { ctx } = context(session);
  ctx.manaWizardDescriptor = { cmd };
  addMana(session.state, HUMAN_ID, 1, { colors: ['U'] });
  assert.equal(ctx.manaWizardFor(wizardCommand(session), { guardParentReservations: true }), null);
  assert.equal(session.state.objects.get('reserved').tapped, false);
});

test('A18: rezerwacja spoza bieżącego kreatora działa również dla przodka', () => {
  const { session, cmd } = fixture();
  const { ctx } = context(session);
  ctx.manaWizardParents.push({ cmd });
  ctx.manaWizardDescriptor = { cmd: { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'druid', abilityIndex: 0 } };
  assert.ok(ctx.manaWizardFor(wizardCommand(session), { guardParentReservations: true }));
});

test('A18: jeśli wszystkie alternatywy są tapnięte, kreator nie poświęca rezerwacji', () => {
  const { session, cmd } = fixture();
  const { ctx, rendered, handlers } = context(session);
  runInContext(['playDirect', 'manaSourceTapPlan', 'openNestedManaWizard', 'returnToParentManaWizard', 'closeManaWizard']
    .map(localFunction).join('\n'), ctx);
  const parent = ctx.manaWizardFor(cmd);
  assert.ok(parent);
  ctx.manaWizardDescriptor = parent;
  for (let i = 0; i < 3; i++) {
    const id = `island-${i}`;
    session.state.objects.set(id, Object.freeze({ ...session.state.objects.get(id), tapped: true }));
  }
  ctx.refreshManaWizard();
  handlers().onTapSource('wiz');
  assert.equal(ctx.manaWizardDescriptor.cmd.objectId, 'wiz');
  assert.equal(session.state.objects.get('reserved').tapped, false);
  assert.ok(!rendered().untappedSources.some(s => s.id === 'reserved'));
  handlers().onCancel();
  assert.equal(ctx.manaWizardDescriptor.cmd.objectId, 'kavu', 'anulowanie wraca do rodzica');
  assert.equal(session.state.objects.get('reserved').tapped, false);
});
