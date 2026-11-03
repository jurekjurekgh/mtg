// CR 702.103b: "As a spell cast bestowed is put onto the stack, it becomes an
// Aura enchantment and gains enchant creature." CR 702.103e: "As a bestowed
// Aura spell begins resolving, if its target is illegal, it ceases to be
// bestowed and the effect making it an Aura spell ends. It continues resolving
// as a creature spell." https://mtg.fandom.com/wiki/Bestow
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const registry = createCardRegistry();
function put(s, id, cardId, playerId, zone) {
  const def = registry.get(cardId);
  assert.ok(def, cardId);
  addObject(s, { id, instanceId: `i-${id}`, cardId, zone, controllerId: playerId, ownerId: playerId,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [] });
}
function scene({ bestow = true, syntheticArtifact = false } = {}) {
  const s = createGameState({ seed: 17721, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'host', 'highland-game', 'p1', 'battlefield');
  put(s, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  if (syntheticArtifact) {
    const o = s.objects.get('dryad');
    s.objects.set('dryad', Object.freeze({ ...o,
      types: ['Legendary', 'Artifact', 'Enchantment', 'Creature'],
      subtypes: ['Equipment', 'Saga', 'Dryad'] }));
  }
  addMana(s, 'p1', 6, { colors: ['G'] });
  const c = playerView(s, 'p1').legalCommands.find(c => c.objectId === 'dryad' && c.type === 'cast_permanent'
    && (bestow ? c.bestow === true && c.targets?.[0] === 'host' : !c.bestow));
  assert.ok(c, 'oferta prawdziwej Dryady');
  assert.ok(execute(s, c).ok);
  const id = s.zones.stack.find(i => s.objects.get(i).cardId === 'leafcrown-dryad');
  assert.ok(id);
  return { s, id };
}
function drain(s) {
  for (let i = 0; i < 16 && s.zones.stack.length; i++) {
    const cmd = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(cmd); assert.ok(execute(s, cmd).ok);
  }
  assert.equal(s.zones.stack.length, 0);
}
function dryad(s, zone) { return [...s.objects.values()].find(o => o.cardId === 'leafcrown-dryad' && o.zone === zone); }

test('A21: Dryada rzucona za bestow jest już na stosie aurą, nie stworem', () => {
  const { s, id } = scene();
  const o = s.objects.get(id);
  assert.equal(o.kind, 'aura');
  assert.deepEqual(o.types, ['Enchantment']);
  assert.deepEqual(o.subtypes, ['Aura']);
  assert.equal(o.spell.aura, true);
  assert.equal(playerView(s, 'p2').zones.stack.find(o => o.id === id).kind, 'aura');
  const event = s.events.find(e => e.type === 'aura_spell_cast' && e.object?.id === id);
  assert.equal(event.object.kind, 'aura');
});

test('A21: zwyczajnie rzucona Dryada pozostaje czarem-stworem', () => {
  const { s, id } = scene({ bestow: false });
  assert.equal(s.objects.get(id).kind, 'creature');
  assert.deepEqual(s.objects.get(id).types, ['Enchantment', 'Creature']);
});

test('A21: legalny cel — aura zachowuje oryginalną linię po odłączeniu', () => {
  const { s } = scene(); drain(s);
  const aura = dryad(s, 'battlefield');
  assert.equal(aura.kind, 'aura');
  assert.deepEqual(aura.types, ['Enchantment']);
  assert.deepEqual(aura.subtypes, ['Aura']);
  moveObjectDirectly(s, 'host', 'graveyard', 'dead-host');
  const creature = s.objects.get(aura.id);
  assert.equal(creature.kind, 'creature');
  assert.deepEqual(creature.types, ['Enchantment', 'Creature']);
  assert.deepEqual(creature.subtypes, ['Nymph', 'Dryad']);
});

test('A21: nielegalny cel przy rozstrzygnięciu — Dryada wchodzi jako stwór', () => {
  const { s } = scene();
  moveObjectDirectly(s, 'host', 'graveyard', 'dead-host');
  drain(s);
  const creature = dryad(s, 'battlefield');
  assert.ok(creature);
  assert.equal(creature.kind, 'creature');
  assert.deepEqual(creature.types, ['Enchantment', 'Creature']);
  assert.deepEqual(creature.subtypes, ['Nymph', 'Dryad']);
});

test('A21: skontrowana aura jest w grobie kartą-stworem', () => {
  const { s, id } = scene();
  put(s, 'neg', 'negate', 'p2', 'hand');
  addMana(s, 'p2', 2, { colors: ['U'] });
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok);
  const cmd = playerView(s, 'p2').legalCommands.find(c => c.objectId === 'neg' && c.targets?.[0] === id);
  assert.ok(cmd, 'Negate oferuje legalny cel');
  assert.ok(execute(s, cmd).ok); drain(s);
  const creature = dryad(s, 'graveyard');
  assert.ok(creature);
  assert.equal(creature.kind, 'creature');
  assert.deepEqual(creature.types, ['Enchantment', 'Creature']);
  assert.deepEqual(creature.subtypes, ['Nymph', 'Dryad']);
});

// Syntetyczna kombinacja typów, bez dodawania karty do katalogu. Fizyczny
// nośnik kosztu jest Dryadą, ale test celowo nadaje jej w fixture dodatkowe
// typy/podtypy, aby sprawdzić ogólny kontrakt 205.1a/205.3h.
test('A21: syntetyczny artefakt-bestow na stosie traci Artifact, zachowuje nadtyp', () => {
  const { s, id } = scene({ syntheticArtifact: true });
  const aura = s.objects.get(id);
  assert.deepEqual(aura.types, ['Legendary', 'Enchantment']);
  assert.deepEqual(aura.subtypes, ['Saga', 'Aura']);
  put(s, 'sabotage', 'steel-sabotage', 'p2', 'hand');
  addMana(s, 'p2', 2, { colors: ['U'] });
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok);
  const offer = playerView(s, 'p2').legalCommands.find(c => c.objectId === 'sabotage' && c.targets?.[0] === id);
  assert.equal(offer, undefined, 'Aura nie jest celem counter target artifact spell');
  const result = execute(s, { type: 'cast_spell', playerId: 'p2', objectId: 'sabotage', modeIndex: 0, targets: [id] });
  assert.equal(result.ok, false, 'walidacja zgadza się z ofertą');
  drain(s);
  const permanent = dryad(s, 'battlefield');
  assert.deepEqual(permanent.types, ['Legendary', 'Enchantment']);
  moveObjectDirectly(s, 'host', 'graveyard', 'dead-host');
  assert.deepEqual(s.objects.get(permanent.id).types, ['Legendary', 'Artifact', 'Enchantment', 'Creature']);
  assert.deepEqual(s.objects.get(permanent.id).subtypes, ['Equipment', 'Saga', 'Dryad']);
});

test('A21: nietrafiony bestow przy zmianie strefy wraca do oryginalnej linii', () => {
  const { s, id } = scene({ syntheticArtifact: true });
  const exiled = moveObjectDirectly(s, id, 'exile', 'exiled-dryad');
  assert.equal(exiled.kind, 'creature');
  assert.deepEqual(exiled.types, ['Legendary', 'Artifact', 'Enchantment', 'Creature']);
  assert.deepEqual(exiled.subtypes, ['Equipment', 'Saga', 'Dryad']);
  assert.equal(exiled.bestowOriginalTypes, null);
});
