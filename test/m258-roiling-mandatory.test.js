import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { describeGameEvent } from '../src/table/session.js';

/**
 * M258 (Żywy Tester, zendikar vs worek-dziki seed 3005): dwa drobne
 * znaleziska regułowe na mechanicie springbloom_sacrifice_search.
 *
 * F4 — Roiling Regrowth („Sacrifice a land. Search your library for up to
 * two basic land cards..."): poświęcenie to INSTRUKCJA rozstrzygnięcia,
 * nie koszt dodatkowy. Gdy przy rozstrzyganiu nie ma lądu, instrukcję
 * pomija się (CR 101.3/608.2b), ale SZUKANIE pozostaje — silnik kończył
 * cały efekt bez skutku (notes karty wręcz chwalił się: „bez lądu na polu
 * bitwy czar nie robi nic").
 *
 * F5 — log mówił „może poświęcić land" także przy OBOWIĄZKOWYM poświęceniu
 * (Roiling) — fałszywe „may" (oś 2: log to jedyne źródło wiedzy gracza;
 * opcjonalność decyzji to informacja regułowa).
 */

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putSpellOnStack(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'stack',
    kind: 'spell', manaCost: def.manaCost, abilities: def.abilities ?? [],
    colors: def.colors ?? [], types: def.types ?? [], keywords: [], subtypes: [],
    spell: def.spell,
  });
  return state.objects.get(id);
}

test('M258/R1: Roiling Regrowth bez lądu na polu — pomija poświęcenie, ALE szuka (CR 101.3/608.2b)', () => {
  const state = game();
  // w bibliotece jest bazowy ląd — szukanie ma co znaleźć
  const forestDef = REGISTRY.get('basic-forest');
  addObject(state, {
    id: 'lib-forest', instanceId: 'i-lib-forest', cardId: 'basic-forest', controllerId: 'p1',
    ownerId: 'p1', zone: 'library', kind: 'land', abilities: forestDef.abilities ?? [],
    colors: [], types: forestDef.types ?? [], keywords: [], subtypes: forestDef.subtypes ?? [],
  });
  const src = putSpellOnStack(state, 'rr', 'roiling-regrowth');
  applyEffect(state, { type: 'springbloom_sacrifice_search', mandatory: true }, src, []);
  assert.ok(state.pendingSearchChoice, 'decyzja szukania otwarta mimo braku lądu (RED przed fixem: efekt kończył się bez skutku)');
  assert.equal(state.pendingSpringbloom, null, 'poświęcenie pominięte — nie ma czego poświęcać');
});

test('M258/R2: Springbloom Druid bez lądu — nic się nie dzieje (anty-over-fix, „you may... If you do")', () => {
  const state = game();
  const src = putSpellOnStack(state, 'sb', 'springbloom-druid');
  applyEffect(state, { type: 'springbloom_sacrifice_search' }, src, []);
  assert.equal(state.pendingSpringbloom, null);
  assert.equal(state.pendingSearchChoice, null, 'opcjonalne poświęcenie bez lądu = brak skutku');
});

test('M258/R3: log rozróżnia obowiązkowe i opcjonalne poświęcenie lądu (oś 2)', () => {
  const helpers = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => String(id),
  };
  const opt = describeGameEvent({ type: 'springbloom_choice_required', controllerId: 'p2', cardId: 'springbloom-druid' }, helpers);
  assert.match(opt, /może poświęcić/, `opcjonalne bez zmian: ${opt}`);
  const man = describeGameEvent({ type: 'springbloom_choice_required', controllerId: 'p2', cardId: 'roiling-regrowth', mandatory: true }, helpers);
  assert.match(man, /musi poświęcić/, `obowiązkowe nie jest „may": ${man}`);
  assert.doesNotMatch(man, /może poświęcić/);
});
