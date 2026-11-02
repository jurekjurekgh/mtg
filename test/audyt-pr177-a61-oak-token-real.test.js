// Ambassador Oak makes a 1/1 green Elf Warrior token; Ivy Lane Denizen
// triggers on another green creature entering under its controller.
// https://www.cardkingdom.com/mtg/masters-25/ambassador-oak
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {gameObjectDataOf} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1') {const d=reg.get(card);assert.ok(d);addObject(s,{id,instanceId:`i-${id}`,cardId:card,zone,ownerId:player,controllerId:player,...gameObjectDataOf(d),types:d.types??[],subtypes:d.subtypes??[],keywords:d.keywords??[]});}
function setup(){const s=createGameState({seed:17761,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'oak','ambassador-oak');addMana(s,'p1',4,{colors:['G']});return s;}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({turn:s.turn,legal:view(s).legalCommands}));let r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function until(s,p){for(let i=0;i<40&&!p();i++)pass(s);assert.ok(p(),JSON.stringify({stack:s.zones.stack,legal:view(s).legalCommands}));}
function cast(s){act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='oak'));}
function token(s){return [...s.objects.values()].find(o=>o.cardId==='token_elf_warrior'&&o.zone==='battlefield');}
function targetIvy(s){const c=view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId==='ivy'||c.candidateIds?.includes('ivy')));act(s,c.targetId?c:{...c,targetId:'ivy'});}

test('A61: Oak i jego zielony Elf Warrior niezależnie wyzwalają własnego Ivy Lane Denizen',()=>{
 const s=setup();put(s,'ivy','ivy-lane-denizen','battlefield');cast(s);until(s,()=>s.pendingTriggerTargets?.length>0);targetIvy(s);
 until(s,()=>s.pendingTriggerTargets?.length>0);targetIvy(s);until(s,()=>s.zones.stack.length===0);
 const t=token(s);assert.ok(t?.isToken);assert.equal(t.ownerId,'p1');assert.equal(t.controllerId,'p1');assert.deepEqual(t.colors,['G']);assert.ok(t.types.includes('Creature'));assert.deepEqual(t.subtypes,['Elf','Warrior']);assert.equal(t.power,1);assert.equal(t.toughness,1);assert.equal(s.objects.get('ivy').counters['+1/+1'],2);
});
test('A61: Ivy Lane Denizen przeciwnika nie widzi wejść pod cudzą kontrolą',()=>{
 const s=setup();put(s,'ivy','ivy-lane-denizen','battlefield','p2');cast(s);until(s,()=>s.zones.stack.length===0);assert.ok(token(s));assert.equal(s.objects.get('ivy').counters?.['+1/+1']??0,0);assert.equal(s.pendingTriggerTargets.length,0);
});
test('A61: zniszczenie Oak w odpowiedzi nie usuwa jego już wyzwolonego ETB',()=>{
 const s=setup();put(s,'kill','fiery-fall','hand','p2');addMana(s,'p2',6,{colors:['R']});cast(s);until(s,()=>s.zones.stack.length===1&&[...s.objects.values()].some(o=>o.instanceId==='i-oak'&&o.zone==='battlefield'));
 const oak=[...s.objects.values()].find(o=>o.instanceId==='i-oak');assert.equal(s.turn.priorityPlayerId,'p1');pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='kill'&&c.targets?.includes(oak.id)));until(s,()=>s.zones.stack.length===0);assert.ok(token(s));assert.equal([...s.objects.values()].find(o=>o.instanceId==='i-oak').zone,'graveyard');
});
