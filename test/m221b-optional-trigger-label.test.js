// M221/B — zgłoszenie właściciela z realnej gry (Angel's Feather): decyzja
// „you may" pokazywała gołe „Efekt dobrowolny (you may)" bez nazwy karty ani
// treści efektu — gracz nie wiedział, czego dotyczy wybór.
//
// Naprawa: playerView wystawia pendingOptionalTrigger { sourceCardId, effect }
// (informacja publiczna, tylko właściciel decyzji — jak pendingHandTopChoice),
// a choiceGroupTitle/choiceSourceTitle nazywa kartę i opisuje efekt
// (describeEffect, bez nazw kart w warstwie opisu — ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { choiceGroupTitle } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const session = { nameOf: (id) => REGISTRY.get(id)?.name ?? String(id) };

function stateWithPending() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  const af = gameObjectDataOf(REGISTRY.get('angels-feather'));
  addObject(state, {
    id: 'af', instanceId: 'i-af', cardId: 'angels-feather', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: af.kind, abilities: af.abilities ?? [], types: af.types ?? ['Artifact'],
  });
  state.pendingOptionalTrigger = {
    playerId: 'p1', sourceId: 'af', ability: { effect: { type: 'gain_life', amount: 1 } },
    restorePriorityTo: 'p1',
  };
  state.turn.priorityPlayerId = 'p1';
  return state;
}

test('M221/B: playerView niesie źródło i efekt decyzji „you may" (właścicielowi)', () => {
  const state = stateWithPending();
  const view = playerView(state, 'p1');
  assert.equal(view.pendingOptionalTrigger?.sourceCardId, 'angels-feather');
  assert.equal(view.pendingOptionalTrigger?.effect?.type, 'gain_life');
  assert.equal(view.pendingOptionalTrigger?.effect?.amount, 1);
});

test('M221/B: tytuł modala nazywa KARTĘ i opisuje efekt (nie gołe „you may")', () => {
  const state = stateWithPending();
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire);
  assert.ok(cmd, 'oferta resolve_optional_trigger_choice(fire) musi istnieć');
  const title = choiceGroupTitle({ options: [cmd] }, session, view);
  assert.match(title, /Angel's Feather/, `tytuł musi nazwać kartę: ${title}`);
  assert.match(title, /zyskaj 1 życie/, `tytuł musi opisać efekt: ${title}`);
  assert.doesNotMatch(title, /^Efekt dobrowolny/, 'tytuł nie może być gołym „Efekt dobrowolny"');
});

test('M221/B: FoW — przeciwnik NIE widzi pendingOptionalTrigger', () => {
  const state = stateWithPending();
  const foeView = playerView(state, 'p2');
  assert.equal(foeView.pendingOptionalTrigger, null,
    'decyzja właściciela nie może wyciekać do widoku przeciwnika (ADR 0003)');
});
