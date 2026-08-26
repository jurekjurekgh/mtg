// M214 — audyt reguł MtG (odznaka wyłapywacza błędów, znalezisko #3):
// Hunter's Blowgun — „Equipped creature has deathtouch during your turn.
// Otherwise, it has reach." — „your turn" odnosi się do KONTROLERA
// Blowguna (CR 109.5: „you"/„your" w tekście karty = kontroler tej karty),
// a nie kontrolera WYPOSAŻONEGO stwora.
//
// Objaw sprzed naprawy: `permanents.js` (conditionalKeywords,
// activePlayerIsController) porównywało `activePlayerId === object.controllerId`,
// gdzie `object` to NOSICIEL (wyposażony stwór), a nie załącznik. Gdy kontrola
// stwora różni się od kontroli Blowguna (np. przeciwnik rzuca Awaken the
// Sleeper — „gain control of target creature until end of turn" — i wybiera
// „may destroy Equipment" = NIE), keyword wraca do złej tury:
//   - tura przeciwnika (kontrolera stwora, nie Blowguna): kod dawał
//     deathtouch, a Oracle nakazuje reach („otherwise");
//   - tura kontrolera Blowguna: kod dawał reach, a Oracle nakazuje deathtouch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { effectiveKeywords } from '../src/engine/permanents.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const BLOWGUN_DEF = REGISTRY.get('hunters-blowgun');

/**
 * Stan: stwór `b` (2/2) na polu bitwy z Blowgunem załączonym (`attachedTo`).
 * `creatureController`/`blowgunController` pozwalają rozejść się kontrolom,
 * `activePlayerId` ustala czyją turę sprawdzamy.
 */
function blowgunState({ creatureController, blowgunController, activePlayerId }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...state.turn, activePlayerId, priorityPlayerId: activePlayerId };
  addObject(state, {
    id: 'b', instanceId: 'i-b', cardId: 'midnight-guard', controllerId: creatureController,
    ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    types: ['Creature'], keywords: [], subtypes: [], abilities: [],
  });
  addObject(state, {
    id: 'blow', instanceId: 'i-blow', cardId: 'hunters-blowgun', controllerId: blowgunController,
    ownerId: 'p1', zone: 'battlefield', kind: 'artifact', types: ['Artifact'],
    subtypes: ['Equipment'], keywords: [], abilities: BLOWGUN_DEF?.abilities ?? [],
    equipment: BLOWGUN_DEF?.equipment,
  });
  // addObject odrzuca pole spoza kontraktu (L21) — załączenie ustawiamy po
  // dodaniu (ta sama droga co attachEquipment, wzorzec equipState).
  const blow = state.objects.get('blow');
  state.objects.set('blow', Object.freeze({ ...blow, attachedTo: 'b' }));
  return state;
}

test('M214: spójna kontrola — w turze kontrolera Blowguna stwór ma deathtouch', () => {
  const state = blowgunState({ creatureController: 'p1', blowgunController: 'p1', activePlayerId: 'p1' });
  assert.deepEqual(effectiveKeywords(state.objects.get('b'), state).filter((k) => k === 'deathtouch' || k === 'reach'), ['deathtouch']);
});

test('M214: spójna kontrola — w turze przeciwnika (kontroler Blowguna p2) — deathtouch', () => {
  const state = blowgunState({ creatureController: 'p2', blowgunController: 'p2', activePlayerId: 'p2' });
  assert.deepEqual(effectiveKeywords(state.objects.get('b'), state).filter((k) => k === 'deathtouch' || k === 'reach'), ['deathtouch']);
});

test('M214: ROZDZIELONA kontrola — stwór przejęty (p2), Blowgun p1 — w turze p2 stwór ma REACH (CR 109.5)', () => {
  // Awaken the Sleeper: przeciwnik przejmuje stwora, zostawia Equipment
  // („you may destroy" — wybiera NIE). „your turn" = tura kontrolera
  // Blowguna (p1), więc w turze p2 działa „otherwise" → reach.
  const state = blowgunState({ creatureController: 'p2', blowgunController: 'p1', activePlayerId: 'p2' });
  assert.deepEqual(effectiveKeywords(state.objects.get('b'), state).filter((k) => k === 'deathtouch' || k === 'reach'), ['reach']);
});

test('M214: ROZDZIELONA kontrola — w turze kontrolera Blowguna (p1) przejęty stwór ma deathtouch', () => {
  const state = blowgunState({ creatureController: 'p2', blowgunController: 'p1', activePlayerId: 'p1' });
  assert.deepEqual(effectiveKeywords(state.objects.get('b'), state).filter((k) => k === 'deathtouch' || k === 'reach'), ['deathtouch']);
});
