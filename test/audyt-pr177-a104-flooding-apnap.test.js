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
 put(s,'hold','holdout-settlement','battlefield',payer);put(s,'ally','goblin-piker','battlefield',payer);put(s,'enemy','highland-game','battlefield',opp);put(s,'bomb','panic-spellbomb','battlefield',payer);
 turn(s,opp);put(s,'flood','chronic-flooding','hand',opp);addMana(s,opp,2,{colors:['U']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='flood'&&c.targets?.includes('hold')));pass(s);pass(s);assert.ok([...s.objects.values()].some(o=>o.cardId==='chronic-flooding'&&o.zone==='battlefield'&&o.attachedTo==='hold'));
 turn(s,active);s.turn.priorityPlayerId=payer;act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='bomb'&&c.targets?.includes('enemy')));pass(s);pass(s);assert.ok(s.pendingOptionalPay);return {s,token,payer,active,other:active==='p1'?'p2':'p1'};
}

// Aura naprawdę rzucona na Holdout; pule oraz zmiany tury/priorytetu są setupem.
for(const payer of ['p1','p2'])test(`A104: Chronic Flooding nie trafia na stos podczas dopłaty (${payer})`,()=>{
 const active=payer==='p1'?'p2':'p1',{s,token}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));const before=[...s.zones.stack];act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));assert.ok(s.pendingOptionalPay);assert.deepEqual(s.zones.stack,before,'tapnięcie źródła many nie kładzie triggera aury na stos podczas dopłaty');
});
for(const payer of ['p1','p2'])test(`A104: Chronic Flooding i triggery śmierci łączą się w APNAP (${payer})`,()=>{
 const active=payer==='p1'?'p2':'p1',{s,token}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));assert.equal(s.turn.priorityPlayerId,active);assert.equal(view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order').length,3);for(let i=0;i<20;i++){const cmds=view(s).legalCommands,choice=cmds.find(c=>c.type==='resolve_trigger_order')??cmds.find(c=>c.type==='resolve_trigger_target');if(!choice)break;act(s,choice);}const entries=s.zones.stack.map(id=>s.objects.get(id)).filter(o=>o.kind==='trigger');assert.equal(entries.length,5);assert.deepEqual(entries.map(o=>o.controllerId),[active,active,active,payer,payer]);assert.equal(entries.filter(o=>o.cardId==='chronic-flooding').length,1);
});
for(const payer of ['p1','p2'])test(`A104 kontrola: dopłata przez Holdout pozwala rozstrzygnąć Chronic Flooding (${payer})`,()=>{
 const active=payer==='p1'?'p2':'p1',{s}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));assert.ok(s.zones.stack.some(id=>s.objects.get(id).cardId==='chronic-flooding'));pass(s);pass(s);const lib=s.zones.library.filter(id=>s.objects.get(id).ownerId===payer);assert.equal(lib.length,0,'dobranie Spellbomb oraz mill 3 zużywają cztery karty');
});
