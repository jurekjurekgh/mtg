// M254 (2026-08-28) — kolizja DWÓCH pendingów tego samego gracza.
//
// Znalezisko z pełnej macierzy benchmarku (`node tools/benchmark.mjs --full`
// po Batchu 51): partia kończyła się wyjątkiem „Bot wybrał nielegalną komendę:
// rebound_unresolved" (random@forgotten-realms vs heuristic@tarkir-wur,
// seed 1006, komenda 603).
//
// Root cause (klasa „rozdźwięk oferta ↔ walidacja"): przy dwóch
// oczekujących decyzjach tego samego gracza — rebound Ojutai's Breath
// (CR 702.97) i wybór ścieżki lochu (M190/B) — silnik oferował
// `resolve_undercity_route`, po czym SAM go odrzucał, bo bramka `execute` dla
// reboundu odrzuca każdą komendę inną niż `resolve_rebound_cast`.
//
// Reguła jest zapisana przy `firstPendingDecisionPlayerId`: pierwszy właściciel
// decyzji = pierwsza bramka `execute` = pierwsza gałąź ofert w `legalCommands`.
// Batch 51 nie dodał żadnej z tych kart — zmiana talii (Typhoid Rats i Dromoka
// Warrior w `tarkir-wur`) tylko sprawiła, że kolizja wyszła w próbce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

/** Stan z DWOMA pendingami tego samego gracza: rebound + wybór ścieżki lochu. */
function stateWithTwoPendings(playerId = 'p1') {
  const state = createGameState({ seed: 254, players: [{ id: 'p1' }, { id: 'p2' }] });
  const def = REGISTRY.get('ojutais-breath');
  addObject(state, {
    id: 'ex1', instanceId: 'i-ex1', cardId: 'ojutais-breath',
    controllerId: playerId, ownerId: playerId, zone: 'exile',
    ...gameObjectDataOf(def), types: def.types, colors: def.colors, spell: def.spell,
  });
  // addObject nie przenosi flagi gotowości (L21) — ustawiamy wprost.
  state.objects.set('ex1', Object.freeze({ ...state.objects.get('ex1'), reboundReady: true }));
  state.pendingReboundCast = {
    playerId, objectId: 'ex1', cardId: 'ojutais-breath', restorePriorityTo: playerId,
  };
  state.pendingUndercityRoute = {
    playerId, fromRoom: 2, fromRoomName: 'Forge',
    candidates: [{ name: 'Trap!', room: 4 }, { name: 'Arena', room: 5 }],
  };
  state.turn.priorityPlayerId = playerId;
  state.turn.activePlayerId = playerId;
  return state;
}

test('M254: przy dwóch pendingach oferowana jest decyzja PIERWSZEJ bramki (rebound przed undercity)', () => {
  const state = stateWithTwoPendings();
  const view = playerView(state, 'p1');
  const types = view.legalCommands.map((c) => c.type);
  assert.ok(types.includes('resolve_rebound_cast'),
    `rebound musi być oferowany (bramka execute odrzuca wszystko inne): ${types.join(', ')}`);
  assert.ok(!types.includes('resolve_undercity_route'),
    'wybór ścieżki lochu NIE może być oferowany, dopóki rebound czeka — oferta zostałaby odrzucona przez własną bramkę');
});

test('M254: oferowana komenda jest realnie przyjmowana przez execute (brak rozdźwięku oferta↔walidacja)', () => {
  const state = stateWithTwoPendings();
  const view = playerView(state, 'p1');
  const decline = view.legalCommands.find((c) => c.type === 'resolve_rebound_cast' && c.cast === false);
  assert.ok(decline, 'wariant „zostaw w exile" jest zawsze oferowany');
  const r = execute(state, decline);
  assert.ok(r.ok, `silnik odrzucił własną ofertę: ${r.events?.[0]?.reason}`);
});

test('M254: po rozstrzygnięciu reboundu wybór ścieżki lochu wraca do ofert', () => {
  const state = stateWithTwoPendings();
  const decline = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_rebound_cast' && c.cast === false);
  execute(state, decline);
  const after = playerView(state, 'p1');
  assert.ok(after.legalCommands.some((c) => c.type === 'resolve_undercity_route'),
    'druga decyzja czeka na swoją kolej — nie ginie przez kolizję');
});
