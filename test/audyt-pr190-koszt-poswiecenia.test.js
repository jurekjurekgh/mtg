import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { createAbility, ABILITY_TYPE } from '../src/engine/abilities.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

// Oracle Malevolent Noble: "{2}, Sacrifice an artifact or another creature:
// Put a +1/+1 counter on this creature." https://api.scryfall.com/cards/eld/95
// CR 205.2b: "Some objects have more than one card type (for example, an
// artifact creature). Such objects satisfy the criteria for any effect that
// applies to any of their card types." https://mtg.fandom.com/wiki/Card_type
// CR 701.21a: "To sacrifice a permanent, its controller moves it from the
// battlefield directly to its owner’s graveyard." https://mtg.fandom.com/wiki/Sacrifice
const registry = createCardRegistry();
function setup() {
  const state = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}
function putCard(state, id, cardId, player = 'p1') {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: player, registry });
  const { id: _id, instanceId, cardId: _cardId, ownerId, controllerId, zone, objectId, ...rest } = entry;
  addObject(state, { ...rest, id, instanceId: `instance-${id}`, cardId, ownerId: player, controllerId: player, zone: 'battlefield' });
}
function putSynthetic(state, { id, types = ['Creature'], cost, player = 'p1' }) {
  addObject(state, {
    id, instanceId: `instance-${id}`, cardId: `synthetic-${id}`, name: id,
    ownerId: player, controllerId: player, zone: 'battlefield', kind: 'creature',
    types, power: 2, toughness: 2,
    abilities: [createAbility({ type: ABILITY_TYPE.activated, cost,
      effect: { type: 'gain_life', amount: 1 } })],
  });
}
function offers(state, id) {
  return playerView(state, 'p1').legalCommands.filter(c => c.type === 'activate_ability' && c.objectId === id);
}
function resolve(state) {
  for (let i = 0; i < 12 && state.zones.stack.length; i++) {
    const p = state.turn.priorityPlayerId;
    const commands = playerView(state, p).legalCommands;
    const command = commands.find(c => c.type.startsWith('resolve_')) ?? commands.find(c => c.type === 'pass_priority');
    assert.ok(command, 'można kontynuować rozstrzyganie');
    const result = execute(state, command);
    assert.equal(result.ok, true, result.reason);
  }
  assert.equal(state.zones.stack.length, 0);
}

test('Noble: artefakt-ląd to legalny koszt, a nie jest nim ląd przeciwnika', () => {
  const state = setup();
  putCard(state, 'noble', 'malevolent-noble');
  putCard(state, 'vault', 'vault-of-whispers');
  putCard(state, 'foe', 'great-furnace', 'p2');
  addMana(state, 'p1', 2);
  const act = offers(state, 'noble').find(c => c.sacrificeCreatureId === 'vault');
  assert.ok(act, 'oferta obejmuje własny Artifact Land');
  assert.ok(!offers(state, 'noble').some(c => ['noble', 'foe'].includes(c.sacrificeCreatureId)));
  const result = execute(state, act);
  assert.equal(result.ok, true, result.reason);
  assert.ok([...state.objects.values()].some(o => o.cardId === 'vault-of-whispers' && o.zone === 'graveyard'));
  resolve(state);
  assert.equal(state.objects.get('noble').counters['+1/+1'], 1);
});

test('Koszt poświęć stwora bez another może wybrać źródło', () => {
  const state = setup();
  putSynthetic(state, { id: 'source', cost: { sacrificeCreature: true } });
  const act = offers(state, 'source').find(c => c.sacrificeCreatureId === 'source');
  assert.ok(act, 'źródło jest własnym stworem');
  const result = execute(state, act);
  assert.equal(result.ok, true, result.reason);
  assert.ok([...state.objects.values()].some(o => o.cardId === 'synthetic-source' && o.zone === 'graveyard'));
  resolve(state);
  assert.equal(state.players.find(p => p.id === 'p1').life, 21);
});

test('Koszt another nie dopuszcza źródła, ale dopuszcza innego stwora', () => {
  const state = setup();
  putSynthetic(state, { id: 'source', cost: { sacrificeCreature: { another: true } } });
  putCard(state, 'other', 'battle-hurda');
  assert.deepEqual(offers(state, 'source').map(c => c.sacrificeCreatureId), ['other']);
});

test('Artifact or another creature: źródło będące artefaktem może być poświęcone jako artefakt', () => {
  const state = setup();
  putSynthetic(state, { id: 'source', types: ['Artifact', 'Creature'], cost: { sacrificeCreature: { artifactOrAnother: true } } });
  const act = offers(state, 'source').find(c => c.sacrificeCreatureId === 'source');
  assert.ok(act, 'another kwalifikuje creature, nie artifact');
  const result = execute(state, act);
  assert.equal(result.ok, true, result.reason);
  resolve(state);
  assert.equal(state.players.find(p => p.id === 'p1').life, 21);
});
