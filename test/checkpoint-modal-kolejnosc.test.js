// ADR 0032 / CR 603.3b–c: modalny trigger ETB należy do tej samej partii co
// zwykły trigger obserwujący wejście. Kontroler wybiera kolejność, a tryb i
// cel modalnego triggera ogłaszamy przy umieszczaniu na stosie.
// Oracle: Etched Host Doombringer — „When this creature enters, choose one —
// • Target opponent loses 2 life and you gain 2 life. • Choose target battle…”
// Impact Tremors — „Whenever a creature you control enters, … 1 damage…”
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';

const REGISTRY = createCardRegistry();
function put(state, id, cardId, zone, playerId) {
  const [{ objectId: _objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry: REGISTRY });
  addObject(state, { ...data, id, instanceId: `i-${id}`, zone, controllerId: playerId });
}
function create(seed) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'tremors', 'impact-tremors', 'battlefield', 'p1');
  put(state, 'doom', 'etched-host-doombringer', 'hand', 'p1');
  addMana(state, 'p1', 12);
  return state;
}
const view = (state) => playerView(state, state.turn.priorityPlayerId);
function act(state, command) {
  assert.ok(command, `brak komendy: ${JSON.stringify(view(state).legalCommands)}`);
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}
const pass = (state) => act(state, view(state).legalCommands.find((c) => c.type === 'pass_priority'));
const stackCards = (state) => state.zones.stack.map((id) => state.objects.get(id)).filter((o) => o?.kind === 'trigger').map((o) => o.cardId);

test('checkpoint/modal: modalny ETB i Impact Tremors wymagają wyboru kolejności (CR 603.3b–c)', () => {
  const state = create(3301);
  act(state, view(state).legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'doom'));
  pass(state);
  pass(state);
  const choices = view(state).legalCommands.filter((c) => c.type === 'resolve_trigger_order');
  assert.deepEqual(choices.map((c) => c.cardId).sort(), ['etched-host-doombringer', 'impact-tremors']);
  act(state, choices.find((c) => c.cardId === 'impact-tremors'));
  const modal = view(state).legalCommands.find((c) => c.type === 'resolve_modal_choice' && c.modeIndex === 0);
  assert.ok(modal, 'czekamy na tryb modalnego ETB');
  act(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0, targetId: 'p2' });
  assert.deepEqual(stackCards(state), ['etched-host-doombringer', 'impact-tremors']);
  const replay = verifyReplay(replayFromState(state), create, (s, cmd) => execute(s, cmd));
  assert.equal(replay.deterministic, true);
  assert.deepEqual(stackCards(replay.state), ['etched-host-doombringer', 'impact-tremors']);
});
