// Prishe's Wanderings: basic land card OR Town card; Vampire Hounds:
// discard a creature card. Both use the shared quality qualifier extracted in #177.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';import {addMana} from '../src/engine/resources.js';
import {effectivePower,effectiveToughness} from '../src/engine/permanents.js';import {stateFingerprint} from '../src/engine/fingerprint.js';
const reg=createCardRegistry();function put(s,id,card,zone='hand',player='p1'){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function until(s,p){for(let i=0;i<30&&!p();i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.ok(p());}function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function scene(){const s=createGameState({seed:17772,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'prishes','prishes-wanderings');put(s,'hounds','vampire-hounds','battlefield');put(s,'creature1','highland-game');put(s,'creature2','changeling-berserker');put(s,'handland','basic-forest');put(s,'handtown','balamb-garden-seed-academy');put(s,'enemyhand','highland-game','hand','p2');
 put(s,'basic','basic-mountain','library');put(s,'town','balamb-garden-seed-academy','library');put(s,'wrong','highland-game','library');put(s,'foreign','basic-island','library','p2');addMana(s,'p1',3,{colors:['G']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='prishes'));until(s,()=>view(s).legalCommands.some(c=>c.type==='resolve_search_choice'));return s;}
for(const found of ['basic','town',null])test(`A72: realne wyszukiwanie ${found??'fail to find'} i następnie koszt Hounds`,()=>{
 const s=scene();const options=view(s).legalCommands.filter(c=>c.type==='resolve_search_choice');assert.deepEqual(options.map(c=>c.found).sort((a,b)=>String(a).localeCompare(String(b))),[null,'basic','town'].sort((a,b)=>String(a).localeCompare(String(b))));
 for(const invalid of ['wrong','foreign','handland','handtown']){const before=stateFingerprint(s);assert.equal(execute(s,{type:'resolve_search_choice',playerId:'p1',found:invalid}).ok,false);assert.equal(stateFingerprint(s),before);}
 act(s,options.find(c=>c.found===found));until(s,()=>s.zones.stack.length===0);
 if(found){assert.equal(card(s,found).zone,'battlefield');assert.equal(card(s,found).tapped,true);}else{assert.equal(card(s,'basic').zone,'library');assert.equal(card(s,'town').zone,'library');}
 assert.equal(card(s,'hounds').counters['+1/+1'],1,'refleks również po fail to find');assert.equal(card(s,'foreign').zone,'library');assert.equal(card(s,'wrong').zone,'library');
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hounds'));const discard=view(s).legalCommands.filter(c=>c.type==='resolve_discard_choice');assert.deepEqual(discard.map(c=>c.cardId).sort(),['creature1','creature2']);
 for(const invalid of ['handland','handtown','enemyhand']){const before=stateFingerprint(s);assert.equal(execute(s,{type:'resolve_discard_choice',playerId:'p1',cardId:invalid}).ok,false);assert.equal(stateFingerprint(s),before);}
 act(s,discard.find(c=>c.cardId==='creature2'));until(s,()=>s.zones.stack.length===0);assert.equal(card(s,'creature2').zone,'graveyard');assert.equal(card(s,'enemyhand').zone,'hand');assert.equal(effectivePower(card(s,'hounds'),s),5);assert.equal(effectiveToughness(card(s,'hounds'),s),5);
});

test('A72: kwalifikator stwora Hounds jest egzekwowany niezależnie od wyszukiwania',()=>{
 const s=createGameState({seed:17773,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'hounds','vampire-hounds','battlefield');put(s,'a','highland-game');put(s,'b','changeling-berserker');put(s,'noncreature','basic-forest');
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hounds'));
 assert.deepEqual(view(s).legalCommands.filter(c=>c.type==='resolve_discard_choice').map(c=>c.cardId).sort(),['a','b']);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_discard_choice'&&c.cardId==='b'));until(s,()=>s.zones.stack.length===0);
 assert.equal(card(s,'b').zone,'graveyard');assert.equal(card(s,'noncreature').zone,'hand');assert.equal(effectivePower(card(s,'hounds'),s),4);
});
