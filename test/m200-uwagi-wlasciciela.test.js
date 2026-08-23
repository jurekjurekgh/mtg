// M200 — uwagi właściciela z testów (2026-08-23): A, A2, B, C, C2, D, E, E2,
// F, G, H + weryfikacja zgłoszenia L z audytu agenta. Każdy punkt osobnym
// commitem (ADR 0020 C); plik rośnie kumulatywnie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { ventureIntoUndercityForTest } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 2001, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/** Wchodzi do pokoju 2 (Forge): sekretne wejście → wybór trasy → Forge. */
function enterForge(state, playerId) {
  state.undercityProgress = { [playerId]: 1 };
  ventureIntoUndercityForTest(state, playerId);
  const forge = playerView(state, playerId).legalCommands
    .find((c) => c.type === 'resolve_undercity_route' && c.roomName === 'Forge');
  assert.ok(forge, 'oferta trasy „Forge”');
  assert.ok(execute(state, forge).ok, 'wybór Forge');
}

// ---- A: Forge nie wzmacnia przeciwnika (fizzle bez własnej kreatury) -------

test('M200/A: Forge bez WŁASNEJ kreatury — efekt fizzluje, nie buffuje przeciwnika', () => {
  const state = game('p1');
  putCard(state, 'foe', 'highland-game', 'p2'); // stwór PRZECIWNIKA
  enterForge(state, 'p1');
  assert.equal(state.pendingRoomTargets.length, 0,
    'brak własnej kreatury = brak decyzji celu (fizzle), nie wymuszony wybór');
  assert.equal(state.objects.get('foe')?.counters?.['+1/+1'] ?? 0, 0,
    'stwór przeciwnika NIE dostaje liczników (zgłoszenie: „bezsens wzmacniać mojego stwora”)');
});

test('M200/A: Forge z własną kreaturą — kandydaci = TYLKO własne, liczniki lądują na nich', () => {
  const state = game('p1');
  putCard(state, 'own', 'highland-game', 'p1');
  putCard(state, 'foe', 'spinewoods-paladin', 'p2');
  enterForge(state, 'p1');
  assert.equal(state.pendingRoomTargets.length, 1, 'decyzja celu pokoju');
  const pending = state.pendingRoomTargets[0];
  assert.deepEqual(pending.candidateIds, ['own'],
    'stwór przeciwnika nie jest kandydatem („target creature” pokoju = twój stwór)');
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_room_target');
  assert.ok(cmd, 'oferta wyboru celu');
  assert.ok(execute(state, cmd).ok, 'wybór celu');
  assert.equal(state.objects.get('own')?.counters?.['+1/+1'] ?? 0, 2, 'dwa liczniki +1/+1 na własnym stwora');
  assert.equal(state.objects.get('foe')?.counters?.['+1/+1'] ?? 0, 0, 'przeciwnik nietknięty');
});
