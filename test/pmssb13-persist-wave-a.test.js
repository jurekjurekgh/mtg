import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
function setup(grave) {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 14);
  for (let i = 0; i < 30; i++) addObject(s, { id: 'lb' + i, instanceId: 'i-lb' + i, cardId: 'x', controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  if (grave) addObject(s, { id: 'g1', instanceId: 'i-g1', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'graveyard', kind: 'creature', power: 3, toughness: 3, manaCost: 4, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'corpse' });
  return s;
}
function castScore(cardId, grave) {
  const s = setup(grave);
  const d = REG.get(cardId);
  addObject(s, { id: 'c1', instanceId: 'i-c1', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  return b.trace().at(-1).options.filter((o) => o.cmd.startsWith('cast_permanent(c1')).map((o) => o.score.toFixed(2));
}

// PMSSB-13 Wave-A (F-R1): persist = 0.5 x return-body (nie flat-5)!
test('PMSSB13-A: clique persist-model 70.20/75.60 (bylo 71.10/76.50: -0.9!)', () => {
  assert.deepEqual(castScore('puppeteer-clique', false), ['70.20']);
  assert.deepEqual(castScore('puppeteer-clique', true), ['75.60']);
});
test('PMSSB13-A: SAME-guards (cultist/forebear, delirium/grave-SKIP)', () => {
  assert.deepEqual(castScore('resurrected-cultist', false), ['67.50']);
  assert.deepEqual(castScore('furious-forebear', false), ['66.60']);
});
