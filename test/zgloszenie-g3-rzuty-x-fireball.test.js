// =============================================================================
// Zgłoszenie G, etap 3b (2026-11-05): rzuty {X}, Fireball i czary dzielone
// w architekturze „konstruuj + waliduj".
//
// Po co: legalXCostCasts enumerował każdy opłacalny X dla każdego zestawu
// celów, legalFireballCasts — każdy podzbiór celów × każdy X, a
// dividedDamageDivisions — każdy podzbiór × każdą kompozycję. Teraz oferty
// to ZIARNA: dla {X} minimum/maksimum/progi zabójstwa celu, dla Fireballa
// pojedyncze cele (X śmiertelne i maksymalne) + zestawy zbiorcze, dla
// czarów dzielonych koncentracje i podziały równe w rankingu kandydatów.
// Kreator (stepper X) konstruuje dowolną wartość z [xMin, xMax]
// (commandForXSelection), a bramki rzutu walidują — kompletność
// konstrukcyjna, jak w etapach 1–3a.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalXCostCasts } from '../src/engine/spells.js';
import { multiTargetPlanOf, commandForXSelection } from '../src/table/multi-target.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function mainState(seed = 91) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function fireballState() {
  const state = mainState();
  putCard(state, 'fb', 'fireball', 'p1', 'hand', { kind: 'spell' });
  for (let i = 0; i < 6; i += 1) putCard(state, `m${i}`, 'basic-mountain', 'p1');
  putCard(state, 'cre1', 'highland-game', 'p2');
  putCard(state, 'cre2', 'thornhide-wolves', 'p2');
  return state;
}

test('G3b/1: Fireball — oferty to ziarna (pojedyncze cele: X śmiertelne/max; zestawy zbiorcze)', () => {
  const state = fireballState();
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'fb');
  assert.ok(offers.length > 0, 'ziarna istnieją');
  assert.ok(offers.length <= 20, `liczba ofert wielomianowa, nie podzbiory×X: ${offers.length}`);
  const single = offers.filter((c) => c.targets.length === 1);
  assert.ok(single.length > 0, 'ziarna jednocelowe');
  for (const offer of single) {
    assert.ok([1, 5].includes(offer.xValue) || offer.xValue === 4,
      `X jednocelowe ze zbioru ziaren (1 / lethal 4 dla 4/4? / max 5): ${offer.xValue}`);
  }
  assert.ok(offers.some((c) => c.targets.length >= 3), 'ziarno zestawu zbiorczego (wszyscy/wrogowie)');
  assert.ok(offers.every((c) => c.xValue >= 1), 'Fireball wymaga X >= 1');
});

test('G3b/2: Fireball za X spoza ziaren przechodzi walidację rzutu', () => {
  const state = fireballState();
  const template = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'fb' && c.targets.length === 1);
  assert.ok(template, 'szablon ziarna');
  const cast = { ...template, targets: ['cre2'], xValue: 3 };
  assert.ok(execute(state, cast).ok, 'skonstruowany rzut X=3 na 5/4 przyjęty');
  const zdarzenie = state.events.filter((e) => e.type === 'spell_cast').at(-1);
  assert.equal(zdarzenie.xValue, 3, 'zdarzenie niesie skonstruowane X');
});

test('G3b/3: kreator X konstruuje komendę spoza ziaren i odrzuca spoza widełek planu', () => {
  const state = fireballState();
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'fb');
  const plan = multiTargetPlanOf(offers);
  assert.ok(plan?.hasX, 'plan ze stepperem X');
  assert.equal(plan.xMin, 1);
  assert.equal(plan.xMax, 5, 'xMax = maksymalne ziarno = maksymalne opłacalne X');
  const constructed = commandForXSelection(plan, offers, { targets: ['cre1'], xValue: 3 });
  assert.ok(constructed, 'konstrukcja dla X=3 (spoza ziaren)');
  assert.equal(constructed.objectId, 'fb');
  assert.equal(constructed.xValue, 3);
  assert.deepEqual(constructed.targets, ['cre1']);
  assert.equal(commandForXSelection(plan, offers, { targets: ['cre1'], xValue: 99 }), null,
    'X ponad maksimum planu bez komendy');
  assert.equal(commandForXSelection(plan, offers, { targets: ['nie-ma'], xValue: 2 }), null,
    'cel spoza puli planu bez komendy');
});

test('G3b/4: czar {X} bez celów — ziarna to minimum i maksimum opłacalnego X', () => {
  const state = mainState(92);
  putCard(state, 'ee', 'epic-experiment', 'p1', 'hand', { kind: 'spell' });
  for (let i = 0; i < 4; i += 1) {
    putCard(state, `is${i}`, 'basic-island', 'p1');
    putCard(state, `mo${i}`, 'basic-mountain', 'p1');
  }
  const obj = state.objects.get('ee');
  const casts = legalXCostCasts(state, 'p1', 'ee', obj, 8);
  assert.ok(casts.length > 0, 'ziarna istnieją (budżet 8, baza {U}{R})');
  assert.deepEqual(casts.map((c) => c.xValue), [0, 6], 'tylko X=0 i X=max, nie 0..6');
});

test('G3b/5: czar dzielony — ziarna podziału sumują do budżetu; podział spoza ziaren legalny', () => {
  const state = mainState(93);
  putCard(state, 'fj', 'fiery-justice', 'p1', 'hand', { kind: 'spell' });
  putCard(state, 'c1', 'oreplate-pangolin', 'p2');
  putCard(state, 'c2', 'thornhide-wolves', 'p2');
  addMana(state, 'p1', 6, { colors: ['R', 'G', 'W'] });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'fj');
  assert.ok(offers.length > 0, 'ziarna podziału istnieją');
  for (const offer of offers) {
    const suma = (offer.damageDivision ?? []).reduce((a, e) => a + e.amount, 0);
    assert.equal(suma, 5, 'każde ziarno dzieli pełny budżet 5');
  }
  const template = offers.find((c) => (c.targets ?? []).includes('p2')) ?? offers[0];
  const cast = { ...template, targets: ['p2'], damageDivision: [{ id: 'c1', amount: 2 }, { id: 'p2', amount: 3 }] };
  assert.ok(execute(state, cast).ok, 'podział 2+3 spoza ziaren przechodzi walidację rzutu');
});
