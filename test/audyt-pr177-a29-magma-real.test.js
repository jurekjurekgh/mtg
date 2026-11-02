// VOW 2021-11-19: "If an amount of damage would be dealt to Magma Pummeler
// greater than the number of +1/+1 counters on it, all of that damage is
// prevented, and all of those counters are removed. ... Its reflexive triggered
// ability still triggers and it will still deal that much damage to any target."
// https://gatherer.wizards.com/VOW/en-us/169/magma-pummeler
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone,owner) {
 const d=reg.get(cardId);assert.ok(d);addObject(s,{id,instanceId:`i-${id}`,cardId,ownerId:owner,controllerId:owner,zone,
 ...gameObjectDataOf(d),types:d.types??[],subtypes:d.subtypes??[],keywords:d.keywords??[]});
}
function game(counters){
 const s=createGameState({seed:17729,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'magma','magma-pummeler','battlefield','p1');addCounter(s,'magma','+1/+1',counters);
 put(s,'shock','shock','hand','p2');addMana(s,'p2',1,{colors:['R']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'brak legalnej oferty');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function round(s){pass(s);pass(s);}
for (const counters of [1,3]) test(`A29: Shock w Magma Pummeler (${counters} liczniki) — realny stos i trigger`,()=>{
 const s=game(counters);const start=s.events.length;
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('magma')));
 round(s);
 const removed=s.events.slice(start).find(e=>e.type==='counter_removed'&&e.cardId==='magma-pummeler');
 assert.ok(removed);assert.equal(removed.amount,Math.min(counters,2));assert.equal(removed.damagePrevention,true);
 if(counters===1){assert.notEqual(s.objects.get('magma')?.zone,'battlefield');
   assert.ok([...s.objects.values()].some(o=>o.cardId==='magma-pummeler'&&o.zone==='graveyard'));
 } else {assert.equal(s.objects.get('magma').counters['+1/+1'],1);assert.equal(s.objects.get('magma').damage,0);}
 const pick=view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId==='p2'||c.targetIds?.includes('p2')));
 act(s,pick);assert.equal(s.objects.get(s.zones.stack.at(-1)).controllerId,'p1');round(s);
 assert.equal(s.players.find(p=>p.id==='p2').life,20-Math.min(counters,2));
});

test('A29: Trigon of Corruption i anihilacja liczników nie są prewencją Magmy',()=>{
 const s=game(3);put(s,'trigon','trigon-of-corruption','battlefield','p2');
 addCounter(s,'trigon','charge',3);addMana(s,'p2',2);
 const start=s.events.length;
 const ability=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='trigon'&&c.abilityIndex===1&&c.targets?.includes('magma'));
 act(s,ability);round(s);
 const o=s.objects.get('magma');assert.equal(o.counters?.['+1/+1'],2);
 assert.equal(o.counters?.['-1/-1']??0,0);
 assert.ok(s.events.slice(start).some(e=>e.type==='counter_removed'&&e.objectId==='magma'&&e.annihilated));
 assert.ok(!s.events.slice(start).some(e=>e.type==='ability_triggered'&&e.cardId==='magma-pummeler'));
 assert.ok(!s.pendingTriggerTargets.some(p=>p.cardId==='magma-pummeler'));
});

test('A29: Rumbling Rockslide z #177 zadaje Magmie więcej obrażeń niż liczników',()=>{
 const s=game(2);put(s,'rockslide','rumbling-rockslide','hand','p2');
 for(let i=0;i<4;i++)put(s,`land${i}`,'basic-mountain','battlefield','p2');
 addMana(s,'p2',5,{colors:['R']});
 const start=s.events.length;
 const spell=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='rockslide'&&c.targets?.includes('magma'));
 act(s,spell);round(s);
 const prevented=s.events.slice(start).find(e=>e.type==='damage_prevented'&&e.cardId==='magma-pummeler'&&e.counterRemoval);
 assert.equal(prevented?.amount,4,'wszystkie obrażenia są zapobiegnięte');
 assert.equal(prevented.countersRemoved,2);
 assert.notEqual(s.objects.get('magma')?.zone,'battlefield');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId==='p2'||c.targetIds?.includes('p2'))));
 round(s);assert.equal(s.players.find(p=>p.id==='p2').life,18);
});

test('A29: Spin Out w odpowiedzi niszczy źródło, ale wcześniejszy trigger Magmy nadal zadaje obrażenia',()=>{
 const s=game(3);put(s,'kill','spin-out','hand','p2');addMana(s,'p2',3,{colors:['B']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('magma')));
 round(s);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId==='p2'||c.targetIds?.includes('p2'))));
 assert.equal(s.turn.priorityPlayerId,'p2');
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='kill'&&c.targets?.includes('magma')));
 round(s);assert.notEqual(s.objects.get('magma')?.zone,'battlefield');round(s);
 assert.equal(s.players.find(p=>p.id==='p2').life,18);
});
