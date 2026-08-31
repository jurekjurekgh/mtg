import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addCounter } from '../src/engine/counters.js';
import { markDamage } from '../src/engine/permanents.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

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

/**
 * M270 błąd #10 — TRZECIA ścieżka zdejmowania licznika shield: SBA przy
 * śmierci z obrażeń (CR 704.5g + 122.1b). Najczęstsza w realnej grze, a jako
 * jedyna nadal zdejmowała licznik ręcznie. Ten blok domyka klasę
 * ENUMERACYJNIE: wszystkie trzy ścieżki raportują tak samo.
 */
test('SBA (śmierć z obrażeń) zdejmuje tarczę przez wspólny helper', () => {
  const state = stan();
  state.objects.set('c', Object.freeze({ ...state.objects.get('c'), damage: 4 }));
  state.events.length = 0;
  runStateBasedActions(state);
  const spider = state.objects.get('c');
  assert.equal(spider.zone, 'battlefield', 'tarcza zastąpiła zniszczenie (CR 122.1b)');
  assert.equal(spider.counters.shield ?? 0, 0, 'licznik zdjęty');
  assert.equal(spider.damage, 0, 'obrażenia zdjęte razem z zastąpieniem');
  assert.equal(ile(state, 'counter_removed'), 1, 'zdjęcie tarczy widoczne w logu');
  assert.equal(ile(state, 'shield_consumed'), 1);
});

test('WSZYSTKIE trzy ścieżki tarczy raportują identycznie (domknięcie klasy)', () => {
  const przezObrazenia = stan();
  markDamage(przezObrazenia, 'c', 3);

  const przezZniszczenie = stan();
  przezZniszczenie.pendingReplacementChoice = { playerId: 'p1', objectId: 'c', cardId: 'giant-spider' };
  execute(przezZniszczenie, { type: 'resolve_replacement_choice', playerId: 'p1', choice: 'shield' });

  const przezSba = stan();
  przezSba.objects.set('c', Object.freeze({ ...przezSba.objects.get('c'), damage: 4 }));
  przezSba.events.length = 0;
  runStateBasedActions(przezSba);

  for (const [nazwa, state] of [['obrażenia', przezObrazenia], ['zniszczenie', przezZniszczenie], ['SBA', przezSba]]) {
    assert.equal(state.objects.get('c').counters.shield ?? 0, 0, `${nazwa}: licznik zdjęty`);
    assert.equal(ile(state, 'counter_removed'), 1, `${nazwa}: dokładnie jeden counter_removed`);
  }
});

test('SBA: przy dwóch tarczach zdejmowana jest dokładnie jedna', () => {
  const state = stan();
  addCounter(state, 'c', 'shield', 1); // razem 2
  state.objects.set('c', Object.freeze({ ...state.objects.get('c'), damage: 4 }));
  state.events.length = 0;
  runStateBasedActions(state);
  assert.equal(state.objects.get('c').counters.shield, 1, 'kontrola negatywna: druga tarcza zostaje');
  assert.equal(ile(state, 'counter_removed'), 1);
});
