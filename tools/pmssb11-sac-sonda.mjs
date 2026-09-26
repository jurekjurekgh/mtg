// PMSSB-11 krok-2: sonda sac-economics (PRE) — ETB-may-sac (exploit/devour/
// rampager) + activated-sac (dreadmaw) + additional-cost-spells (rites/slip/
// strands — resolution-covered?).
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
  // Ofiara-sac na stole (1/1 token!) + cel-foe (2/2!).
  addObject(s, { id: 'v1', instanceId: 'i-v1', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 0, token: true, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'victim' });
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
console.log('--- PMSSB-11 sonda PRE (victim-1/1 + foe-2/2 na stole) ---');
probe('silumgar-butcher', 'cast_permanent');
probe('gurmag-drowner', 'cast_permanent');
probe('gorger-wurm', 'cast_permanent');
probe('rust-shield-rampager', 'cast_permanent');
probe('kheru-dreadmaw', 'cast_permanent');
probe('village-rites', 'cast_spell');
probe('bone-splinters', 'cast_spell');
probe('severed-strands', 'cast_spell');
