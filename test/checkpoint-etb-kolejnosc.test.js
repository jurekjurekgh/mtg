// ADR 0032 / CR 603.3b: wspólny checkpoint nie jest ograniczony do śmierci.
// Dwa wyzwalacze wejścia na pole bitwy jednego kontrolera muszą dać wybór
// kolejności, a wybrana kolejność musi trafić na stos i do replayu.
//
// Oracle (lokalne snapshoty Scryfall):
//  • Impact Tremors: „Whenever a creature you control enters, this enchantment
//    deals 1 damage to each opponent.”
//  • Loporrit Scout: „Whenever another creature you control enters, this
//    creature gets +1/+1 until end of turn.”
//  • Weftblade Enhancer: „When this creature enters, put a +1/+1 counter on
//    each of up to two target creatures.”
//  • Inferno Titan: „When this creature enters, it deals 3 damage divided as
//    you choose among one, two, or three targets.”
// CR 603.3b (przypięty CR, SHA-256 8d860e45…b070ca): „…in any order they
// choose.” CR 603.3d: cele ogłaszamy przy umieszczaniu na stosie.
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

function scene(seed, { hand = [], battlefield = [], opponentBattlefield = [] } = {}) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  for (const [index, cardId] of battlefield.entries()) put(state, `bf-${index}`, cardId, 'battlefield', 'p1');
  for (const [index, cardId] of opponentBattlefield.entries()) put(state, `opp-${index}`, cardId, 'battlefield', 'p2');
  for (const [index, cardId] of hand.entries()) put(state, `hand-${index}`, cardId, 'hand', 'p1');
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
const cast = (state, objectId) => act(state, view(state).legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === objectId));
const orderChoices = (state) => view(state).legalCommands.filter((c) => c.type === 'resolve_trigger_order');
const stackCards = (state) => state.zones.stack.map((id) => state.objects.get(id)).filter((o) => o?.kind === 'trigger').map((o) => o.cardId);

function resolveSpellToEtb(state, objectId) {
  cast(state, objectId);
  pass(state);
  pass(state);
}

test('checkpoint/ETB: dwa wyzwalacze jednego kontrolera wymagają wyboru kolejności (CR 603.3b)', () => {
  const create = (seed) => scene(seed, { hand: ['highland-game'], battlefield: ['impact-tremors', 'loporrit-scout'] });
  const state = create(3201);
  resolveSpellToEtb(state, 'hand-0');
  const choices = orderChoices(state);
  assert.deepEqual(choices.map((c) => c.cardId).sort(), ['impact-tremors', 'loporrit-scout']);
  act(state, choices.find((c) => c.cardId === 'loporrit-scout'));
  assert.deepEqual(stackCards(state), ['impact-tremors', 'loporrit-scout']);

  const replay = verifyReplay(replayFromState(state), create, (s, cmd) => execute(s, cmd));
  assert.equal(replay.deterministic, true);
  assert.deepEqual(stackCards(replay.state), ['impact-tremors', 'loporrit-scout']);
});

test('checkpoint/ETB: cel wielokrotny „up to two” należy do tej samej partii (CR 603.3b–d)', () => {
  const state = scene(3202, { hand: ['weftblade-enhancer'], battlefield: ['impact-tremors', 'highland-game'] });
  resolveSpellToEtb(state, 'hand-0');
  const choices = orderChoices(state);
  assert.deepEqual(choices.map((c) => c.cardId).sort(), ['impact-tremors', 'weftblade-enhancer']);
  act(state, choices.find((c) => c.cardId === 'impact-tremors'));
  const targetCmd = view(state).legalCommands.find((c) => c.type === 'resolve_trigger_target');
  assert.ok(targetCmd, 'czekamy na cel Weftblade Enhancer');
  const creatures = state.zones.battlefield.map((id) => state.objects.get(id))
    .filter((o) => o?.controllerId === 'p1' && o.kind === 'creature').map((o) => o.id);
  assert.ok(creatures.length >= 2);
  const chosen = creatures.slice(0, 2);
  act(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: chosen });
  assert.deepEqual(stackCards(state), ['weftblade-enhancer', 'impact-tremors']);
  const weft = state.objects.get(state.zones.stack[0]);
  assert.deepEqual([...weft.triggerEntry.targets], chosen);
});

test('checkpoint/ETB: podział obrażeń Inferno Titan zamyka ogłoszenie przed kolejną partią (CR 603.3d)', () => {
  const state = scene(3203, { hand: ['inferno-titan'], battlefield: ['impact-tremors', 'highland-game'] });
  resolveSpellToEtb(state, 'hand-0');
  const choices = orderChoices(state);
  assert.deepEqual(choices.map((c) => c.cardId).sort(), ['impact-tremors', 'inferno-titan']);
  act(state, choices.find((c) => c.cardId === 'inferno-titan'));
  act(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['p2', 'bf-1'] });
  const division = view(state).legalCommands.find((c) => c.type === 'resolve_damage_division');
  assert.ok(division, 'czekamy na podział obrażeń');
  act(state, { type: 'resolve_damage_division', playerId: 'p1', amounts: [2, 1] });
  assert.deepEqual(stackCards(state), ['impact-tremors', 'inferno-titan']);
  const titan = state.objects.get(state.zones.stack.at(-1));
  assert.deepEqual([...titan.triggerEntry.damageDivision], [2, 1]);
});
