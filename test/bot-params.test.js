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
import { createCardRegistry } from '../src/cards/card-data.js';

const registry = createCardRegistry();

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
  // Rodzina „premie agresji w ataku".
  assert.equal(DEFAULT_HEURISTIC_PARAMS.attackThroughBonus, 3);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.attackOpenBoardBonus, 8);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.attackEvasionBonus, 3);
  // Rodzina „removal, obrażenia i przewaga kartowa".
  assert.equal(DEFAULT_HEURISTIC_PARAMS.removalEnemyBase, 22);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.removalWorthWeight, 2);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceEnemyBase, 25);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceEnemyPowerWeight, 2);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.damageCreatureBase, 10);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.damageCreaturePowerWeight, 3);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.damageLethalBonus, 15);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.drawCardValue, 6);
  // Rodzina „efektywność removalu" (M234) — WŁĄCZONA wprost (zlecenie właściciela).
  assert.equal(DEFAULT_HEURISTIC_PARAMS.removalTmcWeight, 2);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.removalDeathtouchBonus, 14);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.removalProtectionBonus, 18);
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

test('params: attackOpenBoardBonus realnie przepływa do wyceny declare_attackers', () => {
  // Scena: własny 2/2 w kroku deklaracji atakujących, przeciwnik ma PUSTĄ
  // planszę (żaden bloker). Premia za atak w otwartą planszę wchodzi w grę.
  // Podbicie attackOpenBoardBonus musi zwiększyć wycenę ataku — dowód, że
  // pokrętło działa (nie atrapa).
  const build = () => {
    const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
    initializeResources(state);
    state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
    addObject(state, {
      id: 'a', instanceId: 'ia', cardId: 'A', controllerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    });
    return playerView(state, 'p1');
  };
  const scoreOf = (bot) => {
    const view = build();
    bot.chooseCommand(view);
    const entry = bot.trace().at(-1);
    // Wariant atakujący naszym stworem (nie pusty attack[]).
    const atk = entry.options.find((o) => o.cmd.startsWith('attack') && o.cmd.includes('a'));
    return atk ? atk.score : null;
  };
  const base = scoreOf(createHeuristicBot({ seed: 1 }));
  const bumped = scoreOf(createHeuristicBot({ seed: 1, params: { attackOpenBoardBonus: 40 } }));
  assert.ok(base != null && bumped != null, 'oba boty muszą widzieć wariant ataku');
  assert.ok(bumped > base, `podbita premia otwartej planszy ma zwiększyć wycenę ataku (${bumped} > ${base})`);
});

test('params: removalEnemyBase realnie przepływa do wyceny czaru usuwającego', () => {
  // Scena: czar „zniszcz stwora" (spin-out) w ręce + mana, wrogi stwór na stole.
  // Podbicie removalEnemyBase musi zwiększyć wycenę rzutu w cel wroga — dowód,
  // że pokrętło działa (nie atrapa).
  const build = () => {
    const state = creatureOnHandState();
    const spell = registry.get('spin-out').spell;
    addObject(state, {
      id: 's', instanceId: 'is', cardId: 'spin-out', controllerId: 'p1',
      zone: 'hand', kind: 'spell', power: null, toughness: null, manaCost: 3,
      spell, abilities: [], keywords: [], subtypes: [], types: ['Instant'],
    });
    addObject(state, {
      id: 'foe', instanceId: 'ifoe', cardId: 'F', controllerId: 'p2',
      zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
    });
    addMana(state, 'p1', 3); // {1}{B}{B}
    return playerView(state, 'p1');
  };
  const scoreOf = (bot) => {
    const view = build();
    bot.chooseCommand(view);
    const entry = bot.trace().at(-1);
    const cast = entry.options.find((o) => o.cmd.startsWith('cast_spell'));
    return cast ? cast.score : null;
  };
  const base = scoreOf(createHeuristicBot({ seed: 1, registry }));
  const bumped = scoreOf(createHeuristicBot({ seed: 1, params: { removalEnemyBase: 80 }, registry }));
  assert.ok(base != null && bumped != null, 'oba boty muszą widzieć wariant rzutu removalu');
  assert.ok(bumped > base, `podbita baza removalu ma zwiększyć wycenę (${bumped} > ${base})`);
});
