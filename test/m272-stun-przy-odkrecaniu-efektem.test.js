import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';
import { applyEffect } from '../src/engine/effects.js';
import { untapObject } from '../src/engine/permanents.js';

/**
 * M272 (błąd #18, CR 122.1d + 614.6) — „One or more stun counters on
 * a permanent create a single replacement effect ...: If a permanent with
 * a stun counter on it would become untapped, instead remove a stun counter
 * from it." Zastąpienie działa przy odkręceniu z DOWOLNEGO powodu, nie tylko
 * w kroku odkręcania (ruling WotC: „including its controller's untap step,
 * a spell or ability trying to untap it").
 *
 * PIĘĆ ścieżek efektów odkręcających mutowało `tapped: false` ręcznie,
 * omijając zarówno licznik stun, jak i blokadę odkręcania (`untapLockedBy`).
 * Stwór ze stunem wstawał za darmo, zachowując licznik.
 *
 * Strażnik KLASOWY: porównuje każdą ścieżkę z zachowaniem wzorcowego helpera.
 */
const registry = createCardRegistry();

function stan({ stun = 0, lock = false } = {}) {
  const stwor = registry.get('highland-game');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'c', instanceId: 'ic', cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(stwor), types: stwor.types,
  });
  state.objects.set('c', Object.freeze({
    ...state.objects.get('c'), tapped: true, summoningSickness: false,
  }));
  if (stun > 0) addCounter(state, 'c', 'stun', stun);
  const zrodlo = registry.get('twiddle');
  addObject(state, {
    id: 's', instanceId: 'is', cardId: 'twiddle', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(zrodlo), types: zrodlo.types,
  });
  if (lock) {
    state.objects.set('s', Object.freeze({ ...state.objects.get('s'), kind: 'aura', attachedTo: 'c' }));
    state.objects.set('c', Object.freeze({ ...state.objects.get('c'), untapLockedBy: ['s'] }));
  }
  state.events.length = 0;
  return state;
}

// Ścieżki odkręcania przez EFEKT — każda musi zachować się jak helper.
const sciezki = [
  ['untap_permanent', (s) => applyEffect(s, { type: 'untap_permanent' }, s.objects.get('s'), ['c'])],
  ['untap_all_creatures_you_control', (s) => applyEffect(s, { type: 'untap_all_creatures_you_control' }, s.objects.get('s'), [])],
  ['untap_enchanted_permanent', (s) => {
    s.objects.set('s', Object.freeze({ ...s.objects.get('s'), attachedTo: 'c' }));
    applyEffect(s, { type: 'untap_enchanted_permanent' }, s.objects.get('s'), []);
  }],
];

test('wzorzec: helper untapObject zdejmuje stun zamiast odkręcać', () => {
  const state = stan({ stun: 1 });
  untapObject(state, 'c', 'p1');
  const stwor = state.objects.get('c');
  assert.equal(stwor.tapped, true, 'permanent NIE wstaje');
  assert.equal(stwor.counters.stun ?? 0, 0, 'zdjęty jeden licznik stun');
});

test('KLASA: każda ścieżka efektu respektuje licznik stun (CR 122.1d)', () => {
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan({ stun: 1 });
    wykonaj(state);
    const stwor = state.objects.get('c');
    assert.equal(stwor.tapped, true, `${nazwa}: permanent zostaje tapnięty`);
    assert.equal(stwor.counters.stun ?? 0, 0, `${nazwa}: zdjęty dokładnie jeden stun`);
  }
});

test('KLASA: zdjęcie stunu NIE jest odkręceniem — brak object_untapped', () => {
  // Ruling WotC: „Abilities that trigger whenever a permanent is untapped
  // won't trigger if a stun counter is removed instead."
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan({ stun: 1 });
    wykonaj(state);
    const untapped = state.events.filter((e) => e.type === 'object_untapped');
    assert.equal(untapped.length, 0, `${nazwa}: brak zdarzenia odkręcenia`);
  }
});

test('KLASA: przy DWÓCH stunach zdejmowany jest dokładnie jeden', () => {
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan({ stun: 2 });
    wykonaj(state);
    assert.equal(state.objects.get('c').counters.stun, 1, `${nazwa}: drugi licznik zostaje`);
  }
});

test('KLASA: kontrola negatywna — bez stunu permanent normalnie wstaje', () => {
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan();
    wykonaj(state);
    assert.equal(state.objects.get('c').tapped, false, `${nazwa}: odkręcony`);
    assert.equal(
      state.events.filter((e) => e.type === 'object_untapped').length, 1,
      `${nazwa}: dokładnie jedno zdarzenie odkręcenia`,
    );
  }
});

test('KLASA: blokada odkręcania (untapLockedBy) też obowiązuje efekty', () => {
  for (const [nazwa, wykonaj] of sciezki) {
    const state = stan({ lock: true });
    wykonaj(state);
    assert.equal(state.objects.get('c').tapped, true, `${nazwa}: blokada trzyma`);
  }
});

test('żadna ścieżka odkręcania nie mutuje tapped: false ręcznie', () => {
  const zrodlo = fs.readFileSync('src/engine/effects.js', 'utf8');
  const linie = zrodlo.split('\n');
  linie.forEach((linia, index) => {
    if (!linia.includes("event('object_untapped'")) return;
    const kontekst = linie.slice(Math.max(0, index - 10), index + 1).join('\n');
    assert.ok(
      !kontekst.includes('tapped: false'),
      `effects.js:${index + 1} — odkręcenie z pominięciem untapByEffect (CR 122.1d)`,
    );
  });
});
