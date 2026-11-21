import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { ABILITY_TYPE, createAbility } from '../src/engine/abilities.js';
import { defineCard, createRegistry } from '../src/cards/registry.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { rulesText } from '../src/table/render.js';

const legalCommands = (state, playerId) => playerView(state, playerId).legalCommands;

function goToStep(state, step, activeId) {
  state.turn = jumpToStep({ ...state.turn, activePlayerId: activeId }, step, activeId);
}

const synDamageLifegainBeast = defineCard({
  id: 'syn-damage-lifegain-beast',
  name: 'Synthetic Grollub',
  set: 'SYN',
  types: ['Creature'],
  subtypes: ['Beast'],
  colors: ['B'],
  manaCost: 3,
  power: 3,
  toughness: 3,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.triggered,
      trigger: { event: 'dealt_damage' },
      effect: [{ type: 'gain_life', scope: 'each_opponent', amountFrom: 'damageAmount' }],
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

const synSelfUnblockableSerpent = defineCard({
  id: 'syn-self-unblockable-serpent',
  name: 'Synthetic Sea Serpent',
  set: 'SYN',
  types: ['Creature'],
  subtypes: ['Serpent'],
  colors: ['U'],
  manaCost: 6,
  power: 4,
  toughness: 6,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.activated,
      cost: { mana: 7, colors: ['U', 'U'] },
      effect: { type: 'cant_be_blocked', applyTo: 'self' },
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

function baseState() {
  const s = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (let i = 1; i <= 15; i += 1) {
    addObject(s, { id: `lib-p1-${i}`, instanceId: `il-1-${i}`, cardId: 'basic-island', controllerId: 'p1', zone: 'library', kind: 'land' });
    addObject(s, { id: `lib-p2-${i}`, instanceId: `il-2-${i}`, cardId: 'basic-island', controllerId: 'p2', zone: 'library', kind: 'land' });
  }
  return s;
}

function addFromDef(state, id, controllerId, def, { tapped = false, summoningSickness = false, zone = 'battlefield' } = {}) {
  const data = gameObjectDataOf(def);
  addObject(state, { ...data, id, instanceId: `inst-${id}`, cardId: def.id, controllerId, zone });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addLand(state, id, controllerId, subtype = 'Island') {
  const color = subtype === 'Mountain' ? 'R' : 'U';
  addObject(state, {
    id,
    instanceId: `inst-${id}`,
    cardId: subtype === 'Mountain' ? 'basic-mountain' : 'basic-island',
    controllerId,
    zone: 'battlefield',
    kind: 'land',
    power: null,
    toughness: null,
    abilities: [createAbility({ type: ABILITY_TYPE.activated, cost: { tap: true }, effect: { type: 'add_mana', colors: [color], amount: 1 } })],
    keywords: [],
    subtypes: [subtype],
    types: ['Basic', 'Land'],
  });
}

function addBolt(state, id, controllerId, amount = 2) {
  addObject(state, {
    id,
    instanceId: `inst-${id}`,
    cardId: 'shock',
    controllerId,
    zone: 'hand',
    kind: 'spell',
    manaCost: 1,
    colors: ['R'],
    types: ['Instant'],
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount }] },
    abilities: [],
    keywords: [],
    subtypes: [],
  });
}

test('2A-1 (gain_life scope: each_opponent + amountFrom: damageAmount): nieśmiertelne obrażenia leczą przeciwnika o tę samą kwotę', () => {
  const state = baseState();
  addFromDef(state, 'beast', 'p1', synDamageLifegainBeast);
  addMana(state, 'p2', 1, { colors: ['R'] });
  addBolt(state, 'shock1', 'p2', 2);

  goToStep(state, 'main1', 'p1');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  const cast = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock1', targets: ['beast'] });
  assert.equal(cast.ok, true, cast.reason);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  // Trigger dealt_damage na stosie — rozstrzygnięcie
  assert.equal(state.zones.stack.length, 1, 'trigger dealt_damage powinien wejść na stos');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  const p1 = state.players.find((p) => p.id === 'p1');
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.life, 22, 'przeciwnik (p2) powinien zyskać 2 życia po 2 obrażeniach w bestię p1');
  assert.equal(p1.life, 20, 'kontroler bestii (p1) nie zyskuje życia');
});

test('2A-2 (gain_life scope: each_opponent + damageAmount): śmiertelne obrażenia w walce nadal leczą przeciwnika (CR 603.10 looks-back)', () => {
  const state = baseState();
  addFromDef(state, 'beast', 'p1', synDamageLifegainBeast);
  addObject(state, {
    id: 'ogre', instanceId: 'i-ogre', cardId: 'highland-game', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 4, toughness: 4,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  state.objects.set('ogre', Object.freeze({ ...state.objects.get('ogre'), summoningSickness: false }));

  goToStep(state, 'declare_attackers', 'p2');
  const atk = execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['ogre'] });
  assert.equal(atk.ok, true, atk.reason);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  const blk = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { ogre: ['beast'] } });
  assert.equal(blk.ok, true, blk.reason);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok, true);
  // Trigger w combat_damage na stosie — rozstrzygnięcie
  assert.equal(state.zones.stack.length, 1, 'trigger dealt_damage po śmierci bestii powinien wejść na stos');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);

  assert.equal(state.objects.get('beast'), undefined, 'stary obiekt beast nie może zostać na polu bitwy po śmierci');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === synDamageLifegainBeast.id), 'bestia powinna trafić na cmentarz');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 24, 'przeciwnik p2 zyskuje 4 życia równe obrażeniom zadanym bestii');
});

