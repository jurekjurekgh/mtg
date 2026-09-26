// PMSSB-13 krok-2: sonda persist-unification (PRE) — clique (flat-5? +
// reanimate-ETB?) + cultist (cast + grave-ability?) + forebear-revisit.
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
function probe(cardId, cmdPrefix, grave) {
  const s = setup(grave);
  const d = REG.get(cardId);
  addObject(s, { id: 'c1', instanceId: 'i-c1', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.startsWith(cmdPrefix + '(c1'));
  console.log(cardId, grave ? '+grave' : 'bare', opts.length ? opts.map((o) => o.score.toFixed(2)).join('/') : 'no-offer');
}
console.log('--- PMSSB-13 sonda PRE ---');
probe('puppeteer-clique', 'cast_permanent', false);
probe('puppeteer-clique', 'cast_permanent', true);
probe('resurrected-cultist', 'cast_permanent', false);
probe('furious-forebear', 'cast_permanent', false);
// Cultist grave-ability: cultist w grobie + delirium? (4-typy!) — trudny harness; ability-probe:
{
  const s = setup(false);
  const d = REG.get('resurrected-cultist');
  addObject(s, { id: 'cu', instanceId: 'i-cu', cardId: 'resurrected-cultist', controllerId: 'p1', ownerId: 'p1', zone: 'graveyard', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.includes('cu'));
  console.log('cultist-grave-ability', opts.length ? opts.map((o) => o.cmd.slice(0, 50) + '=' + o.score.toFixed(2)).join('/') : 'no-offer');
}
