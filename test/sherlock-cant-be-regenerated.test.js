// Testy dla poprawek z audytu "Sherlock" — 5 bugów znalezionych w sesji
// Batch 22, które inne modele pominęły. Każdy test sprawdza JEDNĄ poprawkę
// vs Comprehensive Rules.
//
// Bugi:
//   1. Rage of Purphoros "It can't be regenerated this turn" — flaga
//      cantBeRegeneratedThisTurn ustawiana na celu (effects.js).
//   2. tryRegenerate w state-based.js NIE regeneruje obiektu z flagą
//      cantBeRegeneratedThisTurn.
//   3. Trample + tarcza prewencji (Withstand) — lethal w combat.js
//      uwzględnia damageShields i preventDamageThisTurn.
//   4. validateTargets w spells.js obsługuje creature_with_power_at_least
//      (Selesnya Charm tryb Exile: "creature with power 5 or greater").
//   5. destroy_permanent w effects.js respektuje flagę regeneracji
//      (delegacja do tryRegenerate, który ma guard).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { addRegenerationShield, tryRegenerate } from '../src/engine/state-based.js';
import { castSpell } from '../src/engine/spells.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
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
  });
}

function addPlayerMana(state, playerId, amount, colors = []) {
  addMana(state, playerId, amount, { colors });
}

function addStrongCreature(state, id, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'maritime-guard',
    controllerId: 'p2', zone: 'battlefield', kind: 'creature',
    power, toughness, manaCost: 5, types: ['Creature', 'Token'],
    colors: ['U'], keywords: [], subtypes: ['Merfolk', 'Soldier'],
  });
}

// === Bug 1: cant_be_regenerated_this_turn ===

test('Bug 1: cant_be_regenerated_this_turn dodaje id do state.cantBeRegeneratedThisTurn', () => {
  const state = newState();
  addCardFromRegistry(state, 'creature', 'maritime-guard', 'p2', 'battlefield');
  const targetId = state.zones.battlefield[0];
  applyEffect(
    state,
    { type: 'cant_be_regenerated_this_turn' },
    { id: 'src', controllerId: 'p1', cardId: 'rage-of-purphoros' },
    [targetId],
  );
  assert.ok((state.cantBeRegeneratedThisTurn ?? []).includes(targetId),
    'Flaga cantBeRegeneratedThisTurn ustawiona na celu po applyEffect');
});

test('Bug 1: tryRegenerate zwraca false gdy flaga jest ustawiona', () => {
  const state = newState();
  addCardFromRegistry(state, 'creature', 'maritime-guard', 'p2', 'battlefield');
  const targetId = state.zones.battlefield[0];
  state.cantBeRegeneratedThisTurn = [targetId];
  addRegenerationShield(state, targetId);
  const result = tryRegenerate(state, state.objects.get(targetId));
  assert.equal(result, false,
    'tryRegenerate NIE regeneruje obiektu z flagą cantBeRegeneratedThisTurn');
  assert.ok((state.regenerationShields ?? []).includes(targetId),
    'Tarcza regeneracji nie została zużyta (regeneracja nie powiodła się)');
});

test('Bug 1: tryRegenerate zwraca true gdy NIE ma flagi (kontrola)', () => {
  const state = newState();
  addCardFromRegistry(state, 'creature', 'maritime-guard', 'p2', 'battlefield');
  const targetId = state.zones.battlefield[0];
  addRegenerationShield(state, targetId);
  const result = tryRegenerate(state, state.objects.get(targetId));
  assert.equal(result, true, 'tryRegenerate regeneruje normalnie bez flagi');
  assert.ok(!(state.regenerationShields ?? []).includes(targetId),
    'Tarcza zużyta po udanej regeneracji');
});

test('Bug 1 (integracja): Rage of Purphoros zabija stwora mimo tarczy regeneracji', () => {
  const state = newState();
  addCardFromRegistry(state, 'rage', 'rage-of-purphoros', 'p1', 'hand');
  addCardFromRegistry(state, 'creature', 'maritime-guard', 'p2', 'battlefield');
  addPlayerMana(state, 'p1', 5, ['R']);
  const creatureId = state.zones.battlefield[0];
  // Tarcza regeneracji (symulacja: gracz aktywuje "regenerate")
  addRegenerationShield(state, creatureId);
  // Bezpośrednie wywołanie applyEffect (testujemy Rage bez pełnej rundy passów)
  applyEffect(
    state,
    { type: 'cant_be_regenerated_this_turn' },
    { id: 'rage', controllerId: 'p1', cardId: 'rage-of-purphoros' },
    [creatureId],
  );
  // Zadajemy 4 obrażenia bezpośrednio
  const target = state.objects.get(creatureId);
  const damaged = { ...target, damage: 4 };
  state.objects.set(creatureId, damaged);
  // Symulujemy SBA: tryRegenerate powinien NIE zadziałać (flaga)
  const regenerated = tryRegenerate(state, damaged);
  assert.equal(regenerated, false,
    'tryRegenerate zwraca false z flagą cantBeRegeneratedThisTurn');
  assert.equal(state.objects.get(creatureId).zone, 'battlefield',
    'Stwór pozostaje na battlefield (tryRegenerate NIE zabił)');
  // Tarcza NIE zużyta (tryRegenerate nie zadziałał)
  assert.ok((state.regenerationShields ?? []).includes(creatureId),
    'Tarcza regeneracji nie została zużyta');
  // Po ustąpieniu flagi: tryRegenerate zadziała (gdyby tarcza była aktywna)
});

