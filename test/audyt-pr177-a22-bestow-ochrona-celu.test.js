// CR 702.103b: "As a spell cast bestowed is put onto the stack, it becomes an
// Aura enchantment and gains enchant creature." CR 702.16b: "A permanent or
// player with protection can't be targeted by spells with the stated quality".
// https://mtg.fandom.com/wiki/Bestow ; https://mtg.fandom.com/wiki/Protection
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const registry = createCardRegistry();
function put(s, id, cardId, zone = 'battlefield') {
  const def = registry.get(cardId);
  assert.ok(def);
  addObject(s, { id, instanceId: `i-${id}`, cardId, zone, controllerId: 'p1', ownerId: 'p1',
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [] });
}
function scene() {
  const s = createGameState({ seed: 17722, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'host', 'highland-game'); put(s, 'dryad', 'leafcrown-dryad', 'hand');
  addMana(s, 'p1', 6, { colors: ['G'] });
  return s;
}
function drain(s) {
  for (let i = 0; i < 16 && s.zones.stack.length; i++) {
    const cmd = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(cmd); assert.ok(execute(s, cmd).ok);
  }
  assert.equal(s.zones.stack.length, 0);
}
function offer(s) {
  return playerView(s, 'p1').legalCommands.find(c => c.objectId === 'dryad' && c.type === 'cast_permanent'
    && c.bestow === true && c.targets?.[0] === 'host');
}
function castAndCheckAura(s) {
  const c = offer(s);
  assert.ok(c, 'rzeczywista oferta bestow na chronionego gospodarza');
  assert.ok(execute(s, c).ok, 'walidacja zgadza się z ofertą');
  drain(s);
  const dryad = [...s.objects.values()].find(o => o.cardId === 'leafcrown-dryad' && o.zone === 'battlefield');
  assert.equal(dryad?.kind, 'aura');
  assert.equal(dryad.attachedTo, 'host');
}

test('A22: Spare from Evil nie chroni przed Dryadą rzucaną jako Aurę', () => {
  const s = scene();
  put(s, 'spare', 'spare-from-evil', 'hand'); addMana(s, 'p1', 2, { colors: ['W'] });
  const spare = playerView(s, 'p1').legalCommands.find(c => c.objectId === 'spare' && c.type === 'cast_spell');
  assert.ok(spare); assert.ok(execute(s, spare).ok); drain(s);
  assert.ok(s.untilEndOfTurnProtections.some(p => p.objectIds.includes('host') && p.quality?.notSubtype === 'Human'));
  castAndCheckAura(s);
});

test('A22: ochrona przed Aurami blokuje wybór i wykonanie rzutu bestow', () => {
  const s = scene();
  s.untilEndOfTurnProtections = [{ objectIds: ['host'], quality: { subtype: 'Aura' } }];
  assert.equal(offer(s), undefined);
  const result = execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  assert.equal(result.ok, false);
  assert.equal(s.objects.get('dryad').zone, 'hand');
});

test('A22: ochrona przed zielenią dalej blokuje zielony bestow', () => {
  const s = scene();
  s.objects.set('host', Object.freeze({ ...s.objects.get('host'), protectionFromColors: ['G'] }));
  assert.equal(offer(s), undefined);
  assert.equal(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] }).ok, false);
});

test('A22: ochrona przed innym kolorem nie blokuje bestow', () => {
  const s = scene();
  s.objects.set('host', Object.freeze({ ...s.objects.get('host'), protectionFromColors: ['R'] }));
  castAndCheckAura(s);
});

test('A22: ochrona przed non-Human creatures uzyskana po rzuceniu nie odłącza Aury', () => {
  const s = scene();
  const c = offer(s); assert.ok(c); assert.ok(execute(s, c).ok);
  s.untilEndOfTurnProtections = [{ objectIds: ['host'], quality: { kind: 'creature', notSubtype: 'Human' } }];
  drain(s);
  const aura = [...s.objects.values()].find(o => o.cardId === 'leafcrown-dryad' && o.zone === 'battlefield');
  assert.equal(aura?.kind, 'aura'); assert.equal(aura.attachedTo, 'host');
});

test('A22: ochrona przed Aurami zdobyta po rzuceniu kończy bestow przed rozstrzygnięciem', () => {
  const s = scene();
  const c = offer(s); assert.ok(c); assert.ok(execute(s, c).ok);
  s.untilEndOfTurnProtections = [{ objectIds: ['host'], quality: { subtype: 'Aura' } }];
  drain(s);
  const creature = [...s.objects.values()].find(o => o.cardId === 'leafcrown-dryad' && o.zone === 'battlefield');
  assert.equal(creature?.kind, 'creature');
  assert.deepEqual(creature.types, ['Enchantment', 'Creature']);
});
