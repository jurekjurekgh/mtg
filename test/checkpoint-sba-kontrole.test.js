// ADR 0032 / CR 117.5, 704.3–704.4: checkpoint przed priorytetem domyka
// akcje stanowe wywołane przez rozstrzygnięcie i przez ogłoszone wyzwalacze.
// Kontrole na prawdziwych kartach i komendach (nie na synthetic state):
//  • Man-o'-War: „When this creature enters, return target creature to its
//    owner's hand.” Token wraca do ręki, znika (CR 111.7), a Serra's Embrace
//    („Enchant creature”) trafia do grobu, zanim ktokolwiek dostanie priorytet.
//  • Rediscover the Way + Feedback + Courage in Crisis: proliferate dokłada
//    trzeci licznik lore, rozdział III się rozstrzyga, Saga jest poświęcona
//    (CR 715.4), a Feedback („Enchant enchantment”) nie zostaje sierotą.
// Przypięty CR: SHA-256 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';

const REGISTRY = createCardRegistry();
function put(state, id, cardId, zone, playerId = 'p1') {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  addObject(state, { id, instanceId: `i-${id}`, cardId, zone,
    ownerId: playerId, controllerId: playerId, ...gameObjectDataOf(card),
    types: card.types ?? [], subtypes: card.subtypes ?? [], keywords: card.keywords ?? [] });
}
function base(seed) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 12; i++) put(state, `${playerId}-lib${i}`, 'basic-island', 'library', playerId);
  }
  return state;
}
const view = (state) => playerView(state, state.turn.priorityPlayerId);
function act(state, command) {
  assert.ok(command, `brak komendy: ${JSON.stringify(view(state).legalCommands)}`);
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}
function drain(state) {
  for (let i = 0; i < 40 && state.zones.stack.length; i++) {
    const pass = view(state).legalCommands.find((command) => command.type === 'pass_priority');
    if (!pass) break;
    act(state, pass);
  }
  assert.equal(state.zones.stack.length, 0, 'stos rozstrzygnięty');
}
const byInstance = (state, id) => [...state.objects.values()].find((object) => object.instanceId === `i-${id}`);

test('checkpoint/SBA: token wrócony do ręki znika, a jego aura trafia do grobu przed priorytetem', () => {
  const setup = (seed) => {
    const state = base(seed);
    put(state, 'jelly', 'man-o-war', 'hand');
    addMana(state, 'p1', 3, { colors: ['U'] });
    const token = createBattlefieldToken(state, 'p2', { cardId: 'token_soldier', name: 'Soldier',
      kind: 'creature', power: 1, toughness: 1, types: ['Creature'], subtypes: ['Soldier'] });
    put(state, 'aura', 'serras-embrace', 'battlefield', 'p2');
    attachAuraToCreature(state, 'aura', token.id);
    return { state, tokenId: token.id };
  };
  const { state, tokenId } = setup(3601);
  act(state, view(state).legalCommands.find((command) => command.type === 'cast_permanent' && command.objectId === 'jelly'));
  drain(state);
  act(state, view(state).legalCommands.find((command) => command.type === 'resolve_trigger_target' && command.targetId === tokenId));
  drain(state);
  assert.equal(state.objects.has(tokenId), false, 'token poza polem bitwy przestaje istnieć');
  assert.equal(byInstance(state, 'aura')?.zone, 'graveyard', 'aura bez gospodarza w grobie przed priorytetem');
  assert.equal(state.turn.priorityPlayerId, 'p1');
  const replay = verifyReplay(replayFromState(state), (seed) => setup(seed).state, execute);
  assert.equal(replay.deterministic, true);
  assert.equal(stateFingerprint(replay.state), stateFingerprint(state));
});

test('checkpoint/SBA: poświęcona Saga nie zostawia Feedbacku na polu bitwy', () => {
  const setup = (seed) => {
    const state = base(seed);
    put(state, 'saga', 'rediscover-the-way', 'battlefield');
    addCounter(state, 'saga', 'lore', 2);
    put(state, 'bear', 'highland-game', 'battlefield');
    put(state, 'feedback', 'feedback', 'hand');
    put(state, 'courage', 'courage-in-crisis', 'hand');
    addMana(state, 'p1', 12, { colors: ['U', 'G'] });
    return state;
  };
  const state = setup(3602);
  act(state, view(state).legalCommands.find((command) => command.type === 'cast_permanent'
    && command.objectId === 'feedback' && command.targets?.includes('saga')));
  drain(state);
  assert.equal(byInstance(state, 'feedback')?.attachedTo, 'saga');
  act(state, view(state).legalCommands.find((command) => command.type === 'cast_spell'
    && command.objectId === 'courage' && command.targets?.includes('bear')));
  // Courage in Crisis zawiesza czar na decyzji proliferate po dwóch passach.
  act(state, view(state).legalCommands.find((command) => command.type === 'pass_priority'));
  act(state, view(state).legalCommands.find((command) => command.type === 'pass_priority'));
  act(state, view(state).legalCommands.find((command) => command.type === 'resolve_proliferate' && command.targetIds?.includes('saga')));
  drain(state);
  assert.equal(byInstance(state, 'saga')?.zone, 'graveyard', 'Saga poświęcona po rozdziale III');
  assert.equal(byInstance(state, 'feedback')?.zone, 'graveyard', 'Feedback nie zostaje sierotą na polu bitwy');
  assert.equal(state.turn.priorityPlayerId, 'p1');
  const replay = verifyReplay(replayFromState(state), setup, execute);
  assert.equal(replay.deterministic, true);
  assert.equal(stateFingerprint(replay.state), stateFingerprint(state));
});
