import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addCounter } from '../src/engine/counters.js';
import { markDamage } from '../src/engine/permanents.js';

/**
 * M270 błąd #8 (CR 122.1b) — licznik shield zdejmowany DWIEMA ścieżkami:
 * przy obrażeniach (`markDamage` → helper `removeCounter`) i przy zastąpieniu
 * zniszczenia (`resolve_replacement_choice` → ręczne przepisanie `counters`).
 * Ręczna ścieżka nie emitowała `counter_removed`, więc log stołu pokazywał
 * zdjęcie tarczy tylko w jednym z dwóch przypadków, a `syncStationKind`
 * (CR 205.1) był pomijany. Strażnik KLASOWY: równoważność ścieżek (ADR 0002).
 */
function stan() {
  const registry = createCardRegistry();
  const descriptor = registry.get('giant-spider');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'c', instanceId: 'i1', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor), types: descriptor.types,
  });
  addCounter(state, 'c', 'shield', 1);
  state.events.length = 0;
  return state;
}

const typy = (state) => state.events.map((e) => e.type);
const ile = (state, typ) => typy(state).filter((t) => t === typ).length;

test('obie ścieżki zdejmują licznik shield i raportują counter_removed', () => {
  const przezObrazenia = stan();
  markDamage(przezObrazenia, 'c', 3);

  const przezZniszczenie = stan();
  przezZniszczenie.pendingReplacementChoice = { playerId: 'p1', objectId: 'c', cardId: 'giant-spider' };
  execute(przezZniszczenie, { type: 'resolve_replacement_choice', playerId: 'p1', choice: 'shield' });

  assert.equal(przezObrazenia.objects.get('c').counters.shield ?? 0, 0);
  assert.equal(przezZniszczenie.objects.get('c').counters.shield ?? 0, 0);
  assert.equal(ile(przezObrazenia, 'counter_removed'), 1);
  assert.equal(
    ile(przezZniszczenie, 'counter_removed'), 1,
    'zdjęcie tarczy przy zniszczeniu też jest widoczne w logu',
  );
});

test('zdarzenia nie dublują się w strumieniu stanu', () => {
  const state = stan();
  state.pendingReplacementChoice = { playerId: 'p1', objectId: 'c', cardId: 'giant-spider' };
  execute(state, { type: 'resolve_replacement_choice', playerId: 'p1', choice: 'shield' });
  assert.equal(ile(state, 'shield_consumed'), 1, 'dokładnie jeden wpis o zużyciu tarczy');
  assert.equal(ile(state, 'counter_removed'), 1, 'dokładnie jeden wpis o zdjęciu licznika');
});

test('komenda zwraca te same zdarzenia, które trafiły do stanu', () => {
  const state = stan();
  state.pendingReplacementChoice = { playerId: 'p1', objectId: 'c', cardId: 'giant-spider' };
  const wynik = execute(state, { type: 'resolve_replacement_choice', playerId: 'p1', choice: 'shield' });
  assert.equal(wynik.ok, true);
  const zwrocone = wynik.events.map((e) => e.type);
  assert.ok(zwrocone.includes('counter_removed'), 'wynik komendy niesie zdjęcie licznika');
  assert.deepEqual(zwrocone, typy(state), 'wynik komendy zgodny ze strumieniem stanu');
});
