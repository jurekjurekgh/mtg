// Zoraline i Scion prawdziwe; pula oraz przypisanie tury/priorytetu są jawnym setupem.
// CR 603.12: „When you do” reaguje na zapłatę, nie na wyzwolenie innej zdolności.
// CR 603.3b: należy więc do pierwszej partii APNAP, z wyborem kolejności kontrolera.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(payer,active){
 const s=createGameState({seed:17799,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main1',payer);s.turn.activePlayerId=s.turn.priorityPlayerId=payer;
 put(s,'summoner','scion-summoner','hand',payer);addMana(s,payer,3,{colors:['G']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));
 for(let i=0;i<4;i++)pass(s);
 const token=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.ok(token);
 for(const p of ['p1','p2']){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);}
 put(s,'grave','highland-game','graveyard',payer);put(s,'zora','zoraline','hand',payer);addMana(s,payer,5,{colors:['W','B','U']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='zora'));pass(s);pass(s);
 s.turn.activePlayerId=active;for(let i=0;i<2;i++)pass(s);
 assert.ok(s.pendingOptionalPay);return {s,token,active};
}
for(const active of ['p1','p2'])for(const payer of ['p1','p2'])for(const zoraFirst of [false,true])test(`A101: refleks Zoraline w pierwszej partii APNAP (aktywny ${active}, płaci ${payer}, refleks pierwszy=${zoraFirst})`,()=>{
 const {s,token}=scene(payer,active),baseline=s.commands.length;
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));
 assert.equal(s.turn.priorityPlayerId,active,'najpierw kolejność gracza aktywnego');
 const initialOrders=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');
 assert.equal(initialOrders.length,active===payer?3:2,'refleks jest jedną ze zdolności swojego kontrolera');
 assert.equal(initialOrders.some(c=>c.cardId==='zoraline'),active===payer);
 let sawZoraChoice=false;
 for(let i=0;i<20;i++){
  const cmds=view(s).legalCommands,orders=cmds.filter(c=>c.type==='resolve_trigger_order');
  let choice;
  if(orders.length){
   const owner=orders[0].playerId,zora=orders.find(c=>c.cardId==='zoraline');
   choice=owner===payer&&zora?(zoraFirst?zora:orders.find(c=>c.cardId!=='zoraline')??zora):orders[0];
   sawZoraChoice ||= orders.some(c=>c.cardId==='zoraline');
  }else{
   const targets=cmds.filter(c=>c.type==='resolve_trigger_target');
   choice=s.pendingTriggerTargets[0]?.cardId==='zoraline'?targets.find(c=>c.targetId==='grave'):targets[0];
  }
  if(!choice)break;
  act(s,choice);
 }
 assert.ok(sawZoraChoice,'kontroler wybiera miejsce refleksu w swojej grupie');
 const triggers=s.zones.stack.map(id=>s.objects.get(id)).filter(o=>o.kind==='trigger');
 assert.equal(triggers.length,5);
 assert.deepEqual(triggers.map(o=>o.controllerId),active===payer?[payer,payer,payer,'p2'===payer?'p1':'p2','p2'===payer?'p1':'p2']:[active,active,payer,payer,payer],'APNAP między graczami');
 const own=triggers.filter(o=>o.controllerId===payer);
 assert.equal(own[zoraFirst?own.length-1:0].cardId,'zoraline','wybrana kolejność obowiązuje także względem własnych triggerów');
 assert.equal(triggers.filter(o=>o.cardId==='zoraline').length,1);
 assert.ok(triggers.find(o=>o.cardId==='zoraline').triggerEntry.targets.includes('grave'));
 const replay=replayFromState(s),r=verifyReplay({...replay,commands:replay.commands.slice(baseline)},()=>scene(payer,active).s,execute);
 assert.ok(r.deterministic);assert.ok(r.results.every(x=>x.ok));assert.equal(stateFingerprint(r.state),stateFingerprint(s));
});
