// Audyt PR #86 (sesja arena/01a047db, znalezisko N2) — L41/L48: bramka oferty
// pass_priority (ręczny łańcuch ~55 warunków) to jedyna z trzech kopii tej
// logiki BEZ warunku `firstDecisionOwner == null` (Batch 47 doprowadził go
// w siostrzanych bramkach ofert czarów i lądów/ataków z komentarzem, że
// ręczne łańcuchy pomijały decyzje). Efekt: najnowsza blokująca decyzja —
// Manifest Dread (DSK) — znów „wyciekła": widok oferował pass przy otwartej
// decyzji, którą execute i tak odrzuca („manifest_dread_unresolved").
//
// RED→GREEN: przed naprawą bramki test jest czerwony (pass na liście ofert).
// Anty-over-fix: po rozstrzygnięciu decyzji pass MUSI wrócić do oferty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function gameWithManifestDread() {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 20, { G: 5, U: 5, B: 5, R: 5, W: 5 });
  const def = REGISTRY.get('manifest-dread');
  addObject(state, {
    id: 'md', instanceId: 'i-md', cardId: 'manifest-dread', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', types: def.types, colors: def.colors, manaCost: def.manaCost, spell: def.spell,
  });
  for (let i = 0; i < 4; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
      zone: 'library', kind: 'creature', types: ['Creature'], colors: ['R'], power: 2, toughness: 1, subtypes: [], abilities: [],
    });
  }
  return state;
}

function resolveToManifestDreadDecision(state) {
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'md');
  assert.ok(cast, 'oferta rzutu Manifest Dread');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  let guard = 0;
  while (!state.pendingManifestDread && guard++ < 12) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok(state.pendingManifestDread, 'czar rozstrzygnięty do decyzji Manifest Dread');
  return state.pendingManifestDread.playerId;
}

test('N2: przy otwartej decyzji Manifest Dread pass_priority NIE jest oferowany (L48)', () => {
  const state = gameWithManifestDread();
  const decider = resolveToManifestDreadDecision(state);
  const offers = playerView(state, decider).legalCommands.map((c) => c.type);
  assert.ok(offers.includes('resolve_manifest_dread'), 'oferta wyboru karty obecna');
  assert.ok(!offers.includes('pass_priority'), 'pass_priority NIE jest oferowany przy otwartej blokującej decyzji');
});

test('N2 (anty-over-fix): po rozstrzygnięciu Manifest Dread pass wraca do oferty', () => {
  const state = gameWithManifestDread();
  const decider = resolveToManifestDreadDecision(state);
  const pick = playerView(state, decider).legalCommands.find((c) => c.type === 'resolve_manifest_dread');
  assert.ok(pick, 'komenda wyboru');
  assert.ok(execute(state, pick).ok, 'wybór przyjęty');
  assert.equal(state.pendingManifestDread, null, 'decyzja zamknięta');
  const offersAfter = playerView(state, state.turn.priorityPlayerId).legalCommands.map((c) => c.type);
  assert.ok(offersAfter.includes('pass_priority'), 'po zamknięciu decyzji pass jest znowu oferowany');
});
