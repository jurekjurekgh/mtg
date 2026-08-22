// M191 — Batch 46 (lista właściciela 2026-08-22).
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function resolveStack(state, max = 16) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

// ---- Transza 1: mechaniki w pełni istniejące -----------------------------

test('B46/1: Infectious Horror — atak odbiera przeciwnikowi 2 życia', () => {
  const state = game('p1');
  putCard(state, 'horror', 'infectious-horror', 'p1', 'battlefield', {});
  state.objects.set('horror', Object.freeze({ ...state.objects.get('horror'), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  const myLifeBefore = state.players.find((p) => p.id === 'p1').life;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['horror'] }).ok);
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore - 2,
    'każdy przeciwnik traci 2 życia');
  assert.equal(state.players.find((p) => p.id === 'p1').life, myLifeBefore,
    'kontroler nie traci życia (scope: each_opponent)');
});

test('B46/2: Roiling Regrowth — poświęcenie lądu jest OBOWIĄZKOWE', () => {
  const state = game('p1');
  putCard(state, 'spell', 'roiling-regrowth', 'p1', 'hand');
  putCard(state, 'forest', 'basic-forest', 'p1');
  putCard(state, 'l1', 'basic-forest', 'p1');
  putCard(state, 'l2', 'basic-forest', 'p1');
  for (let i = 0; i < 3; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(state.pendingSpringbloom, 'decyzja: który ląd poświęcić');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_springbloom');
  assert.ok(offers.length > 0, 'są oferty poświęcenia');
  assert.ok(!offers.some((c) => c.skip),
    'brak opcji „nie poświęcaj" — Oracle mówi „Sacrifice a land.", nie „you may"');
  const sac = offers.find((c) => c.sacrificeLandId === 'l1');
  assert.ok(sac, 'można wskazać konkretny ląd');
  assert.ok(execute(state, sac).ok);
  // Poświęcony obiekt dostaje NOWE id w grobie (moveObjectDirectly) — liczymy
  // lądy na polu bitwy zamiast pytać o stare id.
  const landsLeft = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o?.kind === 'land' || (o?.types ?? []).includes('Land'));
  assert.equal(landsLeft.length, 2, 'jeden z trzech lądów został poświęcony');
});

test('B46/2b: Springbloom Druid NADAL pozwala odmówić („you may") — kontrola', () => {
  const state = game('p1');
  putCard(state, 'druid', 'springbloom-druid', 'p1', 'hand');
  putCard(state, 'l1', 'basic-forest', 'p1');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'druid');
  assert.ok(cast, 'oferta rzutu druida');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(state.pendingSpringbloom, 'decyzja druida');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_springbloom');
  assert.ok(offers.some((c) => c.skip),
    'opcjonalne poświęcenie zachowuje rezygnację (anty-over-fix)');
});

test('B46/2c: Roiling Regrowth znajduje DO DWÓCH podstawowych lądów tapniętych', () => {
  const state = game('p1');
  putCard(state, 'spell', 'roiling-regrowth', 'p1', 'hand');
  putCard(state, 'l1', 'basic-forest', 'p1');
  for (let i = 0; i < 3; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const sac = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_springbloom' && c.sacrificeLandId === 'l1');
  assert.ok(execute(state, sac).ok);
  // Dwie decyzje szukania (po jednej karcie), obie z możliwością rezygnacji.
  for (let i = 0; i < 2; i += 1) {
    const pick = playerView(state, 'p1').legalCommands
      .find((c) => c.type === 'resolve_search_choice' && c.found != null);
    if (!pick) break;
    assert.ok(execute(state, pick).ok);
  }
  const onBattlefield = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o?.cardId === 'basic-island');
  assert.equal(onBattlefield.length, 2, 'dwa podstawowe lądy weszły na pole bitwy');
  assert.ok(onBattlefield.every((o) => o.tapped), 'oba wchodzą TAPNIĘTE');
});
