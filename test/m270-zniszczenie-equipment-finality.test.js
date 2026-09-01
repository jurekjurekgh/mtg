import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addCounter } from '../src/engine/counters.js';

/**
 * M270 błąd #7 — `destroy_equipment_attached` niszczył Equipment własną
 * ścieżką: na sztywno do CMENTARZA i bez `toZone` w zdarzeniu. Licznik
 * finality (CR 122.1e, „If it would die, exile it instead") był ignorowany,
 * więc Equipment zwrócone przez Zoraline („nonland permanent card with mana
 * value 3 or less") dawało się odzyskać drugi raz. Brak `toZone` dodatkowo
 * mylił triggery śmierci (triggers.js pomija „dies", gdy toZone === 'exile').
 * Strażnik KLASOWY: kontrakt „zniszczenie pyta deathZoneFor i raportuje
 * strefę" (ADR 0002).
 */
function stan({ finality }) {
  const registry = createCardRegistry();
  const creature = registry.get('giant-spider');
  const equipment = registry.get('warriors-sword');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'host', instanceId: 'i1', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(creature), types: creature.types,
  });
  addObject(state, {
    id: 'sword', instanceId: 'i2', cardId: 'warriors-sword',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(equipment), types: equipment.types, equipment: equipment.equipment,
  });
  state.objects.set('sword', Object.freeze({ ...state.objects.get('sword'), attachedTo: 'host' }));
  if (finality) addCounter(state, 'sword', 'finality', 1);
  state.events.length = 0;
  return state;
}

const zniszcz = (state) => applyEffect(
  state, { type: 'destroy_equipment_attached', confirmed: true },
  state.objects.get('host'), ['host'],
);

const miecz = (state) => [...state.objects.values()].find((o) => o.cardId === 'warriors-sword');

test('Equipment z licznikiem finality idzie do wygnania, nie do cmentarza', () => {
  const state = stan({ finality: true });
  zniszcz(state);
  assert.equal(miecz(state).zone, 'exile');
});

test('zdarzenie zniszczenia niesie toZone (triggery śmierci go czytają)', () => {
  const state = stan({ finality: true });
  zniszcz(state);
  const wpis = state.events.find((e) => e.type === 'permanent_destroyed');
  assert.ok(wpis, 'zniszczenie jest zdarzeniem');
  assert.equal(wpis.toZone, 'exile', 'bez tego trigger „dies" odpaliłby mimo wygnania');
});

test('bez licznika finality Equipment idzie normalnie do cmentarza', () => {
  const state = stan({ finality: false });
  zniszcz(state);
  assert.equal(miecz(state).zone, 'graveyard', 'kontrola negatywna');
  const wpis = state.events.find((e) => e.type === 'permanent_destroyed');
  assert.equal(wpis.toZone, 'graveyard');
});

test('naznaczenie exileIfDiesThisTurn działa tak samo jak licznik', () => {
  const state = stan({ finality: false });
  state.exileIfDiesThisTurn = [{ id: 'sword', byCardId: 'test' }];
  zniszcz(state);
  assert.equal(miecz(state).zone, 'exile', 'druga przyczyna z deathZoneFor');
});
