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
function scene(payer,{mana=0,scionOwner=payer,tappedSource=false}={}){
 const s=createGameState({seed:17780,players:[{id:'p1'},{id:'p2'}]});let tokenId=null;
 if(scionOwner){turn(s,scionOwner);put(s,'summoner','scion-summoner','hand',scionOwner);addMana(s,scionOwner,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);tokenId=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield')?.id;assert.ok(tokenId);}
 turn(s,payer);if(mana)addMana(s,payer,mana);if(tappedSource){put(s,'druid','druid-of-the-cowl','battlefield',payer);s.objects.set('druid',Object.freeze({...s.objects.get('druid'),tapped:true}));}put(s,'spire','rupture-spire','hand',payer);act(s,view(s).legalCommands.find(c=>c.type==='play_land'&&c.objectId==='spire'));pass(s);pass(s);return {s,payer,tokenId};
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

test('A80: potencjalne, ale zatapowane źródło nie oferuje nieopłacalnej zapłaty',()=>{
 const {s}=scene('p1',{scionOwner:null,tappedSource:true});assert.ok(s.pendingPayOrSacrifice);const cmds=view(s).legalCommands;assert.ok(!cmds.some(c=>c.type==='resolve_pay_or_sacrifice'&&c.pay===true));act(s,cmds.find(c=>c.type==='resolve_pay_or_sacrifice'&&!c.pay));assert.ok([...s.objects.values()].some(o=>o.cardId==='rupture-spire'&&o.zone==='graveyard'));
});
test('A80: replay ręcznej produkcji many i zapłaty za Spire',()=>{
 const {s,tokenId}=scene('p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokenId));act(s,view(s).legalCommands.find(c=>c.type==='resolve_pay_or_sacrifice'&&c.pay===true));
 const replay=replayFromState(s),verified=verifyReplay({...replay,commands:replay.commands.slice(-2)},()=>scene('p1').s,execute);assert.ok(verified.deterministic);assert.ok(verified.results.every(r=>r.ok));assert.equal(stateFingerprint(verified.state),stateFingerprint(s));
});
// Realne echo pochodzi od rzuconej karty; jedynie wejście do upkeep jest
// zainicjowane zdarzeniem jak w dotychczasowym teście kolorów echo M259.
function echo(){
 const s=createGameState({seed:17780,players:[{id:'p1'},{id:'p2'}]});turn(s,'p1');put(s,'shredder','bone-shredder','hand','p1');addMana(s,'p1',3,{colors:['B']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='shredder'));pass(s);pass(s);
 const sh=[...s.objects.values()].find(o=>o.cardId==='bone-shredder'&&o.zone==='battlefield');assert.ok(sh?.echoUnpaid);s.turn=jumpToStep(s.turn,'upkeep','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';addMana(s,'p1',3,{colors:[]});addMana(s,'p1',1,{colors:['B']});processTriggers(s,[{type:'step_advanced',step:'upkeep',playerId:'p1'}]);pass(s);pass(s);assert.ok(s.pendingPayOrSacrifice);return {s,sh};
}
test('A80: kolorowe echo {2}{B} odrzuca brak czarnej many bez mutacji',()=>{
 const {s,sh}=echo();spendMana(s,'p1',1,[['B']]);assert.equal(s.players[0].mana,3);const before=stateFingerprint(s);let r;assert.doesNotThrow(()=>{r=execute(s,{type:'resolve_pay_or_sacrifice',playerId:'p1',pay:true});});assert.equal(r.ok,false);assert.equal(stateFingerprint(s),before);assert.ok(s.objects.has(sh.id));
});
test('A80: kolorowe echo po prawidłowej zapłacie nie poświęca stwora',()=>{
 const {s,sh}=echo();act(s,view(s).legalCommands.find(c=>c.type==='resolve_pay_or_sacrifice'&&c.pay));assert.ok(s.objects.has(sh.id));assert.equal(s.pendingPayOrSacrifice,null);
});

test('A80: kreator płatności widzi Sciona przy dopłacie Spire',()=>{
 const {s,tokenId}=scene('p1');const v=view(s);const pay=v.legalCommands.find(c=>c.type==='resolve_pay_or_sacrifice'&&c.pay);assert.ok(pay);const descriptor=paymentDescriptorOf(pay,v);assert.ok(descriptor);assert.equal(descriptor.totalNeeded,1);
 const sources=manaSourcesOf(v,'p1',(id,i)=>{const o=s.objects.get(id),a=o?.activatableAbilities?.[i]??o?.abilities?.[i];const e=(Array.isArray(a?.effect)?a.effect:[a?.effect]).find(x=>x?.type==='add_mana');return e?{cardId:o.cardId,colors:e.colors??[],amount:e.amount??1,manaCost:a.cost?.mana??0,costColors:[],isLand:false}:null;});assert.ok(sources.some(x=>x.id===tokenId));assert.equal(shouldOpenManaWizard({sources,poolMana:0,poolUnits:[],totalNeeded:1,requirements:[],autoPayableMana:producibleMana(s,'p1',null,{},[])}),true);
});
