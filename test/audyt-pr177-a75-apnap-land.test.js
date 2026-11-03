import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(active,victim,{wardLand=null,graveCount=2}={}){
 const other=active==='p1'?'p2':'p1',s=createGameState({seed:17780,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',active);s.turn.activePlayerId=s.turn.priorityPlayerId=active;
 for(const p of [other,active]){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);put(s,`${p}-land`,'basic-mountain','battlefield',p);}
 for(let i=0;i<graveCount;i++)put(s,`grave-${i}`,'basic-forest','graveyard',other);
 put(s,'foreign-grave','basic-island','graveyard',active);put(s,'not-land','goblin-picker','graveyard',other);
 if(wardLand){const id=`${wardLand}-land`,o=s.objects.get(id);s.objects.set(id,Object.freeze({...o,ward:2,keywords:['ward']}));}
 put(s,'victim',victim,'battlefield',other);const spell=victim==='polluted-dead'?'fiery-fall':'shock';put(s,'kill',spell,'hand',active);addMana(s,active,spell==='shock'?1:6,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='kill'&&c.targets?.includes('victim')));pass(s);pass(s);return {s,active,other};
}
function chooseBatch({s,active,other},victim){
 assert.equal(s.turn.priorityPlayerId,active);let orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(orders.length,2);act(s,orders.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===other));
 assert.equal(s.turn.priorityPlayerId,other);orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(orders.length,3);act(s,orders.find(c=>c.cardId===victim));orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');act(s,orders.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===active));
 const offers=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_target'), before=stateFingerprint(s);assert.ok(offers.length>=2);
 if(victim==='circle-of-the-land-druid'){
  assert.ok(!offers.some(c=>['foreign-grave','not-land',`${active}-land`].includes(c.targetId)));
  assert.equal(execute(s,{type:'resolve_trigger_target',playerId:other,targetId:'foreign-grave'}).ok,false);
 }
 const bad=execute(s,{type:'resolve_trigger_target',playerId:other,targetId:'nielegalny'});assert.equal(bad.ok,false);assert.equal(stateFingerprint(s),before);
 const target=victim==='polluted-dead'?`${active}-land`:'grave-1';act(s,offers.find(c=>c.targetId===target));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.deepEqual(stack.map(o=>o.controllerId),[active,active,other,other,other]);assert.equal(stack.at(-1).cardId,victim);assert.deepEqual(stack.at(-1).triggerEntry.targets,[target]);assert.equal(s.turn.priorityPlayerId,active);pass(s);pass(s);
 if(victim==='polluted-dead')assert.ok([...s.objects.values()].some(o=>o.cardId==='basic-mountain'&&o.ownerId===active&&o.zone==='graveyard'));
 else assert.ok([...s.objects.values()].some(o=>o.cardId==='basic-forest'&&o.ownerId===other&&o.zone==='hand'));
}
for(const active of ['p1','p2'])for(const victim of ['polluted-dead','circle-of-the-land-druid'])test(`A75: ${victim} i cel lądowy w APNAP, aktywny ${active}`,()=>chooseBatch(scene(active,victim),victim));

// Syntetyczny strażnik przyszłego nosiciela Ward: obecny katalog nie drukuje
// takiego lądu. Nie twierdzimy, że fallback spełnia APNAP z Wardem.
test('A75 granica: przeciwny ląd z Ward wyklucza batch, nie miesza Ward pod triggerami',()=>{
 const {s}=scene('p1','polluted-dead',{wardLand:'p1'});assert.equal(s.pendingDeathTriggerBatch,null);
 assert.equal(s.turn.priorityPlayerId,'p2');assert.ok(view(s).legalCommands.some(c=>c.type==='resolve_trigger_target'&&c.targetId==='p1-land'));
});
test('A75 kontrola: własny Ward nie wyzwala się od własnej zdolności i nie blokuje batcha',()=>{
 const x=scene('p1','polluted-dead',{wardLand:'p2'});assert.ok(x.s.pendingDeathTriggerBatch);chooseBatch(x,'polluted-dead');
});
test('A75 kontrola: jeden ląd w grobie został automatycznie wybrany, reszta APNAP nadal porządkowana',()=>{
 const {s,active,other}=scene('p1','circle-of-the-land-druid',{graveCount:1});
 let orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');act(s,orders.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===other));
 orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(orders.length,3);act(s,orders.find(c=>c.cardId==='circle-of-the-land-druid'));orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');act(s,orders.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===active));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.deepEqual(stack.at(-1).triggerEntry.targets,['grave-0']);assert.equal(s.turn.priorityPlayerId,active);pass(s);pass(s);assert.ok([...s.objects.values()].some(o=>o.cardId==='basic-forest'&&o.zone==='hand'&&o.ownerId===other));
});

for(const victim of ['polluted-dead','circle-of-the-land-druid'])test(`A75: bot i replay wyborów lądowych (${victim})`,()=>{
 const {s}=scene('p1',victim);const bot=createHeuristicBot({seed:177,randomness:0,lookahead:0,registry:reg});let count=0;
 while(count<12){const v=view(s);if(!v.legalCommands.some(c=>c.type==='resolve_trigger_order'||c.type==='resolve_trigger_target'))break;
  const cmd=bot.chooseCommand(v);assert.ok(['resolve_trigger_order','resolve_trigger_target'].includes(cmd.type),JSON.stringify(cmd));act(s,cmd);count++;
 }
 assert.equal(count,6);const replay=replayFromState(s),verified=verifyReplay({...replay,commands:replay.commands.slice(-count)},()=>scene('p1',victim).s,execute);
 assert.ok(verified.deterministic);assert.ok(verified.results.every(r=>r.ok));assert.equal(stateFingerprint(verified.state),stateFingerprint(s));
});
