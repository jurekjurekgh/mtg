import { createGameState, addObject, execute } from './src/engine/game-state.js';
import { jumpToStep } from './src/engine/turn.js';
import { createCardRegistry } from './src/cards/card-data.js';
import { gameObjectDataOf } from './src/cards/materialize.js';
const REG = createCardRegistry();
const state = createGameState({ seed: 38, players: [{ id: 'p1' }, { id: 'p2' }] });
state.turn = jumpToStep(state.turn, 'main', 'p1');
state.turn.activePlayerId='p1';state.turn.priorityPlayerId='p1';state.turn.number=6;
function put(state,id,cid,ctrl,zone='battlefield',over={}){
  const def=REG.get(cid);const data=gameObjectDataOf(def);
  addObject(state,{id,instanceId:`i-${id}`,cardId:cid,controllerId:ctrl,ownerId:ctrl,zone,kind:over.kind??data.kind,power:over.power??data.power,toughness:over.toughness??data.toughness,manaCost:over.manaCost??data.manaCost,spell:data.spell,abilities:data.abilities??[],keywords:over.keywords??def.keywords??[],subtypes:over.subtypes??def.subtypes??[],types:over.types??def.types??[],colors:data.colors??[],cardName:def.name});
}
put(state,'src','fear-of-burning-alive','p1');
put(state,'victim','highland-game','p2','battlefield',{power:1,toughness:1});
state.pendingDeliriumTargets.push({playerId:'p1',sourceId:'src',amount:4,opponentId:'p2',candidateIds:['victim'],restorePriorityTo:'p1'});
const r = execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
console.log('result:', JSON.stringify(r));
