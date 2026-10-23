import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { animatePermanentUntilEndOfTurn } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();

function makeState() {
  const s = createGameState({ seed: 78, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  return s;
}

function put(state, id, cardId, zone, patch = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords ?? [], ...patch,
  });
  return state.objects.get(id);
}

test('F-4/1 (CR 702.33a + CR 400.3 + CR 108.3): deduplikacja kickerLandId nie skleja własnego lądu z przejętym cudzym lądem tej samej nazwy', () => {
  const s = makeState();
  put(s, 'f-stolen', 'basic-forest', 'battlefield', { controllerId: 'p1', ownerId: 'p2' });
  put(s, 'f-own', 'basic-forest', 'battlefield', { controllerId: 'p1', ownerId: 'p1' });
  put(s, 'my-c', 'coralhelm-guide', 'battlefield', { controllerId: 'p1', ownerId: 'p1' });
  put(s, 'opp-c', 'coralhelm-guide', 'battlefield', { controllerId: 'p2', ownerId: 'p2' });
  put(s, 'kick', 'chocobo-kick', 'hand', { controllerId: 'p1', ownerId: 'p1' });
  addMana(s, 'p1', 4, { colors: ['G', 'G', 'G', 'G'] });

  const kicked = playerView(s, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'kick' && c.kicked);
  const landIds = kicked.map((c) => c.kickerLandId);
  assert.ok(landIds.includes('f-own'), `własny Forest musi być oferowany obok przejętego: ${JSON.stringify(landIds)}`);
  assert.ok(landIds.includes('f-stolen'), `przejęty Forest również pozostaje osobną opcją: ${JSON.stringify(landIds)}`);

  const execOwn = execute(s, {
    type: 'cast_spell', playerId: 'p1', objectId: 'kick',
    targets: ['my-c', 'opp-c'], kicked: true, kickerLandId: 'f-own',
  });
  assert.equal(execOwn.ok, true);
  assert.equal(s.zones.hand.some((id) => s.objects.get(id)?.ownerId === 'p1' && s.objects.get(id)?.cardId === 'basic-forest'), true,
    'zwrot własnego lądu oddaje kartę do ręki p1');
});

test('F-4/2 (CR 702.33a): deduplikacja kickerLandId nie skleja zaczarowanego lądu ze zwykłym lądem tej samej nazwy', () => {
  const s = makeState();
  put(s, 'f-plain', 'basic-forest', 'battlefield', { controllerId: 'p1', ownerId: 'p1' });
  put(s, 'f-cursed', 'basic-forest', 'battlefield', { controllerId: 'p1', ownerId: 'p1' });
  put(s, 'aura', 'chronic-flooding', 'battlefield', { controllerId: 'p2', ownerId: 'p2' });
  attachAuraToCreature(s, 'aura', 'f-cursed');
  put(s, 'my-c', 'coralhelm-guide', 'battlefield', { controllerId: 'p1', ownerId: 'p1' });
  put(s, 'opp-c', 'coralhelm-guide', 'battlefield', { controllerId: 'p2', ownerId: 'p2' });
  put(s, 'kick', 'chocobo-kick', 'hand', { controllerId: 'p1', ownerId: 'p1' });
  addMana(s, 'p1', 4, { colors: ['G', 'G', 'G', 'G'] });

  const landIds = playerView(s, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'kick' && c.kicked)
    .map((c) => c.kickerLandId);
  assert.ok(landIds.includes('f-plain') && landIds.includes('f-cursed'),
    `zarówno czysty, jak i zaczarowany Forest muszą być oferowane: ${JSON.stringify(landIds)}`);
});

test('F-4/3 (CR 305 + CR 702.33a + CR 108.3 + L48): ożywiony ląd (stworowo-lądowy) jest legalnym wyborem dla kicker.returnLand i niesie ownerId w PlayerView', () => {
  const s = makeState();
  put(s, 'f-anim', 'basic-forest', 'battlefield', { controllerId: 'p1', ownerId: 'p2' });
  animatePermanentUntilEndOfTurn(s, 'f-anim', { power: 3, toughness: 3, typesAdd: ['Creature'], subtypesAdd: ['Elemental'] });
  assert.equal(s.objects.get('f-anim').kind, 'creature', 'po animacji obiekt ma kind=creature, zachowując typ Land');

  const viewEntry = playerView(s, 'p1').zones.battlefield.find((o) => o.id === 'f-anim');
  assert.equal(viewEntry.ownerId, 'p2', 'PlayerView musi ujawniać ownerId przejętego ożywionego lądu (CR 108.3)');

  put(s, 'my-c', 'coralhelm-guide', 'battlefield', { controllerId: 'p1', ownerId: 'p1' });
  put(s, 'opp-c', 'coralhelm-guide', 'battlefield', { controllerId: 'p2', ownerId: 'p2' });
  put(s, 'kick', 'chocobo-kick', 'hand', { controllerId: 'p1', ownerId: 'p1' });
  addMana(s, 'p1', 4, { colors: ['G', 'G', 'G', 'G'] });

  const landIds = [...new Set(playerView(s, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'kick' && c.kicked)
    .map((c) => c.kickerLandId))];
  assert.deepEqual(landIds, ['f-anim'], 'ożywiony ląd musi być w ofercie kicker.returnLand');

  const res = execute(s, {
    type: 'cast_spell', playerId: 'p1', objectId: 'kick',
    targets: ['my-c', 'opp-c'], kicked: true, kickerLandId: 'f-anim',
  });
  assert.equal(res.ok, true, 'walidacja castSpell musi przyjąć ożywiony ląd dla kicker.returnLand');
});
