// APNAP przy poświęceniu jako koszcie rzeczywistej aktywowanej zdolności.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(active,actor,card){
 const other=active==='p1'?'p2':'p1',s=createGameState({seed:17777,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',active);s.turn.activePlayerId=active;s.turn.priorityPlayerId=actor;
 for(const p of [other,active]){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<8;i++)put(s,`${p}-lib${i}`,'basic-forest','library',p);}
 put(s,'source',card,'battlefield',actor);if(card==='kheru-dreadmaw')put(s,'victim','goblin-picker','battlefield',actor);addMana(s,actor,card==='dawntreader-elk'?1:2,{colors:['G']});
 const c=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='source'&&(card!=='kheru-dreadmaw'||c.sacrificeCreatureId==='victim'));act(s,c);
 assert.equal([...s.objects.values()].find(o=>o.instanceId===`i-${card==='dawntreader-elk'?'source':'victim'}`)?.zone,'graveyard');return {s,active,other,actor,card};
}
function choose(x){
 const {s,active,other,actor,card}=x;assert.equal(s.turn.priorityPlayerId,active);const orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(orders.length,2);
 const before=stateFingerprint(s);assert.equal(execute(s,{type:'resolve_trigger_order',playerId:other,stackEntryId:orders[0].stackEntryId}).ok,false);assert.equal(stateFingerprint(s),before);
 act(s,orders.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===other));assert.equal(s.turn.priorityPlayerId,other);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='selhoff-occultist'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===active));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.equal(stack.length,5);assert.equal(stack[0].cardId,card);assert.ok(stack[0].activatedEntry);assert.deepEqual(stack.slice(1).map(o=>o.controllerId),[active,active,other,other]);assert.equal(s.turn.priorityPlayerId,actor);
 pass(s);pass(s);assert.equal([...s.objects.values()].find(o=>o.instanceId===`i-${active}-lib0`)?.zone,'graveyard');
}
for(const active of ['p1','p2'])for(const ownTurn of [true,false])for(const card of ['dawntreader-elk','kheru-dreadmaw'])test(`A77: ${card}, aktywny ${active}, aktywacja ${ownTurn?'aktywnego':'nieaktywnego'}`,()=>choose(scene(active,ownTurn?active:active==='p1'?'p2':'p1',card)));
