import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { legalActivatedAbilities } from '../src/engine/abilities.js';
import { clearStatModifiers, goadUntilNextTurn } from '../src/engine/permanents.js';
import { applyEffect } from '../src/engine/effects.js';

// =============================================================================
// Srebrna odznaka „wyłapywacz błędów" (sesja 2026-08-08, M56) — 5 błędów vs
// zasady MtG znalezionych w przeglądzie istniejących kart i mechanik:
//   1. Goad (CR 701.38c) — wygasał w cleanup TEJ SAMEJ tury zamiast trwać
//      do początku NASTĘPNEJ tury goadującego (pokoje lochu Forge/Arena).
//   2. Aury (CR 702.11b) — czar aury nie respektował hexproof przeciwnika.
//   3. Lifelink (CR 702.15) — obrażenia NIEcombat nie dawały zysku życia
//      (damage_each_opponent / damage_defending_player / aury Curse/Feedback).
//   4. Prewencja (CR 615) — Curse of the Pierced Heart ignorowała tarcze
//      (damage_enchanted_player bez preventDamageTo).
//   5. Zdarzenie damage_dealt (CR 119.3) — niosło kwotę PRZED prewencją;
//      delirium (Fear of Burning Alive „deals that much damage") przeszacowywało
//      obrażenia, gdy część została zapobiegnięta.
// =============================================================================

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  // M101/A (CR 504.1): dobranie w kroku dobierania jest akcją turową, więc
  // testy przechodzące przez kolejne tury potrzebują niepustych bibliotek —
  // inaczej partia kończy się deck-outem (CR 104.3c).
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 20; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `il-${pid}-${i}`, cardId: 'x-library',
        controllerId: pid, ownerId: pid, zone: 'library',
      });
    }
  }
  return state;
}

function addCreature(state, id, ctrl, p, t, { types = ['Creature'], keywords = [], colors = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId: ctrl, zone: 'battlefield',
    kind: 'creature', power: p, toughness: t, manaCost: 2, abilities: [], keywords,
    subtypes: [], types, colors, summoningSickness: false,
  });
}

function addCardFromRegistry(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name, aura: def.aura ?? null,
  });
}

function passToNextTurn(state, changes) {
  let turns = 0;
  for (let i = 0; i < 120 && turns < changes; i += 1) {
    const before = state.turn.number;
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
    if (state.turn.number !== before) turns += 1;
  }
  return turns === changes;
}

// ---------------------------------------------------------------- 1. Goad

test('B1: goad trwa do NASTĘPNEJ tury goadującego (CR 701.38c), nie do cleanup', () => {
  const state = newState();
  addCreature(state, 'cre', 'p2', 2, 2);
  goadUntilNextTurn(state, 'cre', 'p1');
  // cleanup TEJ SAMEJ tury NIE zdejmuje goadu (poprzednio zdejmował).
  clearStatModifiers(state);
  assert.equal(state.objects.get('cre').goaded, true, 'goad po cleanup');
  // w turze przeciwnika (1 zmiana tury) goad nadal aktywny — stwór MUSI atakować.
  assert.ok(passToNextTurn(state, 1), 'przejście do tury p2');
  assert.equal(state.objects.get('cre').goaded, true, 'goad w turze przeciwnika');
  // na początku tury goadującego (2. zmiana) goad wygasa.
  assert.ok(passToNextTurn(state, 1), 'przejście do tury p1');
  assert.equal(state.objects.get('cre').goaded, false, 'goad wygasa na starcie tury goadującego');
});

// ---------------------------------------------------------------- 2. Aura hexproof

test('B2: czar aury nie może zaczarować cudzego permanenta z hexproof (CR 702.11b)', () => {
  const state = newState();
  addCreature(state, 'hex', 'p2', 2, 2);
  state.objects.set('hex', Object.freeze({ ...state.objects.get('hex'), hexproofUntilTurn: state.turn.number + 2 }));
  addCardFromRegistry(state, 'serra', 'serras-embrace', 'p1', 'hand');
  state.players[0].mana = 4;
  state.players[0].manaPool = { W: 2 };
  const v = playerView(state, 'p1');
  const offersHex = v.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'serra' && c.targets?.[0] === 'hex');
  assert.equal(offersHex.length, 0, 'oferta aury nie zawiera stwora z hexproof');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'serra', targets: ['hex'] });
  assert.equal(r.ok, false, 'rzut aury na hexproof odrzucony');
  // zwykły stwór bez hexproof — nadal legalny cel
  addCreature(state, 'plain', 'p2', 2, 2);
  const r2 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'serra', targets: ['plain'] });
  assert.equal(r2.ok, true, 'rzut aury na zwykłego stwora działa');
});

// ---------------------------------------------------------------- 3. Lifelink niecombat

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 100) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

