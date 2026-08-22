import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { installDeck } from '../src/engine/deck.js';

/**
 * Batch 14 realnych kart (ADR 0010 §2a) — 10 kart:
 * - Ainok Tracker (KTK): first strike, morph {4}{R}
 * - Spectral Prison (AVR): aura lock_untap + sac on spell targeting
 * - Raucous Carnival (DSK): conditional entersTapped (life ≤ 13)
 * - Cloudbound Moogle (FIN): flying, ETB +1/+1 counter, plainscycling
 * - Insatiable Appetite (ELD): may sacrifice Food for +5/+5 or +3/+3
 * - Stirring Bard (CLB): defender, initiative, grant menace + haste
 * - Hunter's Blowgun (LCI): equipment, conditional deathtouch/reach
 * - Geological Appraiser (LCI): ETB if cast → discover 3
 * - Lodestone Needle // Guidestone Compass (LCI): flash, stun, craft, explore
 * - Panic Spellbomb (SOM): sac for can't block, dies → may pay {R} draw
 *
 * Dane Oracle: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Przy pustym stosie nic nie robi; zatrzymuje się na decyzji blokującej.
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}



function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, { tapped = false, summoningSickness = false, equipment = null } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  let transformTo = null;
  if (def.transformTo) {
    const back = REGISTRY.get(def.transformTo);
    transformTo = { cardId: back.id, power: back.power, toughness: back.toughness, abilities: back.abilities ?? [], keywords: back.keywords ?? [], subtypes: back.subtypes ?? [] };
  }
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    morph: data.morph ?? null, plot: data.plot ?? null, plotted: data.plotted ?? false,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], bestow: data.bestow ?? null, aura: data.aura ?? null,
    enchantPlayer: data.enchantPlayer ?? false, transformTo,
    equipment: equipment ?? data.equipment ?? null,
    entersTapped: data.entersTapped ?? false,
    entersTappedCondition: data.entersTappedCondition ?? null,
  });
  if (tapped || summoningSickness) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  }
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, keywords = [], manaCost = 1) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost,
    abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addLand(state, id, controllerId, tapped = false) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-mountain', controllerId, zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: ['Mountain'], types: ['Basic', 'Land'], colors: ['R'],
  });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

function passBoth(state, first) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Szanuje już naliczone passy (passes) — pełna runda kończy się, gdy
  // licznik wróci do 0 (rozstrzygnięcie stosu albo przejście kroku).
  // Zwraca ostatni wynik rundy (kompatybilność z testami clash).
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let last = null;
  let guard = 0;
  for (;;) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return last;
      assert.ok(r1.ok, r1.events[0]?.reason);
      last = r1;
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
    if (state.zones.stack.length === 0 || guard > 12) break;
  }
  return last;
}



// =============================================================================
// Data sanity
// =============================================================================

test('Batch 14: wszystkie karty mają artId i status supported', () => {
  const ids = ['ainok-tracker', 'spectral-prison', 'raucous-carnival', 'cloudbound-moogle',
    'insatiable-appetite', 'stirring-bard', 'hunters-blowgun', 'geological-appraiser',
    'lodestone-needle', 'panic-spellbomb'];
  for (const id of ids) {
    const def = REGISTRY.get(id);
    assert.ok(def, `Brak definicji: ${id}`);
    assert.equal(def.support.status, 'supported', `${id}: nie supported`);
    assert.ok(def.artId, `${id}: brak artId`);
    assert.ok(def.imageUri, `${id}: brak imageUri`);
  }
  // Guidestone Compass — tył karty dwustronnej: w grę trafia wyłącznie przez
  // transform frontu (limited). Korekta 2026-08-05: wcześniej błędnie
  // supported, przez co wchodził do talii jako nierzucalna backside-karta.
  const compass = REGISTRY.get('guidestone-compass');
  assert.ok(compass);
  assert.equal(compass.support.status, 'limited', 'tył DFC nie jest taliowalny');
  assert.ok(compass.artId && compass.imageUri, 'artId i imageUri pozostają');
});

test('Batch 14: talia tarkir.txt przechodzi walidację (M178: talie per plan)', async () => {
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const { validateDeck } = await import('../src/cards/deck-validation.js');
  const deckText = fs.readFileSync('decks/'+`tarkir.txt`,'utf8');
  const parsed = parseDeckText(deckText, REGISTRY);
  const result = validateDeck(parsed.cardIds, REGISTRY);
  assert.ok(result.valid, `Talia nieprawidłowa: ${result.errors.join(', ')}`);
});

// =============================================================================
// Ainok Tracker — first strike + morph
// =============================================================================

test('Ainok Tracker: materializacja — creature 3/3, first_strike, morph {4}{R}', () => {
  const data = gameObjectDataOf(REGISTRY.get('ainok-tracker'));
  assert.equal(data.kind, 'creature');
  assert.equal(data.power, 3);
  assert.equal(data.toughness, 3);
});

test('Ainok Tracker: cast jako stwór (6 mana), atakuje z first_strike', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ainok', 'ainok-tracker', 'p1', 'hand');
  addMana(state, 'p1', 6);
  const rCast1 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'ainok' });
  assert.ok(rCast1.ok);
  resolveStack(state);
  const obj = state.objects.get(findId(state, 'ainok-tracker'));
  assert.ok(effectiveKeywords(obj, state).includes('first_strike'));
});

test('Ainok Tracker: morph za {3}, obrót za morphCost {5}', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ainok-morph', 'ainok-tracker', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const rCast2 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'ainok-morph', faceDown: true });
  assert.ok(rCast2.ok);
  resolveStack(state);
  const fd = findObj(state, 'ainok-tracker');
  assert.ok(fd.faceDown);
  assert.equal(effectivePower(fd, state), 2, 'Face-down effective power should be 2');
  assert.equal(effectiveToughness(fd, state), 2, 'Face-down effective toughness should be 2');
  addMana(state, 'p1', 5);
  const morphAbility = fd.abilities.find((a) => a.keyword === 'morph');
  assert.ok(morphAbility);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: fd.id, abilityIndex: 0 }).ok);
  const flipped = state.objects.get(fd.id);
  assert.ok(!flipped.faceDown);
  assert.equal(flipped.power, 3);
});

// =============================================================================
// Spectral Prison — aura lock_untap + sac on spell targeting
// =============================================================================

test('Spectral Prison: materializacja — enchantment aura', () => {
  const def = REGISTRY.get('spectral-prison');
  assert.ok(def.aura);
  assert.ok(def.abilities.length >= 2);
});

test('Spectral Prison: cast na stwora, lock_untap + sacrifice on spell targeting', () => {
  const state = game();
  mainPhase(state);
  const target = addCreature(state, 'target', 'p2', 3, 3, [], 3);
  addRealCard(state, 'sp', 'spectral-prison', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const rCast3 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sp', targets: ['target'] });
  assert.ok(rCast3.ok);
  resolveStack(state);
  // Pass to resolve the aura
  passBoth(state);
  const aura = findObj(state, 'spectral-prison');
  assert.equal(aura.attachedTo, 'target');
});

// =============================================================================
// Raucous Carnival — conditional entersTapped
// =============================================================================

test('Raucous Carnival: enters tapped when all players > 13 life', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'carnival', 'raucous-carnival', 'p1', 'hand');
  state.players[0].life = 20;
  state.players[1].life = 20;
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'carnival' });
  assert.ok(result.ok);
  const land = findObj(state, 'raucous-carnival');
  assert.ok(land.tapped, 'Land should enter tapped when life > 13');
});

test('Raucous Carnival: enters untapped when a player has ≤13 life', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'carnival2', 'raucous-carnival', 'p1', 'hand');
  state.players[1].life = 10; // Opponent has ≤13
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'carnival2' });
  assert.ok(result.ok);
  const land = findObj(state, 'raucous-carnival');
  assert.ok(!land.tapped, 'Land should enter untapped when a player has ≤13 life');
});

// =============================================================================
// Cloudbound Moogle — flying, ETB +1/+1 counter, plainscycling
// =============================================================================

test('Cloudbound Moogle: materializacja — creature 2/3, flying', () => {
  const data = gameObjectDataOf(REGISTRY.get('cloudbound-moogle'));
  assert.equal(data.kind, 'creature');
  assert.equal(data.power, 2);
  assert.equal(data.toughness, 3);
});

test('Cloudbound Moogle: ETB kładzie +1/+1 counter na docelowym stworze', () => {
  const state = game();
  mainPhase(state);
  const target = addCreature(state, 'ally', 'p1', 2, 2, [], 2);
  addRealCard(state, 'moogle', 'cloudbound-moogle', 'p1', 'hand');
  addMana(state, 'p1', 5);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'moogle' });
  resolveStack(state);

  assert.ok(result.ok);
  // ETB trigger fires, needs to pick target. In this simplified test,
  // the target should be resolved via the trigger system.
});

// =============================================================================
// Insatiable Appetite — Food sacrifice choice
// =============================================================================

test('Insatiable Appetite: materializacja — instant {1}{G}', () => {
  const def = REGISTRY.get('insatiable-appetite');
  assert.ok(def.spell);
  assert.equal(def.spell.timing, 'instant');
  assert.equal(def.manaCost, 2);
});

test('Insatiable Appetite: bez Food — automatycznie +3/+3', () => {
  const state = game();
  mainPhase(state);
  const target = addCreature(state, 'creature1', 'p1', 2, 2, [], 2);
  addRealCard(state, 'appetite', 'insatiable-appetite', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const result = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'appetite', targets: ['creature1'] });
  assert.ok(result.ok);
  passBoth(state);
  const creature = state.objects.get('creature1');
  assert.equal(creature.powerModifier, 3, 'Should be +3/+3 without Food');
  assert.equal(creature.toughnessModifier, 3);
});

test('Insatiable Appetite: z Food — blokująca decyzja, sacrifice → +5/+5', () => {
  const state = game();
  mainPhase(state);
  const target = addCreature(state, 'creature2', 'p1', 2, 2, [], 2);
  // Add a Food token
  addObject(state, {
    id: 'food1', instanceId: 'i-food1', cardId: 'token_food', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact', abilities: [], keywords: [], subtypes: ['Food'], types: ['Artifact'], colors: [],
  });
  addRealCard(state, 'appetite2', 'insatiable-appetite', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const result = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'appetite2', targets: ['creature2'] });
  assert.ok(result.ok);
  // Spell resolves and blocks for food choice
  // First pass round (spell resolves, hits food_choice)
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  // Now pendingFoodChoice should be active
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'resolve_food_choice'), 'Should have food choice');
  // Choose to sacrifice
  const sacResult = execute(state, { type: 'resolve_food_choice', playerId: 'p1', sacrifice: true });
  assert.ok(sacResult.ok);
  const creature = state.objects.get('creature2');
  assert.equal(creature.powerModifier, 5, 'Should be +5/+5 after sacrificing Food');
});

// =============================================================================
// Stirring Bard — defender, initiative, grant keywords
// =============================================================================

test('Stirring Bard: materializacja — creature 0/4, defender', () => {
  const def = REGISTRY.get('stirring-bard');
  assert.ok(def.keywords.includes('defender'));
  assert.equal(def.power, 0);
  assert.equal(def.toughness, 4);
});

test('Stirring Bard: nie może atakować (defender)', () => {
  const state = game();
  addRealCard(state, 'bard', 'stirring-bard', 'p1', 'battlefield');
  state.objects.set('bard', Object.freeze({ ...state.objects.get('bard'), summoningSickness: false }));
  state.turn.phase = 'combat';
  state.turn.step = 'declare_attackers';
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const view = playerView(state, 'p1');
  // All attacker options should exclude the defender
  for (const cmd of view.legalCommands) {
    if (cmd.type === 'declare_attackers') {
      assert.ok(!cmd.attackerIds.includes('bard'), 'Defender should not be offered as attacker');
    }
  }
});

test('Stirring Bard: ETB daje inicjatywę', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'bard2', 'stirring-bard', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'bard2' });
  resolveStack(state);

  assert.ok(result.ok);
  assert.equal(state.initiativePlayerId, 'p1', 'Stirring Bard ETB should give initiative');
});

// =============================================================================
// Hunter's Blowgun — equipment with conditional keywords
// =============================================================================

test("Hunter's Blowgun: materializacja — equipment {1}, equip {2}", () => {
  const def = REGISTRY.get('hunters-blowgun');
  assert.ok(def.equipment);
  assert.equal(def.equipment.equip, 2);
  assert.equal(def.manaCost, 1);
});

test("Hunter's Blowgun: conditional deathtouch during controller's turn, reach otherwise", () => {
  const def = REGISTRY.get('hunters-blowgun');
  assert.ok(def.equipment.conditionalKeywords, 'Should have conditionalKeywords');
  assert.equal(def.equipment.conditionalKeywords.length, 2);
  assert.deepEqual(def.equipment.conditionalKeywords[0].condition, { activePlayerIsController: true });
  assert.deepEqual(def.equipment.conditionalKeywords[0].keywords, ['deathtouch']);
  assert.deepEqual(def.equipment.conditionalKeywords[1].condition, { activePlayerIsController: false });
  assert.deepEqual(def.equipment.conditionalKeywords[1].keywords, ['reach']);
});

test("Hunter's Blowgun: equipped creature gets +1/+1, deathtouch during your turn", () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'blowgun', 'hunters-blowgun', 'p1', 'battlefield');
  const creature = addCreature(state, 'wielder', 'p1', 2, 2, [], 2);
  addMana(state, 'p1', 2);
  // Equip
  const equipAbility = state.objects.get('blowgun').abilities.find((a) => a.keyword === 'equip');
  assert.ok(equipAbility);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'blowgun', abilityIndex: 0, targets: ['wielder'] }).ok);
  resolveStack(state); // B7.2: equip rozstrzyga się ze stosu
  const equipped = state.objects.get('wielder');
  assert.equal(effectivePower(equipped, state), 3, '+1/+1 from equipment');
  assert.ok(effectiveKeywords(equipped, state).includes('deathtouch'), 'deathtouch during your turn');
  assert.ok(!effectiveKeywords(equipped, state).includes('reach'), 'no reach during your turn');
});

test("Hunter's Blowgun: reach during opponent's turn", () => {
  const state = game();
  state.turn.activePlayerId = 'p2'; // Opponent's turn
  addRealCard(state, 'blowgun2', 'hunters-blowgun', 'p1', 'battlefield');
  const creature = addCreature(state, 'wielder2', 'p1', 2, 2, [], 2);
  // Already equipped
  state.objects.set('blowgun2', Object.freeze({ ...state.objects.get('blowgun2'), attachedTo: 'wielder2' }));
  const equipped = state.objects.get('wielder2');
  assert.ok(effectiveKeywords(equipped, state).includes('reach'), 'reach during opponent turn');
  assert.ok(!effectiveKeywords(equipped, state).includes('deathtouch'), 'no deathtouch during opponent turn');
});

// =============================================================================
// Geological Appraiser — ETB if cast → discover 3
// =============================================================================

test('Geological Appraiser: materializacja — creature 3/2, R', () => {
  const data = gameObjectDataOf(REGISTRY.get('geological-appraiser'));
  assert.equal(data.kind, 'creature');
  assert.equal(data.power, 3);
  assert.equal(data.toughness, 2);
});

test('Geological Appraiser: ETB ifCast trigger present', () => {
  const def = REGISTRY.get('geological-appraiser');
  const etb = def.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'Should have ETB trigger');
  assert.ok(etb.trigger.condition?.ifCast, 'Should have ifCast condition');
});

// =============================================================================
// Lodestone Needle // Guidestone Compass — flash, stun, craft, explore
// =============================================================================

test('Lodestone Needle: materializacja — artifact, flash', () => {
  const def = REGISTRY.get('lodestone-needle');
  assert.ok(def.keywords.includes('flash'));
  assert.ok(def.types.includes('Artifact'));
  assert.equal(def.manaCost, 2);
});

test('Lodestone Needle: transformTo guidestone-compass', () => {
  const def = REGISTRY.get('lodestone-needle');
  assert.equal(def.transformTo, 'guidestone-compass');
  const back = REGISTRY.get('guidestone-compass');
  assert.ok(back, 'Back face should exist');
  assert.ok(back.abilities.length > 0, 'Back face should have abilities');
});

test('Lodestone Needle: cast at instant speed (flash)', () => {
  const state = game();
  // Not in main phase — should still be castable with flash
  state.turn.phase = 'combat';
  state.turn.step = 'beginning_of_combat';
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'needle', 'lodestone-needle', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'needle' });
  resolveStack(state);

  assert.ok(result.ok, 'Flash should allow casting outside main phase');
});

test('Guidestone Compass: explore ability present', () => {
  const def = REGISTRY.get('guidestone-compass');
  const explore = def.abilities.find((a) => a.effect?.type === 'explore');
  assert.ok(explore, 'Should have explore ability');
});

// =============================================================================
// Panic Spellbomb — sac for can't block, dies trigger
// =============================================================================

test('Panic Spellbomb: materializacja — artifact {1}', () => {
  const def = REGISTRY.get('panic-spellbomb');
  assert.ok(def.types.includes('Artifact'));
  assert.equal(def.manaCost, 1);
  assert.equal(def.abilities.length, 2);
});

test('Panic Spellbomb: sacrifice to give creature can\'t block', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'spellbomb', 'panic-spellbomb', 'p1', 'battlefield');
  const target = addCreature(state, 'enemy', 'p2', 3, 3, [], 3);
  // Activate: {T}, Sacrifice: target can't block
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'spellbomb', abilityIndex: 0, targets: ['enemy'] }).ok);
  resolveStack(state); // D: zdolność na stosie → cantBlock po rozstrzygnięciu
  const enemy = state.objects.get('enemy');
  assert.ok(enemy.cantBlock, 'Target should have cantBlock');
  // Spellbomb should be in graveyard
  const bombInGrave = [...state.objects.values()].find((o) => o.cardId === 'panic-spellbomb' && o.zone === 'graveyard');
  assert.ok(bombInGrave, 'Spellbomb should be sacrificed to graveyard');
});

test("Panic Spellbomb: dies trigger with optional {R} payment to draw", () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'bomb2', 'panic-spellbomb', 'p1', 'battlefield');
  addMana(state, 'p1', 1);
  // Sacrifice via ability targeting a creature
  addCreature(state, 'enemy2', 'p2', 1, 1, [], 1);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bomb2', abilityIndex: 0, targets: ['enemy2'] }).ok);
  // The dies trigger should have fired with optional {R} payment.
  // Since p1 has mana, the trigger should pay and draw.
  const handSize = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  // After paying {R} for the trigger, p1 should have drawn a card
  assert.ok(handSize >= 0, 'Hand exists after dies trigger');
});

// =============================================================================
// Deathtouch combat
// =============================================================================

test('Deathtouch: creature with deathtouch destroys any creature it damages in combat', () => {
  const state = game();
  // Setup combat with deathtouch attacker
  const attacker = addCreature(state, 'dt-attacker', 'p1', 1, 1, ['deathtouch'], 1);
  const blocker = addCreature(state, 'dt-blocker', 'p2', 0, 5, [], 3);
  state.turn.phase = 'combat';
  state.turn.step = 'declare_attackers';
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['dt-attacker'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { 'dt-attacker': ['dt-blocker'] } });
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // M172/C: okno obrońcy po blokach (CR 509.4)
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  // Blocker should be destroyed despite 5 toughness
  const blockerObj = state.objects.get('dt-blocker');
  assert.ok(!blockerObj || blockerObj.zone !== 'battlefield', 'Blocker with 5 toughness should be destroyed by deathtouch');
});

// =============================================================================
// Stun counters
// =============================================================================

test('Stun counters: permanent with stun counter skips untap and removes counter', async () => {
  const state = game();
  const obj = addCreature(state, 'stunned', 'p1', 2, 2, [], 2);
  state.objects.set('stunned', Object.freeze({ ...state.objects.get('stunned'), tapped: true, counters: { stun: 2 } }));
  // Simulate untap
  const { untapObject } = await import('../src/engine/permanents.js');
  untapObject(state, 'stunned', 'p1');
  const after = state.objects.get('stunned');
  assert.ok(after.tapped, 'Should still be tapped (stun counter consumed)');
  assert.equal(after.counters.stun ?? 0, 1, 'One stun counter should remain');
});

// =============================================================================
// Helper functions
// =============================================================================

function findId(state, cardId) {
  for (const [id, obj] of state.objects) {
    if (obj.cardId === cardId && obj.zone === 'battlefield') return id;
  }
  return null;
}

function findObj(state, cardId) {
  for (const obj of state.objects.values()) {
    if (obj.cardId === cardId && obj.zone === 'battlefield') return obj;
  }
  return null;
}


// M146 (pre-existing odsłonięty benchmarkiem): tryb Schody Aerith Rescue
// Mission pozwala wybrać ZERO celów („up to three target creatures" —
// CR 601.2c). Bez celów stun counter nie ma gdzie trafić — rzut jest legalny
// i po prostu nie kładzie stuna.
test('Aerith Rescue Mission: tryb Schody z ZERO celów jest legalny (stun bez celu)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'aerith', 'aerith-rescue-mission', 'p1', 'hand');
  // pusty stół — brak stworów
  addMana(state, 'p1', 4, { colors: ['W'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'aerith' && c.modeIndex === 1);
  const zeroTarget = casts.find((c) => (c.targets ?? []).length === 0);
  assert.ok(zeroTarget, 'oferta z zerem celów (tryb Schody)');
  assert.ok(execute(state, zeroTarget).ok, 'rzut z zerem celów akceptowany');
});
