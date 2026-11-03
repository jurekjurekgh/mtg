// Rzeczywisty Scion z Summonera, a Rupture Spire jest rzeczywiście zagrywany.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana,spendMana,producibleMana} from '../src/engine/resources.js';
import {manaSourcesOf,paymentDescriptorOf,shouldOpenManaWizard} from '../src/table/mana-wizard.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
import {processTriggers} from '../src/engine/triggers.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function turn(s,p){s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;}
// Wejście w upkeep jest inicjowane zdarzeniem jak w A80, pozostałe karty i akcje prawdziwe.
function scene(payer){const opp=payer==='p1'?'p2':'p1',s=createGameState({seed:17797,players:[{id:'p1'},{id:'p2'}]});turn(s,payer);put(s,'shredder','bone-shredder','hand',payer);addMana(s,payer,3,{colors:['B']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='shredder'));pass(s);pass(s);const sh=[...s.objects.values()].find(o=>o.cardId==='bone-shredder'&&o.zone==='battlefield');assert.ok(sh?.echoUnpaid);addMana(s,payer,6,{colors:['G']});for(let i=0;i<2;i++){put(s,`summoner${i}`,'scion-summoner','hand',payer);act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId===`summoner${i}`));pass(s);pass(s);pass(s);pass(s);}const tokens=[...s.objects.values()].filter(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.equal(tokens.length,2);for(const p of [payer,opp])put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);s.turn=jumpToStep(s.turn,'upkeep',payer);s.turn.activePlayerId=s.turn.priorityPlayerId=payer;addMana(s,payer,1,{colors:['B']});processTriggers(s,[{type:'step_advanced',step:'upkeep',playerId:payer}]);pass(s);pass(s);assert.ok(s.pendingPayOrSacrifice);return {s,tokens,sh};}
for(const payer of ['p1','p2'])test(`A97: dwa Sciony płacą echo {2}{B} mimo celu Selhoff (${payer})`,()=>{const {s,tokens,sh}=scene(payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[0].id));assert.ok(s.pendingPayOrSacrifice);assert.ok(s.pendingTriggerTargets.length>0);const second=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[1].id);assert.ok(second);const r=execute(s,second);assert.ok(r.ok,JSON.stringify(r));act(s,view(s).legalCommands.find(c=>c.type==='resolve_pay_or_sacrifice'&&c.pay));assert.equal(s.pendingPayOrSacrifice,null);assert.ok(s.objects.has(sh.id));});
for(const payer of ['p1','p2'])test(`A97: odmowa echo po pierwszym Scionie pozostaje legalna (${payer})`,()=>{const {s,tokens,sh}=scene(payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[0].id));act(s,view(s).legalCommands.find(c=>c.type==='resolve_pay_or_sacrifice'&&!c.pay));assert.equal(s.pendingPayOrSacrifice,null);assert.equal(s.objects.get(tokens[1].id).zone,'battlefield');assert.ok(!s.objects.has(sh.id));});
test('A97: wybór celu i pass nie omijają echo',()=>{const {s,tokens}=scene('p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[0].id));assert.equal(execute(s,{type:'resolve_trigger_target',playerId:'p1',targetId:'p2'}).reason,'pay_or_sacrifice_unresolved');assert.equal(execute(s,{type:'pass_priority',playerId:'p1'}).reason,'pay_or_sacrifice_unresolved');});
test('A97: replay dwóch Scionów i opłacenia echo',()=>{const {s,tokens}=scene('p1');for(const token of tokens)act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='resolve_pay_or_sacrifice'&&c.pay));const replay=replayFromState(s),r=verifyReplay({...replay,commands:replay.commands.slice(-3)},()=>scene('p1').s,execute);assert.ok(r.deterministic);assert.ok(r.results.every(x=>x.ok));assert.equal(stateFingerprint(r.state),stateFingerprint(s));});
