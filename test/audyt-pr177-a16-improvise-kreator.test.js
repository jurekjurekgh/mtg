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
import { expandManaPool, producibleMana } from '../src/engine/resources.js';
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
  put('fen', 'fen-hauler', 'hand');
  put('talisman', 'pristine-talisman', 'battlefield');
  put('torch', 'blazing-torch', 'battlefield');
  for (let i = 0; i < 4; i++) put(`swamp-${i}`, 'basic-swamp', 'battlefield');
  for (let i = 0; i < 2; i++) put(`island-${i}`, 'basic-island', 'battlefield');
  const cmd = session.view().legalCommands.find(c => c.type === 'cast_permanent' && c.objectId === 'fen'
    && c.improvisePayments?.length === 2);
  assert.ok(cmd, 'silnik oferuje Fen Haulera z dwoma artefaktami');
  return { session, cmd };
}
function context(session) {
  let rendered;
  const ctx = createContext({ session, HUMAN_ID, manaWizardParents: [], manaWizardDescriptor: null,
    els: { manaWizardBody: {} }, registry: createCardRegistry(), MANA_COSTS, parseManaCost,
    effectiveSpellManaCost, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf, wizardProgress,
    getSourceForObject, manaAbilityProductionOf, activatableAbilities, expandManaPool, producibleMana,
    renderManaWizard: (_host, model) => { rendered = model; }, wizardSourceName: source => source.id,
    finishWizardPayment, autosave: () => {}, rerender: () => {}, showBotMoves: () => {},
    showNotice: () => {}, showModal: () => {}, hideModal: () => {},
  });
  runInContext(['restrictedSpellBlockedFor', 'selfTapExclusionFor', 'manaSourcesForPlayer', 'manaWizardFor', 'refreshManaWizard']
    .map(localFunction).join('\n'), ctx);
  return { ctx, rendered: () => rendered };
}

test('A16: kreator Fen Haulera odejmuje wybrane artefakty od generycznej many', () => {
  const { session, cmd } = fixture();
  const raw = paymentDescriptorOf(cmd, session.view());
  assert.equal(raw.totalNeeded, 5, 'dwa artefakty opłacają {2} z kosztu {6}{B}');
  assert.deepEqual(raw.requirements, [['B']], 'improvise nie płaci czarnego pipsa');
  const { ctx, rendered } = context(session);
  const descriptor = ctx.manaWizardFor(cmd);
  assert.ok(descriptor, 'więcej niż jeden kształt płatności daje kreator');
  ctx.manaWizardDescriptor = descriptor;
  ctx.refreshManaWizard();
  const ids = rendered().untappedSources.map(s => s.id);
  assert.ok(!ids.includes('talisman'), 'artefakt wybrany do improvise nie płaci drugi raz');
  for (const id of ['swamp-0', 'swamp-1', 'swamp-2', 'swamp-3', 'island-0']) {
    assert.ok(session.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: id }, { holdPriority: true }).ok);
  }
  const result = finishWizardPayment(session, descriptor, {
    runCommand: command => session.apply(command, { holdPriority: true }),
  });
  assert.equal(result.committed, true);
  assert.equal(session.state.players.find(p => p.id === HUMAN_ID).mana, 0);
  assert.equal(session.state.objects.get('talisman').tapped, true);
  assert.equal(session.state.objects.get('torch').tapped, true);
});

test('A16: bez improvise pełny koszt pozostaje bez zmian', () => {
  const { session, cmd } = fixture();
  const { improvisePayments: _payments, ...without } = cmd;
  const descriptor = paymentDescriptorOf(without, session.view());
  assert.equal(descriptor.totalNeeded, 7);
  assert.deepEqual(descriptor.requirements, [['B']]);
});

test('A16: improvise nie schodzi z obowiązkowych pipów nawet przy nadmiarowej liczbie artefaktów', () => {
  const { session, cmd } = fixture();
  const invalid = { ...cmd, improvisePayments: Array.from({ length: 7 }, (_, i) => ({ artifactId: `a${i}` })) };
  assert.equal(paymentDescriptorOf(invalid, session.view()), null);
});

test('A16: improvise odejmuje od kosztu wariantu po obniżce i kickerze', () => {
  const { session, cmd } = fixture();
  const view = session.view();
  view.zones.hand = view.zones.hand.map(card => card.id === 'fen'
    ? { ...card, kicker: { cost: 4, colors: [] } } : card);
  const descriptor = paymentDescriptorOf({ ...cmd, kicked: true }, view, { effectiveGeneric: 5 });
  assert.equal(descriptor.totalNeeded, 8, '({5}{B} + {4}) − dwa artefakty');
  assert.equal(descriptor.effectiveGeneric, 7);
  assert.deepEqual(descriptor.requirements, [['B']]);
});
