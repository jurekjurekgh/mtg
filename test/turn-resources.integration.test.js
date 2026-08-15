import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { initializeResources } from '../src/engine/resources.js';
import { tapObject } from '../src/engine/permanents.js';

test('przejście do kolejnej tury automatycznie resetuje zasoby i untapuje permanenty', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  addObject(state, { id: 'p1-creature', instanceId: 'i1', cardId: 'Creature', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  tapObject(state, 'p1-creature', 'p1');
  // M101/A (CR 504.1): dobranie jest akcją turową, więc obaj gracze muszą mieć
  // karty — inaczej partia kończy się deck-outem (CR 104.3c) przed turą 3.
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      addObject(state, { id: `lib-${pid}-${i}`, instanceId: `il-${pid}-${i}`, cardId: 'Card', controllerId: pid, zone: 'library' });
    }
  }
  state.players[0].mana = 3;
  state.players[0].landPlays = 0;
  for (let i = 0; i < 48; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.turn.number, 3);
  assert.equal(state.turn.activePlayerId, 'p1');
  assert.equal(state.objects.get('p1-creature').tapped, false);
  assert.equal(state.players[0].mana, 0);
  assert.equal(state.players[0].landPlays, 1);
});
