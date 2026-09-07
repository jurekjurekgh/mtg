import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const registry = createCardRegistry();
function accepted(state, cmd) {
  assert.ok(cmd, 'oferta istnieje');
  const result = execute(state, cmd);
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}
function manifested(cardId) {
  const state = createGameState({ seed: 340, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  for (const [id, cid, zone] of [['spell', 'manifest-dread', 'hand'], ['lib', cardId, 'library'], ['spare', 'basic-forest', 'library']]) {
    addObject(state, { id, instanceId: `i-${id}`, cardId: cid, controllerId: 'p1', ownerId: 'p1', zone, ...gameObjectDataOf(registry.get(cid)) });
  }
  addMana(state, 'p1', 2, { colors: ['G'] });
  accepted(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'spell'));
  for (const playerId of ['p1', 'p2']) accepted(state, { type: 'pass_priority', playerId });
  accepted(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_manifest_dread' && c.cardId === 'lib'));
  const object = state.zones.battlefield.map((id) => state.objects.get(id)).find((o) => o.faceDown);
  assert.ok(object);
  assert.equal(state.pendingSpell, null);
  assert.equal(state.players[0].mana, 0);
  return { state, id: object.id };
}
const offers = (state, id) => playerView(state, 'p1').legalCommands.filter((c) => c.objectId === id);

test('M340/A: CR 701.40c — manifest Monastery Flock można odsłonić za morph {U}, nie potrzeba {2}{U}', () => {
  const { state, id } = manifested('monastery-flock');
  addMana(state, 'p1', 1, { colors: ['U'] });
  assert.equal(offers(state, id).some((c) => c.type === 'turn_manifest_face_up'), false);
  const result = accepted(state, offers(state, id).find((c) => c.type === 'activate_ability'));
  const after = state.objects.get(id);
  assert.equal(after.faceDown, false);
  assert.deepEqual([after.power, after.toughness], [0, 5]);
  assert.equal(state.players[0].mana, 0, 'zapłacono tylko {U}');
  assert.equal(state.zones.stack.length, 0, 'specjalna akcja nie używa stosu');
  assert.ok(result.events.some((e) => e.type === 'turned_face_up'));
  assert.equal(after.manifestReady, false);
  assert.equal(after.manifestTurnUpCost, null);
  assert.equal(after.faceDownCause, null);
});

for (const route of ['activate_ability', 'turn_manifest_face_up']) {
  test(`M340/B: megamorph — licznik tylko za procedurę megamorph (${route})`, () => {
    const { state, id } = manifested('segmented-krotiq');
    addMana(state, 'p1', 7, { colors: ['G'] });
    const available = offers(state, id);
    assert.ok(available.some((c) => c.type === 'activate_ability'));
    assert.ok(available.some((c) => c.type === 'turn_manifest_face_up'));
    accepted(state, available.find((c) => c.type === route));
    const after = state.objects.get(id);
    assert.deepEqual([after.power, after.toughness], [6, 5]);
    assert.equal(after.counters?.['+1/+1'] ?? 0, route === 'activate_ability' ? 1 : 0);
    assert.equal(state.players[0].mana, route === 'activate_ability' ? 0 : 1);
    assert.equal(after.manifestReady, false);
    assert.equal(after.faceDownCause, null);
  });
}

test('M340/C: obrót zmanifestowanego Willbendera przywraca jego drukowane zdolności', () => {
  const { state, id } = manifested('willbender');
  addMana(state, 'p1', 2, { colors: ['U'] });
  accepted(state, offers(state, id).find((c) => c.type === 'activate_ability'));
  assert.deepEqual(state.objects.get(id).abilities, registry.get('willbender').abilities);
  assert.ok(state.objects.get(id).abilities.some((a) => a.trigger?.event === 'turned_face_up'));
  assert.equal(state.objects.get(id).originalAbilities, undefined);
});

test('M340/D: morph nadal wymaga koloru i priorytetu — brak nadmiarowej oferty', () => {
  const { state, id } = manifested('monastery-flock');
  assert.equal(offers(state, id).some((c) => c.type === 'activate_ability'), false);
  addMana(state, 'p1', 1, { colors: ['R'] });
  assert.equal(offers(state, id).some((c) => c.type === 'activate_ability'), false);
  addMana(state, 'p1', 1, { colors: ['U'] });
  assert.ok(offers(state, id).some((c) => c.type === 'activate_ability'));
  accepted(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(offers(state, id).some((c) => c.type === 'activate_ability'), false);
});

test('M340/E: przeciwnik nie widzi procedury ani karty pod manifestem', () => {
  const { state, id } = manifested('willbender');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const own = playerView(state, 'p1').zones.battlefield.find((o) => o.id === id);
  const foe = playerView(state, 'p2').zones.battlefield.find((o) => o.id === id);
  assert.equal(own.activatableAbilities.length, 1);
  assert.equal(foe.cardId ?? null, null);
  assert.equal(foe.activatableAbilities, undefined);
  assert.equal(foe.faceDownCause, 'manifest');
  assert.deepEqual(foe.keywords ?? [], [], 'procedura nie jest publiczną zdolnością stworzenia');
});

test('M340/F: manifest karty bez morpha nie dostaje wymyślonej procedury', () => {
  for (const cardId of ['goblin-piker', 'basic-island', 'shock']) {
    const { state, id } = manifested(cardId);
    addMana(state, 'p1', 10);
    assert.equal(offers(state, id).some((c) => c.type === 'activate_ability'), false, cardId);
    assert.equal(offers(state, id).some((c) => c.type === 'turn_manifest_face_up'), cardId === 'goblin-piker');
  }
});