test('2A-3 (cant_be_blocked applyTo: self): aktywacja bez celu daje nieblokowalność i chowa drugą ofertę jako no-op', () => {
  const state = baseState();
  addFromDef(state, 'serpent', 'p1', synSelfUnblockableSerpent);
  for (let i = 1; i <= 7; i += 1) addLand(state, `isl-${i}`, 'p1', 'Island');
  addObject(state, {
    id: 'blocker', instanceId: 'i-blocker', cardId: 'highland-game', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 6, toughness: 6,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });

  goToStep(state, 'main1', 'p1');
  const before = legalCommands(state, 'p1').filter((c) => c.type === 'activate_ability' && c.objectId === 'serpent');
  assert.equal(before.length, 1, 'powinna być dokładnie 1 oferta aktywacji self-cant_be_blocked');

  assert.equal(execute(state, before[0]).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  const after = state.objects.get('serpent');
  assert.equal(after.cantBeBlockedUntilTurn, state.turn.number + 1, 'serpent powinien dostać cantBeBlockedUntilTurn');

  // Bezpośrednie wywołanie applyEffect z pustą listą celów przy applyTo: 'self'
  const directState = baseState();
  addFromDef(directState, 'serpent2', 'p1', synSelfUnblockableSerpent);
  applyEffect(directState, { type: 'cant_be_blocked', applyTo: 'self' }, directState.objects.get('serpent2'), []);
  assert.equal(directState.objects.get('serpent2').cantBeBlockedUntilTurn, directState.turn.number + 1, 'applyEffect z applyTo: self nie wymaga targets[0]');

  const repeat = legalCommands(state, 'p1').filter((c) => c.type === 'activate_ability' && c.objectId === 'serpent');
  assert.equal(repeat.length, 0, 'druga aktywacja w tej samej turze powinna być schowana jako no-op');

  // Próba zadeklarowania blokera nie powiedzie się (CR 509.1b)
  goToStep(state, 'declare_attackers', 'p1');
  const atk = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['serpent'] });
  assert.equal(atk.ok, true, atk.reason);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  const blockRes = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { serpent: ['blocker'] } });
  assert.equal(blockRes.ok, false);
  assert.match(blockRes.reason, /cantBeBlocked|nie może być blokowany/i);
});

test('2A-4 (cant_be_blocked applyTo: self — ruling 2019-07-12): aktywacja PO zadeklarowaniu blokerów nie cofa bloku', () => {
  const state = baseState();
  addFromDef(state, 'serpent', 'p1', synSelfUnblockableSerpent);
  for (let i = 1; i <= 7; i += 1) addLand(state, `isl-${i}`, 'p1', 'Island');
  addObject(state, {
    id: 'wall', instanceId: 'i-wall', cardId: 'highland-game', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 0, toughness: 8,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });

  goToStep(state, 'declare_attackers', 'p1');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['serpent'] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { serpent: ['wall'] } }).ok, true);

  // Obrońca (p2) oddaje priorytet w oknie po blokach -> aktywny (p1) aktywuje przed resolve_combat
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  const cmd = legalCommands(state, 'p1').find((c) => c.type === 'activate_ability' && c.objectId === 'serpent');
  assert.ok(cmd, 'aktywacja powinna być legalna w oknie przed rozstrzygnięciem obrażeń');
  assert.equal(execute(state, cmd).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  // Rozstrzygnięcie obrażeń — serpent wciąż zablokowany, p2 nie dostaje obrażeń
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok, true);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 20, 'aktywacja po deklaracji blokerów nie może cofnąć istniejącego bloku');
});

test('2A-5 (render + bot): polskie etykiety bez undefined oraz sensowna wycena self-cant_be_blocked vs pass', () => {
  const glLabel = rulesText(synDamageLifegainBeast);
  assert.doesNotMatch(glLabel, /undefined/);
  assert.match(glLabel, /przeciwnik|każdy przeciwnik/i);

  const cbLabel = rulesText(synSelfUnblockableSerpent);
  assert.doesNotMatch(cbLabel, /undefined/);

  const registry = createRegistry([...createCardRegistry().all(), synDamageLifegainBeast, synSelfUnblockableSerpent]);
  const bot = createHeuristicBot({ seed: 1, registry });
  const preCombat = baseState();
  addFromDef(preCombat, 'serpent', 'p1', synSelfUnblockableSerpent);
  for (let i = 1; i <= 7; i += 1) addLand(preCombat, `isl-${i}`, 'p1', 'Island');
  addObject(preCombat, {
    id: 'wall', instanceId: 'i-wall', cardId: 'highland-game', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 0, toughness: 8,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  goToStep(preCombat, 'beginning_of_combat', 'p1');

  const postCombat = baseState();
  addFromDef(postCombat, 'serpent', 'p1', synSelfUnblockableSerpent);
  for (let i = 1; i <= 7; i += 1) addLand(postCombat, `isl-${i}`, 'p1', 'Island');
  goToStep(postCombat, 'main2', 'p1');

  const postChoice = bot.chooseCommand(playerView(postCombat, 'p1'));
  assert.equal(postChoice.type, 'pass_priority', 'bot nie może aktywować self-cant_be_blocked w main2 po walce');

  const preChoice = bot.chooseCommand(playerView(preCombat, 'p1'));
  assert.equal(preChoice.type, 'activate_ability', 'przed walką przeciwko blokerowi 0/8 bot powinien aktywować nieblokowalność (zamiast 0 przez target=null)');
});
