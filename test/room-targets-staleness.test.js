import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, legalRoomTargetCandidates, playerView } from '../src/engine/game-state.js';

/**
 * Regresja (M33, 2026-08-05): kandydaci pokoju lochu mogą zniknąć MIĘDZY
 * utworzeniem decyzji a jej rozstrzygnięciem (przychwycone w pełnej macierzy
 * B0 — trigger „deals combat damage\" Kappa Tech-Wrecker wygnął stwora w tej
 * samej komendzie, która kolejkowała wybór celu Forge). legalCommands musi
 * oferować wyłącznie kandydatów legalnych w danej chwili (ta sama lista co
 * walidacja w execute), a decyzja bez żadnego legalnego celu gaśnie jak czar
 * bez celu (CR 608.2b) — nie blokuje gry.
 */

function game() {
  return createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function addCreature(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'test-creature', controllerId,
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
  });
}

function forgeChoice(state, candidateIds) {
  state.pendingRoomTargets.push({
    playerId: 'p1', room: 2, roomName: 'Forge', kind: 'creature',
    effectType: 'add_counter', params: { amount: 2 },
    candidateIds, cards: null, restorePriorityTo: 'p1',
  });
}

function exileTo(state, controllerId, objectId, newId) {
  state.turn.priorityPlayerId = controllerId;
  const r = execute(state, { type: 'move_object', playerId: controllerId, objectId, toZone: 'exile', newObjectId: newId });
  assert.equal(r.ok, true, r.events[0]?.reason);
}

test('lista celów pokoju pomija kandydata, który zniknął z bitwiska', () => {
  const state = game();
  addCreature(state, 'cre-ok', 'p1');
  addCreature(state, 'cre-gone', 'p2');
  // Wygnanie w tej samej komendzie, która (już wcześniej) pobierała kandydatów
  // — lista decyzji pokoju zatrzaskuje nieaktualny identyfikator.
  exileTo(state, 'p2', 'cre-gone', 'cre-gone-x');
  forgeChoice(state, ['cre-ok', 'cre-gone']);
  state.turn.priorityPlayerId = 'p1';
  assert.deepEqual(legalRoomTargetCandidates(state, state.pendingRoomTargets[0]), ['cre-ok']);
  const roomCmds = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_room_target');
  assert.deepEqual(roomCmds.map((c) => c.targetId).sort(), ['cre-ok'], 'widok oferuje wyłącznie legalnych kandydatów');
  // Komenda spoza oferty jest odrzucana (oferta i walidacja spójne):
  const bad = execute(state, { type: 'resolve_room_target', playerId: 'p1', targetId: 'cre-gone-x' });
  assert.equal(bad.ok, false);
  assert.equal(bad.events[0].reason, 'illegal_room_target');
  // Legalny wybór przechodzi i schodzi z listy decyzji:
  const ok = execute(state, { type: 'resolve_room_target', playerId: 'p1', targetId: 'cre-ok' });
  assert.equal(ok.ok, true, ok.events[0]?.reason);
  assert.equal(state.objects.get('cre-ok').counters['+1/+1'], 2);
  assert.equal(state.pendingRoomTargets.length, 0);
});

test('decyzja pokoju bez żadnego legalnego celu gaśnie, gra toczy się dalej', () => {
  const state = game();
  addCreature(state, 'cre-gone', 'p2');
  exileTo(state, 'p2', 'cre-gone', 'cre-gone-x');
  forgeChoice(state, ['cre-gone']);
  state.turn.priorityPlayerId = 'p1';
  // Widok nie blokuje się na ślepej decyzji — pass jest dostępny.
  assert.ok(
    playerView(state, 'p1').legalCommands.some((c) => c.type === 'pass_priority'),
    'pass dostępny mimo nieaktywnej decyzji pokoju',
  );
  // Pierwsza kolejna komenda sprząta decyzję automatycznie i przechodzi.
  const ok = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(ok.ok, true, ok.events[0]?.reason);
  assert.equal(state.pendingRoomTargets.length, 0, 'ślepa decyzja posprzątana');
  assert.ok(
    state.events.some((e) => e.type === 'room_target_resolved' && e.noLegalTargets === true && e.room === 2),
    'zdarzenie gaśnięcia decyzji bez celu trafiło do logu',
  );
});
