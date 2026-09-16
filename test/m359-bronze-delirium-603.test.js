/**
 * M359 (Brąz #5): trigger DELIRIUM (Fear of Burning Alive) — CR 603.3 + 603.4.
 *
 * Błąd: decyzja `resolve_delirium_target` zadawała obrażenia NATYCHMIAST
 * (wykonanie efektu w bramce komendy), zamiast położyć trigger ze snapshotem
 * obrażeń na STOS. Poprawka: decyzja kolejkuje trigger
 * (extra.deliriumDamage { amount, opponentId }) przez `queueTriggerToStack`;
 * rozstrzygnięcie re-waliduje: (a) cel = stwór na polu bitwy pod kontrolą
 * poszkodowanego gracza, (b) intervening-if — 4+ typy kart w grobie
 * kontrolera (CR 603.4/207.2c). `queueTriggerToStack` kasuje ślepe wpisy
 * sam (CR 608.2b).
 *
 * Dowód online: CR 603.3 (trigger idzie na stos) + Oracle Fear of Burning
 * Alive („Whenever a source you control deals noncombat damage... if...,
 * this creature deals that amount...") — tekst przy pełnej implementacji.
 * Setup: własne ETB Feara (4 dmg w p2) odpala delirium bezpośrednio
 * (triggery wieloprzebiegowe CR 603.2 — precedens batch18).
 *
 * RED: 5a/5b/5c/5d FAIL (natychmiastowe obrażenia), 5e PASS też przed
 * (pin zachowania: śmierć źródła nie zatrzymuje triggera, CR 113.7a).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { graveyardCardTypeCount } from '../src/engine/triggers.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function addRealCard(state, id, cardId, controllerId, zone, opts = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [],
    aura: def.aura ?? null, devour: def.devour ?? null, endure: def.endure ?? null,
    ownerId: opts.ownerId ?? null,
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 1, toughness = 1 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  return state.objects.get(id);
}

function findId(state, cardId, zone = 'battlefield') {
  for (const [id, obj] of state.objects) {
    if (obj.cardId === cardId && obj.zone === zone) return id;
  }
  return null;
}

function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.step = 'precombat_main';
  state.turn.passes = 0;
}

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break;
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}

function putTypesInGraveyard(state, playerId, typeCount) {
  const cards = ['shatter', 'bone-splinters', 'ainok-artillerist', 'basic-forest'];
  cards.slice(0, typeCount).forEach((cardId, i) => addRealCard(state, `gy-${cardId}-${i}`, cardId, playerId, 'graveyard'));
}

function fearEnters(state) {
  mainPhase(state, 'p1');
  addRealCard(state, 'fear-card', 'fear-of-burning-alive', 'p1', 'hand');
  addMana(state, 'p1', 10);
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fear-card' });
  assert.ok(cast.ok);
  resolveStack(state); // ETB 4 dmg w p2 odpala delirium (decyzja czeka).
  return findId(state, 'fear-of-burning-alive');
}

function shock(state, targetId) {
  const id = `shock-${state.objectSequence}`;
  addRealCard(state, id, 'shock', 'p1', 'hand');
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: id, targets: [targetId] });
  assert.ok(cast.ok, cast.events[0]?.reason);
  return id;
}

function setupDelirium(state) {
  // Własne ETB Feara odpala delirium: decyzja (amount 4) czeka na cel.
  putTypesInGraveyard(state, 'p1', 4);
  addSimpleCreature(state, 'victim', 'p2');
  const fearId = fearEnters(state);
  assert.equal(state.pendingDeliriumTargets.length, 1, 'delirium czeka na wybór celu');
  assert.equal(state.pendingDeliriumTargets[0].amount, 4);
  return fearId;
}

test('M359/5a: decyzja delirium kładzie trigger NA STOS — obrażenia po passach (RED)', () => {
  const state = game();
  setupDelirium(state);
  const resolved = execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  assert.ok(resolved.ok);
  // RED: obrażenia natychmiast, stos pusty.
  assert.equal(state.zones.stack.length, 1, 'trigger delirium na stosie (M359)');
  assert.notEqual(state.objects.get('victim'), undefined, 'ofiara żyje do rozstrzygnięcia (M359)');
  assert.equal(state.objects.get('victim').damage ?? 0, 0, 'brak obrażeń przed passami (M359)');
  resolveStack(state);
  assert.equal(state.objects.get('victim'), undefined, '1/1 ginie od 4 obrażeń po passach');
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.delirium === true && e.targetId === 'victim'));
});

test('M359/5b: okno odpowiedzi — zabicie celu fizzluje delirium (RED)', () => {
  const state = game();
  setupDelirium(state);
  execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  shock(state, 'victim'); // odpowiedź: Shock w ofiarę.
  resolveStack(state); // Shock (ofiara ginie), potem ślepy trigger.
  assert.equal(state.objects.get('victim') ?? null, null);
  const resolution = state.events.find((e) => e.type === 'trigger_resolved' && e.delirium === true);
  assert.ok(resolution, 'trigger delirium rozstrzygnął się (M359)');
  assert.equal(resolution.noEffect, true, 'ślepy trigger bez efektu (M359)');
  assert.equal(resolution.reason, 'no_targets');
  assert.ok(!state.events.some((e) => e.type === 'damage_dealt' && e.target === 'victim' && e.amount === 4),
    'martwa ofiara nie dostaje obrażeń delirium');
});

test('M359/5c: intervening-if — utrata delirium w odpowiedzi wyłącza trigger (RED)', () => {
  const state = game();
  setupDelirium(state);
  execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  // Odpowiedź: z grobu znika typ Instant (3 typy — delirium wygaszone).
  state.zones.graveyard = state.zones.graveyard.filter((id) => id !== 'gy-shatter-0');
  state.objects.delete('gy-shatter-0');
  assert.equal(graveyardCardTypeCount(state, 'p1'), 3);
  resolveStack(state);
  const resolution = state.events.find((e) => e.type === 'trigger_resolved' && e.delirium === true);
  assert.ok(resolution, 'trigger delirium rozstrzygnął się (M359)');
  assert.equal(resolution.noEffect, true, 'intervening-if niespełniony — brak efektu (M359)');
  assert.equal(resolution.reason, 'delirium_lost');
  assert.equal(state.objects.get('victim').damage ?? 0, 0, 'ofiara bez obrażeń');
});

test('M359/5d: cel musi być stworem poszkodowanego — zmiana kontroli fizzluje (RED)', () => {
  const state = game();
  setupDelirium(state);
  execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  // Odpowiedź: ofiara przechodzi pod kontrolę p1 (jak Act of Treason).
  state.objects.set('victim', Object.freeze({ ...state.objects.get('victim'), controllerId: 'p1' }));
  resolveStack(state);
  const resolution = state.events.find((e) => e.type === 'trigger_resolved' && e.delirium === true);
  assert.ok(resolution, 'trigger delirium rozstrzygnął się (M359)');
  assert.equal(resolution.noEffect, true, 'cel nie jest stworem p2 — brak efektu (M359)');
  assert.equal(resolution.reason, 'no_targets');
  assert.equal(state.objects.get('victim').damage ?? 0, 0, 'ofiara bez obrażeń');
});

test('M359/5e: źródło zabite w odpowiedzi — ofiara i tak dostaje obrażenia (pin CR 113.7a)', () => {
  const state = game();
  const fearId = setupDelirium(state);
  execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  // Odpowiedź: dwa Shocki we Feara (4/4) BEZ rozstrzygania między nimi —
  // rzucający zachowuje priorytet (CR 117.1a), więc drugi Shock ląduje na
  // stosie od razu. LIFO: oba Shocki zabijają Feara PRZED rozstrzygnięciem
  // delirium (stos: [delirium, shock1, shock2]).
  shock(state, fearId);
  assert.equal(state.zones.stack.length, 2, 'stos cały po pierwszym Shocku');
  shock(state, fearId);
  assert.equal(state.zones.stack.length, 3, 'oba Shocki nad triggerem delirium');
  resolveStack(state);
  assert.equal(state.objects.get(fearId) ?? null, null, 'Fear zginął od Shocków');
  assert.equal(state.objects.get('victim'), undefined, 'ofiara i tak ginie od 4 obrażeń delirium');
});
