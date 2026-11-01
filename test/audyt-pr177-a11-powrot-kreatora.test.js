// A11: powrót z podrzędnego kreatora nie otwiera ponownie zakończonego modala.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSession, HUMAN_ID, BOT_ID, commandOptionKey } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana, expandManaPool } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { finishWizardPayment } from '../src/table/mana-wizard.js';

const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
function localFunction(name) {
  const from = source.indexOf(`  function ${name}(`), end = source.indexOf('\n  }', from);
  assert.ok(from >= 0 && end > from);
  return source.slice(from, end + 4);
}
function fixture() {
  const registry = createCardRegistry();
  const ignoredOptionKeys = new Set();
  const session = createSession({ seed: 348, registry, ignoredOptionKeys,
    decks: new Map([[HUMAN_ID, Array(20).fill('goblin-piker')], [BOT_ID, Array(20).fill('basic-forest')]]) });
  session.apply(session.view().legalCommands.find(c => c.type === 'resolve_mulligan_choice' && c.keep));
  const s = session.state;
  for (const id of [...s.zones.hand]) if (s.objects.get(id)?.controllerId === HUMAN_ID) moveObjectDirectly(s, id, 'graveyard', `discard-${id}`);
  s.pendingDiscardChoice = null;
  s.turn = jumpToStep(s.turn, 'main1', HUMAN_ID);
  s.turn.activePlayerId = s.turn.priorityPlayerId = HUMAN_ID;
  const wizard = registry.get('apprentice-wizard');
  addObject(s, { id: 'wiz', instanceId: 'i-wiz', cardId: wizard.id, controllerId: HUMAN_ID, ownerId: HUMAN_ID,
    zone: 'battlefield', ...gameObjectDataOf(wizard), types: wizard.types, subtypes: wizard.subtypes, keywords: wizard.keywords });
  s.objects.set('wiz', Object.freeze({ ...s.objects.get('wiz'), summoningSickness: false }));
  const piker = registry.get('goblin-piker');
  addObject(s, { id: 'piker', instanceId: 'i-piker', cardId: piker.id, controllerId: HUMAN_ID, ownerId: HUMAN_ID,
    zone: 'hand', ...gameObjectDataOf(piker), types: piker.types, subtypes: piker.subtypes, keywords: piker.keywords });
  addMana(s, HUMAN_ID, 1, { colors: ['U'] });
  addMana(s, HUMAN_ID, 1, { colors: ['R'] });
  const parent = session.view().legalCommands.find(c => c.type === 'cast_permanent' && c.objectId === 'piker');
  assert.ok(parent, 'czar nadrzędny jest faktycznie legalny');
  ignoredOptionKeys.add(commandOptionKey(parent)); // wyciszenie nie może przerwać trwającej płatności
  const cmd = session.view().legalCommands.find(c => c.type === 'activate_ability' && c.objectId === 'wiz');
  assert.ok(cmd, 'istnieje legalna aktywacja Apprentice Wizarda');
  return { session, cmd, parent };
}


test('A11: zakończenie płatności przez zagnieżdżoną zdolność nie otwiera pustego modala', () => {
  const { session, cmd, parent } = fixture();
  let visible = true;
  const ctx = createContext({ HUMAN_ID, session, finishWizardPayment, expandManaPool,
    manaWizardDescriptor: { cmd, _restrictedBlocked: false },
    manaWizardParents: [{ cmd: parent, _restrictedBlocked: false }],
    els: { manaWizardBody: {} }, manaSourcesForPlayer: () => [], selfTapExclusionFor: () => null,
    wizardProgress: () => ({ done: true }), autosave: () => {}, rerender: () => {}, showBotMoves: () => {},
    showModal: () => { visible = true; }, hideModal: () => { visible = false; }, showNotice: () => {},
  });
  runInContext(`${localFunction('playDirect')}\n${localFunction('closeManaWizard')}\n${localFunction('returnToParentManaWizard')}\n${localFunction('refreshManaWizard')}\nrefreshManaWizard();`, ctx);
  assert.ok(session.view().zones.battlefield.some(o => o.cardId === 'goblin-piker'), 'czar nadrzędny został rozstrzygnięty');
  assert.notEqual(session.state.objects.get('piker')?.zone, 'hand', 'wykonano czar nadrzędny');
  assert.equal(ctx.manaWizardDescriptor, null, 'płatność zakończona');
  assert.equal(visible, false, 'zakończony modal nie powinien zostać ponownie otwarty');
});


test('A11: niedokończony kreator nadrzędny pozostaje widoczny', () => {
  const { session, cmd, parent } = fixture();
  let visible = true;
  let rendered = false;
  const ctx = createContext({ HUMAN_ID, session, finishWizardPayment, expandManaPool,
    manaWizardDescriptor: { cmd, _restrictedBlocked: false },
    manaWizardParents: [{ cmd: parent, _restrictedBlocked: false }],
    els: { manaWizardBody: {} }, manaSourcesForPlayer: () => [], selfTapExclusionFor: () => null,
    wizardProgress: (_view, _player, descriptor) => descriptor.cmd.objectId === 'wiz'
      ? { done: true }
      : { done: false, untappedSources: [], missingColors: [], requirements: [] },
    renderManaWizard: () => { rendered = true; },
    autosave: () => {}, rerender: () => {}, showBotMoves: () => {},
    showModal: () => { visible = true; }, hideModal: () => { visible = false; }, showNotice: () => {},
  });
  runInContext(`${localFunction('playDirect')}\n${localFunction('closeManaWizard')}\n${localFunction('returnToParentManaWizard')}\n${localFunction('refreshManaWizard')}\nrefreshManaWizard();`, ctx);
  assert.equal(ctx.manaWizardDescriptor.cmd.objectId, 'piker');
  assert.ok(rendered, 'nadrzędna płatność została wyrenderowana');
  assert.equal(visible, true);
  assert.equal(session.state.turn.step, 'main1');
});
