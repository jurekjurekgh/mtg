// PMSSB-12 krok-2: sonda pay-trigger-net (PRE) — spellbomby (dies-pay-draw),
// descendant (attacks-pay-endure), spire (land-pay-or-sac), forebear (grave!).
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
function setup() {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 14);
  for (let i = 0; i < 30; i++) addObject(s, { id: 'lb' + i, instanceId: 'i-lb' + i, cardId: 'x', controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  // R/W-lands (kolory-płatności!) + foe (cel-cant_block!).
  addObject(s, { id: 'm1', instanceId: 'i-m1', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land', power: 0, toughness: 0, manaCost: 0, abilities: [], keywords: [], subtypes: ['Mountain'], types: ['Land'], colors: ['R'], cardName: 'mtn' });
  addObject(s, { id: 'p1l', instanceId: 'i-p1l', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land', power: 0, toughness: 0, manaCost: 0, abilities: [], keywords: [], subtypes: ['Plains'], types: ['Land'], colors: ['W'], cardName: 'pln' });
  addObject(s, { id: 'f1', instanceId: 'i-f1', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'foe' });
  return s;
}
function probe(cardId, cmdPrefix) {
  const s = setup();
  const d = REG.get(cardId);
  addObject(s, { id: 'c1', instanceId: 'i-c1', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.startsWith(cmdPrefix + '(c1'));
  console.log(cardId, opts.length ? opts.map((o) => o.score.toFixed(2)).join('/') : 'no-offer');
}
console.log('--- PMSSB-12 sonda PRE (R/W-lands + foe) ---');
probe('panic-spellbomb', 'cast_permanent');
probe('horizon-spellbomb', 'cast_permanent');
probe('descendant-of-storms', 'cast_permanent');
probe('rupture-spire', 'play_land');
probe('furious-forebear', 'cast_permanent');
