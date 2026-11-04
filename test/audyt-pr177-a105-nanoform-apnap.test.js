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
 turn(s,active);s.turn.priorityPlayerId=payer;act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='bomb'&&c.targets?.includes('enemy')));pass(s);pass(s);assert.ok(s.pendingOptionalPay);return {s,token,payer,active,other:active==='p1'?'p2':'p1'};
}

// Sentinel, Scion, Holdout i Spellbomb są rzeczywiste; pula/tura/priorytet to setup.
for(const payer of ['p1','p2'])test(`A105: cel Nanoform Sentinel czeka do końca dopłaty (${payer})`,()=>{
 const active=payer==='p1'?'p2':'p1',{s,token}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));const before=[...s.zones.stack];act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));assert.ok(s.pendingOptionalPay);assert.ok(s.triggerFiredThisTurn['ally:0'],'limit raz na turę zapamiętany w chwili tapnięcia');assert.ok(!s.pendingTriggerTargets.some(t=>t.cardId==='nanoform-sentinel'),'przed końcem dopłaty nie wybieramy celu');assert.deepEqual(s.zones.stack,before);
});
for(const payer of ['p1','p2'])test(`A105: cel Nanoform Sentinel i śmierć Sciona ogłaszane APNAP (${payer})`,()=>{
 const active=payer==='p1'?'p2':'p1',{s,token}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));assert.equal(s.turn.priorityPlayerId,active);assert.equal(view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order').length,2);for(let i=0;i<20;i++){const cmds=view(s).legalCommands,choice=cmds.find(c=>c.type==='resolve_trigger_order')??cmds.find(c=>c.type==='resolve_trigger_target');if(!choice)break;act(s,choice);}const entries=s.zones.stack.map(id=>s.objects.get(id)).filter(o=>o.kind==='trigger');assert.equal(entries.length,5);assert.deepEqual(entries.map(o=>o.controllerId),[active,active,payer,payer,payer]);const sent=entries.find(o=>o.cardId==='nanoform-sentinel');assert.ok(sent);assert.equal(sent.triggerEntry.targets.length,1);
});
for(const payer of ['p1','p2'])test(`A105 kontrola: cel Holdout rzeczywiście odtapowuje się po dopłacie (${payer})`,()=>{
 const active=payer==='p1'?'p2':'p1',{s}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));assert.equal(s.objects.get('hold').tapped,true);act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='hold'));pass(s);pass(s);assert.equal(s.objects.get('hold').tapped,false);assert.ok(s.triggerFiredThisTurn['ally:0']);
});
