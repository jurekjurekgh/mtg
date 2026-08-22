// M186 — pętla jakości Żywym Testerem po Batchu 45 (2026-08-22).
// Z1: wizard bloków oferował samotny blok stworem z „can't block alone"
// (Ember Beast, g1-ravnica-innistrad-s9) — walidacja wizarda czytała
// entry.abilities, których playerView nie wysyła (martwa od urodzenia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, ctrl) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
}

test('M186/Z1: widok niesie JAWNE flagi cantAttackAlone/cantBlockAlone (Ember Beast)', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  put(state, 'beast', 'ember-beast', 'p1');
  put(state, 'deer', 'highland-game', 'p1');
  for (const observer of ['p1', 'p2']) {
    const view = playerView(state, observer);
    const beast = view.zones.battlefield.find((o) => o.id === 'beast');
    assert.equal(beast.cantAttackAlone, true, `${observer}: flaga cantAttackAlone w widoku`);
    assert.equal(beast.cantBlockAlone, true, `${observer}: flaga cantBlockAlone w widoku`);
    const deer = view.zones.battlefield.find((o) => o.id === 'deer');
    assert.ok(!deer.cantBlockAlone, `${observer}: zwykły stwór bez flagi`);
  }
});
