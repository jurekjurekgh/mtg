// Rupture Spire Oracle: enters tapped; "When this land enters, sacrifice it
// unless you pay {1}." Mana may be produced before the triggered ability
// resolves; it is an ability, not a cost paid on playing the land.
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
function scene(){const s=createGameState({seed:17748,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'spire','rupture-spire','hand');put(s,'druid','druid-of-the-cowl','battlefield');return s;}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){const v=view(s),c=v.legalCommands.find(c=>c.type==='pass_priority');assert.ok(c,JSON.stringify({step:s.turn.step,options:v.legalCommands}));act(s,c);}
function bot(s){return createHeuristicBot({seed:9,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function until(s,p){for(let i=0;i<20&&!p();i++)pass(s);assert.ok(p(),'oczekiwany stan');}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function play(s){const c=bot(s);assert.equal(c.type,'play_land',JSON.stringify(c));assert.equal(c.objectId,'spire');act(s,c);assert.equal(card(s,'spire').tapped,true);assert.ok(s.zones.stack.length);}
function damageResponse(s){
 put(s,'fall','fiery-fall','hand','p2');addMana(s,'p2',6,{colors:['R']});
 pass(s);act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='fall'&&c.targets?.includes('druid')));
 until(s,()=>card(s,'druid').zone==='graveyard');
}
function decide(s){until(s,()=>s.pendingPayOrSacrifice!=null);const c=bot(s);assert.equal(c.type,'resolve_pay_or_sacrifice',JSON.stringify(c));act(s,c);return c;}

test('A48: bot zagrywa Spire i faktycznie płaci z gotowego Druida',()=>{
 const s=scene();play(s);const choice=decide(s);assert.equal(choice.pay,true);assert.equal(card(s,'spire').zone,'battlefield');assert.equal(card(s,'druid').tapped,true);
});
test('A48: Fiery Fall usuwa jedyne źródło przed triggerem, ląd jest poświęcony',()=>{
 const s=scene();play(s);damageResponse(s);until(s,()=>card(s,'spire').zone==='graveyard');
 assert.equal(s.pendingPayOrSacrifice,null,'brak płatności — automatyczne poświęcenie');assert.ok(s.events.some(e=>e.type==='ability_triggered'&&e.autoSacrificed===true));
});
test('A48: zielona mana wytworzona przed Fiery Fall wystarcza do opłaty',()=>{
 const s=scene();play(s);const mana=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='druid');act(s,mana);assert.equal(card(s,'druid').tapped,true);
 damageResponse(s);const choice=decide(s);assert.equal(choice.pay,true);assert.equal(card(s,'spire').zone,'battlefield');assert.equal(card(s,'druid').zone,'graveyard');
});
test('A48: w odpowiedzi na Fiery Fall można tapnąć Druida i zachować Spire',()=>{
 const s=scene();play(s);put(s,'fall','fiery-fall','hand','p2');addMana(s,'p2',6,{colors:['R']});pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='fall'&&c.targets?.includes('druid')));pass(s);
 assert.equal(s.turn.priorityPlayerId,'p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='druid'));
 until(s,()=>card(s,'druid').zone==='graveyard');const choice=decide(s);assert.equal(choice.pay,true);assert.equal(card(s,'spire').zone,'battlefield');
});
