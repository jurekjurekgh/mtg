// Bestow: na polu bitwy typ Aury, a nie typ stwora z wydrukowanej karty.
// CR 702.103b/f i 205.1a: https://ancestral.vision/additional-rules/keyword-abilities.html
// https://ancestral.vision/parts-of-a-card/type-line.html
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

const registry = createCardRegistry();
function card(s, id, cardId, zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, cardId);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
    ...gameObjectDataOf(def), types: def.types ?? [], colors: def.colors ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], abilities: def.abilities ?? [] });
}
function run(s, cmd) {
  const r = execute(s, cmd);
  assert.ok(r.ok, `${cmd.type}: ${r.events?.[0]?.reason}`);
}
function drain(s) {
  for (let i = 0; i < 30 && s.zones.stack.length; i++) run(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  assert.equal(s.zones.stack.length, 0);
}
function scene() {
  const s = createGameState({ seed: 177, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  card(s, 'host', 'highland-game', 'battlefield');
  card(s, 'dryad', 'leafcrown-dryad');
  addMana(s, 'p1', 4, ['G']);
  run(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  drain(s);
  return s;
}
const find = (s, id, zone = 'battlefield') => [...s.objects.values()].find(o => o.cardId === id && o.zone === zone);

test('Bestowed Dryad jest aurą, bez typu i podtypów stwora', () => {
  const s = scene();
  const aura = find(s, 'leafcrown-dryad');
  assert.equal(aura.kind, 'aura');
  assert.deepEqual(aura.types, ['Enchantment']);
  assert.deepEqual(aura.subtypes, ['Aura']);
  const visible = playerView(s, 'p2').zones.battlefield.find(o => o.id === aura.id);
  assert.deepEqual(visible.types, ['Enchantment']);
  assert.deepEqual(visible.subtypes, ['Aura']);
});

test('Austere Command niszczy stwora, lecz nie bestow Aurę; ta wraca do formy stwora', () => {
  const s = scene();
  card(s, 'command', 'austere-command');
  addMana(s, 'p1', 6, ['W']);
  const cmd = playerView(s, 'p1').legalCommands.find(c => c.type === 'cast_spell' && c.objectId === 'command' && c.modeIndex === 1);
  assert.ok(cmd, 'tryby artefaktów i stworów MV ≤3');
  run(s, cmd); drain(s);
  assert.ok(find(s, 'highland-game', 'graveyard'), 'gospodarz zniszczony');
  const dryad = find(s, 'leafcrown-dryad');
  assert.ok(dryad, 'aura nie była stworem w momencie zniszczenia');
  assert.equal(dryad.kind, 'creature');
  assert.deepEqual(dryad.types, ['Enchantment', 'Creature']);
  assert.deepEqual(dryad.subtypes, ['Nymph', 'Dryad']);
});

test('Zniszczenie aury jako zaklęcia przywraca kartę stwora w grobie', () => {
  const s = scene();
  const aura = find(s, 'leafcrown-dryad');
  card(s, 'keep', 'keep-out');
  addMana(s, 'p1', 2, ['W']);
  const cmd = playerView(s, 'p1').legalCommands.find(c => c.objectId === 'keep' && c.modeIndex === 1 && c.targets?.[0] === aura.id);
  assert.ok(cmd);
  run(s, cmd); drain(s);
  const dryad = find(s, 'leafcrown-dryad', 'graveyard');
  assert.ok(dryad);
  assert.equal(dryad.kind, 'creature');
  assert.deepEqual(dryad.types, ['Enchantment', 'Creature']);
  assert.deepEqual(dryad.subtypes, ['Nymph', 'Dryad']);
});


test('Odbita aura wraca do ręki jako karta stwora i daje się ponownie rzucić', () => {
  const s = scene();
  const aura = find(s, 'leafcrown-dryad');
  const returned = moveObjectDirectly(s, aura.id, 'hand', 'dryad-returned');
  assert.equal(returned.kind, 'creature');
  assert.deepEqual(returned.types, ['Enchantment', 'Creature']);
  assert.deepEqual(returned.subtypes, ['Nymph', 'Dryad']);
  assert.deepEqual(returned.formerTypes, ['Enchantment'], 'LKI z chwili opuszczenia pola');
  assert.equal(returned.bestowOriginalTypes, null);
  addMana(s, 'p1', 2, ['G']);
  run(s, { type: 'cast_permanent', playerId: 'p1', objectId: returned.id });
  drain(s);
  assert.equal(find(s, 'leafcrown-dryad').kind, 'creature');
});

test('Zapis oryginalnej linii typów jest częścią fingerprintu', () => {
  const s = scene();
  const aura = find(s, 'leafcrown-dryad');
  const before = stateFingerprint(s);
  s.objects.set(aura.id, Object.freeze({ ...aura, bestowOriginalSubtypes: ['Wizard'] }));
  assert.notEqual(stateFingerprint(s), before, 'różne efekty odłączenia to różne stany');
});
