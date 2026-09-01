import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';

/**
 * M269 / CR 611.2c — zbiór obiektów dotkniętych efektem ciągłym „until end of
 * turn" jest ustalany PRZY ROZSTRZYGNIĘCIU i nie zmienia się do końca tury.
 * Zmiana KONTROLI nad permanentem (gain control until end of turn) nie zdejmuje
 * bonusu ani osłabienia: efekt dotyczy konkretnych obiektów, nie „tego, co
 * kontrolujesz teraz". Strażnik KLASOWY — sprawdza mechanizm buffów, a nie
 * pojedynczą kartę (ADR 0002).
 */
function stan() {
  const registry = createCardRegistry();
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const descriptor = registry.get('giant-spider');
  addObject(state, {
    id: 'c1', instanceId: 'i1', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor),
    types: descriptor.types, keywords: descriptor.keywords, subtypes: descriptor.subtypes,
  });
  return state;
}

const przejmij = (state, id, playerId) => state.objects.set(
  id, Object.freeze({ ...state.objects.get(id), controllerId: playerId }),
);

test('CR 611.2c: buff grupowy zostaje przy stworze po zmianie kontroli', () => {
  const state = stan();
  state.untilEndOfTurnBuffs = [Object.freeze({
    controllerId: 'p1', opponent: false, objectIds: Object.freeze(['c1']),
    power: 2, toughness: 2, keywords: Object.freeze([]),
  })];
  const spider = () => state.objects.get('c1');
  assert.equal(effectivePower(spider(), state), 4);
  assert.equal(effectiveToughness(spider(), state), 6);
  przejmij(state, 'c1', 'p2');
  assert.equal(effectivePower(spider(), state), 4, 'kradzież nie zdejmuje +X/+X');
  assert.equal(effectiveToughness(spider(), state), 6, 'kradzież nie zdejmuje +X/+X');
});

test('CR 611.2c: buff UJEMNY też zostaje — kradzież nie leczy osłabienia', () => {
  const state = stan();
  // Hysterical Blindness: „Creatures your opponents control get -4/-0".
  state.untilEndOfTurnBuffs = [Object.freeze({
    controllerId: 'p2', opponent: true, objectIds: Object.freeze(['c1']),
    power: -4, toughness: 0, keywords: Object.freeze([]),
  })];
  const spider = () => state.objects.get('c1');
  // CR 107.1b: moc MOŻE być ujemna (podłoga 0 obowiązuje przy zadawaniu obrażeń).
  assert.equal(effectivePower(spider(), state), -2, '2 - 4 = -2');
  przejmij(state, 'c1', 'p2');
  assert.equal(effectivePower(spider(), state), -2, 'przejęcie nie kasuje -4/-0');
});

test('CR 611.2c: buff pojedynczego celu (objectId) przeżywa zmianę kontroli', () => {
  const state = stan();
  state.untilEndOfTurnBuffs = [Object.freeze({
    controllerId: 'p1', objectId: 'c1', opponent: false,
    power: 3, toughness: 3, keywords: Object.freeze(['flying']),
  })];
  const spider = () => state.objects.get('c1');
  assert.equal(effectivePower(spider(), state), 5);
  przejmij(state, 'c1', 'p2');
  assert.equal(effectivePower(spider(), state), 5, 'pump celowany zostaje przy obiekcie');
  assert.equal(effectiveToughness(spider(), state), 7);
});

test('zbiór zamrożony: obiekt spoza objectIds nie łapie buffa mimo kontroli', () => {
  const state = stan();
  const registry = createCardRegistry();
  const descriptor = registry.get('giant-spider');
  addObject(state, {
    id: 'c2', instanceId: 'i2', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor),
    types: descriptor.types, keywords: descriptor.keywords, subtypes: descriptor.subtypes,
  });
  state.untilEndOfTurnBuffs = [Object.freeze({
    controllerId: 'p1', opponent: false, objectIds: Object.freeze(['c1']),
    power: 2, toughness: 2, keywords: Object.freeze([]),
  })];
  assert.equal(effectivePower(state.objects.get('c2'), state), 2, 'świeży stwór poza zbiorem');
  assert.equal(effectivePower(state.objects.get('c1'), state), 4);
});
