import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';

/**
 * M269 błąd #3 — „gains control of this artifact AND UNTAPS IT" emitowało
 * `object_untapped` TYLKO w gałęzi „kontroler się nie zmienił". W ścieżce
 * typowej (piłkę przejmuje przeciwnik) odkręcenie działo się po cichu:
 * żaden trigger „becomes untapped" go nie widział, a log stołu pokazywał samą
 * zmianę kontroli (CR 701.21a, lekcja L24: brak zdarzenia = brak faktu).
 * Strażnik KLASOWY: obie gałęzie tego samego efektu muszą raportować
 * odkręcenie identycznie (ADR 0002).
 */
function stan({ tapped }) {
  const registry = createCardRegistry();
  const descriptor = registry.get('contested-game-ball');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'ball', instanceId: 'i1', cardId: 'contested-game-ball',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(descriptor),
    types: descriptor.types, subtypes: descriptor.subtypes,
  });
  if (tapped) {
    state.objects.set('ball', Object.freeze({ ...state.objects.get('ball'), tapped: true }));
  }
  state.events.length = 0;
  return state;
}

const odpal = (state, attackingPlayerId) => applyEffect(
  state, { type: 'attacker_gains_control_and_untaps' },
  state.objects.get('ball'), [], { attackingPlayerId },
);

test('zmiana kontroli + odkręcenie: obie rzeczy są zdarzeniem', () => {
  const state = stan({ tapped: true });
  odpal(state, 'p2');
  const ball = state.objects.get('ball');
  assert.equal(ball.controllerId, 'p2');
  assert.equal(ball.tapped, false);
  assert.ok(state.events.some((e) => e.type === 'control_changed'), 'zmiana kontroli w logu');
  assert.ok(state.events.some((e) => e.type === 'object_untapped'), 'odkręcenie w logu');
});

test('ten sam kontroler (odkręcenie bez zmiany kontroli) — nadal zdarzenie', () => {
  const state = stan({ tapped: true });
  odpal(state, 'p1');
  assert.equal(state.objects.get('ball').tapped, false);
  assert.ok(state.events.some((e) => e.type === 'object_untapped'));
  assert.ok(!state.events.some((e) => e.type === 'control_changed'), 'kontrola się nie zmieniła');
});

test('permanent NIEtapnięty nie zgłasza fałszywego odkręcenia', () => {
  const state = stan({ tapped: false });
  odpal(state, 'p2');
  assert.equal(state.objects.get('ball').controllerId, 'p2');
  assert.ok(
    !state.events.some((e) => e.type === 'object_untapped'),
    'brak realnej zmiany = brak zdarzenia (inaczej trigger odpalałby bez powodu)',
  );
});
