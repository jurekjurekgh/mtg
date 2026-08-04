import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { jumpToStep } from '../src/engine/turn.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Szósty batch realnych kart (ADR 0010): Soulmender (M20 — aktywowane {T}:
 * zysk 1 życia), Illusory Demon (ARB — flying + trigger „when you cast a
 * spell" → poświęcenie źródła), Jyoti, Moag Ancient (M3C — ETB tworzy
 * tokeny Forest Dryad wg liczby rzuceń commandera (tu: 0) + na początku
 * walki pompuje land creatures o moc Jyoti). Dane Oracle: docs/cards/.
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

const SHOCK = { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] };

function passBoth(state, first = 'p1') {
  const second = first === 'p1' ? 'p2' : 'p1';
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: second }).ok);
}

// --- Soulmender ------------------------------------------------------------

test('Soulmender: materializacja — 1/1 {W}, aktywowane {T}: gain 1 life', () => {
  const state = mainPhase(game());
  const soul = addRealCard(state, 'soul', 'soulmender', 'p1', 'battlefield');
  assert.equal(soul.power, 1);
  assert.equal(soul.toughness, 1);
  const ability = soul.abilities.find((a) => a.trigger == null);
  assert.ok(ability && ability.cost?.tap, 'Soulmender ma zdolność {T}');
  assert.deepEqual(ability.effect, { type: 'gain_life', amount: 1 });

  const lifeBefore = state.players[0].life;
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'soul', abilityIndex: 0 });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.equal(state.players[0].life, lifeBefore + 1, 'zysk 1 życia');
  assert.equal(state.objects.get('soul').tapped, true, 'Soulmender się tapuje');
});

test('Soulmender: tapnięty nie aktywuje zdolności (koszt tap)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'soul', 'soulmender', 'p1', 'battlefield', { tapped: true });
  const cmds = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'soul');
  assert.equal(cmds.length, 0, 'tapnięty Soulmender nie oferuje aktywacji');
});

// --- Illusory Demon --------------------------------------------------------

test('Illusory Demon: materializacja — 4/3 flying, trigger when_you_cast_spell → sacrifice', () => {
  const state = game();
  const demon = addRealCard(state, 'demon', 'illusory-demon', 'p1', 'battlefield');
  assert.equal(demon.power, 4);
  assert.equal(demon.toughness, 3);
  assert.ok(demon.keywords.includes('flying'));
  const ability = demon.abilities.find((a) => a.trigger?.event === 'when_you_cast_spell');
  assert.ok(ability, 'trigger when_you_cast_spell');
  assert.deepEqual(ability.effect, { type: 'sacrifice_permanent' });
});

test('Illusory Demon: rzucenie czaru przez kontrolera poświęca demona', () => {
  const state = mainPhase(game());
  addRealCard(state, 'demon', 'illusory-demon', 'p1', 'battlefield');
  addSimpleCreature(state, 'foe', 'p2', { summoningSickness: false });
  addObject(state, { id: 'shock', instanceId: 'ish', cardId: 'syn-shock', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1, spell: SHOCK });
  addMana(state, 'p1', 1);
  const result = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['foe'] });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  const demon = [...state.objects.values()].find((o) => o.cardId === 'illusory-demon');
  assert.equal(demon.zone, 'graveyard', 'demon poświęcony po rzuceniu czaru');
  assert.ok(result.events.some((e) => e.type === 'permanent_sacrificed'), 'log ma permanent_sacrificed');
});

test('Illusory Demon: zagranie permanentu (stwora) też poświęca demona', () => {
  const state = mainPhase(game());
  addRealCard(state, 'demon', 'illusory-demon', 'p1', 'battlefield');
  addRealCard(state, 'hand-creature', 'soulmender', 'p1', 'hand');
  addMana(state, 'p1', 1);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hand-creature' });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  const demon = [...state.objects.values()].find((o) => o.cardId === 'illusory-demon');
  assert.equal(demon.zone, 'graveyard', 'permanent cast też poświęca demona');
});

test('Illusory Demon: czar przeciwnika NIE poświęca demona', () => {
  const state = mainPhase(game());
  addRealCard(state, 'demon', 'illusory-demon', 'p1', 'battlefield');
  addObject(state, { id: 'shock', instanceId: 'ish', cardId: 'syn-shock', controllerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 1, spell: SHOCK });
  // p2 rzuca w swojej turze, celując w demona.
  mainPhase(state, 'p2');
  addMana(state, 'p2', 1);
  const result = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock', targets: ['demon'] });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  const demon = [...state.objects.values()].find((o) => o.cardId === 'illusory-demon');
  assert.equal(demon.zone, 'battlefield', 'demon kontrolera nie reaguje na czar przeciwnika');
});

test('Illusory Demon: casting samego demona go nie poświęca (nie był na bitwisku)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'hand-demon', 'illusory-demon', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hand-demon' });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  const demon = [...state.objects.values()].find((o) => o.cardId === 'illusory-demon' && o.zone === 'battlefield');
  assert.ok(demon, 'demon wszedł na bitwisko');
});

// --- Jyoti, Moag Ancient ---------------------------------------------------

