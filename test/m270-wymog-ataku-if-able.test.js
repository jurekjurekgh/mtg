import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { declareAttackers, legalAttackerOptions } from '../src/engine/combat.js';

/**
 * M270 błąd #9 (CR 508.1c) — wymóg „attacks each combat IF ABLE" (goad,
 * mustAttack) obowiązuje wyłącznie wtedy, gdy stwór faktycznie MOŻE zostać
 * legalnie zadeklarowany. Stwór z „can't attack alone" (Ember Beast,
 * CR 508.1d), będący jedynym zdolnym do ataku stworem, atakować nie może —
 * więc wymóg go nie dotyczy. Bez tego powstawał DEADLOCK: pusta deklaracja
 * łamała wymóg ataku, a deklaracja z nim samym łamała „can't attack alone",
 * czyli gracz nie miał ANI JEDNEJ legalnej komendy.
 */
function stan({ zPartnerem }) {
  const registry = createCardRegistry();
  const beast = registry.get('ember-beast');
  const spider = registry.get('giant-spider');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  addObject(state, {
    id: 'e', instanceId: 'i1', cardId: 'ember-beast',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(beast),
    types: beast.types, subtypes: beast.subtypes,
    keywords: beast.keywords, abilities: beast.abilities,
  });
  state.objects.set('e', Object.freeze({
    ...state.objects.get('e'), summoningSickness: false, goaded: true,
  }));
  if (zPartnerem) {
    addObject(state, {
      id: 'p', instanceId: 'i2', cardId: 'giant-spider',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      ...gameObjectDataOf(spider), types: spider.types,
    });
    state.objects.set('p', Object.freeze({ ...state.objects.get('p'), summoningSickness: false }));
  }
  return state;
}

const deklaruj = (state, ids) => {
  try {
    declareAttackers(state, 'p1', ids);
    return 'ok';
  } catch (err) {
    return err.message;
  }
};

test('goadowany „can\'t attack alone" bez partnera: pusta deklaracja jest legalna', () => {
  assert.equal(deklaruj(stan({ zPartnerem: false }), []), 'ok');
});

test('samotny atak takiego stwora pozostaje nielegalny (CR 508.1d)', () => {
  const wynik = deklaruj(stan({ zPartnerem: false }), ['e']);
  assert.notEqual(wynik, 'ok');
  assert.match(wynik, /alone/);
});

test('gracz ZAWSZE ma legalną opcję deklaracji (brak deadlocku)', () => {
  const state = stan({ zPartnerem: false });
  const opcje = legalAttackerOptions(state, 'p1');
  assert.ok(opcje.length > 0, 'silnik oferuje przynajmniej jedną deklarację');
  const legalne = opcje.filter((ids) => deklaruj(stan({ zPartnerem: false }), ids) === 'ok');
  assert.ok(legalne.length > 0, 'co najmniej jedna oferta przechodzi walidację');
});

test('z partnerem wymóg ataku NADAL obowiązuje (kontrola negatywna)', () => {
  assert.notEqual(deklaruj(stan({ zPartnerem: true }), []), 'ok', 'pominięcie goada nielegalne');
  assert.notEqual(deklaruj(stan({ zPartnerem: true }), ['p']), 'ok', 'goadowany musi atakować');
  assert.equal(deklaruj(stan({ zPartnerem: true }), ['e', 'p']), 'ok', 'atak w parze legalny');
});
