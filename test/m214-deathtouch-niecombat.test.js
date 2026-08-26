// M214 — audyt reguł MtG (odznaka wyłapywacza błędów, znalezisko #2):
// deathtouch (CR 702.4) przy obrażeniach NIEcombatowych.
//
// CR 702.4b: „Any amount of damage this deals to a creature is enough to
// destroy it." Reguła nie mówi „combat damage" — dotyczy KAŻDEGO zadania
// obrażeń przez stwora z deathtouch: fight (Malamet Battle Glyph),
// „deals damage equal to its power" (Assert Perfection), triggery.
//
// Objaw sprzed naprawy: `dealNonCombatDamage` nie ustawiała
// `damagedByDeathtouch` (robił to wyłącznie combat.js), więc SBA nie miała
// flagi i stwór 1/2 z deathtouch zadający 1 obrażenie niecombatowe nie
// zabijał 4/4 — obrażenia < wytrzymałości, brak śmierci.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { dealNonCombatDamage } from '../src/engine/effects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

function stateWithDeathtoucher({ deathtouch = true } = {}) {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  const def = REGISTRY.get('deadly-recluse');
  addObject(state, {
    id: 'a', instanceId: 'i-a', cardId: 'deadly-recluse', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 2, types: ['Creature'],
    keywords: deathtouch ? ['deathtouch'] : [], subtypes: [], abilities: def?.abilities ?? [],
  });
  addObject(state, {
    id: 'b', instanceId: 'i-b', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 4, toughness: 4, types: ['Creature'],
    keywords: [], subtypes: [], abilities: [],
  });
  return state;
}

test('M214: 1 obrażenie z deathtouch w FIGHT zabija 4/4 (CR 702.4b)', () => {
  const state = stateWithDeathtoucher();
  dealNonCombatDamage(state, state.objects.get('a'), 'b', 1);
  assert.equal(state.objects.get('b').damagedByDeathtouch, true, 'flaga ustawiona po obrażeniach');
  const events = runStateBasedActions(state);
  // CR 400.7: obiekt po zmianie strefy ma NOWE id — szukamy po cardId w grobie.
  const inGrave = state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'hill-giant');
  assert.ok(inGrave || events.some((e) => e.type === 'creature_destroyed'),
    'SBA przenosi stwora do grobu po obrażeniach z deathtouch');
});

test('M214: obrażenia z deathtouch do GRACZA nie zabijają stwora (cel-gracz)', () => {
  const state = stateWithDeathtoucher();
  // obrażenia do gracza — cel to player, nie creature — brak destrukcji
  dealNonCombatDamage(state, state.objects.get('a'), 'p2', 1);
  assert.equal(state.players[1].life, 19);
  assert.equal(state.objects.get('b').zone, 'battlefield', 'cel-gracz nie jest niszczony');
});

test('M214: stwór BEZ deathtouch nie zabija 4/4 takim samym obrażeniem', () => {
  const state = stateWithDeathtoucher({ deathtouch: false });
  dealNonCombatDamage(state, state.objects.get('a'), 'b', 1);
  runStateBasedActions(state);
  assert.equal(state.objects.get('b').zone, 'battlefield', 'obrażenia < wytrzymałości — przeżywa');
});

test('M214: prewencja (shield) kasuje obrażenia — deathtouch nie zabija', () => {
  const state = stateWithDeathtoucher();
  // 1 tarcza na celu — obrażenia w całości zapobiegnięte
  state.damageShields = [{ targetId: 'b', remaining: 1 }];
  dealNonCombatDamage(state, state.objects.get('a'), 'b', 1);
  runStateBasedActions(state);
  assert.equal(state.objects.get('b').zone, 'battlefield', 'zapobiegnięte obrażenia nie są zadane (CR 119.3)');
});
