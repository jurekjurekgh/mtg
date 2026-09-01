import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addPoisonCounters } from '../src/engine/players.js';

/**
 * M269 błąd #4 — proliferate (CR 701.27a) dokładał truciznę przez
 * `player.poison += 1`, omijając helper `addPoisonCounters`. Nie powstawało
 * `poison_counters_added`: log stołu dostawał `counter_added` z ID GRACZA
 * w polu objectId i pisał „? dostaje +1 licznik poison" (klasa L29), a
 * heurystyczny bot nie widział postępu do wygranej przez truciznę
 * (CR 704.5c). Strażnik KLASOWY: obie ścieżki nabijania trucizny raportują
 * ten sam fakt (ADR 0002).
 */
function stan(poison) {
  const registry = createCardRegistry();
  const descriptor = registry.get('giant-spider');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'src', instanceId: 'i1', cardId: 'giant-spider',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor), types: descriptor.types,
  });
  if (poison > 0) addPoisonCounters(state, 'p2', poison);
  state.events.length = 0;
  return state;
}

const proliferuj = (state, targets) => {
  applyEffect(state, { type: 'proliferate' }, state.objects.get('src'), targets);
  applyEffect(state, { type: 'proliferate' }, state.objects.get('src'), targets);
};

const poison = (state, id) => state.players.find((p) => p.id === id).poison;

test('proliferate trucizny emituje poison_counters_added', () => {
  const state = stan(3);
  proliferuj(state, ['p2']);
  assert.equal(poison(state, 'p2'), 4, 'dokładnie +1, bez podwójnego naliczenia');
  const wpis = state.events.find((e) => e.type === 'poison_counters_added');
  assert.ok(wpis, 'zdarzenie rozumiane przez log stołu i bota');
  assert.equal(wpis.after, 4);
  assert.equal(wpis.amount, 1);
});

test('obie ścieżki nabijania trucizny dają ten sam stan i ten sam fakt', () => {
  const przezHelper = stan(3);
  addPoisonCounters(przezHelper, 'p2', 1);
  const przezProliferate = stan(3);
  proliferuj(przezProliferate, ['p2']);
  assert.equal(poison(przezProliferate, 'p2'), poison(przezHelper, 'p2'));
  const typ = (s) => s.events.filter((e) => e.type === 'poison_counters_added').length;
  assert.equal(typ(przezProliferate), typ(przezHelper), 'ten sam typ zdarzenia');
});

test('gracz bez trucizny nie dostaje jej z proliferate (CR 701.27a)', () => {
  const state = stan(0);
  proliferuj(state, ['p2']);
  assert.equal(poison(state, 'p2') ?? 0, 0, 'proliferate tylko zwiększa istniejące liczniki');
  assert.ok(!state.events.some((e) => e.type === 'poison_counters_added'));
});
