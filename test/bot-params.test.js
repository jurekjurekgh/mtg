import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HEURISTIC_PARAMS,
  HEURISTIC_PARAM_KEYS,
  normalizeHeuristicParams,
} from '../src/controllers/heuristic-params.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { initializeResources, addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * B6 T1 — parametry deskryptorowe wyceny (rodzina „wyceny bazowe").
 * Sprawdza walidację modułu ORAZ że niedomyślny parametr REALNIE przepływa
 * do wyceny (pokrętło nie jest atrapą). Golden-master
 * (bot-scoring-snapshot.test.js) pilnuje odwrotności: defaulty == dawne stałe.
 */

test('params: wartości domyślne są dokładnie dawnymi stałymi', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.creatureBase, 70);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.creaturePowerWeight, 2);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.creatureToughnessWeight, 1);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.spellBase, 50);
});

test('params: normalize bez nadpisań zwraca zamrożone defaulty', () => {
  const p = normalizeHeuristicParams();
  assert.deepEqual(p, DEFAULT_HEURISTIC_PARAMS);
  assert.ok(Object.isFrozen(p));
});

test('params: nadpisanie łączy się z defaultami i jest zamrożone', () => {
  const p = normalizeHeuristicParams({ creatureBase: 100 });
  assert.equal(p.creatureBase, 100);
  assert.equal(p.spellBase, 50); // niezmieniony
  assert.ok(Object.isFrozen(p));
});

test('params: literówka klucza jest odrzucana', () => {
  assert.throws(() => normalizeHeuristicParams({ creatureBaze: 100 }), /Nieznane parametry/);
});

test('params: nieliczbowa / nieskończona wartość jest odrzucana', () => {
  assert.throws(() => normalizeHeuristicParams({ creatureBase: 'x' }), /musi być skończoną liczbą/);
  assert.throws(() => normalizeHeuristicParams({ creatureBase: Infinity }), /musi być skończoną liczbą/);
});

test('params: klucze modułu są stabilnym kontraktem', () => {
  assert.deepEqual([...HEURISTIC_PARAM_KEYS].sort(), Object.keys(DEFAULT_HEURISTIC_PARAMS).sort());
});

/** Scena: bot z landem na ręce w fazie głównej — do wyceny cast/land. */
function creatureOnHandState() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  return state;
}

test('params: creatureBase realnie przepływa do wyceny cast_permanent', () => {
  // Ten sam widok, dwa boty: domyślny i z podbitą bazą stwora. Wycena
  // cast_permanent musi wzrosnąć dokładnie o różnicę bazy — dowód, że
  // pokrętło działa (nie atrapa) i że golden-master ma czego pilnować.
  const build = () => {
    const state = creatureOnHandState();
    addObject(state, {
      id: 'c', instanceId: 'ic', cardId: 'razorfoot-griffin', controllerId: 'p1',
      zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 4,
    });
    addMana(state, 'p1', 4); // {3}{W} — żeby cast_permanent był legalny
    return playerView(state, 'p1');
  };
  const scoreOf = (bot) => {
    const view = build();
    bot.chooseCommand(view);
    const entry = bot.trace().at(-1);
    const cast = entry.options.find((o) => o.cmd.startsWith('cast_permanent'));
    return cast ? cast.score : null;
  };
  const base = scoreOf(createHeuristicBot({ seed: 1 }));
  const bumped = scoreOf(createHeuristicBot({ seed: 1, params: { creatureBase: 90 } }));
  assert.ok(base != null && bumped != null, 'oba boty muszą widzieć cast_permanent');
  // +20 bazy → +20 wyceny (przed pomnożeniem przez wagę rodziny 'permanent'=0.9).
  assert.ok(bumped > base, `podbita baza ma zwiększyć wycenę (${bumped} > ${base})`);
});
