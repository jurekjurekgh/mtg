// Rzeczywisty Scion oraz Ward {2} z disguise Riftburst Helliona.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
// Otwarte: wykonywalny RED na żądanie, bez blokowania całej szybkiej paczki.
const audit=(name,fn)=>test(name,{skip:process.env.AUDIT_A109_ENFORCE==='1'?false:'otwarte A109 (AUDIT_A109_ENFORCE=1)'},fn);
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function turn(s,p){s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;}
function scene(active,payer,{aura=false,imp=false,forebear=false}={}){
 const s=createGameState({seed:17795,players:[{id:'p1'},{id:'p2'}]}),opp=payer==='p1'?'p2':'p1';turn(s,payer);addMana(s,payer,6,{colors:['G']});for(let i=0;i<2;i++){put(s,`summoner${i}`,'scion-summoner','hand',payer);act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId===`summoner${i}`));pass(s);pass(s);pass(s);pass(s);}const tokens=[...s.objects.values()].filter(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.equal(tokens.length,2);
 if(aura){put(s,'guide','griffin-guide','hand',payer);addMana(s,payer,3,{colors:['W']});const c=view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='guide'&&c.targets?.includes(tokens[0].id));assert.ok(c,JSON.stringify(view(s).legalCommands));act(s,c);pass(s);pass(s);assert.ok([...s.objects.values()].some(o=>o.cardId==='griffin-guide'&&o.attachedTo===tokens[0].id));}
 turn(s,opp);put(s,'hellion','riftburst-hellion','hand',opp);addMana(s,opp,3,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.objectId==='hellion'&&c.faceDown));pass(s);pass(s);const hidden=[...s.objects.values()].find(o=>o.cardId==='riftburst-hellion'&&o.faceDown);assert.ok(hidden);
 for(const p of ['p2','p1']){put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<4;i++)put(s,`${p}-lib${i}`,'basic-forest','library',p);}
 if(imp)put(s,'imp','nefarious-imp','battlefield',payer);if(forebear)put(s,'forebear','furious-forebear','graveyard',payer);
 turn(s,active);s.turn.priorityPlayerId=payer;put(s,'shock','shock','hand',payer);addMana(s,payer,1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes(hidden.id)));pass(s);pass(s);assert.ok(s.pendingWardPay);return {s,tokens,payer,active};
}




// Karty i akcje realne; pule/tura/priorytet ustawiono w setupie.
for(const payer of ['p1','p2'])for(const pay of [false,true])test(`A109: Griffin i token czekają na SBA po Ward, ${pay?'zapłata':'odmowa'} (${payer})`,()=>{
 const {s,tokens}=scene(payer,payer,{aura:true}),base=s.commands.length;
 const aura=()=>[...s.objects.values()].find(o=>o.cardId==='griffin-guide');
 const graveTokens=()=>[...s.objects.values()].filter(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='graveyard');
 const checkReplay=()=>{const replay=replayFromState(s),result=verifyReplay({...replay,commands:replay.commands.slice(base)},()=>scene(payer,payer,{aura:true}).s,execute);assert.ok(result.deterministic);assert.ok(result.results.every(r=>r.ok));assert.equal(stateFingerprint(result.state),stateFingerprint(s));};
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[0].id));assert.ok(s.pendingWardPay);assert.equal(aura()?.zone,'battlefield','osierocona aura czeka na akcję stanową');assert.equal(graveTokens().length,1,'token przestaje istnieć dopiero w SBA');checkReplay();
 if(pay)act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[1].id));act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay===pay));assert.equal(aura()?.zone,'graveyard');assert.equal(graveTokens().length,0);assert.equal(s.events.filter(e=>e.type==='ability_triggered'&&e.cardId==='griffin-guide'&&e.trigger==='enchanted_creature_dies').length,1);checkReplay();
});
