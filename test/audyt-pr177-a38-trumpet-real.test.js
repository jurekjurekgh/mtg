// CR 611.2c: the set of objects whose characteristics are modified by a
// resolving spell or ability is determined when the effect begins; it does
// not change afterward. CR 702.49: ninjutsu returns an unblocked attacker
// as a cost, then puts the Ninja onto the battlefield tapped and attacking.
// https://github.com/nwgarne/mtg-data/blob/main/rules/cr-raw.txt
// 2026-09-25 SHA-256 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {effectivePower} from '../src/engine/permanents.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});
 addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
 if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
function scene(attacker='p1'){
 const s=createGameState({seed:17738,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'declare_attackers',attacker);s.turn.activePlayerId=s.turn.priorityPlayerId=attacker;
 put(s,'one','highland-game','battlefield',attacker);put(s,'two','leafcrown-dryad','battlefield',attacker);
 put(s,'home','scorpion-sentinel','battlefield',attacker);return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,cmd){assert.ok(cmd,'komenda');const r=execute(s,cmd);assert.ok(r.ok,JSON.stringify(r));return r;}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function attack(s,player='p1'){act(s,{type:'declare_attackers',playerId:player,attackerIds:['one','two']});}
function cast(s,id='blast'){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId===id));}
function finishStack(s){for(let i=0;i<16&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function power(s,id){return effectivePower(s.objects.get(id),s);}
function bot(s){return createHeuristicBot({seed:5}).chooseCommand(view(s));}

test('A38: prawdziwi atakujący otrzymują Trumpet Blast, nieatakujący nie',()=>{
 const s=scene();put(s,'blast','trumpet-blast','hand');addMana(s,'p1',3,{colors:['R']});attack(s);cast(s);finishStack(s);
 assert.equal(power(s,'one'),4);assert.equal(power(s,'two'),4);assert.equal(power(s,'home'),1);
 // Bonus jest do końca tury, także po zakończeniu walki, potem cleanup go usuwa.
 s.turn=jumpToStep(s.turn,'end','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 assert.equal(power(s,'two'),4);pass(s);pass(s);pass(s);pass(s);assert.equal(power(s,'two'),2);
});
test('A38: Kappa po ninjutsu dołącza po Trumpet Blast i nie dostaje wcześniejszego bonusu',()=>{
 const s=scene();put(s,'blast','trumpet-blast','hand');put(s,'kappa','kappa-tech-wrecker','hand');
 put(s,'forest1','basic-forest','battlefield');put(s,'forest2','basic-forest','battlefield');addMana(s,'p1',3,{colors:['R']});
 attack(s);cast(s);finishStack(s);assert.equal(power(s,'one'),4);assert.equal(power(s,'two'),4);
 pass(s);pass(s);act(s,{type:'declare_blockers',playerId:'p2',assignments:{}});pass(s);
 // Silnik dopuszcza ninjutsu w oknie po blokach, przed obrażeniami.
 const opt=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='kappa'&&c.attackerId==='one');
 act(s,opt);finishStack(s);const ninja=[...s.objects.values()].find(o=>o.instanceId==='i-kappa'&&o.zone==='battlefield');
 assert.ok(ninja);assert.ok(s.combat.attackers.includes(ninja.id));assert.equal(power(s,ninja.id),1);assert.equal(power(s,'two'),4);
 assert.ok([...s.objects.values()].some(o=>o.instanceId==='i-one'&&o.zone==='hand'));
});
test('A38: bot wykorzystuje Blast wobec dwóch rzeczywistych własnych atakujących',()=>{
 const s=scene();put(s,'blast','trumpet-blast','hand');addMana(s,'p1',3,{colors:['R']});attack(s);const choice=bot(s);
 assert.equal(choice.type,'cast_spell',JSON.stringify(choice));assert.equal(choice.objectId,'blast');act(s,choice);finishStack(s);
 assert.equal(power(s,'one'),4);assert.equal(power(s,'two'),4);
});
test('A38: bot nie wzmacnia przeciwnika w jego walce',()=>{
 const s=scene('p2');put(s,'blast','trumpet-blast','hand');addMana(s,'p1',3,{colors:['R']});attack(s,'p2');pass(s);
 assert.equal(s.turn.priorityPlayerId,'p1');assert.equal(bot(s).type,'pass_priority');
});
test('A38: człowiek może wzmocnić atakujących przeciwnika, a nie swoich obrońców',()=>{
 const s=scene('p2');put(s,'own','highland-game','battlefield');put(s,'blast','trumpet-blast','hand');addMana(s,'p1',3,{colors:['R']});attack(s,'p2');pass(s);cast(s);finishStack(s);
 assert.equal(power(s,'one'),4);assert.equal(power(s,'two'),4);assert.equal(power(s,'own'),2);
});

test('A38: po odebraniu przejętego atakującego przez Trostani bonus pozostaje do końca tury',()=>{
 const s=scene();s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'prey','highland-game','battlefield','p2');put(s,'trostani','trostani-discordant','battlefield');
 put(s,'steal','act-of-treason','hand');put(s,'blast','trumpet-blast','hand');
 put(s,'m1','basic-mountain','battlefield');put(s,'m2','basic-mountain','battlefield');put(s,'m3','basic-mountain','battlefield');
 addMana(s,'p1',3,{colors:['R']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='steal'&&c.targets?.includes('prey')));finishStack(s);
 assert.equal(s.objects.get('prey').controllerId,'p1');
 s.turn=jumpToStep(s.turn,'declare_attackers','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 act(s,{type:'declare_attackers',playerId:'p1',attackerIds:['prey']});
 cast(s);finishStack(s);assert.equal(power(s,'prey'),5);
 s.turn=jumpToStep(s.turn,'main2','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';pass(s);pass(s);finishStack(s);
 assert.equal(s.objects.get('prey').controllerId,'p2');assert.equal(power(s,'prey'),4);
});
