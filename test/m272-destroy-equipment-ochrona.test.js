import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';
import { applyEffect } from '../src/engine/effects.js';

/**
 * M272 (błąd #19) — „destroy" to JEDNA procedura (CR 701.7a) z warstwą
 * efektów zastępujących: indestructible (CR 702.12), licznik shield
 * (CR 122.1), regeneracja (CR 701.15), a na końcu strefa śmierci wyznaczana
 * przez `deathZoneFor` (licznik finality → wygnanie, CR 122.1e).
 *
 * Sekwencję znała tylko ścieżka `destroy_permanent`. `destroy_equipment_attached`
 * (Awaken the Sleeper) miała własną, uboższą kopię i niszczyła chroniony
 * Equipment mimo ochrony. Ósma ofiara wzorca L107.
 *
 * Strażnik PORÓWNAWCZY: obie ścieżki muszą reagować tak samo na tę samą ochronę.
 */
const registry = createCardRegistry();

function stan({ counters = {}, keywords = [] } = {}) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const stwor = registry.get('highland-game');
  addObject(state, {
    id: 'k', instanceId: 'ik', cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(stwor), types: stwor.types,
  });
  // Equipment załączony do stwora — cel obu badanych ścieżek.
  addObject(state, {
    id: 'eq', instanceId: 'ieq', cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(stwor), types: ['Artifact'],
  });
  state.objects.set('eq', Object.freeze({
    ...state.objects.get('eq'), kind: 'artifact', equipment: true, attachedTo: 'k',
    keywordGrants: keywords,
  }));
  addObject(state, {
    id: 'src', instanceId: 'isrc', cardId: 'awaken-the-sleeper', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(stwor), types: ['Sorcery'],
  });
  for (const [nazwa, ile] of Object.entries(counters)) addCounter(state, 'eq', nazwa, ile);
  state.events.length = 0;
  return state;
}

const sciezki = [
  ['destroy_permanent', (s) => applyEffect(s, { type: 'destroy_permanent' }, s.objects.get('src'), ['eq'])],
  ['destroy_equipment_attached', (s) => applyEffect(s, { type: 'destroy_equipment_attached', confirmed: true }, s.objects.get('src'), ['k'])],
];

function zniszczony(state) {
  return (state.objects.get('eq')?.zone ?? 'graveyard') !== 'battlefield';
}

test('KLASA: indestructible chroni przed każdą ścieżką destroy (CR 702.12)', () => {
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan({ keywords: ['indestructible'] });
    wykonaj(state);
    assert.equal(zniszczony(state), false, `${nazwa}: niezniszczalny Equipment zostaje`);
    assert.equal(
      state.events.filter((e) => e.type === 'permanent_destroyed').length, 0,
      `${nazwa}: brak zdarzenia zniszczenia`,
    );
  }
});

test('KLASA: licznik shield pochłania zniszczenie w każdej ścieżce (CR 122.1)', () => {
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan({ counters: { shield: 1 } });
    wykonaj(state);
    assert.equal(zniszczony(state), false, `${nazwa}: tarcza chroni`);
    assert.equal(state.objects.get('eq').counters.shield ?? 0, 0, `${nazwa}: tarcza zużyta`);
    assert.equal(
      state.events.filter((e) => e.type === 'shield_consumed').length, 1,
      `${nazwa}: zdarzenie zużycia tarczy`,
    );
  }
});

test('KLASA: licznik finality kieruje zniszczenie do wygnania (CR 122.1e)', () => {
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan({ counters: { finality: 1 } });
    wykonaj(state);
    const zdarzenie = state.events.find((e) => e.type === 'permanent_destroyed');
    assert.ok(zdarzenie, `${nazwa}: zniszczenie nastąpiło`);
    assert.equal(zdarzenie.toZone, 'exile', `${nazwa}: strefą docelową jest wygnanie`);
  }
});

test('KLASA: kontrola negatywna — bez ochrony Equipment ginie do cmentarza', () => {
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan();
    wykonaj(state);
    assert.equal(zniszczony(state), true, `${nazwa}: zniszczony`);
    const zdarzenie = state.events.find((e) => e.type === 'permanent_destroyed');
    assert.equal(zdarzenie.toZone, 'graveyard', `${nazwa}: trafia na cmentarz`);
  }
});
