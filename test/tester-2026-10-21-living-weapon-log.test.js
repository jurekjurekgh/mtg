// Q-1, Żywy Tester 2026-10-21: log z partii Dominaria/Mirrodin mówił
// „Strandwalker zostaje załączony do Germ (bestow)”. Engine poprawnie emituje
// via: 'living_weapon'; czytnik logu zakładał, że KAŻDA nieznana via to bestow.
// Test używa prawdziwego zdarzenia z rzutu ekwipunku, nie spreparowanego tekstu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent } from '../src/table/session.js';

const registry = createCardRegistry();
const nameOf = (id) => registry.get(id)?.name ?? '?';
const helpers = (state) => ({
  nameOf,
  nameOfObject: (id) => nameOf(state.objects.get(id)?.cardId),
});

function scene() {
  const state = createGameState({ seed: 37, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const card = registry.get('strandwalker');
  const data = gameObjectDataOf(card);
  addObject(state, {
    id: 'walk', instanceId: 'i-walk', cardId: card.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, abilities: data.abilities ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], types: card.types ?? [], colors: data.colors ?? [],
    equipment: data.equipment,
  });
  addMana(state, 'p1', 5);
  return state;
}

test('Q-1: living weapon ETB ma w logu swoją mechanikę, a nie bestow', () => {
  const state = scene();
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'walk');
  assert.ok(offer, 'rzut ekwipunku z istniejącej karty');
  assert.equal(execute(state, offer).ok, true);
  for (let i = 0; i < 24 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'rozstrzygnięcie czaru i triggera');
    assert.equal(execute(state, pass).ok, true);
  }
  assert.equal(state.zones.stack.length, 0);
  const e = state.events.find((ev) => ev.type === 'object_attached' && ev.cardId === 'strandwalker');
  assert.equal(e?.via, 'living_weapon', 'silnik oznaczył właściwą mechanikę');
  assert.equal(describeGameEvent(e, helpers(state)), 'Strandwalker wyposaża Germ (living weapon)');
});

test('Q-1 anty-over-fix: prawdziwe bestow nadal nazywa się bestow', () => {
  const e = { type: 'object_attached', objectId: 'dryad', cardId: 'leafcrown-dryad',
    hostId: 'host', hostCardId: 'token_germ', via: 'bestow' };
  const text = describeGameEvent(e, { nameOf, nameOfObject: () => '?' });
  assert.equal(text, 'Leafcrown Dryad zostaje załączony do Germ (bestow)');
});

test('Q-1: nieznane via nie podszywa się pod bestow', () => {
  const e = { type: 'object_attached', cardId: 'strandwalker', hostId: 'host',
    hostCardId: 'token_germ', via: 'future_mechanic' };
  const text = describeGameEvent(e, { nameOf, nameOfObject: () => '?' });
  assert.equal(text, 'Strandwalker zostaje załączony do Germ');
});
