// CR 400.7 (litera j): "If the cost of a spell or ability causes an object to move to
// a public zone, that spell or ability's effects can find that object."
// CR 603.7 (litera c): a delayed trigger cannot affect an object that left the zone it
// is expected to be in; even if it returns, it is a new object (CR 400.7).
// CR 122.1h: a finality counter replaces a move to graveyard with exile.
// Rules: https://github.com/nwgarne/mtg-data/blob/main/rules/cr-raw.txt,
// 2026-09-25, SHA-256 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
const registry=createCardRegistry();
function put(s,id,cardId,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry});
 addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function scene({reanimate=true,army=0}={}){
 const s=createGameState({seed:17736,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'reaver','plague-reaver',reanimate?'graveyard':'battlefield');
 put(s,'h1','highland-game','hand');put(s,'h2','highland-game','hand');
 for(let i=0;i<army;i++)put(s,`foe${i}`,i<2?'plague-reaver':'scorpion-sentinel','battlefield','p2');
 if(reanimate){put(s,'zora','zoraline','hand');addMana(s,'p1',5,{colors:['W','B']});}
 return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,cmd){assert.ok(cmd,'brak legalnej komendy');const r=execute(s,cmd);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function resurrect(s){
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='zora'));
 for(let i=0;i<12&&!s.pendingOptionalPay;i++)pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay===true));
 const target=view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId==='reaver'||c.targetIds?.includes('reaver')));
 act(s,target?.targetIds?{...target,targetId:'reaver'}:target);pass(s);pass(s);
 const result=[...s.objects.values()].find(o=>o.instanceId==='i-reaver'&&o.zone==='battlefield');
 assert.equal(result?.counters?.finality,1);return result.id;
}
function activate(s,id){
 const cmd=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===id&&c.targets?.includes('p2'));
 act(s,cmd);if(s.pendingDiscardChoice)act(s,{type:'resolve_discard_choice',playerId:'p1',cardIds:['h1','h2']});
 assert.equal(s.pendingDiscardChoice,null);
}
function nextUpkeep(s,{resolve=true}={}){
 // Jak test batch16: skok fixture do ostatniego kroku, reszta komendami tury.
 s.turn={...s.turn,number:10,activePlayerId:'p1',priorityPlayerId:'p1',phase:'ending',step:'end',stepIndex:9,passes:0};
 for(let i=0;i<10&&!(s.turn.activePlayerId==='p2'&&s.turn.step==='upkeep');i++)pass(s);
 assert.equal(s.turn.activePlayerId,'p2');assert.equal(s.turn.step,'upkeep');
 if(resolve)for(let i=0;i<8&&s.zones.stack.length;i++)pass(s);
}
function reaver(s){return [...s.objects.values()].find(o=>o.instanceId==='i-reaver');}
function choose(s){return createHeuristicBot({seed:2026}).chooseCommand(view(s));}
for(const finality of [false,true]) test(`A36: Reaver ${finality?'z finality po Zoraline wraca z exile':'bez finality wraca z grobu'} w upkeep przeciwnika`,()=>{
 const s=scene({reanimate:finality});const id=finality?resurrect(s):'reaver';activate(s,id);
 assert.equal(reaver(s).zone,finality?'exile':'graveyard');pass(s);pass(s);
 const pending=JSON.parse(stateFingerprint(s)).delayedTriggers.find(t=>t.type==='reanimate_under_target_control');
 assert.equal(pending?.expectedZone,finality?'exile':'graveyard');assert.equal(pending?.controllerId,'p1');nextUpkeep(s);
 const returned=reaver(s);assert.equal(returned.zone,'battlefield');assert.equal(returned.controllerId,'p2');assert.equal(returned.counters?.finality??0,0);
 assert.ok(s.events.some(e=>e.type==='object_moved'&&e.delayed&&e.object?.instanceId==='i-reaver'&&e.fromZone===(finality?'exile':'graveyard')));
});
test('A36: karta poświęcona do grobu i przetasowana Memory’s Journey nie wraca z biblioteki',()=>{
 const s=scene({reanimate:false});put(s,'journey','memory-s-journey','hand');addMana(s,'p1',2,{colors:['U']});
 activate(s,'reaver');pass(s);pass(s);const graveId=reaver(s).id;
 const opt=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='journey'&&c.targets?.includes(graveId));
 act(s,opt);pass(s);pass(s);assert.equal(reaver(s).zone,'library');nextUpkeep(s);assert.equal(reaver(s).zone,'library');
});
for(const n of [2,3]) test(`A36: rzeczywista armia o mocy ${n===2?12:13} a próg darowania`,()=>{
 const s=scene({reanimate:true,army:n});const id=resurrect(s);const choice=choose(s);
 if(n===2)assert.equal(choice.type,'pass_priority',JSON.stringify(choice));
 else {
  assert.equal(choice.type,'activate_ability',JSON.stringify(choice));assert.equal(choice.objectId,id);
  act(s,choice);assert.equal(reaver(s).zone,'exile');pass(s);pass(s);nextUpkeep(s);
  assert.equal(reaver(s).zone,'battlefield');assert.equal(reaver(s).controllerId,'p2');
 }
});

test('A36: Reaver z finality po powrocie powoduje poświęcenie innych stworów nowego kontrolera',()=>{
 const s=scene();put(s,'victim1','leafcrown-dryad','battlefield','p2');put(s,'victim2','scorpion-sentinel','battlefield','p2');
 const id=resurrect(s);activate(s,id);pass(s);pass(s);nextUpkeep(s);
 const returned=reaver(s);assert.equal(returned.controllerId,'p2');
 s.turn=jumpToStep(s.turn,'main2','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 pass(s);pass(s);for(let i=0;i<10&&s.zones.stack.length;i++)pass(s);
 assert.notEqual(s.objects.get('victim1')?.zone,'battlefield');assert.notEqual(s.objects.get('victim2')?.zone,'battlefield');
 assert.equal(reaver(s).zone,'battlefield');assert.equal(reaver(s).controllerId,'p2');
});

test('A36: odpowiedź Memory’s Journey zanim zdolność się rozstrzygnie nie odnajduje nowego obiektu',()=>{
 const s=scene({reanimate:false});put(s,'journey','memory-s-journey','hand');addMana(s,'p1',2,{colors:['U']});
 activate(s,'reaver');const graveId=reaver(s).id;
 const opt=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='journey'&&c.targets?.includes(graveId));
 act(s,opt);pass(s);pass(s);assert.equal(reaver(s).zone,'library');pass(s);pass(s);nextUpkeep(s);assert.equal(reaver(s).zone,'library');
});


test('A36: kontroler aktywacji przejętego Reavera kontroluje opóźniony trigger, nie jego właściciel',()=>{
 const s=createGameState({seed:17736,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'reaver','plague-reaver','battlefield','p2');put(s,'steal','awaken-the-sleeper','hand');
 put(s,'h1','highland-game','hand');put(s,'h2','highland-game','hand');addMana(s,'p1',4,{colors:['R']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='steal'&&c.targets?.includes('reaver')));pass(s);pass(s);
 assert.equal(s.objects.get('reaver').controllerId,'p1');activate(s,'reaver');pass(s);pass(s);
 assert.equal(reaver(s).ownerId,'p2');assert.equal(reaver(s).zone,'graveyard');nextUpkeep(s,{resolve:false});
 const trigger=s.objects.get(s.zones.stack.at(-1));assert.ok(trigger?.triggerEntry);assert.equal(trigger.controllerId,'p1');
 pass(s);pass(s);assert.equal(reaver(s).zone,'battlefield');assert.equal(reaver(s).controllerId,'p2');
});