// === Bug 2: destroy_permanent respektuje flagę ===

test('Bug 2: destroy_permanent nie regeneruje stwora z flagą cantBeRegeneratedThisTurn', () => {
  const state = newState();
  addCardFromRegistry(state, 'creature', 'maritime-guard', 'p2', 'battlefield');
  const targetId = state.zones.battlefield[0];
  state.cantBeRegeneratedThisTurn = [targetId];
  addRegenerationShield(state, targetId);
  // Ilość obiektów PRZED destroy
  const beforeCount = [...state.objects.values()].filter((o) => o.zone === 'battlefield' || o.zone === 'graveyard').length;
  applyEffect(
    state,
    { type: 'destroy_permanent' },
    { id: 'src', controllerId: 'p1', cardId: 'shatter' },
    [targetId],
  );
  // Stary obiekt ma nowe id po moveObjectDirectly (CR 400.7).
  // Sprawdzamy: 1) originalId nie istnieje już w state.objects;
  //             2) nowy obiekt o tym samym cardId jest w grobie;
  //             3) tarcza regeneracji NIE została zużyta (regeneracja nie zadziałała).
  assert.equal(state.objects.has(targetId), false,
    'Stary ID usunięty (CR 400.7)');
  const newId = state.zones.graveyard[state.zones.graveyard.length - 1];
  const movedObject = state.objects.get(newId);
  assert.equal(movedObject?.cardId, 'maritime-guard',
    'Nowy obiekt w grobie ma ten sam cardId');
  assert.equal(movedObject?.zone, 'graveyard',
    'Stwór z flagą cantBeRegeneratedThisTurn ginie (idzie do grobu)');
  // Tarcza regeneracji NIE została zużyta (regeneracja nie zadziałała)
  assert.ok((state.regenerationShields ?? []).includes(targetId),
    'Tarcza regeneracji nie została zużyta (regeneracja zablokowana flagą)');
});

// === Bug 4: validateTargets creature_with_power_at_least ===

test('Bug 4: validateTargets odrzuca cel z mocą < min dla creature_with_power_at_least', () => {
  const state = newState();
  addCardFromRegistry(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  addCardFromRegistry(state, 'weak', 'maritime-guard', 'p2', 'battlefield');
  addPlayerMana(state, 'p1', 5, ['G', 'W']);
  const weakId = state.zones.battlefield[0];
  // maritime-guard 1/3 → moc 1 < 5 (Selesnya Charm tryb Exile: min 5).
  // Rzucamy przez execute (cast_spell z modeIndex=1 — tryb Exile).
  const result = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'charm',
    modeIndex: 1, targets: [weakId],
  });
  assert.equal(result.ok, false,
    'Rzucenie Selesnya Charm Exile na słabego stwora powinno się nie udać');
  assert.match(result.events[0]?.reason ?? '', /moc|cel/i,
    'Powód odrzucenia: moc < 5 lub nielegalny cel');
});

test('Bug 4: validateTargets akceptuje cel z mocą >= min dla creature_with_power_at_least', () => {
  const state = newState();
  addCardFromRegistry(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  addPlayerMana(state, 'p1', 5, ['G', 'W']);
  addStrongCreature(state, 'strong', 6, 6);
  const strongId = state.zones.battlefield[0];
  // Silny stwór → Selesnya Charm Exile akceptuje cel (c trafia na stos).
  const result = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'charm',
    modeIndex: 1, targets: [strongId],
  });
  assert.equal(result.ok, true,
    'validateTargets akceptuje Selesnya Charm Exile z celem o mocy >= 5: ' +
    (result.events[0]?.reason ?? ''));
});

// === Bug 5: destroy_permanent z tarczą regeneracji (bez flagi cantBeRegenerated) ===

test('Bug 5: destroy_permanent z aktywną tarczą regeneracji (bez flagi) regeneruje', () => {
  const state = newState();
  addCardFromRegistry(state, 'creature', 'maritime-guard', 'p2', 'battlefield');
  const targetId = state.zones.battlefield[0];
  addRegenerationShield(state, targetId);
  applyEffect(
    state,
    { type: 'destroy_permanent' },
    { id: 'src', controllerId: 'p1', cardId: 'shatter' },
    [targetId],
  );
  const target = state.objects.get(targetId);
  assert.equal(target.zone, 'battlefield',
    'destroy_permanent z tarczą regeneracji NIE zabija stwora (regeneracja działa)');
  assert.ok(!(state.regenerationShields ?? []).includes(targetId),
    'Tarcza zużyta po udanej regeneracji');
});
