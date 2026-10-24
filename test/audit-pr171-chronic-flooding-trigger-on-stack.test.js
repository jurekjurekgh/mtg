import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { finishWizardPayment, isWizardCommandLegal } from '../src/table/mana-wizard.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 67, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, zone, patch = {}) {
  const def = registry.get(cardId);
  const { runtime, ...rest } = patch;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords ?? [], ...rest,
  });
  if (runtime) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...runtime }));
  }
  return state.objects.get(id);
}

function land(state, id, sub, controllerId = 'p1') {
  return put(state, id, `basic-${sub.toLowerCase()}`, 'battlefield', {
    controllerId, ownerId: controllerId,
    kind: 'land', types: ['Land'], colors: [],
    abilities: [{ type: 'mana', produces: [sub[0]], text: '{T}: dodaj 1 manę' }],
  });
}

function makeWizardSession() {
  const sess = createSession({
    seed: 67, registry, pauseOnBotMoves: true,
    decks: new Map([
      [HUMAN_ID, Array(60).fill('basic-forest')],
      [BOT_ID, Array(60).fill('basic-island')],
    ]),
  });
  const s = sess.state;
  s.pendingMulligans = [];
  s.turn = jumpToStep(s.turn, 'main1', HUMAN_ID);
  s.turn.activePlayerId = HUMAN_ID;
  s.turn.priorityPlayerId = HUMAN_ID;
  return sess;
}

test('PR171/A (CR 307.1 + CR 117.1a): cast_permanent na niepustym stosie z triggera lądu jest odrzucany przez silnik', () => {
  const s = game();
  put(s, 'kul', 'kuldotha-ringleader', 'hand');
  land(s, 'isl', 'Island');
  put(s, 'aura', 'chronic-flooding', 'battlefield');
  attachAuraToCreature(s, 'aura', 'isl');
  addMana(s, 'p1', 5, { colors: ['R', 'R', 'R', 'R', 'R'] });

  const tap = execute(s, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isl' });
  assert.equal(tap.ok, true);
  assert.ok(s.zones.stack.some((id) => s.objects.get(id)?.cardId === 'chronic-flooding'));

  const r = execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'kul', targets: [] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'illegal_cast:Zagranie przy niepustym stosie');
});

test('PR171/B: bez triggera na stosie commit cast_permanent przechodzi natychmiast', () => {
  const s = game();
  put(s, 'kul', 'kuldotha-ringleader', 'hand');
  land(s, 'isl', 'Island');
  addMana(s, 'p1', 5, { colors: ['R', 'R', 'R', 'R', 'R'] });

  assert.equal(execute(s, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isl' }).ok, true);
  assert.equal(s.zones.stack.length, 0);
  assert.equal(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'kul', targets: [] }).ok, true);
  assert.ok(s.zones.stack.some((id) => s.objects.get(id)?.cardId === 'kuldotha-ringleader'));
});

test('F-1/1 (CR 307.1 + CR 117.3d + ADR 0003): finishWizardPayment drenuje trigger Chronic Flooding bez podszywania pod BOT_ID i domyka rzut przez runCommand', () => {
  const sess = makeWizardSession();
  const s = sess.state;
  put(s, 'kul', 'kuldotha-ringleader', 'hand', { controllerId: HUMAN_ID, ownerId: HUMAN_ID });
  land(s, 'isl1', 'Island', HUMAN_ID);
  land(s, 'isl2', 'Island', HUMAN_ID);
  put(s, 'aura1', 'chronic-flooding', 'battlefield', { controllerId: BOT_ID, ownerId: BOT_ID });
  put(s, 'aura2', 'chronic-flooding', 'battlefield', { controllerId: BOT_ID, ownerId: BOT_ID });
  attachAuraToCreature(s, 'aura1', 'isl1');
  attachAuraToCreature(s, 'aura2', 'isl2');
  addMana(s, HUMAN_ID, 4, { colors: ['R', 'R', 'R', 'R'] });

  // Dwa tapnięcia z kreatora z { holdPriority: true } kładą DWA triggery wrogiego Chronic Flooding na stos.
  assert.equal(sess.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'isl1' }, { holdPriority: true }).ok, true);
  assert.equal(sess.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'isl2' }, { holdPriority: true }).ok, true);
  assert.equal(s.zones.stack.length, 2, 'dwa triggery Chronic Flooding siedzą na stosie przed commitem');

  const appliedPlayerIds = [];
  const origApply = sess.apply.bind(sess);
  sess.apply = (cmd, opts) => {
    appliedPlayerIds.push(cmd.playerId);
    return origApply(cmd, opts);
  };

  let runCommandCalls = 0;
  let closed = 0;
  const notices = [];
  const res = finishWizardPayment(sess, {
    cmd: { type: 'cast_permanent', playerId: HUMAN_ID, objectId: 'kul' },
  }, {
    runCommand: (cmd, opts) => {
      runCommandCalls += 1;
      assert.equal(opts?.holdPriority ?? false, false, 'finalny commit czaru nie może trzymać holdPriority=true');
      return sess.apply(cmd, opts);
    },
    onCloseWizard: () => { closed += 1; },
    onNotice: (msg) => notices.push(msg),
  });

  assert.equal(res.committed, true, 'finishWizardPayment musi domknąć rzut po rozstrzygnięciu obu triggerów');
  assert.equal(runCommandCalls, 1, 'finalny commit czaru musi przejść przez runCommand (playDirect)');
  assert.equal(closed, 1, 'kreator musi zostać zamknięty');
  assert.deepEqual(notices, [], 'brak fałszywego komunikatu o niedostępnym zagraniu');
  assert.equal(appliedPlayerIds.every((id) => id === HUMAN_ID), true,
    `UI nie może wysyłać komend w imieniu BOT_ID: ${JSON.stringify(appliedPlayerIds)}`);
  assert.equal(s.zones.battlefield.some((id) => s.objects.get(id)?.cardId === 'kuldotha-ringleader'), true,
    'Kuldotha Ringleader musi rozstrzygnąć się na pole bitwy (brak zawieszenia na stosie z holdPriority=true)');
});

