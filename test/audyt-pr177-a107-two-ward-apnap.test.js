// Rzeczywisty Scion, Panic Spellbomb i Holdout Settlement: płatność opcjonalna.
// Pule do przygotowania Summonera są ustawione addMana; pozostałe akcje są rzeczywiste.
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
function turn(s,p){s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;}
function scene(active,payer){
 const s=createGameState({seed:17794,players:[{id:'p1'},{id:'p2'}]}),opp=payer==='p1'?'p2':'p1';turn(s,payer);put(s,'summoner','scion-summoner','hand',payer);addMana(s,payer,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);const token=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.ok(token);
 for(const p of ['p2','p1']){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<4;i++)put(s,`${p}-lib${i}`,'basic-forest','library',p);}
 put(s,'hold2','holdout-settlement','battlefield',payer);put(s,'ally2','nanoform-sentinel','battlefield',payer);put(s,'hold','holdout-settlement','battlefield',payer);put(s,'ally','nanoform-sentinel','battlefield',payer);put(s,'enemy','highland-game','battlefield',opp);put(s,'bomb','panic-spellbomb','battlefield',payer);
 turn(s,opp);put(s,'hellion','riftburst-hellion','hand',opp);addMana(s,opp,3,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.objectId==='hellion'&&c.faceDown));pass(s);pass(s);const hidden=[...s.objects.values()].find(o=>o.cardId==='riftburst-hellion'&&o.faceDown);assert.ok(hidden);
 turn(s,active);s.turn.priorityPlayerId=payer;act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='bomb'&&c.targets?.includes('enemy')));pass(s);pass(s);assert.ok(s.pendingOptionalPay);return {s,token,hidden,payer,active,other:active==='p1'?'p2':'p1'};
}



// Dwa realne Sentinel i Holdout, rzeczywisty zakryty Hellion; pule i tury pomocnicze.
for(const payer of ['p1','p2'])test(`A107: dwa triggery Ward z jednego checkpointu wymagają kolejności kontrolera (${payer})`,()=>{
 const active=payer,{s,token,hidden}=scene(active,payer),baseline=s.commands.length;let replayedBatch=false;const checkReplay=()=>{const replay=replayFromState(s),r=verifyReplay({...replay,commands:replay.commands.slice(baseline)},()=>scene(payer,payer).s,execute);assert.ok(r.deterministic);assert.ok(r.results.every(x=>x.ok));assert.equal(stateFingerprint(r.state),stateFingerprint(s));};act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));for(const [hold,ally] of [['hold','ally'],['hold2','ally2']])act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===hold&&c.abilityIndex===1&&c.tapCreatureId===ally));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));for(let i=0;i<20;i++){const cmds=view(s).legalCommands,orders=cmds.filter(c=>c.type==='resolve_trigger_order');if(orders.some(c=>c.trigger==='ward'))break;let choice=orders.find(c=>c.cardId==='nanoform-sentinel')??orders[0];if(!choice){const targets=cmds.filter(c=>c.type==='resolve_trigger_target');choice=s.pendingTriggerTargets[0]?.cardId==='nanoform-sentinel'?targets.find(c=>c.targetId===hidden.id):targets[0];}if(!choice)break;act(s,choice);const remaining=view(s).legalCommands.some(c=>(c.type==='resolve_trigger_order'&&c.trigger!=='ward')||c.type==='resolve_trigger_target');if(remaining){assert.ok(!s.zones.stack.some(id=>s.objects.get(id)?.triggerEntry?.ability?.trigger?.event==='ward'),'Ward czeka do końca umieszczania partii');if(!replayedBatch&&s.zones.stack.some(id=>s.objects.get(id)?.cardId==='nanoform-sentinel')){checkReplay();replayedBatch=true;}}}assert.ok(replayedBatch,'replay także w trakcie umieszczania triggerów');const wards=s.zones.stack.map(id=>s.objects.get(id)).filter(o=>o.triggerEntry?.ability?.trigger?.event==='ward');assert.equal(wards.length,2);assert.equal(new Set(wards.map(o=>o.triggerEntry.extra.wardPay.targetingStackId)).size,2);const choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order'&&c.trigger==='ward');assert.equal(choices.length,2,'kontroler obu Ward wybiera ich wzajemną kolejność');assert.equal(s.turn.priorityPlayerId,payer==='p1'?'p2':'p1');const first=wards[0],other=wards[1],firstTarget=first.triggerEntry.extra.wardPay.targetingStackId,otherTarget=other.triggerEntry.extra.wardPay.targetingStackId;act(s,choices.find(c=>c.stackEntryId===first.id));pass(s);pass(s);assert.equal(s.pendingWardPay?.targetingStackId,firstTarget);act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay));pass(s);pass(s);if(s.pendingWardPay){assert.equal(s.pendingWardPay.targetingStackId,otherTarget);assert.ok(!view(s).legalCommands.some(c=>c.type==='resolve_ward_pay_choice'&&c.pay),'drugi Ward nie jest opłacalny');act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&!c.pay));}assert.ok(s.zones.stack.includes(firstTarget));assert.ok(!s.zones.stack.includes(otherTarget),'przy manie tylko na jeden Ward wybór kolejności wpływa na zachowany trigger');checkReplay();
});
