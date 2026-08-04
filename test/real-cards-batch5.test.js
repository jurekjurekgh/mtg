import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Piąty batch realnych kart (ADR 0010): Midnight Guard (DKA — trigger
 * „another creature enters → untap this creature"), Holdout Settlement
 * (OGW — land: {T}: Add {C} + {T}, Tap an untapped creature you control:
 * Add one mana of any color), Skyclave Geopede (ZNR — trample + Landfall:
 * +2/+2 do końca tury przy wejściu własnego landa).
 * Dane Oracle: docs/cards/. Zasada właściciela: karty kodowane w 100%
 * mechanik (brak limitations na mechanikach karty).
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  return state;
}

/** Dodaje realną kartę jak materializacja (pełne pola z definicji). */
function addRealCard(state, id, cardId, controllerId, zone, { tapped = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    entersWithCounters: data.entersWithCounters ?? def.entersWithCounters ?? null,
    types: def.types ?? [], entersTapped: def.entersTapped ?? false,
    bestow: def.bestow ?? null, aura: def.aura ?? null,
    equipment: def.equipment ?? null, backup: def.backup ?? null,
  });
  const object = state.objects.get(id);
  if (tapped) state.objects.set(id, Object.freeze({ ...object, tapped: true }));
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, keywords = [], tapped = false, summoningSickness = true } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-razorback', controllerId, zone: 'battlefield', kind: 'creature',
    power, toughness, abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function findOnBattlefield(state, cardId, controllerId = null) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === 'battlefield' && (controllerId === null || o.controllerId === controllerId));
}

function passBoth(state, first = 'p1') {
  const second = first === 'p1' ? 'p2' : 'p1';
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: second }).ok);
}

// --- Midnight Guard: trigger odkręcania ------------------------------------

test('Midnight Guard: materializacja — 2/3, trigger another_creature_enters → untap', () => {
  const state = game();
  const guard = addRealCard(state, 'guard', 'midnight-guard', 'p1', 'battlefield', { tapped: true });
  assert.equal(guard.power, 2);
  assert.equal(guard.toughness, 3);
  assert.equal(guard.tapped, true);
  const trigger = guard.abilities.find((a) => a.trigger?.event === 'another_creature_enters');
  assert.ok(trigger, 'Midnight Guard ma trigger another_creature_enters');
  assert.deepEqual(trigger.effect, { type: 'untap_permanent' });
});

test('Midnight Guard: wejście INNEGO stworzenia odkręca tapniętego Guarda', () => {
  const state = mainPhase(game());
  addRealCard(state, 'guard', 'midnight-guard', 'p1', 'battlefield', { tapped: true });
  // p1 zagrywa stwora z ręki — Guard (tapnięty) powinien się odkręcić.
  addRealCard(state, 'hand-other', 'skyclave-geopede', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hand-other' });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  const guard = state.objects.get('guard');
  assert.equal(guard.tapped, false, 'trigger odkręca Guarda po wejściu innego stworzenia');
  assert.ok(result.events.some((e) => e.type === 'object_untapped' && e.objectId === 'guard'), 'log ma object_untapped dla Guarda');
});

test('Midnight Guard: wejście landa NIE odkręca (tylko stwory)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'guard', 'midnight-guard', 'p1', 'battlefield', { tapped: true });
  addRealCard(state, 'hand-land', 'holdout-settlement', 'p1', 'hand');
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'hand-land' });
  assert.ok(result.ok);
  assert.equal(state.objects.get('guard').tapped, true, 'land nie wyzwala triggera');
});

// --- Holdout Settlement: {T} + tap stwora = mana ---------------------------

test('Holdout Settlement: aktywacja {T}+tap stwora dodaje manę i tapuje oba', () => {
  const state = mainPhase(game());
  const settlement = addRealCard(state, 'hold', 'holdout-settlement', 'p1', 'battlefield');
  addSimpleCreature(state, 'dork', 'p1', { summoningSickness: false });
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'hold');
  assert.ok(cmd, 'widok oferuje aktywację Holdout Settlement');
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'hold', abilityIndex: 0 });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.equal(state.players[0].mana, 1, 'mana dodana do puli');
  assert.equal(state.objects.get('hold').tapped, true, 'land zatapiany jako koszt');
  assert.equal(state.objects.get('dork').tapped, true, 'stwór zatapiany jako dodatkowy koszt');
});

test('Holdout Settlement: bez nietapniętego stwora zdolność jest niedostępna', () => {
  const state = mainPhase(game());
  addRealCard(state, 'hold', 'holdout-settlement', 'p1', 'battlefield');
  addSimpleCreature(state, 'dork', 'p1', { tapped: true, summoningSickness: false });
  const view = playerView(state, 'p1');
  const cmds = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'hold');
  assert.equal(cmds.length, 0, 'brak nietapniętego stwora → brak aktywacji');
});

