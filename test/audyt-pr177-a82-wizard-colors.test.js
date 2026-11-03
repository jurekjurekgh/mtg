import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana,expandManaPool} from '../src/engine/resources.js';
import {processTriggers} from '../src/engine/triggers.js';
import {manaSourcesOf,paymentDescriptorOf,wizardProgress,finishWizardPayment} from '../src/table/mana-wizard.js';
const reg=createCardRegistry();
function put(s,id,card,zone){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:'p1',registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:'p1'});}
const view=s=>playerView(s,'p1');
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,playerView(s,s.turn.priorityPlayerId).legalCommands.find(c=>c.type==='pass_priority'));}
function state(){const s=createGameState({seed:17782,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';return s;}
function zora(){const s=state();put(s,'grave','highland-game','graveyard');put(s,'zora','zoraline','hand');for(const [id,card] of [['w','basic-plains'],['b','basic-swamp'],['u1','basic-island'],['u2','basic-island']])put(s,id,card,'battlefield');addMana(s,'p1',3,{colors:['W','B']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='zora'));pass(s);pass(s);pass(s);pass(s);assert.ok(s.pendingOptionalPay);return s;}
function echo(){const s=state();put(s,'shredder','bone-shredder','hand');addMana(s,'p1',3,{colors:['B']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='shredder'));pass(s);pass(s);s.turn=jumpToStep(s.turn,'upkeep','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';addMana(s,'p1',3,{colors:['B']});processTriggers(s,[{type:'step_advanced',step:'upkeep',playerId:'p1'}]);pass(s);pass(s);assert.ok(s.pendingPayOrSacrifice);return s;}
const pay=(s,type)=>view(s).legalCommands.find(c=>c.type===type&&c.pay);
test('A82: prawdziwa dopłata Zoraline opisuje w kreatorze {W}{B}',()=>{const s=zora(),v=view(s),cmd=pay(s,'resolve_optional_pay_choice');assert.deepEqual(cmd.costColors,['W','B']);const d=paymentDescriptorOf(cmd,v);assert.equal(d.totalNeeded,2);assert.deepEqual(d.requirements,[['W'],['B']]);assert.equal(d.effectiveGeneric,0);assert.equal(d.costStr,'{W}{B}');});
test('A82: kreator Zoraline prowadzi do Plains i Swamp, nie Island',()=>{const s=zora(),d=paymentDescriptorOf(pay(s,'resolve_optional_pay_choice'),view(s));const sources=manaSourcesOf(view(s),'p1');const initial=wizardProgress(view(s),'p1',d,sources,[]);assert.deepEqual(new Set(initial.untappedSources.map(x=>x.id)),new Set(['w','b']));});
test('A82: dwie wyspy nie kończą kreatora Zoraline',()=>{const s=zora(),d=paymentDescriptorOf(pay(s,'resolve_optional_pay_choice'),view(s));act(s,{type:'tap_for_mana',playerId:'p1',objectId:'u1'});act(s,{type:'tap_for_mana',playerId:'p1',objectId:'u2'});const progress=wizardProgress(view(s),'p1',d,manaSourcesOf(view(s),'p1'),expandManaPool(s.players[0].manaPool));assert.equal(progress.done,false);assert.deepEqual(new Set(progress.missingColors),new Set(['W','B']));});
test('A82: prawdziwe echo Bone Shreddera opisuje {2}{B}',()=>{const s=echo(),cmd=pay(s,'resolve_pay_or_sacrifice');assert.deepEqual(cmd.costColors,['B']);const d=paymentDescriptorOf(cmd,view(s));assert.equal(d.totalNeeded,3);assert.deepEqual(d.requirements,[['B']]);assert.equal(d.effectiveGeneric,2);assert.equal(d.costStr,'{2}{B}');});

test('A82: prawidłowa płatność przez kreator Zoraline i refleks reanimują stwora',()=>{
 const s=zora(),cmd=pay(s,'resolve_optional_pay_choice'),d={...paymentDescriptorOf(cmd,view(s)),cmd};act(s,{type:'tap_for_mana',playerId:'p1',objectId:'w'});act(s,{type:'tap_for_mana',playerId:'p1',objectId:'b'});assert.equal(wizardProgress(view(s),'p1',d,manaSourcesOf(view(s),'p1'),expandManaPool(s.players[0].manaPool)).done,true);
 let closed=false;const session={view:()=>view(s),apply:c=>execute(s,c)};assert.deepEqual(finishWizardPayment(session,d,{onCloseWizard:()=>{closed=true;}}),{committed:true});assert.ok(closed);assert.equal(s.players[0].life,18);act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='grave'));pass(s);pass(s);assert.ok([...s.objects.values()].some(o=>o.cardId==='highland-game'&&o.zone==='battlefield'));
});
