// M152 (audyt Żywym Testerem): etykieta decyzji Satyr Wayfinder pokazywała
// „Weź ląd do ręki: ?" — karty odsłoniętej biblioteki są w PlayerView ukryte
// (hidden:true, bez cardId), więc nameOfObjectId zwracał „?". Satyr Wayfinder
// odsłania WŁASNE karty (gracz je zna), więc label bierze nazwę z pełnego
// stanu sesji (jak resolve_reveal_exile_hand / resolve_discard_choice).

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [], cardName: def.name,
  });
  return state.objects.get(id);
}

test('M152: „Weź ląd do ręki" pokazuje nazwę lądu (nie „?") dla odsłoniętej karty biblioteki', () => {
  const state = createGameState({ seed: 152, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.number = 6;
  put(state, 'wayfinder', 'satyr-wayfinder', 'p1', 'battlefield');
  const land1 = put(state, 'lib-land', 'basic-forest', 'p1', 'library');
  put(state, 'lib-creature', 'highland-game', 'p1', 'library');

  // Zbuduj oczekującą decyzję Satyr Wayfinder: odsłonięte 2 karty (ląd + stwór).
  state.pendingSatyrLook = {
    playerId: 'p1',
    objectIds: [land1.id, 'lib-creature'],
    landIds: [land1.id],
    restorePriorityTo: 'p1',
  };
  const view = playerView(state, 'p1');
  // Komendy resolve_satyr_look_choice dla lądu.
  const cmd = view.legalCommands.find((c) => c.type === 'resolve_satyr_look_choice' && c.pickId === land1.id);
  assert.ok(cmd, 'oferta wzięcia lądu do ręki');

  // Sesyjny nameOfObject zna pełny stan — karta biblioteki ma cardId.
  const session = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (objectId) => {
      const o = state.objects.get(objectId);
      return o ? (REGISTRY.get(o.cardId)?.name ?? o.cardId) : '?';
    },
  };
  const label = commandLabel(cmd, session, view);
  assert.match(label, /Weź ląd do ręki: Forest/, `label: ${label}`);
  assert.ok(!label.includes('?'), 'nie może być „?" dla nazwy odsłoniętego lądu');
});
