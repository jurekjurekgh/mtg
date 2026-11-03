// Rzut artefaktu i Scion pochodzą z rzeczywistych komend silnika.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana,spendMana} from '../src/engine/resources.js';
import {processTriggers} from '../src/engine/triggers.js';
import {removeCounter} from '../src/engine/counters.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(payer,{reserve=0,withScion=true}={}){
 const s=createGameState({seed:17781,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',payer);s.turn.activePlayerId=s.turn.priorityPlayerId=payer;
 let tokenId;if(withScion){put(s,'summoner','scion-summoner','hand',payer);addMana(s,payer,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);tokenId=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield')?.id;assert.ok(tokenId);}
 put(s,'pangolin','oreplate-pangolin','battlefield',payer);put(s,'artifact','panic-spellbomb','hand',payer);addMana(s,payer,1+reserve);act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='artifact'));pass(s);pass(s);pass(s);pass(s);return {s,tokenId};
}
for(const payer of ['p1','p2'])test(`A81: Scion pozwala zapłacić za trigger Pangolina (${payer})`,()=>{
 const {s,tokenId}=scene(payer);assert.ok(s.pendingOptionalPay,'trigger powinien dać szansę ręcznej produkcji many');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokenId));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));pass(s);pass(s);assert.equal(s.objects.get('pangolin')?.counters?.['+1/+1'],1);assert.equal(s.objects.has(tokenId),false);
});
for(const payer of ['p1','p2'])test(`A81: niezapłacalna spreparowana komenda nie usuwa decyzji (${payer})`,()=>{
 const {s}=scene(payer,{reserve:1});assert.ok(s.pendingOptionalPay);spendMana(s,payer,1,[]);const before=stateFingerprint(s);let r;assert.doesNotThrow(()=>{r=execute(s,{type:'resolve_optional_pay_choice',playerId:payer,pay:true});});assert.equal(r.ok,false);assert.equal(stateFingerprint(s),before);assert.ok(s.pendingOptionalPay);
});
test('A81: brak źródła pomija opcjonalną dopłatę',()=>{const {s}=scene('p1',{withScion:false});assert.equal(s.pendingOptionalPay,null);assert.equal(s.objects.get('pangolin')?.counters?.['+1/+1']??0,0);});
test('A81: odmowa nie poświęca Sciona ani nie daje licznika',()=>{const {s,tokenId}=scene('p1',{reserve:1});assert.ok(s.pendingOptionalPay);act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&!c.pay));assert.ok(s.objects.has(tokenId));assert.equal(s.objects.get('pangolin')?.counters?.['+1/+1']??0,0);});
// Źródłem jest realna rzucona Zoraline; wyłącznie późniejszy ubytek zasobów
// symuluje przestarzałe/złośliwe żądanie po otwarciu decyzji.
function zora(){
 const s=createGameState({seed:17782,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'grave','highland-game','graveyard','p1');put(s,'zora','zoraline','hand','p1');addMana(s,'p1',5,{colors:['W','B','U']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='zora'));pass(s);pass(s);pass(s);pass(s);assert.ok(s.pendingOptionalPay);return s;
}
test('A81: Zoraline bez jednego koloru nie pobiera many ani 2 życia',()=>{
 const s=zora();spendMana(s,'p1',2,[]);addMana(s,'p1',1,{colors:['W']});addMana(s,'p1',1,{colors:[]});const before=stateFingerprint(s);let r;assert.doesNotThrow(()=>{r=execute(s,{type:'resolve_optional_pay_choice',playerId:'p1',pay:true});});assert.equal(r.ok,false);assert.equal(stateFingerprint(s),before);assert.equal(s.players[0].life,20);
});
test('A81: Zoraline bez życia nie pobiera many ani nie usuwa decyzji',()=>{
 const s=zora();s.players[0].life=1;const before=stateFingerprint(s);let r;assert.doesNotThrow(()=>{r=execute(s,{type:'resolve_optional_pay_choice',playerId:'p1',pay:true});});assert.equal(r.ok,false);assert.equal(stateFingerprint(s),before);
});

// Rzeczywista karta, zdarzenie walki zainicjowane syntetycznie; znacznik
// usuwamy po otwarciu decyzji, symulując przestarzałą komendę.
test('A81: Kappa bez wymaganego znacznika odrzuca zapłatę atomowo',()=>{
 const s=createGameState({seed:17783,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'kappa','kappa-tech-wrecker','battlefield','p1');s.objects.set('kappa',Object.freeze({...s.objects.get('kappa'),counters:{deathtouch:1}}));put(s,'relic','angels-feather','battlefield','p2');processTriggers(s,[{type:'damage_dealt',source:'kappa',target:'p2',amount:1,combat:true}]);pass(s);pass(s);assert.ok(s.pendingOptionalPay);removeCounter(s,'kappa','deathtouch',1);const before=stateFingerprint(s);let r;assert.doesNotThrow(()=>{r=execute(s,{type:'resolve_optional_pay_choice',playerId:'p1',pay:true});});assert.equal(r.ok,false);assert.equal(stateFingerprint(s),before);
});
