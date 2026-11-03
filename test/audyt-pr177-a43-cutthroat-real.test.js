// Fathom Fleet Cutthroat Oracle: destroy a creature an opponent controls that
// was dealt damage this turn. No synthetic damage flags or modified P/T.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
 if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
function scene(){
 const s=createGameState({seed:17743,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'cut','fathom-fleet-cutthroat','hand');put(s,'victim','scorpion-sentinel','battlefield','p2');
 for(let i=0;i<4;i++)put(s,`swamp${i}`,'basic-swamp','battlefield');return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){const v=view(s),c=v.legalCommands.find(c=>c.type==='pass_priority');assert.ok(c,JSON.stringify({step:s.turn.step,options:v.legalCommands}));act(s,c);}
function bot(s){return createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function until(s,p){for(let i=0;i<30&&!p();i++){
 const v=view(s),cmd=v.legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='victim')??v.legalCommands.find(c=>c.type==='resolve_combat')??v.legalCommands.find(c=>c.type==='pass_priority');
 assert.ok(cmd,JSON.stringify({step:s.turn.step,options:v.legalCommands}));act(s,cmd);
 }assert.ok(p(),'oczekiwany stan');}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function castCutAndResolve(s){const cmd=bot(s);assert.equal(cmd.type,'cast_permanent',JSON.stringify(cmd));assert.equal(cmd.objectId,'cut');act(s,cmd);until(s,()=>card(s,'victim').zone==='graveyard');assert.equal(card(s,'cut').zone,'battlefield');}

test('A43: bot czeka przed walką, potem niszczy stwora obrażonego w prawdziwym combacie',()=>{
 const s=scene();put(s,'attacker','highland-game','battlefield');assert.equal(bot(s).type,'pass_priority');
 until(s,()=>s.turn.step==='declare_attackers');act(s,{type:'declare_attackers',playerId:'p1',attackerIds:['attacker']});
 until(s,()=>s.turn.step==='declare_blockers');act(s,{type:'declare_blockers',playerId:'p2',assignments:{attacker:['victim']}});
 until(s,()=>s.turn.step==='main2');assert.equal(card(s,'victim').damage,2);assert.equal(card(s,'victim').zone,'battlefield');assert.equal(card(s,'attacker').zone,'graveyard');castCutAndResolve(s);
});
test('A43: prawdziwy Shock umożliwia Cutthroata już w main1',()=>{
 const s=scene();put(s,'shock','shock','hand');addMana(s,'p1',1,{colors:['R']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));until(s,()=>!s.zones.stack.length);
 assert.equal(card(s,'victim').damage,2);castCutAndResolve(s);
});
test('A43: prawdziwy Magic Damper ukrywa obrażonego wroga przed czarnym ETB',()=>{
 const s=scene();put(s,'shock','shock','hand');put(s,'damper','magic-damper','hand','p2');addMana(s,'p1',1,{colors:['R']});addMana(s,'p2',2,{colors:['U']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));until(s,()=>!s.zones.stack.length);
 assert.equal(card(s,'victim').damage,2);pass(s);act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='damper'&&c.targets?.includes('victim')));until(s,()=>!s.zones.stack.length);
 assert.equal(s.turn.priorityPlayerId,'p1');assert.equal(bot(s).type,'pass_priority');assert.equal(card(s,'victim').zone,'battlefield');
});
test('A43: obrażony Shockiem własny stwór nie jest celem ETB',()=>{
 const s=scene();put(s,'own','scorpion-sentinel','battlefield');put(s,'shock','shock','hand');addMana(s,'p1',1,{colors:['R']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('own')));until(s,()=>!s.zones.stack.length);
 assert.equal(card(s,'own').damage,2);assert.equal(card(s,'victim').damage,0);assert.equal(bot(s).type,'pass_priority');
});
