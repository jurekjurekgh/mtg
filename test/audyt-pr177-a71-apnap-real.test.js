// CR 603.3b: simultaneous triggered abilities go on the stack in APNAP order;
// each player chooses the order of the triggers they control.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
import {commandLabel,choiceRequestGroupKey} from '../src/table/render.js';
import {commandOptionKey,hasMeaningfulDecisionOf} from '../src/table/session.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(active,{extraActiveOccult=false,reverse=false,victimCard='goblin-picker'}={}){
 const other=active==='p1'?'p2':'p1';const s=createGameState({seed:17771,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',active);s.turn.activePlayerId=s.turn.priorityPlayerId=active;
 for(const p of (reverse?[other,active]:[active,other])){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);if(p===active&&extraActiveOccult)put(s,`${p}-extra`,'selhoff-occultist','battlefield',p);for(let i=0;i<3;i++)put(s,`${p}-lib${i}`,'basic-island','library',p);}
 put(s,'victim',victimCard,'battlefield',other);put(s,'shock','shock','hand',active);addMana(s,active,1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));pass(s);pass(s);
 return {s,active,other};
}
for(const active of ['p1','p2']) test(`A71: triggery obu kontrolerów nie przeplatają się (aktywny ${active})`,()=>{
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

test('A71: aktywny wybiera kolejność swoich różnych triggerów przed decyzjami przeciwnika',()=>{
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

test('A71: APNAP pozwala nieaktywnemu dobrać wierzch przed zmieleniem przez aktywnego',()=>{
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

for(const firstActive of ['murder-of-crows','selhoff-occultist'])for(const firstOther of ['murder-of-crows','selhoff-occultist'])test(`A74: oba wybory (${firstActive}, ${firstOther}) przed priorytetem`,()=>{
 const {s,active,other}=scene('p1');let n=0;const chosen=[];
 while(n++<16){const cmds=view(s).legalCommands;const order=cmds.filter(c=>c.type==='resolve_trigger_order');
  if(order.length){const current=s.turn.priorityPlayerId;assert.ok(current===active||current===other);const want=current===active?firstActive:firstOther;chosen.push(current);act(s,order.find(c=>c.cardId===want));continue;}
  const target=cmds.find(c=>c.type==='resolve_trigger_target'&&c.targetId===(s.turn.priorityPlayerId===active?other:active));if(target){act(s,target);continue;}break;
 }
 assert.deepEqual(chosen,[active,other]);assert.equal(s.turn.priorityPlayerId,active);const stack=s.zones.stack.map(id=>s.objects.get(id));
 assert.deepEqual(stack.map(o=>o.controllerId),[active,active,other,other]);assert.equal(stack[1].cardId,firstActive);assert.equal(stack[3].cardId,firstOther);
});

test('A74: kolejność wymaga decyzji aktywnego, inne komendy są odrzucane atomowo',()=>{
 const {s}=scene('p1');const choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(choices.length,2);const before=stateFingerprint(s);
 assert.equal(execute(s,{...choices[0],playerId:'p2'}).ok,false);assert.equal(execute(s,{...choices[0],stackEntryId:'nieistniejacy'}).ok,false);assert.equal(execute(s,{type:'pass_priority',playerId:'p1'}).ok,false);assert.equal(stateFingerprint(s),before);
});

test('A74: bot wykonuje legalne decyzje, replay zachowuje odcisk',()=>{
 const {s}=scene('p1');const start=stateFingerprint(s);const bot=createHeuristicBot({seed:177,randomness:0,lookahead:0,registry:reg});let count=0;
 while(count<12){const v=view(s);if(!v.legalCommands.some(c=>c.type==='resolve_trigger_order'||c.type==='resolve_trigger_target'))break;
  const cmd=bot.chooseCommand(v);assert.ok(['resolve_trigger_order','resolve_trigger_target'].includes(cmd.type),JSON.stringify(cmd));act(s,cmd);count++;
 }
 assert.equal(count,4);assert.notEqual(stateFingerprint(s),start);const replay=replayFromState(s);const verified=verifyReplay({...replay,commands:replay.commands.slice(-count)},()=>scene('p1').s,execute);assert.ok(verified.deterministic);assert.ok(verified.results.every(r=>r.ok));assert.equal(stateFingerprint(verified.state),stateFingerprint(s));
});

test('A74: dwa celowane i jeden niecelowany trigger aktywnego, cele przed decyzją przeciwnika',()=>{
 const {s}=scene('p1',{extraActiveOccult:true,reverse:true});let opts=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(opts.length,3);
 const top=opts.find(c=>c.cardId==='selhoff-occultist');act(s,top);opts=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(opts.length,2);act(s,opts.find(c=>c.cardId==='murder-of-crows'));
 assert.equal(s.turn.priorityPlayerId,'p1');act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p1'));
 assert.equal(s.turn.priorityPlayerId,'p1');act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p2'));
 assert.equal(s.turn.priorityPlayerId,'p2');opts=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(opts.length,2);act(s,opts.find(c=>c.cardId==='murder-of-crows'));
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p1'));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.deepEqual(stack.map(o=>o.controllerId),['p1','p1','p1','p2','p2']);assert.equal(stack[2].cardId,'selhoff-occultist');assert.deepEqual(stack[2].triggerEntry.targets,['p2']);assert.equal(stack[1].cardId,'murder-of-crows');assert.deepEqual(stack[0].triggerEntry.targets,['p1']);assert.equal(s.turn.priorityPlayerId,'p1');
});

test('A74: odwrócona kolejność wstawienia źródeł nie zmienia APNAP',()=>{
 const {s}=scene('p1',{reverse:true});for(let i=0;i<12;i++){const cmds=view(s).legalCommands;const order=cmds.find(c=>c.type==='resolve_trigger_order');const target=cmds.find(c=>c.type==='resolve_trigger_target');if(order)act(s,order);else if(target)act(s,target);else break;}
 assert.deepEqual(s.zones.stack.map(id=>s.objects.get(id).controllerId),['p1','p1','p2','p2']);
});

test('A74: same celowane triggery śmierci — aktywny wybiera cel pierwszy, stos APNAP',()=>{
 const s=createGameState({seed:17774,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'p2-occult','selhoff-occultist','battlefield','p2');put(s,'p1-occult','selhoff-occultist','battlefield','p1');put(s,'victim','goblin-picker','battlefield','p2');put(s,'shock','shock','hand','p1');
 for(const p of ['p1','p2'])for(let i=0;i<3;i++)put(s,`${p}-lib${i}`,'basic-island','library',p);addMana(s,'p1',1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));pass(s);pass(s);
 assert.equal(s.turn.priorityPlayerId,'p1');act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p2'));assert.equal(s.turn.priorityPlayerId,'p2');act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p1'));
 assert.deepEqual(s.zones.stack.map(id=>s.objects.get(id).controllerId),['p1','p2']);assert.equal(s.turn.priorityPlayerId,'p1');
});

test('A74: klon decyzji APNAP nie mutuje oryginału i daje identyczną kontynuację',()=>{
 const {s}=scene('p1');const clone=structuredClone(s),before=stateFingerprint(s);const choice=view(clone).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='selhoff-occultist');
 act(clone,choice);assert.equal(stateFingerprint(s),before);assert.notEqual(stateFingerprint(clone),before);act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='selhoff-occultist'));
 assert.equal(stateFingerprint(s),stateFingerprint(clone));
});

test('A74: jeden kontroler dwóch różnych triggerów wybiera kolejność i cel',()=>{
 const s=createGameState({seed:17775,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'crow','murder-of-crows','battlefield','p1');put(s,'occult','selhoff-occultist','battlefield','p1');put(s,'victim','goblin-picker','battlefield','p2');put(s,'shock','shock','hand','p1');addMana(s,'p1',1,{colors:['R']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));pass(s);pass(s);
 const orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(orders.length,2);act(s,orders.find(c=>c.cardId==='murder-of-crows'));
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p2'));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.deepEqual(stack.map(o=>o.cardId),['selhoff-occultist','murder-of-crows']);assert.deepEqual(stack[0].triggerEntry.targets,['p2']);assert.equal(s.turn.priorityPlayerId,'p1');
});

test('A74: wybór celowanego triggera ma nazwę, unikalny klucz i zatrzymuje autopass',()=>{
 const {s}=scene('p1');const v=view(s),choices=v.legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(choices.length,2);assert.ok(hasMeaningfulDecisionOf(v));
 assert.equal(new Set(choices.map(choiceRequestGroupKey)).size,1);assert.equal(new Set(choices.map(commandOptionKey)).size,2);
 const session={nameOf:id=>reg.get(id)?.name??id};assert.match(commandLabel(choices.find(c=>c.cardId==='selhoff-occultist'),session,v),/Selhoff Occultist/);
});

test('A74: cztery niecelowane Crows, każdy kontroler wybiera kolejność przed priorytetem',()=>{
 const s=createGameState({seed:17776,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 for(const p of ['p2','p1'])for(let i=0;i<2;i++)put(s,`${p}-crow${i}`,'murder-of-crows','battlefield',p);
 put(s,'victim','goblin-picker','battlefield','p2');put(s,'shock','shock','hand','p1');addMana(s,'p1',1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));pass(s);pass(s);
 assert.equal(s.turn.priorityPlayerId,'p1');const first=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(first.length,2);act(s,first[1]);
 assert.equal(s.turn.priorityPlayerId,'p2');const second=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(second.length,2);act(s,second[1]);
 assert.deepEqual(s.zones.stack.map(id=>s.objects.get(id).controllerId),['p1','p1','p2','p2']);assert.equal(s.zones.stack[1],first[1].stackEntryId);assert.equal(s.zones.stack[3],second[1].stackEntryId);assert.equal(s.turn.priorityPlayerId,'p1');
});

test('A74: poświęcenie w koszcie Village Rites też ogłasza triggery APNAP przed priorytetem',()=>{
 const s=createGameState({seed:17777,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 for(const p of ['p1','p2']){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<3;i++)put(s,`${p}-lib${i}`,'basic-island','library',p);}
 put(s,'victim','goblin-picker','battlefield','p1');put(s,'rites','village-rites','hand','p1');addMana(s,'p1',1,{colors:['B']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='rites'&&c.sacrificeTargetId==='victim'));
 assert.equal(s.turn.priorityPlayerId,'p1');const orders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(orders.length,2);act(s,orders.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p2'));
 const second=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(s.turn.priorityPlayerId,'p2');act(s,second.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p1'));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.equal(stack[0].cardId,'village-rites');assert.deepEqual(stack.slice(1).map(o=>o.controllerId),['p1','p1','p2','p2']);assert.equal(s.turn.priorityPlayerId,'p1');
});

test('A74: śmierć Highland Game łączy jego dies z innymi death triggerami APNAP',()=>{
 const {s}=scene('p1',{victimCard:'highland-game'});let chosen=0;
 for(let i=0;i<16;i++){const cmds=view(s).legalCommands;const order=cmds.find(c=>c.type==='resolve_trigger_order');const target=cmds.find(c=>c.type==='resolve_trigger_target');if(order){chosen++;act(s,order);}else if(target)act(s,target);else break;}
 assert.equal(chosen,3,'aktywny ma 2 triggery, nieaktywny ma 3');const stack=s.zones.stack.map(id=>s.objects.get(id));assert.deepEqual(stack.map(o=>o.controllerId),['p1','p1','p2','p2','p2']);assert.ok(stack.some(o=>o.cardId==='highland-game'));assert.equal(s.turn.priorityPlayerId,'p1');
});

test('A74: Servant of the Scale rzeczywiście umiera — własny cel stwora wybierany w APNAP',()=>{
 const s=createGameState({seed:17778,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'servant','servant-of-the-scale','hand','p2');addMana(s,'p2',1,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='servant'));pass(s);pass(s);
 const servant=[...s.objects.values()].find(o=>o.cardId==='servant-of-the-scale'&&o.zone==='battlefield');assert.equal(servant.counters['+1/+1'],1);s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 for(const p of ['p1','p2']){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);}
 put(s,'shock','shock','hand','p1');addMana(s,'p1',1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes(servant.id)));pass(s);pass(s);
 assert.equal(s.turn.priorityPlayerId,'p1');act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p2'));
 assert.equal(s.turn.priorityPlayerId,'p2');act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='servant-of-the-scale'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='murder-of-crows'));
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p1'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='p2-crow'));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.deepEqual(stack.map(o=>o.controllerId),['p1','p1','p2','p2','p2']);assert.equal(stack.at(-1).cardId,'servant-of-the-scale');assert.equal(s.turn.priorityPlayerId,'p1');pass(s);pass(s);assert.equal(s.objects.get('p2-crow').counters['+1/+1'],1);
});

// A75: wcześniejszy RED także na bazie i #177, obecnie zwykły test.
test('A75: Polluted Dead celuje w ląd; APNAP zaczyna aktywny gracz',()=>{
 const s=createGameState({seed:17779,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 for(const p of ['p1','p2']){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);put(s,`${p}-land`,'basic-mountain','battlefield',p);}
 put(s,'dead','polluted-dead','battlefield','p2');put(s,'fiery','fiery-fall','hand','p1');addMana(s,'p1',6,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='fiery'&&c.targets?.includes('dead')));pass(s);pass(s);
 assert.equal(s.turn.priorityPlayerId,'p1');assert.ok(view(s).legalCommands.some(c=>c.type==='resolve_trigger_order'));
});