test('F-1/2 (L32 + commandOptionKey): finishWizardPayment weryfikuje pełny klucz wariantu (np. kicked + kickerLandId), nie sam (type, objectId, targets)', () => {
  const sess = makeWizardSession();
  const s = sess.state;
  const oppCreature = put(s, 'opp-bear', 'coralhelm-guide', 'battlefield', { controllerId: BOT_ID, ownerId: BOT_ID });
  const myCreature = put(s, 'my-bear', 'coralhelm-guide', 'battlefield', { controllerId: HUMAN_ID, ownerId: HUMAN_ID });
  put(s, 'kick-spell', 'chocobo-kick', 'hand', { controllerId: HUMAN_ID, ownerId: HUMAN_ID });
  land(s, 'isl', 'Island', HUMAN_ID);
  put(s, 'aura', 'chronic-flooding', 'battlefield', { controllerId: BOT_ID, ownerId: BOT_ID });
  attachAuraToCreature(s, 'aura', 'isl');
  addMana(s, HUMAN_ID, 3, { colors: ['G', 'G', 'G'] });

  assert.equal(sess.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'isl' }, { holdPriority: true }).ok, true);
  assert.equal(s.zones.stack.length, 1);

  let synced = 0;
  const notices = [];
  // Wariant unkicked jest legalny po opróżnieniu stosu, ale żądany wariant kicked z nieistniejącym lądem NIE jest legalny.
  const res = finishWizardPayment(sess, {
    cmd: {
      type: 'cast_spell', playerId: HUMAN_ID, objectId: 'kick-spell',
      targets: [myCreature.id, oppCreature.id],
      kicked: true, kickerLandId: 'missing-land',
    },
  }, {
    onSyncUi: () => { synced += 1; },
    onNotice: (msg) => notices.push(msg),
  });

  assert.equal(res.committed, false, 'nielegalny wariant kicked nie może być uznany za skutecznie rzucony');
  assert.equal(synced, 1, 'po nieudanym commicie UI musi odświeżyć stan (autosave/rerender/showBotMoves)');
  assert.equal(notices.length, 1, 'użytkownik musi dostać komunikat o pozostawieniu many w puli');
});

test('F-1/3: gdy trigger opróżni stos a rzut nie jest już legalny, finishWizardPayment woła onSyncUi zamiast zostawiać martwy DOM', () => {
  const sess = makeWizardSession();
  const s = sess.state;
  land(s, 'isl', 'Island', HUMAN_ID);
  put(s, 'aura', 'chronic-flooding', 'battlefield', { controllerId: BOT_ID, ownerId: BOT_ID });
  attachAuraToCreature(s, 'aura', 'isl');

  assert.equal(sess.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: 'isl' }, { holdPriority: true }).ok, true);
  assert.equal(s.zones.stack.length, 1);

  let synced = 0;
  let closed = 0;
  const res = finishWizardPayment(sess, {
    cmd: { type: 'cast_permanent', playerId: HUMAN_ID, objectId: 'nonexistent-card' },
  }, {
    onCloseWizard: () => { closed += 1; },
    onSyncUi: () => { synced += 1; },
  });

  assert.equal(res.committed, false);
  assert.equal(closed, 1);
  assert.equal(synced, 1, 'UI musi odświeżyć stan stołu po rozstrzygnięciu triggera nawet gdy sam rzut przepadł');
});

test('Audyt PR #171 F-1 (Delve/Crew): isWizardCommandLegal akceptuje delveExileIds i crewCreatureIds z kreatora, ale odrzuca brak karty w grobie lub inny tryb', () => {
  const view = {
    zones: {
      graveyard: [{ id: 'g1' }, { id: 'g2' }],
    },
    legalCommands: [
      { type: 'cast_permanent', playerId: HUMAN_ID, objectId: 'mandrills' },
      { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'skiff', abilityIndex: 0, crewCreatureIds: ['c1'] },
      { type: 'cast_spell', playerId: HUMAN_ID, objectId: 'charm', modeIndex: 0 },
    ],
  };

  assert.equal(
    isWizardCommandLegal(view, {
      type: 'cast_permanent', playerId: HUMAN_ID, objectId: 'mandrills', delveExileIds: ['g1', 'g2'],
    }),
    true,
    'Delve dokleja delveExileIds ponad reprezentantem z legalCommands, gdy wskazane karty wciąż leżą w grobie',
  );
  assert.equal(
    isWizardCommandLegal(view, {
      type: 'cast_permanent', playerId: HUMAN_ID, objectId: 'mandrills', delveExileIds: ['g1', 'g-exiled'],
    }),
    false,
    'gdy wyzwalacz wygnał wskazaną kartę z grobu przed commitem, płatność Delve staje się nieaktualna',
  );
  assert.equal(
    isWizardCommandLegal(view, {
      type: 'activate_ability', playerId: HUMAN_ID, objectId: 'skiff', abilityIndex: 0, crewCreatureIds: ['c2', 'c3'],
    }),
    true,
    'kreator załogi może podmienić domyślne crewCreatureIds bez utraty dopasowania zdolności',
  );
  assert.equal(
    isWizardCommandLegal(view, {
      type: 'cast_spell', playerId: HUMAN_ID, objectId: 'charm', modeIndex: 1,
    }),
    false,
    'różny modeIndex nadal musi być odrzucony',
  );
});

