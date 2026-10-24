import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { effectiveSpellManaCost } from '../src/engine/spells.js';
import { parseManaCost } from '../src/engine/mana-cost.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { addMana } from '../src/engine/resources.js';
import { paymentDescriptorOf } from '../src/table/mana-wizard.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();

function game() {
  const s = createGameState({ seed: 67, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
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
    keywords: def.keywords ?? [], spell: def.spell ?? null, ...patch,
  });
  return state.objects.get(id);
}

test('U/C: paymentDescriptorOf dla Consume Spirit xValue=1 z opts.xBlack dodaje pip {B} za X', () => {
  const s = game();
  put(s, 'cs', 'consume-spirit', 'hand');
  addMana(s, 'p1', 1, { colors: ['B'] });
  addMana(s, 'p1', 2, { colors: ['R', 'R'] });
  const view = playerView(s, 'p1');
  const cmd = { type: 'cast_spell', playerId: 'p1', objectId: 'cs', xValue: 1, targets: [] };
  const desc = paymentDescriptorOf(cmd, view, { xBlack: true });
  const coveredBlack = (desc?.requirements ?? []).filter((r) => Array.isArray(r) && r[0] === 'B').length;
  assert.equal(coveredBlack, 2);
  assert.equal(desc?.totalNeeded, 3);
});

test('F-5/1 (CR 107.3 + L48): paymentDescriptorOf czyta spell.xCost.black wprost z PlayerView ręki bez opts.xBlack', () => {
  const s = game();
  put(s, 'cs', 'consume-spirit', 'hand');
  const view = playerView(s, 'p1');
  const cmd = { type: 'cast_spell', playerId: 'p1', objectId: 'cs', xValue: 2, targets: [] };
  const desc = paymentDescriptorOf(cmd, view);
  const blackReqs = (desc?.requirements ?? []).filter((r) => Array.isArray(r) && r[0] === 'B').length;
  assert.equal(blackReqs, 3, 'Consume Spirit {X}{1}{B} dla X=2 wymaga 3 pipów {B} z samego PlayerView');
  assert.equal(desc?.totalNeeded, 4);
  assert.equal(desc?.effectiveGeneric, 1);
});

test('F-5/2 (CR 601.2f + L48): paymentDescriptorOf uwzględnia obniżkę części generycznej (effectiveGeneric) dla czarów z {X}', () => {
  const s = game();
  const cs = put(s, 'cs', 'consume-spirit', 'hand');
  put(s, 'reducer', 'coralhelm-guide', 'battlefield', {
    abilities: [{ type: 'static', costModifier: { spellTypes: ['Sorcery'], amount: 1 } }],
  });
  const parsed = parseManaCost(MANA_COSTS[cs.cardId]);
  const nonGeneric = parsed.colored.length + parsed.hybrid.length + parsed.phyrexian.length;
  const effectiveGeneric = Math.max(0, effectiveSpellManaCost(s, cs) - nonGeneric);
  assert.equal(effectiveGeneric, 0, 'modyfikator statyczny redukuje generyczne {1} w {X}{1}{B} do 0');

  const view = playerView(s, 'p1');
  const cmd = { type: 'cast_spell', playerId: 'p1', objectId: 'cs', xValue: 1, targets: [] };
  const desc = paymentDescriptorOf(cmd, view, { effectiveGeneric });
  assert.equal(desc?.effectiveGeneric, 0, 'część generyczna po obniżce wynosi 0');
  assert.equal(desc?.totalNeeded, 2, 'całkowity koszt {X}{1}{B} przy X=1 i obniżce {1} wynosi 2 ({B}{B}), nie 3');
  assert.deepEqual(desc?.requirements, [['B'], ['B']]);
});
