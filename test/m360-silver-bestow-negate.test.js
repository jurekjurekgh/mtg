/**
 * M360 (Srebro B1): bestow rzucony jako Aura to czar NIE-stworowy (CR 702.103b)
 * — Negate („Counter target noncreature spell”) MUSI móc go skontrować.
 *
 * Błąd: filtr `noncreature_spell_on_stack` (oferta + walidacja) wykluczał
 * kind 'creature' — a bestow-aura niesie kind 'creature' ze stosu (dziedziczy
 * po karcie-stworze). W efekcie Negate nie widział czaru aury rzuconego za
 * bestow (0 ofert + „Nielegalny cel”), choć to legalny cel.
 *
 * Dowód online: CR 702.103b („As a spell cast bestowed is put onto the stack,
 * it becomes an Aura enchantment…”, mtg.wiki/Bestow, CR 08-2026) + ruling
 * „On the stack, a spell with bestow is either a creature spell or an Aura
 * spell. It's never both.” + Oracle Leafcrown Dryad („…it's an Aura spell
 * with enchant creature”, Scryfall THS/161) + Oracle Negate („Counter target
 * noncreature spell.”, Scryfall M20/69).
 *
 * Fix: wyjątek dla czaru aury (`spell.aura === true`) we wspólnym helprze
 * `isNoncreatureSpellOnStack` (L48: oferta = walidacja).
 *
 * RED: B1a FAIL (0 ofert, odrzut) przed fixem; B1b/B1c piny (przechodzą
 * przed i po — bestow-stwór i czysta aura bez zmian).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 360, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.step = 'precombat_main';
  state.turn.passes = 0;
}

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
    aura: def.aura ?? null, bestow: def.bestow ?? null,
  });
  return state.objects.get(id);
}

/** T1 (stos): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return;
      assert.ok(r1.ok, r1.events[0]?.reason);
      if (state.turn.passes === 0) break;
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
}

function castBestowAura(state) {
  mainPhase(state, 'p1');
  putCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  putCard(state, 'host', 'tenth-district-veteran', 'p1', 'battlefield');
  putCard(state, 'neg', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 6, { colors: ['G'] });
  addMana(state, 'p2', 4, { colors: ['U'] });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', targets: ['host'], bestow: true });
  assert.ok(cast.ok, cast.events[0]?.reason);
  assert.equal(state.zones.stack.length, 1);
  // Rzucający zachowuje priorytet (CR 117.1a) — pass do p2.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  return state.zones.stack[0];
}

test('M360/B1a: Negate kontruje bestow rzucony jako Aurę (czar nie-stworowy, CR 702.103b)', () => {
  const state = game();
  const stackId = castBestowAura(state);
  // RED: 0 ofert + „Nielegalny cel”.
  const offers = playerView(state, 'p2').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'neg');
  assert.ok(offers.some((c) => (c.targets ?? []).includes(stackId)),
    'oferta Negate na czar aury z bestow (M360)');
  const neg = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stackId] });
  assert.ok(neg.ok, neg.events[0]?.reason);
  resolveStack(state);
  assert.equal(state.zones.stack.length, 0, 'stos pusty po rozstrzygnięciu');
  const dryadGrave = [...state.objects.values()]
    .find((o) => o.cardId === 'leafcrown-dryad' && o.zone === 'graveyard');
  assert.ok(dryadGrave, 'skontrowany bestow ląduje w grobie (CR 701.5a)');
  assert.equal(state.objects.get('host').zone, 'battlefield');
  assert.ok(!(state.objects.get('host').attachments ?? []).length
    && ![...state.objects.values()].some((o) => o.attachedTo === 'host'),
    'gospodarz bez aury (czar nie wszedł)');
});

test('M360/B1b (pin): Negate NIE kontruje bestow rzuconego jako stwora', () => {
  const state = game();
  mainPhase(state, 'p1');
  putCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  putCard(state, 'neg', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 4);
  addMana(state, 'p2', 4, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  const stackId = state.zones.stack[0];
  const offers = playerView(state, 'p2').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'neg');
  assert.ok(!offers.some((c) => (c.targets ?? []).includes(stackId)),
    'brak oferty Negate na czar stwora');
  const neg = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stackId] });
  assert.equal(neg.ok, false, 'czar stwora nie jest celem Negate');
});

test('M360/B1c (pin): Negate kontruje czystą aurę (Hobble) — bez zmian', () => {
  const state = game();
  mainPhase(state, 'p1');
  putCard(state, 'hob', 'hobble', 'p1', 'hand');
  putCard(state, 'host', 'tenth-district-veteran', 'p1', 'battlefield');
  putCard(state, 'neg', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 6, { colors: ['W'] });
  addMana(state, 'p2', 4, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hob', targets: ['host'] }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  const stackId = state.zones.stack[0];
  const neg = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stackId] });
  assert.ok(neg.ok, neg.events[0]?.reason);
  resolveStack(state);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'hobble' && o.zone === 'graveyard'));
});
