// Batch 72 (2026-11-06) — collection 635–644. Focused regression coverage for
// card definitions and the three new shared rule paths; no card-name branches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, faceDownAbilities, producibleMana, turnFaceUpManaPurpose } from '../src/engine/resources.js';
import { purposeAllowsSpendOnly } from '../src/engine/mana-restrictions.js';
import { effectivePower } from '../src/engine/permanents.js';
import { blockAssignmentViolation } from '../src/engine/combat.js';
import { processTriggers, triggerConditionHolds, triggerTargetCandidates } from '../src/engine/triggers.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { applyEffect, cardMatchesQualifier } from '../src/engine/effects.js';

const registry = createCardRegistry();
const commands = (state, playerId = 'p1') => playerView(state, playerId).legalCommands;
const definition = (id) => registry.get(id);

function game(seed = 72) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

function addCard(state, id, cardId, zone = 'battlefield', extra = {}) {
  const def = definition(cardId);
  addObject(state, {
    id, instanceId: `instance-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    colors: def.colors ?? [], keywords: def.keywords ?? [], ...extra,
  });
  return state.objects.get(id);
}

function addBasicLand(state, id, controllerId = 'p1') {
  addObject(state, {
    id, instanceId: `instance-${id}`, cardId: 'island', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'land', types: ['Land'], subtypes: ['Island'], colors: ['U'],
  });
}

function resolveStack(state) {
  for (let i = 0; i < 20 && state.zones.stack.length; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((command) => command.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

function tapPeeperForMana(state) {
  const ability = commands(state).find((command) => command.type === 'activate_ability'
    && command.objectId === 'peeper' && command.abilityIndex === 0);
  assert.ok(ability, 'Creeping Peeper mana ability is offered');
  assert.equal(execute(state, ability).ok, true);
  assert.equal(state.players.find((player) => player.id === 'p1').purposeRestrictedPool
    && Object.values(state.players.find((player) => player.id === 'p1').purposeRestrictedPool).reduce((a, b) => a + b, 0), 1);
}

test('Batch 72: all ten card entries match the saved Scryfall snapshots and collection records', () => {
  const expected = [
    ['feral-ridgewolf', 635, 'ISD', 'Wiedźmin'],
    ['creeping-peeper', 636, 'DSK', 'Duskmourn'],
    ['vortex-runner', 637, 'STX', 'Arcavios'],
    ['kraken-hatchling', 638, 'M13', 'Wiedźmin'],
    ['open-the-gates', 639, 'RNA', 'Bloomburrow'],
    ['living-history', 640, 'SOS', 'Arcavios'],
    ['banishing-light', 641, 'EOE', 'Kamigawa'],
    ['pheres-band-centaurs', 642, 'THS', 'Theros'],
    ['shining-aerosaur', 643, 'XLN', 'Ixalan'],
    ['lichs-caress', 644, 'M19', 'Forgotten Realms'],
  ];
  assert.equal(expected.length, 10);
  for (const [id, artId, set, plan] of expected) {
    const card = definition(id);
    const snapshot = JSON.parse(fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8'));
    assert.equal(card.artId, artId, id);
    assert.equal(card.set, set, id);
    assert.equal(card.plan, plan, id);
    assert.equal(card.support?.status, 'supported', id);
    assert.deepEqual(card.support?.limitations, [], id);
    assert.equal(card.name, snapshot.name, `${id} snapshot name`);
  }
  assert.deepEqual(definition('token_spirit_red_white').colors, ['R', 'W']);
});

test('Feral Ridgewolf uses the existing paid pump ability; vanilla and flying cards retain their printed characteristics', () => {
  const state = game();
  const wolf = addCard(state, 'ridgewolf', 'feral-ridgewolf');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const pump = commands(state).find((command) => command.type === 'activate_ability'
    && command.objectId === 'ridgewolf' && command.abilityIndex === 0);
  assert.ok(pump, '{1}{R} pump is offered when payable');
  assert.equal(execute(state, pump).ok, true);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('ridgewolf'), state), 3);
  assert.deepEqual([definition('kraken-hatchling').power, definition('kraken-hatchling').toughness], [0, 4]);
  assert.deepEqual([definition('pheres-band-centaurs').power, definition('pheres-band-centaurs').toughness], [3, 7]);
  assert.ok(definition('shining-aerosaur').keywords.includes('flying'));
});

test('Open the Gates accepts basic lands or Gates, and rejects unrelated lands', () => {
  const qualifier = definition('open-the-gates').spell.effects[0].qualifier;
  assert.equal(cardMatchesQualifier(definition('plains'), qualifier), true);
  assert.equal(cardMatchesQualifier(definition('dimir-guildgate'), qualifier), true);
  assert.equal(cardMatchesQualifier(definition('forest'), qualifier), true);
  assert.equal(cardMatchesQualifier({ kind: 'land', types: ['Land'], subtypes: ['Tower'], manaCost: 1 }, qualifier), false);
});

test('Banishing Light trigger targets only an opponent nonland permanent and creates linked exile', () => {
  const state = game();
  const source = addCard(state, 'banishing-light', 'banishing-light');
  const own = addCard(state, 'own-creature', 'kraken-hatchling');
  const foeDef = definition('kraken-hatchling');
  addObject(state, {
    id: 'foe-creature', instanceId: 'instance-foe-creature', cardId: foeDef.id,
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    ...gameObjectDataOf(foeDef), types: foeDef.types, subtypes: foeDef.subtypes,
    colors: foeDef.colors, keywords: foeDef.keywords,
  });
  addObject(state, {
    id: 'foe-land', instanceId: 'instance-foe-land', cardId: 'forest',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'land',
    types: ['Land'], subtypes: ['Forest'], colors: ['G'],
  });
  const ability = definition('banishing-light').abilities[0];
  const candidates = triggerTargetCandidates(state, ability.trigger.requiresTarget, source);
  assert.deepEqual(candidates, ['foe-creature']);
  assert.ok(!candidates.includes(own.id) && !candidates.includes('foe-land'));
  applyEffect(state, ability.effect, source, ['foe-creature']);
  assert.ok(state.zones.exile.some((id) => state.objects.get(id)?.cardId === 'kraken-hatchling'
    && state.objects.get(id)?.temporaryExile?.byCardId === source.cardId));
});

test('Lich’s Caress destroys the targeted creature and gains three life on resolution', () => {
  const state = game();
  const spell = addCard(state, 'lichs-caress', 'lichs-caress', 'hand');
  addObject(state, {
    id: 'target', instanceId: 'instance-target', cardId: 'thornhide-wolves',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature',
    types: ['Creature'], power: 4, toughness: 4, colors: ['G'],
  });
  addMana(state, 'p1', 5, { colors: ['B'] });
  const cast = commands(state).find((command) => command.type === 'cast_spell'
    && command.objectId === spell.id && command.targets?.[0] === 'target');
  assert.ok(cast, 'sorcery has an offer with a legal creature target');
  assert.equal(execute(state, cast).ok, true);
  resolveStack(state);
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'thornhide-wolves'));
  assert.equal(state.players.find((player) => player.id === 'p1').life, 23);
});

test('Creeping Peeper mana can cast an enchantment, but cannot cast an ordinary sorcery', () => {
  const state = game();
  addCard(state, 'peeper', 'creeping-peeper');
  addCard(state, 'living', 'living-history', 'hand');
  const ordinarySorcery = {
    id: 'batch72-ordinary-sorcery', name: 'Ordinary Sorcery', set: 'TST',
    types: ['Sorcery'], colors: ['R'], manaCost: 2,
    spell: { timing: 'sorcery', targets: [], effects: [{ type: 'gain_life', amount: 1 }] },
  };
  addObject(state, {
    id: 'ordinary', instanceId: 'instance-ordinary', cardId: ordinarySorcery.id,
    controllerId: 'p1', ownerId: 'p1', zone: 'hand', kind: 'spell',
    ...gameObjectDataOf(ordinarySorcery), types: ordinarySorcery.types, spell: ordinarySorcery.spell,
  });
  addMana(state, 'p1', 1, { colors: ['R'] });
  tapPeeperForMana(state);

  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((command) => command.type === 'cast_permanent'
    && command.objectId === 'living'), 'the {R} pool unit plus purpose-restricted {U} casts the enchantment');
  assert.ok(!view.legalCommands.some((command) => command.objectId === 'ordinary'
    && ['cast_spell', 'cast_permanent'].includes(command.type)), 'the same restricted unit cannot cast a sorcery');

  const cast = view.legalCommands.find((command) => command.type === 'cast_permanent' && command.objectId === 'living');
  assert.equal(execute(state, cast).ok, true);
  assert.ok([...state.objects.values()].some((object) => object.cardId === 'living-history' && object.zone === 'stack'));
});

test('Creeping Peeper restriction recognizes all printed purposes, including the generic door purpose', () => {
  const state = game();
  addCard(state, 'peeper', 'creeping-peeper');
  tapPeeperForMana(state);
  const peeperEffect = definition('creeping-peeper').abilities[0].effect;
  assert.equal(purposeAllowsSpendOnly(peeperEffect.spendOnly, { castingSpell: true, enchantmentSpell: true }), true);
  assert.equal(purposeAllowsSpendOnly(peeperEffect.spendOnly, { castingSpell: true, enchantmentSpell: false }), false);
  assert.equal(purposeAllowsSpendOnly(peeperEffect.spendOnly, turnFaceUpManaPurpose()), true);
  assert.equal(purposeAllowsSpendOnly(peeperEffect.spendOnly, { unlockDoor: true }), true);
  assert.equal(producibleMana(state, 'p1'), 0, 'purpose mana is not available for an ordinary ability cost');
  assert.equal(producibleMana(state, 'p1', null, { unlockDoor: true }), 1);
});

test('Creeping Peeper mana pays the direct manifest face-up action and is consumed', () => {
  const state = game();
  addCard(state, 'peeper', 'creeping-peeper');
  const covered = addCard(state, 'manifested-kraken', 'kraken-hatchling', 'battlefield', {
    manifestReady: true, manifestTurnUpCost: 1,
    kind: 'creature', power: 2, toughness: 2, abilities: [],
  });
  state.objects.set(covered.id, Object.freeze({ ...covered, faceDown: true }));
  tapPeeperForMana(state);
  const offer = commands(state).find((command) => command.type === 'turn_manifest_face_up'
    && command.objectId === covered.id);
  assert.ok(offer, 'manifest offer includes Peeper mana for the turn-face-up purpose');
  assert.equal(execute(state, offer).ok, true);
  assert.equal(state.objects.get(covered.id).faceDown, false);
  assert.equal(Object.values(state.players.find((player) => player.id === 'p1').purposeRestrictedPool)
    .reduce((a, b) => a + b, 0), 0);
});

test('Creeping Peeper mana pays the direct cloak face-up action', () => {
  const state = game();
  addCard(state, 'peeper', 'creeping-peeper');
  const covered = addCard(state, 'cloaked-kraken', 'kraken-hatchling', 'battlefield', {
    kind: 'creature', power: 2, toughness: 2, abilities: [],
  });
  state.objects.set(covered.id, Object.freeze({
    ...covered, faceDown: true, cloakReady: true, cloakTurnUpCost: 1,
  }));
  tapPeeperForMana(state);
  const offer = commands(state).find((command) => command.type === 'turn_cloak_face_up'
    && command.objectId === covered.id);
  assert.ok(offer, 'cloak offer includes Peeper mana for the turn-face-up purpose');
  assert.equal(execute(state, offer).ok, true);
  assert.equal(state.objects.get(covered.id).faceDown, false);
  assert.equal(Object.values(state.players.find((player) => player.id === 'p1').purposeRestrictedPool)
    .reduce((a, b) => a + b, 0), 0);
});

test('Creeping Peeper mana pays the generic morph turn_face_up ability', () => {
  const state = game();
  addCard(state, 'peeper', 'creeping-peeper');
  const flockDef = definition('monastery-flock');
  const faceDownObject = {
    ...gameObjectDataOf(flockDef), cardId: flockDef.id, id: 'morph-flock',
    faceDown: true, kind: 'creature', power: 2, toughness: 2,
    morph: flockDef.morph,
  };
  faceDownObject.abilities = faceDownAbilities(faceDownObject);
  const { faceDown: _faceDown, ...morphObjectData } = faceDownObject;
  addObject(state, {
    ...morphObjectData, instanceId: 'instance-morph-flock', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
  });
  state.objects.set('morph-flock', Object.freeze({ ...state.objects.get('morph-flock'), faceDown: true }));
  tapPeeperForMana(state);
  const offer = commands(state).find((command) => command.type === 'activate_ability'
    && command.objectId === 'morph-flock' && command.abilityIndex === 0);
  assert.ok(offer, 'generic morph ability recognizes turn-face-up payment purpose');
  assert.equal(execute(state, offer).ok, true);
  assert.equal(state.objects.get('morph-flock').faceDown, false);
  assert.equal(Object.values(state.players.find((player) => player.id === 'p1').purposeRestrictedPool)
    .reduce((a, b) => a + b, 0), 0);
});

test('Vortex Runner evasion and bonus power switch live at the eight-land threshold', () => {
  const state = game();
  const runner = addCard(state, 'runner', 'vortex-runner');
  const blockerDef = {
    id: 'batch72-blocker', name: 'Blocker', set: 'TST', types: ['Creature'], colors: [],
    power: 2, toughness: 2, manaCost: 0,
  };
  addObject(state, {
    id: 'blocker', instanceId: 'instance-blocker', cardId: blockerDef.id,
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature',
    types: blockerDef.types, power: 2, toughness: 2,
  });
  for (let i = 0; i < 7; i += 1) addBasicLand(state, `land-${i}`);
  assert.equal(effectivePower(runner, state), 2);
  assert.equal(blockAssignmentViolation(state, runner, ['blocker']), null);
  addBasicLand(state, 'land-7');
  assert.equal(effectivePower(runner, state), 3);
  assert.notEqual(blockAssignmentViolation(state, runner, ['blocker']), null);
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'land-0');
  state.objects.delete('land-0');
  assert.equal(effectivePower(runner, state), 2);
  assert.equal(blockAssignmentViolation(state, runner, ['blocker']), null);
});

test('Living History trigger checks the per-turn graveyard departure fact at trigger time', () => {
  const state = game();
  const history = addCard(state, 'history', 'living-history');
  addCard(state, 'attacker', 'kraken-hatchling');
  const graveCard = addCard(state, 'grave-card', 'kraken-hatchling', 'graveyard');
  const trigger = definition('living-history').abilities[1];
  assert.equal(triggerConditionHolds(state, trigger, history), false);

  // The shared zone-movement choke point sets the fact for a real card.
  moveObjectDirectly(state, graveCard.id, 'hand', 'returned-card');
  assert.equal(state.cardsLeftGraveyardThisTurn.p1, true);
  assert.equal(triggerConditionHolds(state, trigger, history), true);

  // The event scan sees an enchantment's "attacks you control" trigger and
  // queues it with a legal attacking-creature target.
  state.combat = {
    attackers: ['attacker'], blockers: new Map(), blockedAttackers: [], attackingPlayerId: 'p1',
  };
  const triggerEvents = processTriggers(state, [{
    type: 'attackers_declared', playerId: 'p1', attackerIds: ['attacker'],
  }]);
  assert.ok(triggerEvents.some((event) => event.type === 'ability_triggered'
    && event.trigger === 'attacks_you_control'), 'qualifying attack queues Living History trigger');
  // Intervening-if condition is rechecked when the trigger resolves.
  state.cardsLeftGraveyardThisTurn = {};
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('attacker'), state), 0,
    'if the per-turn condition no longer holds, the queued trigger has no effect');

  // Tokens are not cards (CR 108.2b), so moving one out of the graveyard does
  // not create the fact by itself.
  state.combat = null;
  state.cardsLeftGraveyardThisTurn = {};
  addObject(state, {
    id: 'grave-token', instanceId: 'instance-grave-token', cardId: 'token_spirit_red_white',
    controllerId: 'p1', ownerId: 'p1', zone: 'graveyard', kind: 'creature',
    types: ['Creature'], colors: ['R', 'W'], power: 2, toughness: 2,
  });
  state.objects.set('grave-token', Object.freeze({ ...state.objects.get('grave-token'), isToken: true }));
  moveObjectDirectly(state, 'grave-token', 'exile', 'exiled-token');
  assert.deepEqual(state.cardsLeftGraveyardThisTurn, {});
});
