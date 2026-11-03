// Scion pochodzi z realnego Scion Summoner; nie wytwarzamy tokenu ręcznie.
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
function scene(active,actor){
 const other=active==='p1'?'p2':'p1',s=createGameState({seed:17778,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',actor);s.turn.activePlayerId=s.turn.priorityPlayerId=actor;
 put(s,'summoner','scion-summoner','hand',actor);addMana(s,actor,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);
 const token=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.ok(token?.isToken);s.turn=jumpToStep(s.turn,'main1',active);s.turn.activePlayerId=active;s.turn.priorityPlayerId=actor;
 for(const p of [other,active]){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<3;i++)put(s,`${p}-lib${i}`,'basic-island','library',p);}
 return {s,active,other,actor,tokenId:token.id};
}
function activate(x){const {s,tokenId,actor}=x;act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokenId));assert.equal(s.objects.has(tokenId),false);assert.equal(s.players.find(p=>p.id===actor).mana,1);}
function choose(x){
 const {s,active,other,actor}=x;assert.equal(s.turn.priorityPlayerId,active);const orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(orders.length,2);
 const before=stateFingerprint(s);assert.equal(execute(s,{type:'resolve_trigger_order',playerId:other,stackEntryId:orders[0].stackEntryId}).ok,false);assert.equal(stateFingerprint(s),before);
 act(s,orders.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===other));assert.equal(s.turn.priorityPlayerId,other);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='selhoff-occultist'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===active));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.equal(stack.length,4);assert.deepEqual(stack.map(o=>o.controllerId),[active,active,other,other]);assert.equal(s.turn.priorityPlayerId,actor);pass(s);pass(s);
 assert.equal([...s.objects.values()].find(o=>o.instanceId===`i-${active}-lib0`)?.zone,'graveyard');
}
for(const active of ['p1','p2'])for(const ownTurn of [true,false])test(`A78: otwarty priorytet, aktywny ${active}, Scion ${ownTurn?'aktywny':'nieaktywny'}`,()=>{const x=scene(active,ownTurn?active:active==='p1'?'p2':'p1');activate(x);choose(x);});

test('A78 granica: Scion podczas rzeczywistej dopłaty Ward nie przestawia decyzji',()=>{
 const x=scene('p1','p1'),{s,tokenId}=x;s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'hellion','riftburst-hellion','hand','p2');addMana(s,'p2',3,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.objectId==='hellion'&&c.faceDown));pass(s);pass(s);
 const hidden=[...s.objects.values()].find(o=>o.cardId==='riftburst-hellion'&&o.zone==='battlefield');assert.ok(hidden?.faceDown);
 s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'shock','shock','hand','p1');addMana(s,'p1',3,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes(hidden.id)));pass(s);pass(s);
 assert.ok(s.pendingWardPay);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokenId));assert.equal(s.pendingDeathTriggerBatch,null);assert.ok(s.pendingWardPay);assert.equal(s.turn.priorityPlayerId,'p1');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===true));assert.equal(s.pendingWardPay,null);assert.ok(s.zones.stack.some(id=>s.objects.get(id)?.cardId==='shock'));
});
for(const actor of ['p1','p2'])test(`A78: bot i replay wyborów po manie Sciona (${actor})`,()=>{
 const x=scene('p1',actor);activate(x);const {s,active,other}=x,bot=createHeuristicBot({seed:177,randomness:0,lookahead:0,registry:reg});let count=0;
 while(count<12){const v=view(s);if(!v.legalCommands.some(c=>c.type==='resolve_trigger_order'||c.type==='resolve_trigger_target'))break;const cmd=bot.chooseCommand(v);assert.ok(['resolve_trigger_order','resolve_trigger_target'].includes(cmd.type));act(s,cmd);count++;}
 assert.equal(count,4);assert.deepEqual(s.zones.stack.map(id=>s.objects.get(id).controllerId),[active,active,other,other]);assert.equal(s.turn.priorityPlayerId,actor);
 const replay=replayFromState(s),verified=verifyReplay({...replay,commands:replay.commands.slice(-count)},()=>{const y=scene('p1',actor);activate(y);return y.s;},execute);
 assert.ok(verified.deterministic);assert.ok(verified.results.every(r=>r.ok));assert.equal(stateFingerprint(verified.state),stateFingerprint(s));
});
