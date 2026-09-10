import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { triggerTargetCandidates, legalTriggerTargetCandidates, processTriggers } from '../src/engine/triggers.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Audyt CR-compliance (pętla E5, ścieżka inna niż PR #111): cele triggerów
 * a protection.
 *
 * CR 702.16b (dosłownie, CR 2026-08-07 „The Hobbit", za mtg.wiki — ADR 0030):
 *   „A permanent or player with protection can't be targeted by spells or
 *    abilities controlled by a source with the protected quality..."
 * Ograniczenie celowania przez ochronę działa też dla ZDOLNOŚCI
 * TRIGGEROWANYCH (nie tylko rzutów czarów) i niezależnie od kontrolera
 * źródła. Silnik w triggerTargetCandidates filtrował hexproof, ale NIE
 * protection — Inferno Titan (LTC) mógł celować w stwora z protection from
 * red.
 */

const REGISTRY = createCardRegistry();

function game(seed = 770) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...data, types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], ...patch,
  });
  return state.objects.get(id);
}

test('P1: trigger „target creature" — stwór z protection od koloru źródła nie jest kandydatem (CR 702.16b)', () => {
  const state = game();
  const source = putCard(state, 'src', 'inferno-titan', 'p1'); // czerwony Giant
  putCard(state, 'ok', 'gloomfang-mauler', 'p2');
  putCard(state, 'prot', 'gloomfang-mauler', 'p2', 'battlefield', { protectionFromColors: ['R'] });
  const candidates = triggerTargetCandidates(state, { type: 'creature' }, source, {});
  assert.ok(candidates.includes('ok'), 'zwykły stwór jest kandydatem');
  assert.ok(!candidates.includes('prot'), 'protection from red blokuje cel triggera czerwonego źródła');
});

test('P2: „any target" — protection wyklucza, brak ochrony nie', () => {
  const state = game();
  const source = putCard(state, 'src', 'inferno-titan', 'p1');
  putCard(state, 'ok', 'gloomfang-mauler', 'p2');
  putCard(state, 'prot', 'gloomfang-mauler', 'p2', 'battlefield', { protectionFromColors: ['R'] });
  const candidates = triggerTargetCandidates(state, { type: 'any_target', count: 3, upTo: true }, source, {});
  assert.ok(candidates.includes('ok'), 'zwykły cel legalny');
  assert.ok(!candidates.includes('prot'), 'chroniony cel nielegalny');
  assert.ok(candidates.includes('p2'), 'przeciwnik pozostaje celem');
});

test('P3: protection od jakości źródła (non-Human creatures) — Spare from Evil blokuje cel Titana', () => {
  const state = game();
  const source = putCard(state, 'src', 'inferno-titan', 'p1');
  putCard(state, 'ok', 'gloomfang-mauler', 'p2');
  // Spare from Evil: „protection from non-Human creatures" — Titan jest
  // Giantem (nie-Człowiek), więc jego zdolność nie może celować.
  putCard(state, 'prot', 'gloomfang-mauler', 'p2');
  // Grant jak Spare from Evil (M109): jakość deskryptorem, nie kolorem.
  state.untilEndOfTurnProtections.push({
    objectIds: ['prot'], quality: { kind: 'creature', notSubtype: 'Human' },
  });
  const candidates = triggerTargetCandidates(state, { type: 'creature' }, source, {});
  assert.ok(candidates.includes('ok'), 'zwykły stwór legalny');
  assert.ok(!candidates.includes('prot'), 'non-Human protection wyklucza Titana');
});

test('P4: integracja — Inferno Titan ETB: decyzja celu bez chronionego stwora', () => {
  const state = game();
  putCard(state, 'ok', 'gloomfang-mauler', 'p2');
  putCard(state, 'prot', 'gloomfang-mauler', 'p2', 'battlefield', { protectionFromColors: ['R'] });
  // Jak audit-pr49: obiekt już na polu bitwy, zdarzenie wejścia symulowane.
  putCard(state, 'titan', 'inferno-titan', 'p1');
  const object = state.objects.get('titan');
  processTriggers(state, [{
    type: 'permanent_entered_battlefield', objectId: 'titan', object,
    cardId: object.cardId, controllerId: object.controllerId, resolved: true,
  }]);
  // Trigger „whenever enters ... deals 3 damage divided among up to three
  // targets" czeka z decyzją celu.
  const pending = state.pendingTriggerTargets.find((p) => p.sourceId === 'titan');
  assert.ok(pending, 'decyzja celu triggera w kolejce');
  const candidates = legalTriggerTargetCandidates(state, pending);
  assert.ok(!candidates.includes('prot'), 'chroniony stwór NIE jest oferowany jako cel');
  assert.ok(candidates.includes('ok'), 'zwykły stwór oferowany');
});

test('P5: bez ochrony — nic się nie zmienia (regresja)', () => {
  const state = game();
  const source = putCard(state, 'src', 'inferno-titan', 'p1');
  putCard(state, 'a', 'gloomfang-mauler', 'p2');
  putCard(state, 'b', 'gloomfang-mauler', 'p1'); // własny cel też legalny
  const candidates = triggerTargetCandidates(state, { type: 'creature' }, source, {});
  assert.ok(candidates.includes('a') && candidates.includes('b'), 'obiekty bez ochrony legalne');
});
