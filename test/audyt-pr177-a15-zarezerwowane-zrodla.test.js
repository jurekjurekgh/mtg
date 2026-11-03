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
  put('kavu', 'kavu-primarch', 'hand');
  put('druid', 'druid-of-the-cowl', 'battlefield');
  put('other', 'ordinary-bear', 'battlefield');
  for (let i = 0; i < 3; i++) put(`forest-${i}`, 'basic-forest', 'battlefield');
  put('island', 'basic-island', 'battlefield');
  const cmd = session.view().legalCommands.find(c => c.type === 'cast_permanent'
    && c.objectId === 'kavu' && c.convokePayments?.length === 1
    && c.convokePayments[0].creatureId === 'druid' && c.convokePayments[0].color === 'generic');
  assert.ok(cmd, 'faktyczna oferta convoke wybiera Druida');
  return { session, cmd };
}
function context(session) {
  let rendered;
  const ctx = createContext({ session, HUMAN_ID, manaWizardParents: [], manaWizardDescriptor: null,
    els: { manaWizardBody: {} }, registry: createCardRegistry(), MANA_COSTS, parseManaCost,
    effectiveSpellManaCost, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf, wizardProgress,
    getSourceForObject, manaAbilityProductionOf, activatableAbilities, expandManaPool, producibleMana, canPayColoredCost,
    renderManaWizard: (_host, model) => { rendered = model; }, wizardSourceName: source => source.id,
    finishWizardPayment, autosave: () => {}, rerender: () => {}, showBotMoves: () => {},
    showNotice: () => {}, showModal: () => {}, hideModal: () => {},
  });
  runInContext(['restrictedSpellBlockedFor', 'selfTapExclusionFor', 'manaSourcesForPlayer', 'manaWizardFor', 'refreshManaWizard']
    .map(localFunction).join('\n'), ctx);
  return { ctx, rendered: () => rendered };
}

test('A15: kreator Kavu nie pokazuje Druida zarezerwowanego do convoke', () => {
  const { session, cmd } = fixture();
  const { ctx, rendered } = context(session);
  const descriptor = ctx.manaWizardFor(cmd);
  assert.ok(descriptor, 'rzeczywiste alternatywne źródła otwierają kreator');
  ctx.manaWizardDescriptor = descriptor;
  ctx.refreshManaWizard();
  const sources = rendered().untappedSources.map(s => s.id);
  assert.ok(sources.includes('forest-0'));
  assert.ok(!sources.includes('druid'), `Druid jest zarezerwowany do convoke (${sources})`);
  assert.equal(session.state.objects.get('druid').tapped, false);
  for (let i = 0; i < 3; i++) {
    assert.ok(session.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: `forest-${i}` }, { holdPriority: true }).ok);
  }
  const result = finishWizardPayment(session, descriptor, {
    runCommand: command => session.apply(command, { holdPriority: true }),
  });
  assert.equal(result.committed, true);
  assert.notEqual(session.state.objects.get('kavu')?.zone, 'hand');
  assert.equal(session.state.objects.get('druid').tapped, true, 'Druid został użyty do convoke');
});

test('A15: Druid niezarezerwowany do convoke nadal jest źródłem many', () => {
  const { session } = fixture();
  const cmd = session.view().legalCommands.find(c => c.type === 'cast_permanent'
    && c.objectId === 'kavu' && c.convokePayments?.length === 1
    && c.convokePayments[0].creatureId === 'other' && c.convokePayments[0].color === 'generic');
  assert.ok(cmd);
  const { ctx, rendered } = context(session);
  const descriptor = ctx.manaWizardFor(cmd);
  assert.ok(descriptor);
  ctx.manaWizardDescriptor = descriptor;
  ctx.refreshManaWizard();
  assert.ok(rendered().untappedSources.some(s => s.id === 'druid'));
});

test('A15: podrzędny kreator chroni rezerwacje wszystkich płatności rodzicielskich', () => {
  const { session, cmd } = fixture();
  const card = createCardRegistry().get('apprentice-wizard');
  addObject(session.state, { id: 'wizard', instanceId: 'i-wizard', cardId: card.id,
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield', ...gameObjectDataOf(card),
    types: card.types, subtypes: card.subtypes, keywords: card.keywords });
  session.state.objects.set('wizard', Object.freeze({ ...session.state.objects.get('wizard'), summoningSickness: false }));
  const child = { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'wizard', abilityIndex: 0 };
  const { ctx } = context(session);
  ctx.manaWizardParents.push({ cmd });
  ctx.manaWizardDescriptor = { cmd: child };
  const excluded = ctx.selfTapExclusionFor(child);
  const sources = ctx.manaSourcesForPlayer(excluded).map(s => s.id);
  assert.ok(!sources.includes('druid'), `convoke rodzica musi zostać zarezerwowane (${sources})`);
  assert.ok(!sources.includes('wizard'), `aktywowane źródło nie płaci samo za siebie (${sources})`);
  assert.ok(sources.includes('forest-0'));
});
