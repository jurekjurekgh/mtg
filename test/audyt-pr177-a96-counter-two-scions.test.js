// Rzeczywisty Scion oraz Izzet Charm: kontra, chyba że zapłacisz {2}.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function turn(s,p){s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;}
function scene(active,payer){
 const s=createGameState({seed:17796,players:[{id:'p1'},{id:'p2'}]}),opp=payer==='p1'?'p2':'p1';turn(s,payer);addMana(s,payer,6,{colors:['G']});for(let i=0;i<2;i++){put(s,`summoner${i}`,'scion-summoner','hand',payer);act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId===`summoner${i}`));pass(s);pass(s);pass(s);pass(s);}const tokens=[...s.objects.values()].filter(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.equal(tokens.length,2);
 for(const p of ['p2','p1']){put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<4;i++)put(s,`${p}-lib${i}`,'basic-forest','library',p);}
 put(s,'enemy','highland-game','battlefield',opp);put(s,'shock','shock','hand',payer);put(s,'charm','izzet-charm','hand',opp);turn(s,active);s.turn.priorityPlayerId=payer;addMana(s,payer,1,{colors:['R']});addMana(s,opp,2,{colors:['U','R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('enemy')));const shock=s.zones.stack.find(id=>s.objects.get(id).cardId==='shock');assert.ok(shock);pass(s);const charm=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='charm'&&c.targets?.includes(shock));assert.ok(charm,JSON.stringify(view(s).legalCommands));act(s,charm);pass(s);pass(s);assert.ok(s.pendingCounterPay);return {s,tokens,payer,active};
}
for(const active of ['p1','p2'])for(const payer of ['p1','p2'])test(`A96: dwa Sciony finansują Izzet Charm mimo triggera po pierwszym (aktywny ${active}, płaci ${payer})`,()=>{const {s,tokens}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[0].id));assert.ok(s.pendingCounterPay);assert.ok(s.pendingTriggerTargets.length>0);const second=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[1].id);assert.ok(second);const r=execute(s,second);assert.ok(r.ok,JSON.stringify(r));act(s,view(s).legalCommands.find(c=>c.type==='resolve_counter_pay_choice'&&c.pay));assert.equal(s.pendingCounterPay,null);assert.ok(s.zones.stack.some(id=>s.objects.get(id).cardId==='shock'));});
for(const payer of ['p1','p2'])test(`A96: po pierwszym Scionie można odmówić dopłaty (${payer})`,()=>{const {s,tokens}=scene(payer,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[0].id));act(s,view(s).legalCommands.find(c=>c.type==='resolve_counter_pay_choice'&&!c.pay));assert.equal(s.pendingCounterPay,null);assert.equal(s.objects.get(tokens[1].id).zone,'battlefield');assert.ok(!s.zones.stack.some(id=>s.objects.get(id).cardId==='shock'));});
test('A96: wybór celu i pass nie omijają dopłaty kontry',()=>{const {s,tokens,payer}=scene('p1','p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[0].id));assert.equal(execute(s,{type:'resolve_trigger_target',playerId:payer,targetId:'p2'}).reason,'counter_pay_unresolved');assert.equal(execute(s,{type:'pass_priority',playerId:payer}).reason,'counter_pay_unresolved');});
test('A96: replay dwóch Scionów i opłacenia kontry',()=>{const {s,tokens}=scene('p1','p1');for(const token of tokens)act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='resolve_counter_pay_choice'&&c.pay));const replay=replayFromState(s),r=verifyReplay({...replay,commands:replay.commands.slice(-3)},()=>scene('p1','p1').s,execute);assert.ok(r.deterministic);assert.ok(r.results.every(x=>x.ok));assert.equal(stateFingerprint(r.state),stateFingerprint(s));});
