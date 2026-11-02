import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
const registry = createCardRegistry();
function put(s,id,cardId,controllerId,zone) {
 const def=registry.get(cardId), data=gameObjectDataOf(def);
 addObject(s,{id,instanceId:`i-${id}`,cardId,controllerId,ownerId:controllerId,zone,...data,types:def.types,subtypes:def.subtypes,keywords:def.keywords??[]});
}
function scene() {
 const s=createGameState({seed:340,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';put(s,'jelly','man-o-war','p2','hand');addMana(s,'p2',3,{colors:['U']});return s;
}
function choose(s){return createHeuristicBot({seed:340}).chooseCommand(playerView(s,'p2'),{});}
for (const own of [false,true]) test(`Man-o'-War: bot czeka bez stwora przeciwnika (własny stwór: ${own})`,()=>{
 const s=scene();if(own)put(s,'friend','child-of-night','p2','battlefield');const v=playerView(s,'p2');assert.ok(v.legalCommands.some(c=>c.type==='cast_permanent'&&c.objectId==='jelly'),'legalny rzut człowieka nie jest zabroniony');const cmd=choose(s);assert.notEqual(cmd.objectId,'jelly',JSON.stringify(cmd));
});
test("Man-o'-War: bot rzuca, gdy istnieje legalny stwór przeciwnika",()=>{
 const s=scene();put(s,'foe','child-of-night','p1','battlefield');const cmd=choose(s);assert.equal(cmd.type,'cast_permanent');assert.equal(cmd.objectId,'jelly');assert.ok(execute(s,cmd).ok);
 for(let i=0;i<2;i++)assert.ok(execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId}).ok);
 const target=playerView(s,'p2').legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='foe');assert.ok(target);assert.ok(execute(s,target).ok);
 for(let i=0;i<2;i++)assert.ok(execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId}).ok);
 assert.ok([...s.objects.values()].some(o=>o.cardId==='child-of-night'&&o.zone==='hand'&&o.ownerId==='p1'));assert.ok([...s.objects.values()].some(o=>o.cardId==='man-o-war'&&o.zone==='battlefield'));

});
test("Man-o'-War: artefakt przeciwnika nie jest stworem",()=>{
 const s=scene();put(s,'foe','meteorite','p1','battlefield');assert.notEqual(choose(s).objectId,'jelly');
});
