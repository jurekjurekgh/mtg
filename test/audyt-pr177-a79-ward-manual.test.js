// Ward po realnym disguise, rzut Shock i prawdziwy Scion z ETB Summonera.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana,spendMana} from '../src/engine/resources.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function turn(s,p){s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;}
function scene(payer,{reserve=1,scionOwner=payer,tappedSource=false}={}){
 const opponent=payer==='p1'?'p2':'p1',s=createGameState({seed:17779,players:[{id:'p1'},{id:'p2'}]});let tokenId=null;
 if(scionOwner){turn(s,scionOwner);put(s,'summoner','scion-summoner','hand',scionOwner);addMana(s,scionOwner,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);tokenId=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield')?.id;assert.ok(tokenId);}
 turn(s,opponent);put(s,'hellion','riftburst-hellion','hand',opponent);addMana(s,opponent,3,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.objectId==='hellion'&&c.faceDown));pass(s);pass(s);
 const hidden=[...s.objects.values()].find(o=>o.cardId==='riftburst-hellion'&&o.zone==='battlefield');assert.ok(hidden?.faceDown);turn(s,payer);if(tappedSource){put(s,'druid','druid-of-the-cowl','battlefield',payer);s.objects.set('druid',Object.freeze({...s.objects.get('druid'),tapped:true}));}put(s,'shock','shock','hand',payer);addMana(s,payer,reserve+1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes(hidden.id)));pass(s);pass(s);
 return {s,payer,opponent,tokenId,hiddenId:hidden.id};
}
for(const payer of ['p1','p2'])test(`A79: Shock przeciw Ward {2}, pula 1 + realny Scion, płacący ${payer}`,()=>{
 const {s,tokenId,hiddenId}=scene(payer);assert.ok(s.pendingWardPay,'Ward nie może skontrować przed szansą aktywacji Sciona');assert.equal(s.turn.priorityPlayerId,payer);assert.equal(s.players.find(p=>p.id===payer).mana,1);
 assert.ok(view(s).legalCommands.some(c=>c.type==='resolve_ward_pay_choice'&&c.pay===true));const before=stateFingerprint(s);const invalid=execute(s,{type:'resolve_ward_pay_choice',playerId:payer,pay:true});assert.equal(invalid.ok,false);assert.equal(stateFingerprint(s),before,'odmowa komendy bez wystarczającej wyprodukowanej many jest atomowa');
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokenId));assert.equal(s.objects.has(tokenId),false);assert.ok(s.pendingWardPay);assert.equal(s.players.find(p=>p.id===payer).mana,2);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===true));assert.equal(s.players.find(p=>p.id===payer).mana,0);pass(s);pass(s);assert.equal(s.objects.has(hiddenId),false);assert.ok([...s.objects.values()].some(o=>o.cardId==='riftburst-hellion'&&o.zone==='graveyard'));
});
for(const payer of ['p1','p2'])test(`A79: brak osiągalnej many kontrowany natychmiast (${payer})`,()=>{
 const {s,hiddenId}=scene(payer,{reserve:0,scionOwner:null});assert.equal(s.pendingWardPay,null);assert.ok(s.objects.has(hiddenId));assert.ok([...s.objects.values()].some(o=>o.cardId==='shock'&&o.zone==='graveyard'));
});
test('A79: Scion przeciwnika nie daje płacącemu legalnej aktywacji',()=>{
 const {s,hiddenId}=scene('p1',{reserve:0,scionOwner:'p2'});assert.equal(s.pendingWardPay,null);assert.ok(s.objects.has(hiddenId));assert.ok([...s.objects.values()].some(o=>o.cardId==='shock'&&o.zone==='graveyard'));
});
test('A79: gracz może odmówić Ward bez poświęcania Sciona',()=>{
 const {s,tokenId,hiddenId}=scene('p1',{reserve:2});assert.ok(s.pendingWardPay);act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===false));assert.ok(s.objects.has(tokenId));assert.ok(s.objects.has(hiddenId));assert.ok([...s.objects.values()].some(o=>o.cardId==='shock'&&o.zone==='graveyard'));
});
test('A79: wyprodukowana mana opłaca Ward bez poświęcenia Sciona',()=>{
 const {s,tokenId,hiddenId}=scene('p1',{reserve:2});assert.ok(s.pendingWardPay);act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===true));assert.ok(s.objects.has(tokenId));pass(s);pass(s);assert.ok(!s.objects.has(hiddenId));
});

// Syntetyczna zmiana puli PO realnym otwarciu Ward: weryfikuje atomowość
// nieaktualnej/spreparowanej zapłaty również przed poprawką otwierania okna.
test('A79: niewystarczająca zapłata Ward nie usuwa decyzji ani nie zmienia stanu',()=>{
 const {s}=scene('p1',{reserve:2});assert.ok(s.pendingWardPay);spendMana(s,'p1',1,[]);const before=stateFingerprint(s);
 const r=execute(s,{type:'resolve_ward_pay_choice',playerId:'p1',pay:true});assert.equal(r.ok,false);assert.equal(stateFingerprint(s),before);assert.ok(s.pendingWardPay);
});

test('A79: konserwatywne okno przy nietrafnym źródle nadal umożliwia odmowę',()=>{
 const {s}=scene('p1',{reserve:0,scionOwner:null,tappedSource:true});assert.ok(s.pendingWardPay);const cmds=view(s).legalCommands;
 assert.ok(!cmds.some(c=>c.type==='resolve_ward_pay_choice'&&c.pay===true));act(s,cmds.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===false));assert.ok([...s.objects.values()].some(o=>o.cardId==='shock'&&o.zone==='graveyard'));
});
test('A79: aktywacja Sciona i opłata Ward są deterministyczne w replay',()=>{
 const {s,tokenId}=scene('p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokenId));act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===true));
 const replay=replayFromState(s),verified=verifyReplay({...replay,commands:replay.commands.slice(-2)},()=>scene('p1').s,execute);assert.ok(verified.deterministic);assert.ok(verified.results.every(r=>r.ok));assert.equal(stateFingerprint(verified.state),stateFingerprint(s));
});

test('A79: Ward chroni także celowaną zdolność Azorius Justiciara, można zapłacić Scionem',()=>{
 const s=createGameState({seed:17779,players:[{id:'p1'},{id:'p2'}]});turn(s,'p1');put(s,'summoner','scion-summoner','hand','p1');addMana(s,'p1',3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);
 const token=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.ok(token);
 turn(s,'p2');put(s,'hellion','riftburst-hellion','hand','p2');addMana(s,'p2',3,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.objectId==='hellion'&&c.faceDown));pass(s);pass(s);const target=[...s.objects.values()].find(o=>o.cardId==='riftburst-hellion'&&o.faceDown);assert.ok(target);
 turn(s,'p1');put(s,'justiciar','azorius-justiciar','hand','p1');addMana(s,'p1',5,{colors:['W']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='justiciar'));pass(s);pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetIds?.length===1&&c.targetIds.includes(target.id)));pass(s);pass(s);assert.ok(s.pendingWardPay);assert.equal(s.players.find(p=>p.id==='p1').mana,1);
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===true));pass(s);pass(s);assert.equal(s.objects.get(target.id)?.detained,true);
});
