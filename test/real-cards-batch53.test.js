import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 53, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function addPermanent(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, subtypes = [], keywords = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords,
    subtypes, types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function byCard(state, cardId, controllerId = null) {
  return [...state.objects.values()]
    .find((o) => o.cardId === cardId && (controllerId == null || o.controllerId === controllerId));
}

function commands(state, playerId = 'p1') {
  return playerView(state, playerId).legalCommands;
}

function resolveStack(state, limit = 24) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

// =====================================================================
// Keep Out (ECL) — modalny instant: 4 obrażenia tapped stwora | zniszcz enchantment
// =====================================================================
test('B53: Keep Out — dane Oracle (modalny instant)', () => {
  const def = REGISTRY.get('keep-out');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.artId, 590);
  assert.equal(def.plan, 'Wiedźmin');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.equal(def.spell.modes.length, 2);
  assert.equal(def.spell.modes[0].targets[0].type, 'tapped_creature');
  assert.equal(def.spell.modes[1].targets[0].type, 'enchantment');
});

test('B53: Keep Out — tryb obrażeń w tapped stwora', () => {
  const state = game();
  addMana(state, 'p1', 2, { colors: ['W'] });
  addCard(state, 'ko', 'keep-out', 'p1', 'hand');
  // Stan bojowy nadajemy po dodaniu obiektu (addObject odrzuca spoza kontraktu).
  addObject(state, {
    id: 'tap-cre', instanceId: 'i-tap-cre', cardId: 'x-cre', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 6, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('tap-cre', Object.freeze({ ...state.objects.get('tap-cre'), tapped: true }));

  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'ko' && c.modeIndex === 0 && c.targets?.[0] === 'tap-cre');
  assert.ok(cast, 'oferta trybu obrażeń w tapped stwora');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(state.objects.get('tap-cre')?.zone, 'battlefield', 'stwór przeżywa 4 obrażenia (2/6)');
  assert.equal(state.objects.get('tap-cre').damage, 4);
});

test('B53: Keep Out — tryb zniszczenia enchantmentu', () => {
  const state = game();
  addMana(state, 'p1', 2, { colors: ['W'] });
  addCard(state, 'ko', 'keep-out', 'p1', 'hand');
  addObject(state, {
    id: 'ench', instanceId: 'i-ench', cardId: 'x-ench', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'enchantment', power: null, toughness: null, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Enchantment'], colors: [],
  });
  addObject(state, {
    id: 'cre', instanceId: 'i-cre', cardId: 'x-cre2', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('cre', Object.freeze({ ...state.objects.get('cre'), tapped: true }));

  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'ko' && c.modeIndex === 1 && c.targets?.[0] === 'ench');
  assert.ok(cast, 'oferta trybu zniszczenia enchantmentu');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.notEqual(state.objects.get('ench')?.zone, 'battlefield', 'enchantment zniszczony');
  assert.equal(state.objects.get('cre')?.zone, 'battlefield', 'stwór nietknięty');
});

// =====================================================================
// Ghirapur Gearcrafter (ORI) — ETB: 1/1 Thopter z lataniem
// =====================================================================
test('B53: Ghirapur Gearcrafter — dane Oracle i efekt ETB', () => {
  const def = REGISTRY.get('ghirapur-gearcrafter');
  assert.deepEqual(def.subtypes, ['Human', 'Artificer']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 596);
  assert.equal(def.plan, 'Kaladesh');
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].effect.type, 'create_token');
  assert.equal(def.abilities[0].effect.cardId, 'token_thopter');
});

test('B53: Ghirapur Gearcrafter — wejście tworzy 1/1 Thopter z lataniem', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['R'] });
  addCard(state, 'gg', 'ghirapur-gearcrafter', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gg' }).ok);
  resolveStack(state);
  const thopter = [...state.objects.values()].find((o) => o.cardId === 'token_thopter' && o.zone === 'battlefield');
  assert.ok(thopter, 'Thopter utworzony');
  assert.equal(thopter.power, 1);
  assert.equal(thopter.toughness, 1);
  assert.ok((thopter.keywords ?? []).includes('flying'));
  assert.equal(thopter.controllerId, 'p1');
});

