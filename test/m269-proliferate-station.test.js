import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addCounter } from '../src/engine/counters.js';

/**
 * M269 błąd #2 — proliferate (CR 701.27) dokładał liczniki WŁASNĄ ścieżką,
 * omijając wspólny helper `addCounter`, a więc i `syncStationKind`. Spacecraft
 * ze station dobity proliferatem do progu („It's an artifact creature at 6+")
 * zostawał zwykłym artefaktem — nie mógł atakować ani blokować (CR 205.1).
 * Strażnik KLASOWY: sprawdza RÓWNOWAŻNOŚĆ obu ścieżek dokładania licznika,
 * a nie zachowanie konkretnej karty (ADR 0002).
 */
function stan(charge) {
  const registry = createCardRegistry();
  const descriptor = registry.get('warmaker-gunship');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'ship', instanceId: 'i1', cardId: 'warmaker-gunship',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor),
    types: descriptor.types, subtypes: descriptor.subtypes, station: descriptor.station,
  });
  addObject(state, {
    id: 'src', instanceId: 'i2', cardId: 'warmaker-gunship',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor),
    types: descriptor.types, subtypes: descriptor.subtypes,
  });
  if (charge > 0) addCounter(state, 'ship', 'charge', charge);
  return state;
}

// Proliferate kolejkuje decyzję gracza (pendingProliferate), potem ją wykonuje.
function proliferuj(state, targets) {
  applyEffect(state, { type: 'proliferate' }, state.objects.get('src'), targets);
  applyEffect(state, { type: 'proliferate' }, state.objects.get('src'), targets);
}

test('proliferate przekraczający próg station robi ze Spacecraft stwora', () => {
  const state = stan(5);
  assert.equal(state.objects.get('ship').kind, 'artifact', 'przed progiem: artefakt');
  proliferuj(state, ['ship']);
  const ship = state.objects.get('ship');
  assert.equal(ship.counters.charge, 6, 'licznik doliczony');
  assert.equal(ship.kind, 'creature', 'próg 6 osiągnięty — artifact creature');
  assert.ok(ship.types.includes('Creature'), 'typ Creature dołożony (CR 205.1)');
});

test('obie ścieżki dokładania licznika dają IDENTYCZNY stan station', () => {
  const przezHelper = stan(5);
  addCounter(przezHelper, 'ship', 'charge', 1);
  const przezProliferate = stan(5);
  proliferuj(przezProliferate, ['ship']);
  const a = przezHelper.objects.get('ship');
  const b = przezProliferate.objects.get('ship');
  assert.equal(b.kind, a.kind, 'ten sam kind niezależnie od ścieżki');
  assert.deepEqual(b.types, a.types, 'te same typy niezależnie od ścieżki');
  assert.equal(b.counters.charge, a.counters.charge);
});

test('proliferate poniżej progu NIE zamienia Spacecraft w stwora', () => {
  const state = stan(3);
  proliferuj(state, ['ship']);
  const ship = state.objects.get('ship');
  assert.equal(ship.counters.charge, 4);
  assert.equal(ship.kind, 'artifact', '4 < próg 6 — wciąż artefakt');
});

test('proliferate emituje counter_added ze znacznikiem fromProliferate', () => {
  const state = stan(5);
  state.events.length = 0;
  proliferuj(state, ['ship']);
  const dodane = state.events.filter((e) => e.type === 'counter_added');
  assert.equal(dodane.length, 1);
  assert.equal(dodane[0].fromProliferate, true, 'log odróżnia proliferate');
  assert.equal(dodane[0].total, 6, 'zdarzenie niesie stan po zmianie');
  assert.ok(
    state.events.some((e) => e.type === 'station_status_changed'),
    'przekroczenie progu jest widoczne dla gracza',
  );
});
