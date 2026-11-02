// A59: rzeczywista wycena bounce z #177 oraz ferocious Force Away.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function game({power4=false,opponentShock=false,twoTargets=false}={}){
 const s=createGameState({seed:17759,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'away','force-away','hand');put(s,'foe','nightshade-harvester','battlefield','p2');if(twoTargets)put(s,'cheap','goblin-picker','battlefield','p2');if(power4)put(s,'ferocious','ainok-artillerist','battlefield');
 for(let i=0;i<24;i++)put(s,`lib${i}`,i===0?'highland-game':'basic-forest','library');addMana(s,'p1',2,{colors:['U']});
 if(opponentShock){put(s,'shock','shock','hand','p2');addMana(s,'p2',1,{colors:['R']});}return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function until(s,p){for(let i=0;i<20&&!p();i++)pass(s);assert.ok(p(),JSON.stringify({step:s.turn.step,commands:view(s).legalCommands}));}
function bot(s,params=undefined){const b=createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg,...(params?{params}:{})});const c=b.chooseCommand(view(s));return {c,rows:b.trace().at(-1)?.options??[]};}
function obj(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function cast(s,target='foe'){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='away'&&c.targets?.includes(target)));}

test('A59: bot wybiera droższą rzeczywistą 2/2 i odbija ją do ręki właściciela',()=>{
 const s=game({twoTargets:true});const {c,rows}=bot(s);const zero=bot(s,{bounceTmcWeight:0}).rows;for(const [target,mv] of [['foe',4],['cheap',2]]){const key=`cast_spell(away->${target})`;assert.equal(rows.find(r=>r.cmd===key).score-zero.find(r=>r.cmd===key).score,6*mv);}assert.equal(c.type,'cast_spell');assert.equal(c.objectId,'away');assert.deepEqual(c.targets,['foe']);act(s,c);until(s,()=>s.zones.stack.length===0);
 assert.equal(obj(s,'foe').zone,'hand');assert.equal(obj(s,'foe').ownerId,'p2');assert.equal(obj(s,'cheap').zone,'battlefield');
});
test('A59: ferocious 4/1 — prawdziwy bounce, decyzja dobierz i odrzuć',()=>{
 const s=game({power4:true});cast(s);until(s,()=>s.pendingOptionalDraw!=null);assert.equal(obj(s,'foe').zone,'hand');
 const {c:yes,rows}=bot(s);assert.equal(yes.type,'resolve_optional_draw',JSON.stringify(rows));assert.equal(yes.draw,true);act(s,yes);
 if(s.pendingDiscardChoice)act(s,view(s).legalCommands.find(c=>c.type==='resolve_discard_choice'));
 assert.equal(s.pendingOptionalDraw,null);assert.equal(s.pendingDiscardChoice,null);assert.equal(s.zones.stack.length,0);
 assert.ok(s.events.some(e=>e.type==='card_drawn'&&e.playerId==='p1'));assert.ok(s.events.some(e=>e.type==='card_discarded'&&e.playerId==='p1'));
});
test('A59: bez stwora o mocy 4 brak decyzji o dobieraniu',()=>{
 const s=game();cast(s);until(s,()=>s.zones.stack.length===0);assert.equal(obj(s,'foe').zone,'hand');assert.equal(s.pendingOptionalDraw,null);assert.ok(!s.events.some(e=>e.type==='card_drawn'&&e.playerId==='p1'));
});
test('A59: Shock w odpowiedzi zabija jedynego stwora o mocy 4, ferocious przestaje zachodzić',()=>{
 const s=game({power4:true,opponentShock:true});cast(s);pass(s);assert.equal(s.turn.priorityPlayerId,'p2');act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('ferocious')));
 until(s,()=>s.zones.stack.length===1);assert.equal(obj(s,'ferocious').zone,'graveyard');until(s,()=>s.zones.stack.length===0);assert.equal(obj(s,'foe').zone,'hand');assert.equal(s.pendingOptionalDraw,null);
});
test('A59: odbicie własnego jedynego stwora o mocy 4 usuwa warunek przed decyzją loot',()=>{
 const s=game({power4:true});cast(s,'ferocious');until(s,()=>s.zones.stack.length===0);assert.equal(obj(s,'ferocious').zone,'hand');assert.equal(s.pendingOptionalDraw,null);
});

test('A59: Brute Force w odpowiedzi daje ferocious dopiero przed rozstrzygnięciem Force Away',()=>{
 const s=game();put(s,'small','highland-game','battlefield');put(s,'pump','brute-force','hand');addMana(s,'p1',1,{colors:['R']});cast(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='pump'&&c.targets?.includes('small')));
 until(s,()=>s.zones.stack.length===1);until(s,()=>s.pendingOptionalDraw!=null);assert.equal(obj(s,'foe').zone,'hand');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_draw'&&c.draw===false));assert.equal(s.zones.stack.length,0);assert.ok(!s.events.some(e=>e.type==='card_drawn'&&e.playerId==='p1'));
});
