import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';

// M101/A (CR 504.1): dobranie w kroku dobierania jest AKCJĄ TUROWĄ — dzieje się
// samo przy wejściu w krok, nie jest komendą gracza. Testy sprawdzają więc
// SKUTEK wejścia w krok, a nie ofertę `draw_card` (której już nie ma).

function toDraw(state) {
  // CR 103.7a: pierwsza tura gry (p1) pomija draw step — przechodzimy do
  // draw stepa TURY 2+, gdzie dobranie jest obowiązkowe.
  for (let i = 0; i < 60 && !(state.turn.step === 'draw' && state.turn.activePlayerId === 'p1' && state.turn.number > 1); i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
}

test('krok dobierania sam przenosi wierzchnią kartę biblioteki do ręki (CR 504.1)', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'library-1', instanceId: 'i-1', cardId: 'Mountain', controllerId: 'p1', zone: 'library' });
  // Przeciwnik też potrzebuje kart: od M101/A dobranie jest akcją turową, więc
  // gracz z pustą biblioteką przegrywa w swoim kroku dobierania (CR 104.3c).
  for (let i = 0; i < 6; i += 1) {
    addObject(state, { id: `lib-p2-${i}`, instanceId: `i-p2-${i}`, cardId: 'Forest', controllerId: 'p2', zone: 'library' });
  }
  toDraw(state);
  assert.equal(state.turn.step, 'draw');
  assert.ok(!state.zones.library.includes('library-1'), 'karta p1 opuściła bibliotekę przez akcję turową');
  const wRece = state.zones.hand.map((id) => state.objects.get(id).instanceId);
  assert.ok(wRece.includes('i-1'), `karta trafiła do ręki (${wRece.join(', ')})`);
  assert.equal(state.turn.drawnInStep, true);
});

test('draw_card jest odrzucane poza krokiem draw', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'library-1', instanceId: 'i-1', cardId: 'Mountain', controllerId: 'p1', zone: 'library' });
  const result = execute(state, { type: 'draw_card', playerId: 'p1', objectId: 'library-1' });
  assert.equal(result.ok, false);
  assert.equal(result.events[0].reason, 'wrong_timing');
});

test('krok draw dobiera dokładnie jedną kartę', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, { id: 'library-1', instanceId: 'i-1', cardId: 'Mountain', controllerId: 'p1', zone: 'library' });
  addObject(state, { id: 'library-2', instanceId: 'i-2', cardId: 'Forest', controllerId: 'p1', zone: 'library' });
  for (let i = 0; i < 8; i += 1) {
    addObject(state, { id: `lib-p2-${i}`, instanceId: `i-p2-${i}`, cardId: 'Forest', controllerId: 'p2', zone: 'library' });
  }
  toDraw(state);
  const p1Lib = () => state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1');
  assert.equal(p1Lib().length, 1, 'dokładnie jedna karta p1 opuściła bibliotekę');
  // Krok dobierania nie jest już decyzją gracza — nie ma czego klikać.
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'draw_card'), false);
  // Ręcznie zbudowana komenda też nie doda drugiej karty (akcja już wykonana).
  const second = execute(state, { type: 'draw_card', playerId: 'p1', objectId: 'library-2' });
  assert.equal(second.ok, false);
  assert.equal(second.events[0].reason, 'already_drew');
  assert.equal(p1Lib().length, 1);

  // Kolejna tura p1: znacznik znika i akcja turowa dobiera następną kartę.
  const wHrece = state.zones.hand.length;
  for (let i = 0; i < 200 && !(state.turn.step === 'draw' && state.turn.activePlayerId === 'p1' && state.turn.number > 3); i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.turn.step, 'draw');
  assert.ok(state.zones.hand.length > wHrece || state.status === 'finished',
    'w kolejnej turze dobranie wykonuje się ponownie');
});
