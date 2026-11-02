// CR 603.3b: simultaneous triggered abilities go on the stack in APNAP order;
// each player chooses the order of the triggers they control.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(active){
 const other=active==='p1'?'p2':'p1';const s=createGameState({seed:17771,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',active);s.turn.activePlayerId=s.turn.priorityPlayerId=active;
 for(const p of [active,other]){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<3;i++)put(s,`${p}-lib${i}`,'basic-island','library',p);}
 put(s,'victim','goblin-picker','battlefield',other);put(s,'shock','shock','hand',active);addMana(s,active,1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));pass(s);pass(s);
 return {s,active,other};
}
// TODO A71: otwarty, odtworzony także w bazie #177 — patrz raport.
for(const active of ['p1','p2']) test.todo(`A71: triggery obu kontrolerów nie przeplatają się (aktywny ${active})`,()=>{
 const {s,other}=scene(active);
 // Complete any triggered ability target decisions. A player-order interface may
 // additionally interleave trigger-order choices with target choices.
 for(let i=0;i<12;i++){
  const commands=view(s).legalCommands;const target=commands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===other)??commands.find(c=>c.type==='resolve_trigger_target');
  const order=commands.find(c=>c.type==='resolve_trigger_order');if(target)act(s,target);else if(order)act(s,order);else break;
 }
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.equal(stack.length,4);
 assert.deepEqual(stack.map(o=>o.controllerId),[active,active,other,other],`APNAP: ${stack.map(o=>`${o.cardId}:${o.controllerId}`)}`);
});

test.todo('A71: aktywny wybiera kolejność swoich różnych triggerów przed decyzjami przeciwnika',()=>{
 const {s,active,other}=scene('p1');let commands=view(s).legalCommands;
 // Implementacja może pytać o cel przed kolejnością, ale nie wolno jej
 // przejść do decyzji drugiego gracza, zanim aktywny określi swój porządek.
 if(!commands.some(c=>c.type==='resolve_trigger_order')){
  assert.equal(s.turn.priorityPlayerId,active);
  act(s,commands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===other));
  commands=view(s).legalCommands;
 }
 assert.equal(s.turn.priorityPlayerId,active);
 assert.ok(commands.some(c=>c.type==='resolve_trigger_order'),`brak wyboru kolejności: ${JSON.stringify(commands)}`);
});

for(const active of ['p1','p2']) test(`A71 kontrola: po jednym Murder of Crows na gracza, aktywny ${active}`,()=>{
 const other=active==='p1'?'p2':'p1';const s=createGameState({seed:17772,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',active);s.turn.activePlayerId=s.turn.priorityPlayerId=active;
 for(const p of [active,other]){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-lib`,'basic-island','library',p);}
 put(s,'victim','goblin-picker','battlefield',other);put(s,'shock','shock','hand',active);addMana(s,active,1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));pass(s);pass(s);
 assert.deepEqual(s.zones.stack.map(id=>s.objects.get(id).controllerId),[active,other]);
 pass(s);pass(s);assert.equal(s.pendingOptionalTrigger?.playerId,other);
 act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));pass(s);pass(s);assert.equal(s.pendingOptionalTrigger?.playerId,active);
});

test.todo('A71: APNAP pozwala nieaktywnemu dobrać wierzch przed zmieleniem przez aktywnego',()=>{
 const {s}=scene('p1');
 for(let i=0;i<12;i++){
  const cmds=view(s).legalCommands;const order=cmds.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='murder-of-crows')??cmds.find(c=>c.type==='resolve_trigger_order');
  const target=cmds.find(c=>c.type==='resolve_trigger_target'&&c.targetId===(s.turn.priorityPlayerId==='p1'?'p2':'p1'));
  if(order)act(s,order);else if(target)act(s,target);else break;
 }
 for(let i=0;i<12&&!s.pendingOptionalTrigger;i++)pass(s);
 assert.equal(s.pendingOptionalTrigger?.playerId,'p2');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_trigger_choice'&&c.fire));
 const drawn=s.events.find(e=>e.type==='card_drawn'&&e.playerId==='p2');assert.equal(drawn?.fromId,'p2-lib0','nieaktywny dobiera zanim aktywny Selhoff zmieli tę kartę');
});
