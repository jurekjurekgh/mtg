import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineCard } from '../src/cards/registry.js';
import { SYNTHETIC_CARDS, SYNTHETIC_SET, createCardRegistry } from '../src/cards/card-data.js';
import { querySupportedCards } from '../src/cards/catalog.js';
import { gameObjectDataOf, createCardDeck, setupCardMatch } from '../src/cards/materialize.js';

test('syntetyczny katalog jest oznaczony i zawiera mieszankę statusów', () => {
  assert.ok(SYNTHETIC_CARDS.length >= 6);
  const statuses = new Set(SYNTHETIC_CARDS.map((card) => card.support.status));
  assert.deepEqual([...statuses].sort(), ['in-development', 'limited', 'supported', 'unsupported']);
  assert.ok(SYNTHETIC_CARDS.every((card) => card.set === SYNTHETIC_SET));
  assert.ok(SYNTHETIC_CARDS.every((card) => card.name.startsWith('Synthetic')));
});

test('katalog filtruje supported po planie, setcie i nazwie', () => {
  const registry = createCardRegistry();
  assert.deepEqual(querySupportedCards(registry, { plan: 'aggro' }).map((card) => card.id), ['syn-mountain', 'syn-razorback', 'syn-pummeler', 'syn-shock', 'syn-swarmsummon']);
  assert.deepEqual(querySupportedCards(registry, { set: 'synth', name: 'wood' }).map((card) => card.id), ['syn-woodcaller']);
  // limited i in-development nie są proponowane kreatorowi.
  assert.equal(querySupportedCards(registry, { name: 'colossus' }).length, 0);
  // 'Synthetic Apprentice' jest in-development; realny Apprentice Wizard
  // (Batch 7) jest supported — filtr po secie oddziela katalogi.
  assert.equal(querySupportedCards(registry, { set: 'synth', name: 'apprentice' }).length, 0);
  assert.deepEqual(querySupportedCards(registry, { name: 'apprentice' }).map((card) => card.id), ['apprentice-wizard']);
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
  assert.deepEqual(gameObjectDataOf(registry.get('syn-mountain')), { kind: 'land', entersTapped: false, abilities: [], colors: ['R'] });
  assert.deepEqual(gameObjectDataOf(registry.get('syn-razorback')), { kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], colors: ['R'] });
  assert.deepEqual(gameObjectDataOf(registry.get('syn-mystery')), { kind: 'card', manaCost: 1, abilities: [], colors: ['G'] });
  assert.throws(() => gameObjectDataOf(null), /Nieznana/);
});

test('talia kart odrzuca karty bez statusu supported', () => {
  const registry = createCardRegistry();
  assert.throws(() => createCardDeck({ cardIds: ['syn-apprentice'], ownerId: 'p1', registry }), /nieobsługiwane/);
  assert.throws(() => createCardDeck({ cardIds: ['syn-mystery'], ownerId: 'p1', registry }), /nieobsługiwane/);
});

test('partia składana z definicji tasuje biblioteki i rozdaje ręce ze statystykami', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    ['p1', ['syn-mountain', 'syn-mountain', 'syn-razorback', 'syn-razorback', 'syn-pummeler', 'syn-mountain', 'syn-razorback', 'syn-pummeler', 'syn-mountain', 'syn-razorback']],
    ['p2', ['syn-forest', 'syn-forest', 'syn-woodcaller', 'syn-woodcaller', 'syn-elder-tusker', 'syn-forest', 'syn-woodcaller', 'syn-elder-tusker', 'syn-forest', 'syn-woodcaller']],
  ]);
  const state = setupCardMatch({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }], decks, registry, openingHandSize: 3 });
  assert.equal(state.zones.hand.length, 6);
  assert.equal(state.zones.library.length, 14);
  const all = [...state.objects.values()];
  assert.equal(all.filter((o) => o.kind === 'land').length, 8);
  assert.equal(all.filter((o) => o.kind === 'creature').length, 12);
  const razorback = all.find((o) => o.cardId === 'syn-razorback');
  assert.deepEqual({ power: razorback.power, toughness: razorback.toughness, manaCost: razorback.manaCost }, { power: 2, toughness: 2, manaCost: 1 });
  // Ten sam seed daje identyczną instalację.
  const again = setupCardMatch({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }], decks, registry, openingHandSize: 3 });
  assert.deepEqual(again.zones.library, state.zones.library);
});
