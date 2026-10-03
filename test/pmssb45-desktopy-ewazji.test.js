// PMSSB-45 (2026-10-03f): PlayerView niesie publiczne deskryptory ewazji
// (cantBeBlockedExceptByColors, cantBeBlockedByPower) — następcy landwalka.
// Bot rozpoznaje je w hostEvadesBlockers tak samo jak flying/menace/landwalk.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function putOnBf(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], abilities: def.abilities ?? [], ...patch,
  });
  return state.objects.get(id);
}

describe('PMSSB-45/A: PlayerView wystawia deskryptory ewazji (fakt publiczny, ADR 0017)', () => {
  it('A1 Dread Warlock ma cantBeBlockedExceptByColors:[B] w widoku wroga', () => {
    const state = game();
    putOnBf(state, 'dw', 'dread-warlock', 'p1');
    const view = playerView(state, 'p2');
    const entry = view.zones.battlefield.find((o) => o.id === 'dw');
    assert.deepEqual(entry.cantBeBlockedExceptByColors, ['B']);
  });

  it('A2 Rust-Shield Rampager ma cantBeBlockedByPower:2 w widoku wroga', () => {
    const state = game();
    putOnBf(state, 'rr', 'rust-shield-rampager', 'p1');
    const view = playerView(state, 'p2');
    const entry = view.zones.battlefield.find((o) => o.id === 'rr');
    assert.equal(entry.cantBeBlockedByPower, 2);
  });
});
