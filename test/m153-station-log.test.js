// M153/A1 — log aktywacji Station (Warmaker Gunship) ma nazywać TAPNIĘTEGO
// stwora („(tapuje: <nazwa>)”), nie sztywny opis „moc zatapniętego stwora”.
// Zdarzenie ability_activated niesie stationTappedCreatureId.

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 153, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, ctrl, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
    kind: extra.kind ?? data.kind, power: extra.power ?? data.power,
    toughness: extra.toughness ?? data.toughness, manaCost: extra.manaCost ?? data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: extra.types ?? def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, station: def.station,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// --- A1: log Station nazywa tapniętego stwora ------------------------------
test('A1: log aktywacji Station nazywa tapniętego stwora (nie „moc zatapniętego stwora")', () => {
  const state = newState();
  put(state, 'ship', 'warmaker-gunship', 'p1');
  put(state, 'sold', 'token_soldier', 'p1', 'battlefield', { kind: 'creature', power: 2, toughness: 2 });
  const view = playerView(state, 'p1');
  const act = view.legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'ship' && c.tapOtherCreatureId === 'sold');
  assert.ok(act, 'oferta aktywacji Station (tap soldier)');
  const result = execute(state, act);
  const ev = result.events.find((e) => e.type === 'ability_activated');
  assert.ok(ev, 'zdarzenie ability_activated');
  assert.equal(ev.stationTappedCreatureId, 'sold', 'zdarzenie niesie id tapniętego stwora');
  const helpers = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    nameOfObject: (id) => { const o = state.objects.get(id); return o ? (REGISTRY.get(o.cardId)?.name ?? o.cardId) : '?'; },
    isPlayer: (id) => state.players.some((p) => p.id === id),
  };
  const text = describeGameEvent(ev, helpers);
  assert.match(text, /\(tapuje: Soldier\)/, `log powinien nazwać stwora: ${text}`);
  assert.doesNotMatch(text, /moc zatapniętego stwora/);
});
