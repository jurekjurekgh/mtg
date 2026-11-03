// Somberwald Spider: Morbid checks whether a creature died this turn at entry,
// regardless of whose creature died or whether the Spider was cast.
// CR 700.4 and Unearth 702.84a (rules 2026-09-25).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1'){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function until(s,p){for(let i=0;i<30&&!p();i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.ok(p());}
function setup(){const s=createGameState({seed:17767,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';for(let i=0;i<3;i++)put(s,`forest${i}`,'basic-forest','library');addMana(s,'p1',17,{colors:['G','B','U']});return s;}
function sacrifice(s,id){put(s,'rites','village-rites');act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='rites'&&c.sacrificeTargetId===id));until(s,()=>s.zones.stack.length===0);}
function history(s,mode){
 if(mode==='token'){
  put(s,'oak','ambassador-oak');act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='oak'));until(s,()=>s.zones.stack.length===0);
  const token=[...s.objects.values()].find(o=>o.cardId==='token_elf_warrior'&&o.zone==='battlefield');assert.ok(token?.isToken);sacrifice(s,token.id);
 }else if(mode==='unearth'){
  put(s,'abomination','etherium-abomination','graveyard');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='abomination'));until(s,()=>s.zones.stack.length===0);
  const a=[...s.objects.values()].find(o=>o.instanceId==='i-abomination');assert.equal(a.unearthExile,true);sacrifice(s,a.id);assert.equal([...s.objects.values()].find(o=>o.instanceId==='i-abomination').zone,'exile');
 }
}
for(const method of ['cast','bond'])for(const mode of ['none','token','unearth'])test(`A67: Spider ${method}, historia ${mode}`,()=>{
 const s=setup();history(s,mode);put(s,'spider','somberwald-spider',method==='cast'?'hand':'graveyard');
 if(method==='cast')act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='spider'));
 else {put(s,'bond','unbreakable-bond');act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='bond'&&c.targets?.includes('spider')));}
 until(s,()=>s.zones.stack.length===0);const spider=[...s.objects.values()].find(o=>o.instanceId==='i-spider');assert.equal(spider.zone,'battlefield');assert.equal(spider.counters?.['+1/+1']??0,mode==='token'?2:0);
 if(method==='bond')assert.equal(spider.counters?.lifelink,1);
});
