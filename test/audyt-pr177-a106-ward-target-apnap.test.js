// Rzeczywisty Scion, Panic Spellbomb i Holdout Settlement: płatność opcjonalna.
// Pule do przygotowania Summonera są ustawione addMana; pozostałe akcje są rzeczywiste.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function turn(s,p){s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;}
function scene(active,payer){
 const s=createGameState({seed:17794,players:[{id:'p1'},{id:'p2'}]}),opp=payer==='p1'?'p2':'p1';turn(s,payer);put(s,'summoner','scion-summoner','hand',payer);addMana(s,payer,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);const token=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.ok(token);
 for(const p of ['p2','p1']){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<4;i++)put(s,`${p}-lib${i}`,'basic-forest','library',p);}
 put(s,'hold','holdout-settlement','battlefield',payer);put(s,'ally','nanoform-sentinel','battlefield',payer);put(s,'enemy','highland-game','battlefield',opp);put(s,'bomb','panic-spellbomb','battlefield',payer);
 turn(s,opp);put(s,'hellion','riftburst-hellion','hand',opp);addMana(s,opp,3,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.objectId==='hellion'&&c.faceDown));pass(s);pass(s);const hidden=[...s.objects.values()].find(o=>o.cardId==='riftburst-hellion'&&o.faceDown);assert.ok(hidden);
 turn(s,active);s.turn.priorityPlayerId=payer;act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='bomb'&&c.targets?.includes('enemy')));pass(s);pass(s);assert.ok(s.pendingOptionalPay);return {s,token,hidden,payer,active,other:active==='p1'?'p2':'p1'};
}


// Hellion rzeczywiście rzucony z disguise, pozostałe karty/akcje również rzeczywiste; tury, priorytet i pule to setup.
for(const active of ['p1','p2'])for(const payer of ['p1','p2'])test(`A106: możliwość wyboru Ward nie usuwa APNAP (aktywny ${active}, płaci ${payer})`,()=>{
 const {s,token,hidden}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));assert.equal(s.turn.priorityPlayerId,active);assert.equal(view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order').length,active===payer?3:2);for(let i=0;i<20;i++){const cmds=view(s).legalCommands;const order=cmds.filter(c=>c.type==='resolve_trigger_order');let choice=order.find(c=>c.cardId==='nanoform-sentinel')??order[0];if(!choice){const targets=cmds.filter(c=>c.type==='resolve_trigger_target');choice=s.pendingTriggerTargets[0]?.cardId==='nanoform-sentinel'?targets.find(c=>c.targetId===hidden.id):targets[0];}if(!choice)break;act(s,choice);if(s.pendingDeathTriggerBatch)assert.ok(!s.zones.stack.some(id=>s.objects.get(id)?.triggerEntry?.ability?.trigger?.event==='ward'),'Ward czeka do końca umieszczania partii');}const entries=s.zones.stack.map(id=>s.objects.get(id)).filter(o=>o.kind==='trigger');assert.equal(entries.length,6);assert.equal(entries.at(-1).triggerEntry?.ability?.trigger?.event,'ward','Ward z ogłoszenia celu leży nad całą partią APNAP');assert.deepEqual(entries.slice(0,-1).map(o=>o.controllerId),active===payer?[active,active,active,active==='p1'?'p2':'p1',active==='p1'?'p2':'p1']:[active,active,payer,payer,payer]);assert.ok(entries.find(o=>o.cardId==='nanoform-sentinel')?.triggerEntry.targets.includes(hidden.id));
});
for(const payer of ['p1','p2'])for(const pay of [false,true])test(`A106 kontrola: cel Nanoform w Ward, decyzja ${pay?'zapłać':'odmów'} (${payer})`,()=>{
 const active=payer==='p1'?'p2':'p1',{s,hidden}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===hidden.id));let entries=s.zones.stack.map(id=>s.objects.get(id));const sentinel=entries.find(o=>o.cardId==='nanoform-sentinel');assert.ok(sentinel);assert.equal(entries.at(-1).triggerEntry?.ability?.trigger?.event,'ward');addMana(s,payer,2,{colors:[]});pass(s);pass(s);assert.ok(s.pendingWardPay);act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===pay));assert.equal(s.zones.stack.includes(sentinel.id),pay,'odmowa kontruje, płatność zachowuje zdolność Sentinel');if(pay){pass(s);pass(s);assert.ok(!s.zones.stack.includes(sentinel.id));}
});
