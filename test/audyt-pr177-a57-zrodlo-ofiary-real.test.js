// A57: kontrakt źródła zdarzenia z PR #177 na rzeczywistych czarach.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {describeGameEvent} from '../src/table/session.js';
const reg=createCardRegistry();
const helpers={nameOf:id=>reg.get(id)?.name??id,nameOfObject:id=>id,isPlayer:id=>id==='p1'||id==='p2'};
function put(s,id,card,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function until(s,pred){for(let i=0;i<20&&!pred();i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.ok(pred(),'oczekiwanie na decyzję');}
function game(spell){const s=createGameState({seed:17757,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'spell',spell,'hand');put(s,'weak','highland-game','battlefield','p2');put(s,'strong','woolly-loxodon','battlefield','p2');put(s,'dead','leafcrown-dryad','graveyard');addMana(s,'p1',8,{colors:['B']});return s;}
function findInstance(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
for(const spell of ['lilianas-triumph','grave-exchange'])test(`A57: ${spell} przekazuje źródło i decydenta do zdarzenia oraz logu`,()=>{
 const s=game(spell);const cmd=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spell'&&(spell!=='grave-exchange'||(c.targets?.includes('dead')&&c.targets?.includes('p2'))));act(s,cmd);until(s,()=>s.pendingSacrifice!=null);
 const ev=s.events.findLast(e=>e.type==='sacrifice_choice_required');assert.equal(ev.playerId,'p2');assert.equal(ev.cardId,spell);assert.ok(ev.sourceId);assert.equal(s.pendingSacrifice.sourceId,ev.sourceId);assert.equal(s.pendingSacrifice.cardId,ev.cardId);
 assert.equal(playerView(s,'p2').pendingSacrifice.cardId,spell);assert.equal(playerView(s,'p1').pendingSacrifice,null);
 const text=describeGameEvent(ev,helpers,{p1:'Atakujący',p2:'Obrońca'},{drugaOsoba:false});assert.match(text,new RegExp(reg.get(spell).name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const illegal=execute(s,{type:'resolve_sacrifice_choice',playerId:'p1',targetId:'strong'});assert.equal(illegal.ok,false);assert.equal(findInstance(s,'strong').zone,'battlefield');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId==='strong'));until(s,()=>s.zones.stack.length===0);
 assert.equal(findInstance(s,'strong').zone,'graveyard');assert.equal(findInstance(s,'weak').zone,'battlefield');if(spell==='grave-exchange')assert.equal(findInstance(s,'dead').zone,'hand');
});
test('A57: stare zdarzenie bez karty ma poprawny opis bez fałszywego źródła',()=>{
 const text=describeGameEvent({type:'sacrifice_choice_required',playerId:'p2'},helpers,{p1:'Atakujący',p2:'Obrońca'},{drugaOsoba:false});assert.equal(text,'Obrońca wskazuje stwora do poświęcenia');
});

test('A57: rzeczywisty Changeling Berserker — źródło i odróżnienie wygnania od poświęcenia',()=>{
 const s=createGameState({seed:17757,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'champ','changeling-berserker','hand');put(s,'host','highland-game','battlefield');addMana(s,'p1',4,{colors:['R']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='champ'));until(s,()=>s.pendingSacrifice!=null);
 const ev=s.events.findLast(e=>e.type==='sacrifice_choice_required');assert.equal(ev.cardId,'changeling-berserker');assert.equal(ev.champion,true);
 const text=describeGameEvent(ev,helpers,{p1:'Ty',p2:'Nieprzyjaciel'});assert.equal(text,'Changeling Berserker: wybierasz wygnanie innego permanenta albo rezygnację (champion)');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId==='host'));assert.equal(findInstance(s,'host').zone,'exile');
});
test('A57: źródło ze Scythe Tiger wskazuje poświęcenie lądu, a nie wygnanie championa',()=>{
 const s=createGameState({seed:17757,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'tiger','scythe-tiger','hand');put(s,'land','basic-forest','battlefield');addMana(s,'p1',1,{colors:['G']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='tiger'));until(s,()=>s.pendingSacrifice!=null);
 const ev=s.events.findLast(e=>e.type==='sacrifice_choice_required');assert.equal(ev.cardId,'scythe-tiger');assert.equal(ev.sacrificeUnless,true);
 const text=describeGameEvent(ev,helpers,{p1:'Ty',p2:'Nieprzyjaciel'});assert.equal(text,'Scythe Tiger: wskazujesz permanent do poświęcenia albo poświęcasz źródło');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId==='land'));assert.equal(findInstance(s,'land').zone,'graveyard');
});

test('A57: Liliana’s Triumph nie celuje i może wymusić poświęcenie Scythe Tiger z shroud',()=>{
 const s=createGameState({seed:17757,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'spell','lilianas-triumph','hand');put(s,'tiger','scythe-tiger','battlefield','p2');put(s,'forest','basic-forest','battlefield','p2');addMana(s,'p1',2,{colors:['B']});
 const cast=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spell');assert.deepEqual(cast.targets??[],[]);act(s,cast);until(s,()=>s.pendingSacrifice!=null);
 const ev=s.events.findLast(e=>e.type==='sacrifice_choice_required');assert.equal(ev.cardId,'lilianas-triumph');assert.deepEqual(ev.candidates,['tiger']);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId==='tiger'));until(s,()=>s.zones.stack.length===0);assert.equal(findInstance(s,'tiger').zone,'graveyard');
});
test('A57: przeciwnik bez stworów — Triumph nie generuje pustej decyzji',()=>{
 const s=createGameState({seed:17757,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'spell','lilianas-triumph','hand');addMana(s,'p1',2,{colors:['B']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spell'));until(s,()=>s.zones.stack.length===0);
 assert.equal(s.pendingSacrifice,null);assert.ok(!s.events.some(e=>e.type==='sacrifice_choice_required'));
});