test('Holdout Settlement: zwykłe {T}: Add {C} nadal działa (domyślny land)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'hold', 'holdout-settlement', 'p1', 'battlefield');
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'tap_for_mana' && c.objectId === 'hold'), 'land można tapnąć jak zwykle');
  assert.ok(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'hold' }).ok);
  assert.equal(state.players[0].mana, 1);
});

// --- Skyclave Geopede: trample + landfall -----------------------------------

test('Skyclave Geopede: materializacja — 3/1 z trample i triggerem landfall', () => {
  const state = game();
  const ge = addRealCard(state, 'ge', 'skyclave-geopede', 'p1', 'battlefield');
  assert.equal(ge.power, 3);
  assert.equal(ge.toughness, 1);
  assert.ok(ge.keywords.includes('trample'));
  const trigger = ge.abilities.find((a) => a.trigger?.event === 'land_entered_under_your_control');
  assert.ok(trigger);
  assert.deepEqual(trigger.effect, { type: 'pump', power: 2, toughness: 2 });
});

test('Skyclave Geopede: landfall — wejście własnego landa daje +2/+2 do końca tury', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ge', 'skyclave-geopede', 'p1', 'battlefield');
  assert.equal(effectivePower(state.objects.get('ge'), state), 3);
  // Zagranie landa z ręki → landfall.
  addRealCard(state, 'hand-land', 'holdout-settlement', 'p1', 'hand');
  assert.ok(execute(state, { type: 'play_land', playerId: 'p1', objectId: 'hand-land' }).ok);
  const pumped = state.objects.get('ge');
  assert.equal(effectivePower(pumped, state), 5, '+2 power po landfall');
  assert.equal(effectiveToughness(pumped, state), 3, '+2 toughness po landfall');
  // Land przeciwnika nie daje buffa (trigger tylko „a land you control enters").
  const before = state.objects.get('ge').powerModifier;
  addRealCard(state, 'foe-land', 'holdout-settlement', 'p2', 'hand');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  mainPhase(state, 'p2');
  const foeResult = execute(state, { type: 'play_land', playerId: 'p2', objectId: 'foe-land' });
  assert.ok(foeResult.ok);
  assert.equal(state.objects.get('ge').powerModifier, before, 'cudzy land nie odpala landfallu');
});

test('Skyclave Geopede: buff landfallu znika w cleanupie (do końca tury)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ge', 'skyclave-geopede', 'p1', 'battlefield');
  addRealCard(state, 'hand-land', 'holdout-settlement', 'p1', 'hand');
  execute(state, { type: 'play_land', playerId: 'p1', objectId: 'hand-land' });
  assert.equal(effectivePower(state.objects.get('ge'), state), 5);
  // Przejście przez cleanup (koniec tury p1).
  passBoth(state, 'p1');
  state.turn = jumpToStep(state.turn, 'end', 'p2');
  passBoth(state, 'p2');
  assert.equal(effectivePower(state.objects.get('ge'), state), 3, 'po cleanup wraca 3/1');
});

test('Skyclave Geopede: trample — nadmiar obrażeń przechodzi na gracza', () => {
  const state = game();
  const ge = addRealCard(state, 'ge', 'skyclave-geopede', 'p1', 'battlefield');
  state.objects.set('ge', Object.freeze({ ...ge, summoningSickness: false }));
  addSimpleCreature(state, 'chump', 'p2', { power: 1, toughness: 1, summoningSickness: false });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ge'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { ge: ['chump'] } }).ok);
  const lifeBefore = state.players[1].life;
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(result.ok);
  // 3/1 trample vs 1/1: bloker dostaje 3 (ginie), nadmiar 3−1 = 2 do gracza.
  assert.equal(state.players[1].life, lifeBefore - 2, 'trample: 2 obrażenia przechodzą na gracza');
  assert.ok(result.events.some((e) => e.type === 'creature_destroyed' && e.fromId === 'chump'), 'bloker ginie');
});

test('Skyclave Geopede: bez trample nadmiar nie przechodzi (regresja)', () => {
  const state = game();
  const plain = addSimpleCreature(state, 'plain', 'p1', { power: 3, toughness: 3, summoningSickness: false });
  addSimpleCreature(state, 'chump', 'p2', { power: 1, toughness: 1, summoningSickness: false });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['plain'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { plain: ['chump'] } });
  const lifeBefore = state.players[1].life;
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(state.players[1].life, lifeBefore, 'stwór bez trample nie przebija');
});

// --- Talia i probe botów ----------------------------------------------------

