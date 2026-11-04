// Oracle: Anticipate "Look at the top three ... Put one of them into your
// hand"; Coatl "Whenever you draw a card, put a +1/+1 counter on this
// creature." https://gatherer.wizards.com/M19/en-us/44/anticipate
// CR 121.1: "A player draws a card by putting the top card of their library
// into their hand" as a draw action/instruction; looking and putting is not
// an instruction to draw. CR 401.2: library is a face-down hidden zone.
// https://github.com/nwgarne/mtg-data/blob/main/rules/cr-raw.txt
// 2026-09-25 SHA-256 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {describeGameEvent} from '../src/table/session.js';
const registry=createCardRegistry();
const library=['basic-forest','highland-game','shock','basic-island'];
function put(s,id,cardId,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry});
 addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function scene(n,player='p1',spell='anticipate'){
 const s=createGameState({seed:17737,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main',player);s.turn.activePlayerId=s.turn.priorityPlayerId=player;
 put(s,'spell',spell,'hand',player);put(s,'coatl','lorescale-coatl','battlefield',player);
 library.slice(0,n).forEach((id,i)=>put(s,`lib${i}`,id,'library',player));
 addMana(s,player,6,{colors:['U']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,cmd){assert.ok(cmd,'legalna komenda');const r=execute(s,cmd);assert.ok(r.ok,JSON.stringify(r));return r;}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function cast(s,target=null){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spell'&&(!target||c.targets?.includes(target))));}
function resolve(s){for(let i=0;i<12&&s.zones.stack.length&&!s.pendingLookTopN;i++)pass(s);}
function byInstance(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
for(let n=0;n<=4;n++)test(`A37: Anticipate przy ${n} kartach biblioteki nie dobiera Coatl`,()=>{
 const s=scene(n);cast(s);resolve(s);
 if(n>=2){
  assert.ok(s.pendingLookTopN);const choices=view(s).legalCommands.filter(c=>c.type==='resolve_look_top_choice');
  assert.equal(choices.length,Math.min(n,3));
  const visible=playerView(s,'p1').pendingLookTopN.cards;assert.deepEqual(visible.map(o=>o.id),Array.from({length:Math.min(n,3)},(_,i)=>`lib${i}`));
  assert.equal(playerView(s,'p2').pendingLookTopN.cards,null);
  assert.ok(!playerView(s,'p2').legalCommands.some(c=>c.type==='resolve_look_top_choice'));
  const [pick,...rest]=s.pendingLookTopN.objectIds;
  act(s,{type:'resolve_look_top_choice',playerId:'p1',cardId:pick,bottomOrder:rest.reverse()});
  assert.equal(byInstance(s,pick).zone,'hand');
  assert.deepEqual(s.zones.library.slice(-(n===4?3:n-1)),n===4?['lib3','lib2','lib1']:(n===3?['lib2','lib1']:['lib1']));
 } else {assert.equal(s.pendingLookTopN,null);if(n===1)assert.equal(byInstance(s,'lib0').zone,'hand');}
 assert.equal(s.objects.get('coatl').counters?.['+1/+1']??0,0);
 assert.ok(!s.events.some(e=>e.type==='card_drawn'));assert.equal(s.status,'active');
});
test('A37: prawdziwe Inspiration dobiera 2 karty i obowiązkowo wyzwala Coatl dwa razy',()=>{
 const s=scene(4,'p1','inspiration');cast(s,'p1');resolve(s);assert.equal(s.zones.stack.length,0);
 assert.equal(s.events.filter(e=>e.type==='card_drawn').length,2);assert.equal(s.objects.get('coatl').counters?.['+1/+1'],2);
 assert.ok(!s.pendingOptionalTrigger);
});
test('A37: Anticipate przeciwnika nie ujawnia nazw kart w dzienniku gracza',()=>{
 const s=scene(4,'p2');cast(s);resolve(s);const pending=s.pendingLookTopN;
 assert.equal(playerView(s,'p1').pendingLookTopN.cards,null);
 act(s,{type:'resolve_look_top_choice',playerId:'p2',cardId:pending.objectIds[0],bottomOrder:pending.objectIds.slice(1).reverse()});
 const helpers={nameOf:id=>registry.get(id)?.name??id,nameOfObject:()=>'?'};
 const lines=s.events.filter(e=>['look_top_started','look_top_resolved','object_moved'].includes(e.type))
  .map(e=>describeGameEvent(e,helpers)).filter(Boolean).join('\n');
 for(const id of library)assert.ok(!lines.includes(registry.get(id).name),lines);
});

test('A37: nielegalna kolejność spodu Anticipate jest atomowo odrzucana',()=>{
 const s=scene(4);cast(s);resolve(s);const [pick,...rest]=s.pendingLookTopN.objectIds;
 const before=structuredClone(s);const bad=execute(s,{type:'resolve_look_top_choice',playerId:'p1',cardId:pick,bottomOrder:[rest[0],rest[0]]});
 assert.equal(bad.ok,false);assert.equal(bad.events[0].reason,'illegal_look_top_bottom_order');assert.deepEqual(s,before);
 act(s,{type:'resolve_look_top_choice',playerId:'p1',cardId:pick,bottomOrder:rest});
 assert.deepEqual(s.zones.library,['lib3','lib1','lib2']);
});

test('A37: opis zdarzeń prywatnego Anticipate pokazuje nazwy właścicielowi, ale nie obserwatorowi',()=>{
 const s=scene(3);cast(s);resolve(s);const p=s.pendingLookTopN;
 act(s,{type:'resolve_look_top_choice',playerId:'p1',cardId:p.objectIds[0],bottomOrder:p.objectIds.slice(1)});
 const helpers={nameOf:id=>registry.get(id)?.name??id,nameOfObject:()=>'?'};
 const events=s.events.filter(e=>['look_top_started','look_top_resolved'].includes(e.type));
 const own=events.map(e=>describeGameEvent(e,helpers)).join('\n');
 const hidden=events.map(e=>describeGameEvent(e,helpers,undefined,{fogOfWar:true})).join('\n');
 assert.ok(own.includes('Highland Game'),own);assert.ok(own.includes('Forest'),own);
 for(const id of library)assert.ok(!hidden.includes(registry.get(id).name),hidden);
});
