// Rzeczywisty Scion, Panic Spellbomb i Holdout Settlement: płatność opcjonalna.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
// Otwarte: wykonywalny RED na żądanie, bez blokowania całej szybkiej paczki.
const audit=test;
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function turn(s,p){s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;}
function scene(active,payer){
 const s=createGameState({seed:17794,players:[{id:'p1'},{id:'p2'}]}),opp=payer==='p1'?'p2':'p1';turn(s,payer);put(s,'summoner','scion-summoner','hand',payer);addMana(s,payer,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);const token=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.ok(token);
 for(const p of ['p2','p1']){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<4;i++)put(s,`${p}-lib${i}`,'basic-forest','library',p);}
 put(s,'hold','holdout-settlement','battlefield',payer);put(s,'ally','goblin-piker','battlefield',payer);put(s,'enemy','highland-game','battlefield',opp);put(s,'bomb','panic-spellbomb','battlefield',payer);
 turn(s,active);s.turn.priorityPlayerId=payer;act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='bomb'&&c.targets?.includes('enemy')));pass(s);pass(s);assert.ok(s.pendingOptionalPay);return {s,token,payer,active,other:active==='p1'?'p2':'p1'};
}
// Po Scionie bieżące view pokazuje legalny Holdout, ale executor przechodzi
// przez bramkę starego celu triggera i go odrzuca. Ta regresja jest odrębna
// od nadal otwartej kolejności A84; nie asercjonujemy kolejności triggerów.
for(const active of ['p1','p2'])for(const payer of ['p1','p2'])test(`A94: po Scionie można użyć Holdouta i opłacić Spellbomb (aktywny ${active}, płaci ${payer})`,()=>{
 const {s,token}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));assert.ok(s.pendingOptionalPay);assert.equal(s.pendingTriggerTargets.length,0);assert.ok((s.pendingOptionalPay.deferredTargets?.length??0)>0);const cmd=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally');assert.ok(cmd,'legalna oferta Holdout');const r=execute(s,cmd);assert.ok(r.ok,JSON.stringify(r));assert.equal(s.objects.get('hold').tapped,true);assert.equal(s.objects.get('ally').tapped,true);const before=s.zones.hand.length;act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));assert.equal(s.pendingOptionalPay,null);assert.equal(s.zones.hand.length,before+1);
});
for(const payer of ['p1','p2'])test(`A94: po Scionie nadal można odmówić opcjonalnej dopłaty (${payer})`,()=>{const {s,token}=scene(payer,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&!c.pay));assert.equal(s.pendingOptionalPay,null);assert.equal(s.objects.get('hold').tapped,false);});
test('A94: nie-mana i przedwczesny wybór celu nie omijają opcjonalnej płatności',()=>{const {s,token,payer}=scene('p1','p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));const command={type:'resolve_trigger_target',playerId:payer,targetId:'p2'};const r=execute(s,command);assert.equal(r.ok,false);assert.equal(r.reason,'optional_pay_unresolved');const pass=execute(s,{type:'pass_priority',playerId:payer});assert.equal(pass.ok,false);assert.equal(pass.reason,'optional_pay_unresolved');});
test('A94: ląd dodający manę również działa po wyzwoleniu wyboru celu',()=>{const {s,token}=scene('p1','p1');put(s,'mount','basic-mountain','battlefield','p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));const r=execute(s,{type:'tap_for_mana',playerId:'p1',objectId:'mount'});assert.ok(r.ok,JSON.stringify(r));assert.equal(s.objects.get('mount').tapped,true);act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));assert.equal(s.pendingOptionalPay,null);});
test('A94: po odmowie ogłoszenie triggerów blokuje aktywację many do czasu priorytetu',()=>{const {s,token}=scene('p1','p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));const hold=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally');act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&!c.pay));assert.ok(s.pendingDeathTriggerBatch||s.pendingTriggerOrder||s.pendingTriggerTargets.length>0);const r=execute(s,hold);assert.equal(r.ok,false);assert.equal(s.objects.get('hold').tapped,false);});
test('A94: replay Sciona, Holdouta i dopłaty jest deterministyczny',()=>{const {s,token}=scene('p1','p1');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));const replay=replayFromState(s),r=verifyReplay({...replay,commands:replay.commands.slice(-3)},()=>scene('p1','p1').s,execute);assert.ok(r.deterministic);assert.ok(r.results.every(x=>x.ok));assert.equal(stateFingerprint(r.state),stateFingerprint(s));});