test('Jyoti: materializacja — 2/4 legendarny Elemental, triggery ETB i beginning_of_combat', () => {
  const state = game();
  const jyoti = addRealCard(state, 'jyoti', 'jyoti-moag-ancient', 'p1', 'battlefield');
  assert.equal(jyoti.power, 2);
  assert.equal(jyoti.toughness, 4);
  assert.ok(jyoti.types.includes('Legendary'));
  const etb = jyoti.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb && etb.effect.type === 'create_token' && etb.effect.cardId === 'token_forest_dryad');
  const combat = jyoti.abilities.find((a) => a.trigger?.event === 'beginning_of_combat');
  assert.ok(combat && combat.effect.type === 'buff_land_creatures');
});

test('Jyoti: ETB z 0 rzuceń commandera nie tworzy tokenów (zdarzenie triggera jest)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'hand-jyoti', 'jyoti-moag-ancient', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hand-jyoti' });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'enter_battlefield'), 'trigger ETB odpalił się');
  const dryads = [...state.objects.values()].filter((o) => o.cardId === 'token_forest_dryad');
  assert.equal(dryads.length, 0, '0 tokenów (commanderCasts = 0)');
});

test('Jyoti: ETB z 2 rzuceniami commandera tworzy 2 tokeny Forest Dryad (land creatures)', () => {
  const state = mainPhase(game());
  state.players[0].commanderCasts = 2; // ręczne ustawienie (test command zone)
  addRealCard(state, 'hand-jyoti', 'jyoti-moag-ancient', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hand-jyoti' });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  const dryads = [...state.objects.values()].filter((o) => o.cardId === 'token_forest_dryad');
  assert.equal(dryads.length, 2, '2 tokeny Forest Dryad');
  for (const dryad of dryads) {
    assert.equal(dryad.power, 1);
    assert.equal(dryad.toughness, 1);
    assert.ok(dryad.types.includes('Land') && dryad.types.includes('Creature'), 'land creature');
    assert.equal(dryad.summoningSickness, true, 'choroba przywołania');
  }
});

test('Jyoti: token Forest Dryad tapuje się na manę i może atakować (land creature)', () => {
  const state = mainPhase(game());
  const token = createBattlefieldToken(state, 'p1', {
    cardId: 'token_forest_dryad', name: 'Forest Dryad', kind: 'creature',
    power: 1, toughness: 1, colors: ['G'], types: ['Land', 'Creature'], subtypes: ['Forest', 'Dryad'],
  });
  // Mana: tap_for_mana akceptuje land creature.
  const tapCmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'tap_for_mana' && c.objectId === token.id);
  assert.ok(tapCmd, 'land creature oferuje tap_for_mana');
  assert.ok(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: token.id }).ok);
  assert.equal(state.players[0].mana, 1, 'produkuje manę');
  // Atak: stwór bez choroby przywołania atakuje.
  state.objects.set(token.id, Object.freeze({ ...state.objects.get(token.id), tapped: false, summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const attack = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [token.id] });
  assert.ok(attack.ok, 'land creature może atakować');
});

test('Jyoti: beginning_of_combat pompuje land creatures o moc Jyoti, zwykłe stwory nie', () => {
  const state = mainPhase(game());
  addRealCard(state, 'jyoti', 'jyoti-moag-ancient', 'p1', 'battlefield');
  const dryad = createBattlefieldToken(state, 'p1', {
    cardId: 'token_forest_dryad', name: 'Forest Dryad', kind: 'creature',
    power: 1, toughness: 1, colors: ['G'], types: ['Land', 'Creature'], subtypes: ['Forest', 'Dryad'],
  });
  addSimpleCreature(state, 'plain', 'p1', { power: 2, toughness: 2, summoningSickness: false });
  assert.equal(effectivePower(dryad, state), 1);
  // Przejście z main do beginning_of_combat (pass obu) odpala trigger.
  passBoth(state, 'p1');
  assert.equal(state.turn.step, 'beginning_of_combat', 'pass w main przechodzi do beginning_of_combat');
  assert.equal(effectivePower(state.objects.get(dryad.id), state), 3, 'dryad +2 (moc Jyoti)');
  assert.equal(effectiveToughness(state.objects.get(dryad.id), state), 3, 'dryad +2 toughness');
  assert.equal(effectivePower(state.objects.get('plain'), state), 2, 'zwykły stwór bez buffa');
});

test('Jyoti: buff land creatures znika w cleanupie (do końca tury)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'jyoti', 'jyoti-moag-ancient', 'p1', 'battlefield');
  const dryad = createBattlefieldToken(state, 'p1', {
    cardId: 'token_forest_dryad', name: 'Forest Dryad', kind: 'creature',
    power: 1, toughness: 1, colors: ['G'], types: ['Land', 'Creature'], subtypes: ['Forest', 'Dryad'],
  });
  passBoth(state, 'p1');
  assert.equal(effectivePower(state.objects.get(dryad.id), state), 3);
  // Dociągnięcie do cleanup (pełne przejście).
  passBoth(state, 'p1');
  if (state.turn.step !== 'cleanup') {
    state.turn = jumpToStep(state.turn, 'end', 'p1');
    passBoth(state, 'p1');
  }
  mainPhase(state, 'p2');
  state.turn = jumpToStep(state.turn, 'end', 'p2');
  passBoth(state, 'p2');
  assert.equal(effectivePower(state.objects.get(dryad.id), state), 1, 'po cleanup buff znika');
});

// --- Talia i probe botów ----------------------------------------------------

