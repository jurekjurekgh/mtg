import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { finishWizardPayment, isWizardCommandLegal } from '../src/table/mana-wizard.js';

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
  for (let i = 0; i < 4; i++) put(`forest-${i}`, 'basic-forest', 'battlefield');
  const cmd = session.view().legalCommands.find(c => c.type === 'cast_permanent'
    && c.objectId === 'kavu' && c.convokePayments?.length === 1
    && c.convokePayments[0].creatureId === 'druid' && c.convokePayments[0].color === 'generic');
  assert.ok(cmd, 'faktyczna oferta convoke wybiera Druida');
  return { session, cmd };
}
function runThroughRealPlayDirect(session, cmd) {
  const notices = [];
  let closed = false;
  const ctx = createContext({ session, autosave: () => {}, rerender: () => {},
    showBotMoves: () => {}, showNotice: message => notices.push(message) });
  runInContext(localFunction('playDirect'), ctx);
  const result = finishWizardPayment(session, { cmd }, {
    runCommand: (command) => ctx.playDirect(command, { holdPriority: true }),
    onCloseWizard: () => { closed = true; },
    onNotice: message => notices.push(message),
  });
  return { result, notices, closed };
}

test('A14: odrzucony Kavu z nieaktualnym convoke nie jest zgłaszany jako sukces', () => {
  const { session, cmd } = fixture();
  const tap = session.view().legalCommands.find(c => c.type === 'activate_ability' && c.objectId === 'druid');
  assert.ok(tap && session.apply(tap, { holdPriority: true }).ok);
  for (let i = 0; i < 2; i++) {
    assert.ok(session.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: `forest-${i}` }, { holdPriority: true }).ok);
  }
  assert.equal(session.state.players.find(p => p.id === HUMAN_ID).mana, 3);
  assert.equal(isWizardCommandLegal(session.view(), cmd), true, 'oferta innego wariantu ma ten sam klucz bazowy');
  const { result, notices, closed } = runThroughRealPlayDirect(session, cmd);
  assert.equal(result.committed, false);
  assert.match(result.reason, /convoke/i);
  assert.ok(closed);
  assert.ok(notices.some(message => message.includes('nie jest już dostępne')));
  assert.equal(session.state.objects.get('kavu').zone, 'hand');
  assert.equal(session.state.players.find(p => p.id === HUMAN_ID).mana, 3, 'zebrana mana pozostaje w puli');
});

test('A14: ważny wariant convoke nadal finalizuje się prawdziwą komendą', () => {
  const { session, cmd } = fixture();
  for (let i = 0; i < 3; i++) {
    assert.ok(session.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: `forest-${i}` }, { holdPriority: true }).ok);
  }
  const { result, notices, closed } = runThroughRealPlayDirect(session, cmd);
  assert.equal(result.committed, true);
  assert.ok(closed);
  assert.deepEqual(notices, []);
  assert.notEqual(session.state.objects.get('kavu')?.zone, 'hand');
  assert.equal(session.state.objects.get('druid').tapped, true);
});

test('A14: wyjątek sesji nie jest sukcesem i nie gubi komunikatu wewnętrznego', () => {
  const { session, cmd } = fixture();
  session.apply = () => { throw new Error('sonda wyjątku'); };
  const { result, notices } = runThroughRealPlayDirect(session, cmd);
  assert.equal(result.committed, false);
  assert.equal(result.reason, 'internal_error');
  assert.equal(notices.length, 1);
  assert.match(notices[0], /Błąd wewnętrzny stołu: sonda wyjątku/);
});
