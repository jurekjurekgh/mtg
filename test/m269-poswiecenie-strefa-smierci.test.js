import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addCounter } from '../src/engine/counters.js';
import { deathZoneFor } from '../src/engine/permanents.js';
import { tapTreasureForMana } from '../src/engine/resources.js';

/**
 * M269 błąd #5 — poświęcenie JEST śmiercią (CR 700.4 + 701.21a), więc strefę docelową
 * musi wyznaczać wspólny `deathZoneFor`: licznik finality (CR 122.1h,
 * „If it would die, exile it instead") i naznaczenie `exileIfDiesThisTurn`
 * kierują permanent do wygnania. Cztery ścieżki poświęcenia (koszt dodatkowy,
 * exploit, devour, wybór ofiary / Food) szły na sztywno do CMENTARZA, więc
 * stwór z licznikiem finality dawał się reanimować drugi raz.
 * Strażnik KLASOWY: porównuje ścieżki między sobą, nie karty (ADR 0002).
 */
function stanZFinality() {
  const registry = createCardRegistry();
  const descriptor = registry.get('giant-spider');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'vic', instanceId: 'i1', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor), types: descriptor.types,
  });
  addCounter(state, 'vic', 'finality', 1);
  return state;
}

const strefaOfiary = (state) => [...state.objects.values()]
  .find((o) => o.cardId === 'giant-spider').zone;

test('deathZoneFor kieruje permanent z licznikiem finality do wygnania', () => {
  const state = stanZFinality();
  assert.equal(deathZoneFor(state, state.objects.get('vic')), 'exile');
});

test('ścieżka referencyjna (efekt sacrifice_permanent) wygania', () => {
  const state = stanZFinality();
  applyEffect(state, { type: 'sacrifice_permanent' }, state.objects.get('vic'), ['vic']);
  assert.equal(strefaOfiary(state), 'exile');
});

test('resolve_sacrifice_choice wygania tak samo jak ścieżka referencyjna', () => {
  const state = stanZFinality();
  state.pendingSacrifice = { playerId: 'p1', candidateIds: ['vic'], restorePriorityTo: 'p1' };
  const wynik = execute(state, { type: 'resolve_sacrifice_choice', playerId: 'p1', targetId: 'vic' });
  assert.equal(wynik.ok, true);
  assert.equal(strefaOfiary(state), 'exile', 'wybór ofiary nie omija finality');
});

test('exploit wygania ofiarę z licznikiem finality', () => {
  const state = stanZFinality();
  state.pendingExploits = [{ playerId: 'p1', sourceId: 'vic', candidateIds: ['vic'] }];
  execute(state, { type: 'resolve_exploit_choice', playerId: 'p1', targetId: 'vic' });
  assert.equal(strefaOfiary(state), 'exile');
});

test('bez licznika finality poświęcenie idzie normalnie do cmentarza', () => {
  const registry = createCardRegistry();
  const descriptor = registry.get('giant-spider');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'vic', instanceId: 'i1', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor), types: descriptor.types,
  });
  state.pendingSacrifice = { playerId: 'p1', candidateIds: ['vic'], restorePriorityTo: 'p1' };
  execute(state, { type: 'resolve_sacrifice_choice', playerId: 'p1', targetId: 'vic' });
  assert.equal(strefaOfiary(state), 'graveyard', 'kontrola negatywna');
});

// Audyt PR #156 (F2, 2026-10-07): auto-tap Skarba w `spendMana`
// (`tapTreasureForMana`) miał RĘCZNE `toZone = 'graveyard'` — drugą kopię
// reguły „gdzie ląduje poświęcony obiekt" (klasa L109/L41; wszystkie inne
// ścieżki poświęcenia wołają `deathZoneFor`). Token Skarbu jest syntetyczny
// (poza katalogiem, ADR 0029) — zdolność w deskryptorze obiektu, jak w
// testach auto-tap-mana. Ścieżka porównana z referencyjną: ten sam strażnik
// klasowy, nie karta (ADR 0002).
const skarbStan = ({ finality = false } = {}) => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'treas', instanceId: 'i-treas', cardId: 'token_treasure', cardName: 'Treasure',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact', manaCost: 0,
    subtypes: ['Treasure'], types: ['Artifact'], keywords: [], colors: [],
    abilities: [Object.freeze({
      type: 'activated', timing: 'instant', keyword: null,
      cost: Object.freeze({ tap: true, sacrificeSelf: true }),
      effect: Object.freeze({ type: 'add_mana', amount: 1, colors: ['W', 'U', 'B', 'R', 'G'], fromTreasure: true }),
      trigger: null, targets: null, cycling: null, condition: null, pump: null,
      keywords: null, oncePerTurn: false, mustAttack: false,
    })],
  });
  if (finality) addCounter(state, 'treas', 'finality', 1);
  return state;
};

test('auto-tap Skarba (tapTreasureForMana) wygania Skarb z licznikiem finality', () => {
  const state = skarbStan({ finality: true });
  assert.equal(deathZoneFor(state, state.objects.get('treas')), 'exile');
  tapTreasureForMana(state, 'p1', 'treas', {});
  const skarb = [...state.objects.values()].find((o) => o.instanceId === 'i-treas');
  assert.equal(skarb.zone, 'exile', 'auto-tap nie omija finality (deathZoneFor)');
});

test('auto-tap Skarba bez finality idzie normalnie do cmentarza', () => {
  const state = skarbStan();
  tapTreasureForMana(state, 'p1', 'treas', {});
  const skarb = [...state.objects.values()].find((o) => o.instanceId === 'i-treas');
  assert.equal(skarb.zone, 'graveyard', 'kontrola negatywna');
});
