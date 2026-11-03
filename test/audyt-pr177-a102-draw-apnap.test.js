// Rzeczywisty Scion, Panic Spellbomb i Holdout Settlement: płatność opcjonalna.
// Pule do przygotowania Summonera są ustawione addMana; pozostałe akcje są rzeczywiste.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
// Otwarte: wykonywalny RED na żądanie, bez blokowania całej szybkiej paczki.
const audit=(name,fn)=>test(name,{skip:process.env.AUDIT_A102_ENFORCE==='1'?false:'otwarte A84/A102 (AUDIT_A102_ENFORCE=1)'},fn);
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function turn(s,p){s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;}
function scene(active,payer){
 const s=createGameState({seed:17794,players:[{id:'p1'},{id:'p2'}]}),opp=payer==='p1'?'p2':'p1';turn(s,payer);put(s,'summoner','scion-summoner','hand',payer);addMana(s,payer,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);const token=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.ok(token);
 for(const p of ['p2','p1']){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<4;i++)put(s,`${p}-lib${i}`,'basic-forest','library',p);}
 put(s,'coatl','lorescale-coatl','battlefield',payer);put(s,'hold','holdout-settlement','battlefield',payer);put(s,'ally','goblin-piker','battlefield',payer);put(s,'enemy','highland-game','battlefield',opp);put(s,'bomb','panic-spellbomb','battlefield',payer);
 turn(s,active);s.turn.priorityPlayerId=payer;act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='bomb'&&c.targets?.includes('enemy')));pass(s);pass(s);assert.ok(s.pendingOptionalPay);return {s,token,payer,active,other:active==='p1'?'p2':'p1'};
}
// Tura/priorytet i pula są pomocnicze; wszystkie karty i komendy są rzeczywiste.
for(const payer of ['p1','p2'])audit(`A102: dobranie Spellbomb i śmierć Sciona łączą się w APNAP (${payer})`,()=>{
 const active=payer==='p1'?'p2':'p1',{s,token}=scene(active,payer);act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hold'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));assert.equal(s.turn.priorityPlayerId,active);const choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(choices.length,2);for(let i=0;i<20;i++){const cmds=view(s).legalCommands,choice=cmds.find(c=>c.type==='resolve_trigger_order')??cmds.find(c=>c.type==='resolve_trigger_target');if(!choice)break;act(s,choice);}const triggers=s.zones.stack.map(id=>s.objects.get(id)).filter(o=>o.kind==='trigger');assert.equal(triggers.length,5);assert.deepEqual(triggers.map(o=>o.controllerId),[active,active,payer,payer,payer]);assert.equal(triggers.filter(o=>o.cardId==='lorescale-coatl').length,1);
});
