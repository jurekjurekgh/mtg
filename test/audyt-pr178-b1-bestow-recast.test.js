// Audyt PR #178, B1: po odbiciu bestowed Aury karta wraca do ręki jako nowy
// obiekt z wydrukowanymi cechami (CR 400.7, 702.103b/f). Ponowny zwykły rzut
// jest czarem stwora, nie Aurą — Negate nie może go zobaczyć, a rozstrzygnięcie
// nie może iść ścieżką aury z nielegalnym/brakującym gospodarzem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { isNoncreatureSpellOnStack } from '../src/engine/spells.js';

const reg = createCardRegistry();
function put(s, id, card, zone = 'hand', player = 'p1') {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [card], ownerId: player, registry: reg });
  addObject(s, { ...data, id, instanceId: `i-${id}`, zone, controllerId: player });
}
const view = s => playerView(s, s.turn.priorityPlayerId);
function act(s, c) {
  assert.ok(c, JSON.stringify(view(s).legalCommands));
  const r = execute(s, c);
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}
function drain(s) {
  for (let i = 0; i < 30 && s.zones.stack.length; i++) {
    act(s, view(s).legalCommands.find(c => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0);
}
const find = (s, id, zone) => [...s.objects.values()].find(o => o.instanceId === `i-${id}` && o.zone === zone);
function scene() {
  const s = createGameState({ seed: 17801, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'host', 'highland-game', 'battlefield', 'p2');
  put(s, 'dryad', 'leafcrown-dryad');
  put(s, 'scorn', 'sea-gods-scorn');
  put(s, 'neg', 'negate', 'hand', 'p2');
  addMana(s, 'p1', 20, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addMana(s, 'p2', 4, { colors: ['U'] });
  return s;
}
function castBestow(s) {
  act(s, view(s).legalCommands.find(c => c.objectId === 'dryad' && c.bestow && c.targets?.[0] === 'host'));
  drain(s);
  const d = find(s, 'dryad', 'battlefield');
  assert.equal(d.kind, 'aura');
  return d;
}
function bounceDryad(s) {
  const d = castBestow(s);
  act(s, view(s).legalCommands.find(c => c.objectId === 'scorn' && c.targets?.length === 1 && c.targets[0] === d.id));
  drain(s);
  const hand = find(s, 'dryad', 'hand');
  assert.ok(hand, 'Dryada wraca do ręki');
  return hand;
}
function negateOffers(s) {
  return playerView(s, 'p2').legalCommands.filter(c => c.type === 'cast_spell' && c.objectId === 'neg');
}

test('B1: zwykły ponowny rzut odbitej Dryady nie jest celem Negate i nie rozstrzyga się jako aura', () => {
  const s = scene();
  const hand = bounceDryad(s);
  // Nowy obiekt w ręce nie niesie deskryptora czaru aury z poprzedniego rzutu.
  assert.notEqual(hand.spell?.aura, true, 'stary deskryptor aury nie może przetrwać zmiany strefy');
  act(s, view(s).legalCommands.find(c => c.objectId === hand.id && !c.bestow));
  const stack = find(s, 'dryad', 'stack');
  assert.equal(stack.kind, 'creature');
  assert.notEqual(stack.spell?.aura, true);
  act(s, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(!negateOffers(s).some(c => c.targets?.includes(stack.id)), 'Negate nie oferuje czaru stwora');
  const before = stateFingerprint(s);
  const rejected = execute(s, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stack.id] });
  assert.equal(rejected.ok, false);
  assert.equal(stateFingerprint(s), before, 'odrzucona kontra jest atomowa');
  drain(s);
  const permanent = find(s, 'dryad', 'battlefield');
  assert.equal(permanent.kind, 'creature');
  assert.equal(permanent.attachedTo, null);
  const etb = s.events.filter(e => e.type === 'permanent_entered_battlefield' && e.cardId === 'leafcrown-dryad').at(-1);
  assert.notEqual(etb?.aura, true, 'wejście zwykłego stwora nie jest zdarzeniem aury');
});

test('B1: ponowny rzut odbitej Dryady za bestow nadal jest Aurą i Negate go kontruje', () => {
  const s = scene();
  const hand = bounceDryad(s);
  act(s, view(s).legalCommands.find(c => c.objectId === hand.id && c.bestow && c.targets?.[0] === 'host'));
  const stack = find(s, 'dryad', 'stack');
  assert.equal(stack.kind, 'aura');
  assert.equal(stack.spell?.aura, true);
  act(s, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(negateOffers(s).some(c => c.targets?.includes(stack.id)));
  act(s, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stack.id] });
  drain(s);
  assert.ok(find(s, 'dryad', 'graveyard'));
  assert.equal(find(s, 'host', 'battlefield').attachments?.length ?? 0, 0);
});

test('B1 kontrola: pierwszy zwykły rzut Dryady pozostaje czarem stwora', () => {
  const s = scene();
  act(s, view(s).legalCommands.find(c => c.objectId === 'dryad' && !c.bestow));
  const stack = find(s, 'dryad', 'stack');
  assert.equal(stack.kind, 'creature');
  act(s, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(!negateOffers(s).some(c => c.targets?.includes(stack.id)));
  drain(s);
  assert.equal(find(s, 'dryad', 'battlefield').kind, 'creature');
});

test('B1 kontrola: czysta aura nadal jest celem Negate', () => {
  const s = scene();
  put(s, 'hobble', 'hobble');
  act(s, view(s).legalCommands.find(c => c.objectId === 'hobble' && c.targets?.[0] === 'host'));
  const stack = find(s, 'hobble', 'stack');
  act(s, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(negateOffers(s).some(c => c.targets?.includes(stack.id)));
  act(s, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stack.id] });
  drain(s);
  assert.ok(find(s, 'hobble', 'graveyard'));
});

test('B1: predykat Negate czyta aktualne cechy, nie historyczny deskryptor aury', () => {
  assert.equal(isNoncreatureSpellOnStack({
    zone: 'stack', kind: 'creature', types: ['Enchantment', 'Creature'], spell: { aura: true },
  }), false, 'czar stwora nie staje się nie-stworowy przez stary spell.aura');
  assert.equal(isNoncreatureSpellOnStack({
    zone: 'stack', kind: 'aura', types: ['Enchantment'], subtypes: ['Aura'], spell: { aura: true },
  }), true, 'bestow na stosie jest Aurą');
});
