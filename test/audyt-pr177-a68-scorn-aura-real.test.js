// Sea God's Scorn: return up to three target creatures and/or enchantments.
// State-based actions happen only when a player would receive priority;
// an Aura that is itself returned with its host is not left on the battlefield.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1'){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function drain(s){for(let i=0;i<30&&s.zones.stack.length;i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.equal(s.zones.stack.length,0);}
function find(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function setup({auraController='p2',feedback=false}={}){
 const s=createGameState({seed:17768,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'host','highland-game','battlefield','p2');s.turn=jumpToStep(s.turn,'main1',auraController);s.turn.activePlayerId=s.turn.priorityPlayerId=auraController;put(s,'aura','curiosity','hand',auraController);addMana(s,auraController,4,{colors:['U']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='aura'&&c.targets?.includes('host')));drain(s);const aura=find(s,'aura');assert.equal(aura.zone,'battlefield');assert.equal(aura.attachedTo,'host');
 if(feedback){put(s,'feedback','feedback','hand',auraController);act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='feedback'&&c.targets?.includes(aura.id)));drain(s);assert.equal(find(s,'feedback').attachedTo,aura.id);}
 s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'scorn','sea-gods-scorn');addMana(s,'p1',6,{colors:['U']});return {s,auraId:aura.id};
}
function cast(s,ids){const cmd=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='scorn'&&c.targets?.length===ids.length&&ids.every(id=>c.targets.includes(id)));assert.ok(cmd,JSON.stringify(view(s).legalCommands));act(s,{...cmd,targets:ids});drain(s);}
for(const order of ['host-first','aura-first'])test(`A68: Scorn zwraca host i Curiosity, ${order}`,()=>{
 const {s,auraId}=setup();cast(s,order==='host-first'?['host',auraId]:[auraId,'host']);assert.equal(find(s,'host').zone,'hand');assert.equal(find(s,'host').controllerId,'p2');assert.equal(find(s,'aura').zone,'hand');assert.equal(find(s,'aura').controllerId,'p2');
});
test('A68: tylko host wraca do ręki, niezaznaczona Curiosity trafia do grobu',()=>{
 const {s}=setup();cast(s,['host']);assert.equal(find(s,'host').zone,'hand');assert.equal(find(s,'aura').zone,'graveyard');
});
test('A68: sama Curiosity wraca, host pozostaje na polu',()=>{
 const {s,auraId}=setup();cast(s,[auraId]);assert.equal(find(s,'aura').zone,'hand');assert.equal(find(s,'host').zone,'battlefield');
});

for(const order of ['host-first','feedback-first'])test(`A68: Scorn zwraca łańcuch Feedback → Curiosity → host, ${order}`,()=>{
 const {s,auraId}=setup({feedback:true});const feedbackId=find(s,'feedback').id;
 cast(s,order==='host-first'?['host',auraId,feedbackId]:[feedbackId,auraId,'host']);
 for(const id of ['host','aura','feedback']){assert.equal(find(s,id).zone,'hand',id);assert.equal(find(s,id).controllerId,'p2');}
});
test('A68: wybrane Feedback i host wracają, pominięta Curiosity trafia do grobu',()=>{
 const {s}=setup({feedback:true});const feedbackId=find(s,'feedback').id;cast(s,['host',feedbackId]);assert.equal(find(s,'host').zone,'hand');assert.equal(find(s,'feedback').zone,'hand');assert.equal(find(s,'aura').zone,'graveyard');
});
test('A68: aura własna na cudzym hoście wraca do ręki właściciela',()=>{
 const {s,auraId}=setup({auraController:'p1'});cast(s,['host',auraId]);assert.equal(find(s,'host').zone,'hand');assert.equal(find(s,'host').controllerId,'p2');assert.equal(find(s,'aura').zone,'hand');assert.equal(find(s,'aura').controllerId,'p1');
});

test('A68: Magic Damper w odpowiedzi chroni hosta, a legalna aura wraca',()=>{
 const {s,auraId}=setup();put(s,'damper','magic-damper','hand','p2');
 const cmd=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='scorn'&&c.targets?.length===2&&c.targets.includes('host')&&c.targets.includes(auraId));act(s,cmd);
 act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='damper'&&c.targets?.includes('host')));drain(s);
 assert.equal(find(s,'host').zone,'battlefield');assert.equal(find(s,'aura').zone,'hand');
});
test('A68: bot wybiera oba rzeczywiste cele Scorn i oba wracają',()=>{
 const {s,auraId}=setup();const bot=createHeuristicBot({seed:17768,randomness:0,lookahead:0,registry:reg});const cmd=bot.chooseCommand(view(s));
 assert.equal(cmd.type,'cast_spell');assert.equal(cmd.objectId,'scorn');assert.ok(cmd.targets.includes('host'),JSON.stringify(cmd));assert.ok(cmd.targets.includes(auraId),JSON.stringify(cmd));act(s,cmd);drain(s);
 assert.equal(find(s,'host').zone,'hand');assert.equal(find(s,'aura').zone,'hand');
});