// =====================================================================
// Ironclad Slayer (EMN) — ETB: may return target Aura/Equipment from graveyard
// =====================================================================
test('B53: Ironclad Slayer — dane Oracle i filtr celu', () => {
  const def = REGISTRY.get('ironclad-slayer');
  assert.deepEqual(def.subtypes, ['Human', 'Warrior']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 594);
  assert.equal(def.plan, 'Wiedźmin');
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].trigger.requiresTarget.type, 'aura_or_equipment_card_in_graveyard');
  assert.equal(def.abilities[0].trigger.requiresTarget.optional, true);
});

test('B53: Ironclad Slayer — zwraca Equipment z grobu, gdy wybiorę cel', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  addCard(state, 'is', 'ironclad-slayer', 'p1', 'hand');
  addCard(state, 'equip-in-gy', 'warriors-sword', 'p1', 'graveyard');
  addCard(state, 'creature-in-gy', 'highland-game', 'p1', 'graveyard');

  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'is' }).ok);
  resolveStack(state); // rozstrzygnij stos — trigger ETB przechodzi do fazy wskazywania celu
  const target = commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'equip-in-gy');
  assert.ok(target, 'oferta celu: Equipment z grobu');
  assert.ok(execute(state, target).ok);
  resolveStack(state);
  const returned = [...state.objects.values()].find((o) => o.cardId === 'warriors-sword' && o.zone === 'hand');
  assert.ok(returned, 'Equipment wrócił do ręki');
  assert.equal(state.objects.get('creature-in-gy')?.zone, 'graveyard', 'stwor w grobie nietknięty');
});

test('B53: Ironclad Slayer — odmowa celu = trigger bez efektu (you may)', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  addCard(state, 'is', 'ironclad-slayer', 'p1', 'hand');
  addCard(state, 'equip-in-gy', 'warriors-sword', 'p1', 'graveyard');

  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'is' }).ok);
  resolveStack(state);
  const decline = commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === null);
  assert.ok(decline, 'odmowa celu dostępna');
  assert.ok(execute(state, decline).ok);
  resolveStack(state);
  assert.equal(state.objects.get('equip-in-gy')?.zone, 'graveyard', 'bez wyboru celu nic nie wraca');
});

// =====================================================================
// Sheriff of Safe Passage (OTJ) — enters with +1/+1 for each other creature
// =====================================================================
test('B53: Sheriff of Safe Passage — dane Oracle i deskryptor wejścia', () => {
  const def = REGISTRY.get('sheriff-of-safe-passage');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Knight']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 0);
  assert.equal(def.toughness, 0);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 598);
  assert.equal(def.plan, 'Śródziemie');
  assert.deepEqual(def.plot, { cost: 2, colors: ['W'] });
  assert.deepEqual(def.entersWithCounters, { '+1/+1': 'other_creatures_you_control_plus_one' });
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B53: Sheriff of Safe Passage — wejście na pustym stole = 1 licznik (+1/+1)', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  addCard(state, 'sheriff', 'sheriff-of-safe-passage', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sheriff' }).ok);
  resolveStack(state);
  const sheriff = byCard(state, 'sheriff-of-safe-passage');
  assert.ok(sheriff, 'szeryf na polu bitwy');
  assert.equal(sheriff.counters?.['+1/+1'], 1, 'zero innych stworów → jeden licznik');
});

test('B53: Sheriff of Safe Passage — +1 za każdego INNEGO stwora', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  addSimpleCreature(state, 'ally1', 'p1', { power: 1, toughness: 1 });
  addSimpleCreature(state, 'ally2', 'p1', { power: 1, toughness: 1 });
  addCard(state, 'sheriff', 'sheriff-of-safe-passage', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sheriff' }).ok);
  resolveStack(state);
  const sheriff = byCard(state, 'sheriff-of-safe-passage');
  assert.ok(sheriff, 'szeryf na polu bitwy');
  assert.equal(sheriff.counters?.['+1/+1'], 3, '1 bazowy + 2 za sojuszników');
});
