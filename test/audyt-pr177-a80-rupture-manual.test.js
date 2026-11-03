// Rzeczywisty Scion z Summonera, a Rupture Spire jest rzeczywiście zagrywany.
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
function scene(payer,{mana=0,scionOwner=payer}={}){
 const s=createGameState({seed:17780,players:[{id:'p1'},{id:'p2'}]});let tokenId=null;
 if(scionOwner){turn(s,scionOwner);put(s,'summoner','scion-summoner','hand',scionOwner);addMana(s,scionOwner,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);tokenId=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield')?.id;assert.ok(tokenId);}
 turn(s,payer);if(mana)addMana(s,payer,mana);put(s,'spire','rupture-spire','hand',payer);act(s,view(s).legalCommands.find(c=>c.type==='play_land'&&c.objectId==='spire'));pass(s);pass(s);return {s,payer,tokenId};
}
for(const payer of ['p1','p2'])test(`A80: rzeczywisty Scion pozwala dopłacić Rupture Spire (${payer})`,()=>{
 const {s,tokenId}=scene(payer);assert.ok(s.pendingPayOrSacrifice,'nie poświęcaj Spire przed szansą aktywacji Sciona');assert.equal(s.players.find(p=>p.id===payer).mana,0);assert.ok(s.objects.has(tokenId));
 const before=stateFingerprint(s);let r;assert.doesNotThrow(()=>{r=execute(s,{type:'resolve_pay_or_sacrifice',playerId:payer,pay:true});});assert.equal(r.ok,false);assert.equal(stateFingerprint(s),before);
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokenId));assert.equal(s.objects.has(tokenId),false);act(s,view(s).legalCommands.find(c=>c.type==='resolve_pay_or_sacrifice'&&c.pay===true));assert.ok([...s.objects.values()].some(o=>o.cardId==='rupture-spire'&&o.zone==='battlefield'));assert.equal(s.players.find(p=>p.id===payer).mana,0);
});
for(const payer of ['p1','p2'])test(`A80: nieopłacalna spreparowana komenda jest atomowa (${payer})`,()=>{
 const {s}=scene(payer,{mana:1});assert.ok(s.pendingPayOrSacrifice);spendMana(s,payer,1,[]);const before=stateFingerprint(s);let r;assert.doesNotThrow(()=>{r=execute(s,{type:'resolve_pay_or_sacrifice',playerId:payer,pay:true});});assert.equal(r.ok,false);assert.equal(stateFingerprint(s),before);assert.ok(s.pendingPayOrSacrifice);
});
test('A80: bez własnego źródła Spire jest automatycznie poświęcany',()=>{
 const {s}=scene('p1',{scionOwner:'p2'});assert.equal(s.pendingPayOrSacrifice,null);assert.ok([...s.objects.values()].some(o=>o.cardId==='rupture-spire'&&o.zone==='graveyard'));
});
test('A80: odmowa dopłaty nie poświęca Sciona',()=>{
 const {s,tokenId}=scene('p1',{mana:1});assert.ok(s.pendingPayOrSacrifice);act(s,view(s).legalCommands.find(c=>c.type==='resolve_pay_or_sacrifice'&&c.pay===false));assert.ok(s.objects.has(tokenId));assert.ok([...s.objects.values()].some(o=>o.cardId==='rupture-spire'&&o.zone==='graveyard'));
});
