// ADR 0032 / CR 603.3b–d, 603.12: madness i refleks odrzucenia należą do
// jednej partii. Najpierw kontroler wybiera kolejność, dopiero potem cel
// zdolności w kolejności jej umieszczania na stosie. Sam wybór celu nie
// rozstrzyga jeszcze efektu ani nie otwiera priorytetu.
//
// Oracle (src/cards/card-data.js): Talion's Messenger — „Whenever you attack
// with one or more Faeries, draw a card, then discard a card. When you discard
// a card this way, put a +1/+1 counter on target Faerie you control.”
// Revolutionist ma madness; dwa Faerie dają rzeczywisty wybór celu refleksu.
// Przypięty CR: SHA-256 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';

const REGISTRY = createCardRegistry();
function put(state, id, cardId, zone = 'hand', playerId = 'p1') {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  addObject(state, { id, instanceId: `i-${id}`, cardId, zone,
    ownerId: playerId, controllerId: playerId, ...gameObjectDataOf(card),
    types: card.types ?? [], subtypes: card.subtypes ?? [], keywords: card.keywords ?? [] });
}
function setup(seed) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'talion', 'talions-messenger', 'battlefield');
  put(state, 'clique', 'puppeteer-clique', 'battlefield');
  for (const id of ['talion', 'clique']) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  put(state, 'rev', 'revolutionist');
  put(state, 'draw', 'basic-island', 'library');
  return state;
}
const view = (state) => playerView(state, state.turn.priorityPlayerId);
function act(state, command) {
  assert.ok(command, `brak komendy: ${JSON.stringify(view(state).legalCommands)}`);
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}
function pass(state) {
  act(state, view(state).legalCommands.find((command) => command.type === 'pass_priority'));
}
function afterDiscard(seed) {
  const state = setup(seed);
  act(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['talion'] });
  pass(state);
  pass(state);
  act(state, view(state).legalCommands.find((command) => command.type === 'resolve_discard_choice' && command.cardId === 'rev'));
  return state;
}
const triggerStack = (state) => state.zones.stack.map((id) => state.objects.get(id))
  .filter((object) => object?.kind === 'trigger');

for (const first of ['reflexive_discard', 'madness']) {
  test(`checkpoint/madness: najpierw ${first}, cel dopiero przy ogłoszeniu tej zdolności`, () => {
    const state = afterDiscard(first === 'madness' ? 3401 : 3402);
    const options = view(state).legalCommands;
    assert.ok(!options.some((command) => command.type === 'pass_priority'), 'brak priorytetu przed domknięciem partii');
    assert.ok(!options.some((command) => command.type === 'resolve_trigger_target'),
      'cel refleksu nie może wyprzedzić wyboru kolejności całej partii');
    const choices = options.filter((command) => command.type === 'resolve_trigger_order');
    assert.deepEqual(choices.map((command) => command.trigger).sort(), ['madness', 'reflexive_discard']);
    assert.ok(state.pendingDeathTriggerBatch, 'madness korzysta ze wspólnego nośnika checkpointu');
    act(state, choices.find((command) => command.trigger === first));
    const beforeTarget = stateFingerprint(state);
    act(state, view(state).legalCommands.find((command) => command.type === 'resolve_trigger_target' && command.targetId === 'clique'));
    assert.notEqual(stateFingerprint(state), beforeTarget, 'ogłoszenie celu jest częścią odcisku');
    assert.equal(state.pendingDeathTriggerBatch, null);
    assert.equal(state.pendingTriggerOrder, null);
    assert.equal(state.turn.priorityPlayerId, 'p1');
    const second = first === 'madness' ? 'reflexive_discard' : 'madness';
    const expectedCards = first === 'madness'
      ? ['talions-messenger', 'revolutionist'] : ['revolutionist', 'talions-messenger'];
    // Stos zapisujemy od dołu; wybrany „pierwszy” ma rozstrzygnąć się z góry.
    assert.deepEqual(triggerStack(state).map((entry) => entry.cardId), expectedCards);
    assert.deepEqual(triggerStack(state).map((entry) => entry.triggerEntry.ability.trigger.event), [second, first]);
    assert.equal(new Set(state.zones.stack).size, state.zones.stack.length, 'brak podwójnych wpisów stosu');
    const reflex = triggerStack(state).find((entry) => entry.triggerEntry.ability.trigger.event === 'reflexive_discard');
    assert.deepEqual([...reflex.triggerEntry.targets], ['clique']);
    assert.equal(state.objects.get('clique').counters?.['+1/+1'] ?? 0, 0, 'wybór celu nie rozstrzyga efektu');
    const replay = verifyReplay(replayFromState(state), setup, execute);
    assert.equal(replay.deterministic, true);
    assert.ok(replay.results.every((result) => result.ok));
    assert.equal(stateFingerprint(replay.state), stateFingerprint(state));
  });
}
