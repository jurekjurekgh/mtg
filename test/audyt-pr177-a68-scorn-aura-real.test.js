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
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1'){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function drain(s){for(let i=0;i<30&&s.zones.stack.length;i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.equal(s.zones.stack.length,0);}
function find(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function setup(){
 const s=createGameState({seed:17768,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'host','highland-game','battlefield','p2');put(s,'aura','curiosity','hand','p2');addMana(s,'p2',1,{colors:['U']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='aura'&&c.targets?.includes('host')));drain(s);const aura=find(s,'aura');assert.equal(aura.zone,'battlefield');assert.equal(aura.attachedTo,'host');
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
