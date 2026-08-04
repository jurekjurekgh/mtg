import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineCard } from '../src/cards/registry.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { querySupportedCards } from '../src/cards/catalog.js';
import { gameObjectDataOf, createCardDeck, setupCardMatch } from '../src/cards/materialize.js';

test('katalog zawiera realne karty i wirtualne landy podstawowe', () => {
  const registry = createCardRegistry();
  assert.ok(registry.supported().length >= 70, 'sporo realnych kart supported');
  assert.ok(registry.has('highland-game'));
  assert.ok(registry.has('basic-forest'));
  // Tokeny są limited (nie w kreatorze, nie supported).
  assert.equal(registry.get('token_wolf').support.status, 'limited');
});

test('katalog filtruje supported po planie, secie i nazwie', () => {
  const registry = createCardRegistry();
  // Filtr po planie (settingu) — np. Tarkir.
  const tarkir = querySupportedCards(registry, { plan: 'tarkir' }).map((card) => card.id);
  assert.ok(tarkir.includes('highland-game'));
  // Filtr po secie.
  const ktks = querySupportedCards(registry, { set: 'ktk' }).map((card) => card.id);
  assert.ok(ktks.includes('highland-game'));
  // Filtr po nazwie.
  assert.deepEqual(querySupportedCards(registry, { name: 'highland game' }).map((card) => card.id), ['highland-game']);
  // Token (limited) nie jest proponowany kreatorowi.
  assert.ok(!querySupportedCards(registry).some((card) => card.id === 'token_wolf'));
});

test('registry odrzuca nieprawidłowe statystyki definicji', () => {
  const base = { id: 'bad', name: 'Bad Card', support: { status: 'supported' } };
  assert.throws(() => defineCard({ ...base, power: -1 }), RangeError);
  assert.throws(() => defineCard({ ...base, toughness: 1.5 }), RangeError);
  assert.throws(() => defineCard({ ...base, manaCost: Number.NaN }), RangeError);
  assert.equal(defineCard({ ...base, manaCost: 2 }).manaCost, 2);
});

test('materializacja przenosi statystyki permanentów z definicji do obiektu gry', () => {
  const registry = createCardRegistry();
  // Kolory karty trafiają na obiekt gry (publiczne dane — trigger „a player
  // casts a white spell" czyta je z obiektu czaru; ADR 0002).
  const mountain = gameObjectDataOf(registry.get('basic-mountain'));
  assert.equal(mountain.kind, 'land');
  assert.deepEqual(mountain.colors, ['R']);
  const highland = gameObjectDataOf(registry.get('highland-game'));
  assert.deepEqual({ kind: highland.kind, power: highland.power, toughness: highland.toughness, manaCost: highland.manaCost }, { kind: 'creature', power: 2, toughness: 1, manaCost: 2 });
  assert.throws(() => gameObjectDataOf(null), /Nieznana/);
});

test('talia kart odrzuca karty bez statusu supported', () => {
  const registry = createCardRegistry();
  // Token (limited) nie jest taliowalny.
  assert.throws(() => createCardDeck({ cardIds: ['token_wolf'], ownerId: 'p1', registry }), /nieobsługiwane/);
});

test('partia składana z definicji tasuje biblioteki i rozdaje ręce ze statystykami', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    ['p1', ['basic-mountain', 'basic-mountain', 'highland-game', 'highland-game', 'goblin-piker', 'basic-mountain', 'highland-game', 'goblin-piker', 'basic-mountain', 'highland-game']],
    ['p2', ['basic-forest', 'basic-forest', 'kappa-tech-wrecker', 'kappa-tech-wrecker', 'segmented-krotiq', 'basic-forest', 'kappa-tech-wrecker', 'segmented-krotiq', 'basic-forest', 'kappa-tech-wrecker']],
  ]);
  const state = setupCardMatch({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }], decks, registry, openingHandSize: 3 });
  assert.equal(state.zones.hand.length, 6);
  assert.equal(state.zones.library.length, 14);
  const all = [...state.objects.values()];
  assert.equal(all.filter((o) => o.kind === 'land').length, 8);
  assert.equal(all.filter((o) => o.kind === 'creature').length, 12);
  const highland = all.find((o) => o.cardId === 'highland-game');
  assert.deepEqual({ power: highland.power, toughness: highland.toughness, manaCost: highland.manaCost }, { power: 2, toughness: 1, manaCost: 2 });
  // Ten sam seed daje identyczną instalację.
  const again = setupCardMatch({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }], decks, registry, openingHandSize: 3 });
  assert.deepEqual(again.zones.library, state.zones.library);
});
