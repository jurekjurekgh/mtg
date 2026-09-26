// PMSSB-14 krok-2: sonda impulse/saga (PRE) — drowner, dockhand-ability,
// saga-cast (chapters-0?).
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
  addObject(s, { id: 'v1', instanceId: 'i-v1', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'v' });
  addObject(s, { id: 'f1', instanceId: 'i-f1', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'f' });
  for (let i = 1; i <= 3; i++) addObject(s, { id: 'a' + i, instanceId: 'i-a' + i, cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact', power: 0, toughness: 0, manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: 'art' });
  return s;
}
function probeCast(cardId) {
  const s = setup();
  const d = REG.get(cardId);
  addObject(s, { id: 'c1', instanceId: 'i-c1', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.startsWith('cast_permanent(c1'));
  console.log(cardId, 'cast', opts.length ? opts.map((o) => o.score.toFixed(2)).join('/') : 'no-offer');
}
console.log('--- PMSSB-14 sonda PRE ---');
probeCast('gurmag-drowner');
probeCast('merchants-dockhand');
probeCast('rediscover-the-way');
{
  const s = setup();
  const d = REG.get('merchants-dockhand');
  addObject(s, { id: 'md', instanceId: 'i-md', cardId: 'merchants-dockhand', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.includes('activate_ability(md'));
  console.log('dockhand-ability', opts.length ? opts.map((o) => o.cmd.slice(0, 60) + '=' + o.score.toFixed(2)).join('/') : 'no-offer');
}
