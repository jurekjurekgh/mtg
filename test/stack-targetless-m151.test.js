// M151 (audyt żywym testerem): stos pokazywał „Ghoulcaller's Bell → cel:
// Ghoulcaller's Bell" dla bezcelowej zdolności aktywowanej ({T}: każdy gracz
// mieli). Root cause: activatedEntry.targets to [sourceId] — slot dla
// applyEffect, NIE cel — a PlayerView eksponował go jako „cel". Teraz widok
// ujawnia cele tylko, gdy zdolność je faktycznie ma (ability.targets).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView, execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  return state.objects.get(id);
}

test('M151: bezcelowa zdolność (Ghoulcaller\'s Bell {T}: mieli obu) NIE pokazuje „→ cel: <źródło>" na stosie', () => {
  const state = createGameState({ seed: 151, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  put(state, 'bell', 'ghoulcallers-bell', 'p1', 'battlefield');
  state.objects.set('bell', Object.freeze({ ...state.objects.get('bell'), summoningSickness: false }));

  // Aktywuj {T}: each player mills a card — bezcelowa.
  const view = playerView(state, 'p1');
  const act = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'bell');
  assert.ok(act, 'oferta aktywacji dzwonu');
  execute(state, act);

  const after = playerView(state, 'p1');
  const stackEntry = after.zones.stack.find((s) => s.abilityIndex === 0);
  assert.ok(stackEntry, 'zdolność na stosie');
  assert.deepEqual(stackEntry.targets ?? [], [], 'bezcelowa zdolność nie niesie „celu" (był [sourceId])');
});

test('M151: zdolność Z CELEM nadal pokazuje cel na stosie (anty-over-fix)', () => {
  const state = createGameState({ seed: 151, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  // Cellar Door — aktywowana zdolność z celem ({1},{T}: target player mills).
  put(state, 'cellar', 'cellar-door', 'p1', 'battlefield');
  state.objects.set('cellar', Object.freeze({ ...state.objects.get('cellar'), summoningSickness: false }));
  addMana(state, 'p1', 3);

  const view = playerView(state, 'p1');
  const act = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'cellar' && (c.targets ?? []).length === 1);
  assert.ok(act, `oferta zdolności z celem: ${JSON.stringify(act)}`);
  execute(state, act);

  const after = playerView(state, 'p1');
  const stackEntry = after.zones.stack.find((s) => s.abilityIndex === 0);
  assert.ok(stackEntry, 'zdolność na stosie');
  assert.deepEqual(stackEntry.targets, act.targets, 'zdolność z celem zachowuje cel na stosie');
});
