// E8/B1 (wyzwanie wyłapywacza błędów): REGENERACJA KONSUMUJE WSZYSTKIE TARCZE.
//
// CR 701.15b: każdy efekt „Regenerate [permanent]" tworzy zastępczy efekt
// chroniący przy NASTĘPNEJ próbie zniszczenia — czyli JEDNA tarcza = jedno
// uratowanie. Dwie tarcze na tym samym permanencie ratują DWUKROTNIE.
// `tryRegenerate` (state-based.js) robiło `filter((id) => id !== object.id)`
// — jedne zniszczenie konsumowało wszystkie tarcze naraz, więc drugie
// zniszczenie w tej samej turze zabijało mimo drugiej (nietkniętej) tarczy.
//
// Pin: tarcze znikają PO JEDNEJ; nadmiarowa tarcza czeka na kolejne
// zniszczenie, trzecie zniszczenie (bez tarczy) zabija.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { addRegenerationShield } from '../src/engine/state-based.js';
import { destroyPermanentAndClear } from './helpers/e8-destroy-harness.js';

// Obiekt zmienia id przy zmianie strefy (CR 400.7) — szukamy po cardId.
function husk(state) {
  return [...state.objects.values()].find((o) => o.cardId === 'basic-husk');
}

function creature(state, id) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-husk', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['B'], abilities: [], keywords: [], subtypes: [],
  });
  return state.objects.get(id);
}

test('E8/B1: dwie tarcze regeneracji ratują DWUKROTNIE (jedna tarcza = jedno zniszczenie)', () => {
  const state = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  creature(state, 'husk');
  addRegenerationShield(state, 'husk');
  addRegenerationShield(state, 'husk');
  // 1. zniszczenie — tarcza nr 1.
  assert.equal(destroyPermanentAndClear(state, 'husk'), false, '1. zniszczenie zastąpione');
  assert.equal((state.regenerationShields ?? []).filter((id) => id === 'husk').length, 1,
    'ZOSTAJE dokładnie jedna tarcza (było: wszystkie konsumowane naraz)');
  assert.equal(husk(state).zone, 'battlefield', 'stwór żyje');
  // 2. zniszczenie — tarcza nr 2.
  assert.equal(destroyPermanentAndClear(state, 'husk'), false, '2. zniszczenie też zastąpione');
  assert.equal((state.regenerationShields ?? []).filter((id) => id === 'husk').length, 0, 'tarcze wyczerpane');
  assert.equal(husk(state).zone, 'battlefield', 'stwór nadal żyje');
  // 3. zniszczenie — bez tarczy: śmierć (CR 701.15a).
  assert.equal(destroyPermanentAndClear(state, 'husk'), true, '3. zniszczenie skuteczne');
  assert.equal(husk(state).zone, 'graveyard', 'stwór w grobie');
});
