// Audyt #177 A17: rzeczywiste czary i zmiany między rzuceniem a rozstrzygnięciem.
// Tail Slash, ruling DTK 2015-02-25 (docs/cards/scryfall-tail-slash.json):
// "If either creature is an illegal target as Tail Slash tries to resolve,
// the creature you control won’t deal damage."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const registry = createCardRegistry();
function game() {
  const state = createGameState({ seed: 17717, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10, { colors: ['R'] });
  return state;
}
function creature(state, id, controllerId, { power = 2, toughness = 10, colors = ['G'], keywords = [], protectionFromColors = [] } = {}) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], subtypes: [], colors, keywords, abilities: [], protectionFromColors });
}
function land(state, id, controllerId = 'p1') {
  const card = registry.get('basic-mountain');
  addObject(state, { id, instanceId: `i-${id}`, cardId: card.id, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(card), types: card.types, subtypes: card.subtypes });
}
function cast(state, cardId, targets) {
  const card = registry.get(cardId);
  addObject(state, { id: 'spell', instanceId: 'i-spell', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(card), types: card.types, subtypes: card.subtypes ?? [] });
  const cmd = playerView(state, 'p1').legalCommands.find(c => c.type === 'cast_spell'
    && c.objectId === 'spell' && JSON.stringify(c.targets) === JSON.stringify(targets));
  assert.ok(cmd, `oferta ${cardId} ${JSON.stringify(targets)}`);
  assert.equal(execute(state, cmd).ok, true);
}
function resolve(state) {
  for (let i = 0; i < 10 && state.zones.stack.length; i++) {
    const cmd = playerView(state, state.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(cmd);
    assert.equal(execute(state, cmd).ok, true);
  }
  assert.equal(state.zones.stack.length, 0);
}

test('A17: Tail Slash — nielegalny pierwszy cel nie zadaje obrażeń drugiemu', () => {
  const state = game();
  creature(state, 'dealer', 'p1'); creature(state, 'victim', 'p2');
  cast(state, 'tail-slash', ['dealer', 'victim']);
  moveObjectDirectly(state, 'dealer', 'graveyard', 'dead-dealer');
  resolve(state);
  assert.equal(state.objects.get('victim').damage, 0);
});

test('A17: Tail Slash — hexproof drugiego celu po rzuceniu powstrzymuje obrażenia', () => {
  const state = game();
  creature(state, 'dealer', 'p1', { keywords: ['lifelink'] }); creature(state, 'victim', 'p2');
  cast(state, 'tail-slash', ['dealer', 'victim']);
  state.objects.set('victim', Object.freeze({ ...state.objects.get('victim'), keywords: ['hexproof'] }));
  resolve(state);
  assert.equal(state.objects.get('victim').damage, 0);
  assert.equal(state.players.find(p => p.id === 'p1').life, 20);
});

test('A17: Tail Slash — zmiana kontrolera pierwszego celu czyni go nielegalnym', () => {
  const state = game();
  creature(state, 'dealer', 'p1'); creature(state, 'victim', 'p2');
  cast(state, 'tail-slash', ['dealer', 'victim']);
  state.objects.set('dealer', Object.freeze({ ...state.objects.get('dealer'), controllerId: 'p2' }));
  resolve(state);
  assert.equal(state.objects.get('victim').damage, 0);
});

test('A17: Tail Slash — źródło obrażeń i moc są brane od stwora w chwili rozstrzygnięcia', () => {
  const state = game();
  creature(state, 'dealer', 'p1', { power: 2, colors: ['G'], keywords: ['lifelink'] });
  creature(state, 'victim', 'p2');
  cast(state, 'tail-slash', ['dealer', 'victim']);
  state.objects.set('dealer', Object.freeze({ ...state.objects.get('dealer'), power: 4 }));
  resolve(state);
  assert.equal(state.objects.get('victim').damage, 4, 'moc po rzuceniu, przed rozstrzygnięciem');
  assert.equal(state.players.find(p => p.id === 'p1').life, 24, 'lifelink stwora');
});

test('A17: Tail Slash — ochrona przed zielonym dawcą zapobiega obrażeniom', () => {
  const state = game();
  creature(state, 'dealer', 'p1', { power: 2, colors: ['G'], keywords: ['lifelink'] });
  creature(state, 'victim', 'p2', { protectionFromColors: ['G'] });
  cast(state, 'tail-slash', ['dealer', 'victim']);
  resolve(state);
  assert.equal(state.objects.get('victim').damage, 0);
  assert.equal(state.players.find(p => p.id === 'p1').life, 20);
});

test('A17: Rumbling Rockslide liczy landy w chwili rozstrzygnięcia', () => {
  const state = game();
  land(state, 'l1'); land(state, 'l2'); land(state, 'enemy', 'p2');
  creature(state, 'victim', 'p2');
  cast(state, 'rumbling-rockslide', ['victim']);
  moveObjectDirectly(state, 'l1', 'graveyard', 'dead-land');
  land(state, 'l3'); land(state, 'l4');
  resolve(state);
  assert.equal(state.objects.get('victim').damage, 3, 'tylko aktualne własne landy');
});