test('B3: lifelink źródła daje zysk przy obrażeniach NIEcombat (CR 702.15)', () => {
  const state = newState();
  addObject(state, {
    id: 'welder', instanceId: 'i-w', cardId: 'welder-automaton', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 1, manaCost: 2, abilities: REGISTRY.get('welder-automaton').abilities,
    keywords: ['lifelink'], subtypes: ['Construct'], types: ['Artifact', 'Creature'], colors: [], summoningSickness: false,
  });
  state.players[0].mana = 4;
  state.players[0].manaPool = { R: 1 };
  const p1life = state.players[0].life;
  const offers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'welder');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'welder', abilityIndex: offers[0].abilityIndex });
  assert.equal(r.ok, true);
  resolveStack(state); // D: zdolność na stosie → obrażenia po rozstrzygnięciu
  assert.equal(state.players[1].life, 19, 'przeciwnik traci 1');
  assert.equal(state.players[0].life, p1life + 1, 'lifelink: +1 życia (damage_each_opponent)');
});

// ---------------------------------------------------------------- 4. Curse prevention

test('B4: Curse of the Pierced Heart respektuje tarcze prewencji (CR 615)', () => {
  const state = newState();
  addObject(state, {
    id: 'curse', instanceId: 'i-c', cardId: 'curse-of-the-pierced-heart', controllerId: 'p1', zone: 'battlefield',
    kind: 'enchantment', power: null, toughness: null, manaCost: 2, abilities: REGISTRY.get('curse-of-the-pierced-heart').abilities,
    keywords: [], subtypes: [], types: ['Enchantment'], colors: ['R'], enchantPlayer: true,
  });
  state.objects.set('curse', Object.freeze({ ...state.objects.get('curse'), enchantedPlayerId: 'p2' }));
  state.damageShields = [{ targetId: 'p2', remaining: 3, sourceCardId: 'withstand' }];
  applyEffect(state, { type: 'damage_enchanted_player', amount: 1 }, state.objects.get('curse'), []);
  assert.equal(state.players[1].life, 20, 'tarcza Withstand pochłania obrażenia Curse');
  // bez tarczy — zadaje
  const st2 = newState();
  addObject(st2, {
    id: 'curse', instanceId: 'i-c', cardId: 'curse-of-the-pierced-heart', controllerId: 'p1', zone: 'battlefield',
    kind: 'enchantment', power: null, toughness: null, manaCost: 2, abilities: REGISTRY.get('curse-of-the-pierced-heart').abilities,
    keywords: [], subtypes: [], types: ['Enchantment'], colors: ['R'], enchantPlayer: true,
  });
  st2.objects.set('curse', Object.freeze({ ...st2.objects.get('curse'), enchantedPlayerId: 'p2' }));
  applyEffect(st2, { type: 'damage_enchanted_player', amount: 1 }, st2.objects.get('curse'), []);
  assert.equal(st2.players[1].life, 19, 'bez tarczy Curse zadaje 1');
});

// ---------------------------------------------------------------- 5. Event amount

test('B5: damage_dealt niesie kwotę ZADANĄ (po prewencji) — delirium nie przeszacowuje', () => {
  const state = newState();
  state.damageShields = [{ targetId: 'p2', remaining: 3, sourceCardId: 'withstand' }];
  const before = state.events.length;
  applyEffect(state, { type: 'damage_each_opponent', amount: 4 }, Object.freeze({ id: 'fear', controllerId: 'p1', cardId: 'fear-of-burning-alive' }), []);
  const dmg = state.events.slice(before).find((e) => e.type === 'damage_dealt');
  assert.equal(dmg?.amount, 1, 'event niesie kwotę po prewencji (z 4 zapobiegnięto 3)');
  assert.equal(state.players[1].life, 19, 'gracz traci tylko 1');
  // lifelink + prewencja: zysk życia tylko od obrażeń ZADANYCH
  const st2 = newState();
  addObject(st2, {
    id: 'welder', instanceId: 'i-w', cardId: 'welder-automaton', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 1, manaCost: 2, abilities: REGISTRY.get('welder-automaton').abilities,
    keywords: ['lifelink'], subtypes: ['Construct'], types: ['Artifact', 'Creature'], colors: [], summoningSickness: false,
  });
  st2.damageShields = [{ targetId: 'p2', remaining: 3, sourceCardId: 'withstand' }];
  const p1b = st2.players[0].life;
  applyEffect(st2, { type: 'damage_each_opponent', amount: 1 }, st2.objects.get('welder'), []);
  assert.equal(st2.players[1].life, 20, '1 zapobiegnięte — gracz bez straty');
  assert.equal(st2.players[0].life, p1b, 'lifelink 0 (nic nie doszło)');
});
