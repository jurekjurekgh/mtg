// E9/F5 (wyzwanie wyłapywacza błędów II): THRONE — PODWÓJNY TRIGGER ETB
// (CR 603.6c). `thronePutChosenCreature` emituje I `object_moved`
// (toZone battlefield), I `permanent_entered_battlefield` — pompa triggerów
// (processTriggersScan) dopasowuje OBA typy do zdolności „enters the
// battlefield" i odpala je DWA RAZY (Omenspeaker dała scry 2 dwa razy,
// Impact Tremors 2 obrażenia zamiast 1). Pozostałe ścieżki wejść emitują
// dokładnie jedno z tych zdarzeń.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { processTriggers } from '../src/engine/triggers.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function etbEventsFor(objectId) {
  const object = { ...REGISTRY.get('omenspeaker'), id: objectId, instanceId: `i-${objectId}`, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield' };
  return [
    { type: 'object_moved', fromId: 'lib1', object, fromZone: 'library', toZone: 'battlefield' },
    { type: 'permanent_entered_battlefield', objectId, object, cardId: object.cardId, controllerId: 'p1' },
  ];
}

test('E9/F5: wejście z Throne odpala trigger ETB DOKŁADNIE RAZ (CR 603.6c)', () => {
  const state = createGameState({ seed: 12, players: [{ id: 'p1' }, { id: 'p2' }] });
  const data = gameObjectDataOf(REGISTRY.get('omenspeaker'));
  addObject(state, {
    ...data, id: 'omen', instanceId: 'i-omen', cardId: 'omenspeaker',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
  });
  const before = state.events.length;
  processTriggers(state, etbEventsFor('omen'));
  const fires = state.events.slice(before)
    .filter((e) => e.type === 'ability_triggered' && e.trigger === 'enter_battlefield');
  assert.equal(fires.length, 1,
    `trigger ETB odpalony raz (było: ${fires.length} — podwójne odpalenie z podwójnej emisji zdarzeń Throne)`);
});
