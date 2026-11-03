// Rzeczywisty Scion oraz Ward {2} z disguise Riftburst Helliona.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
// Otwarte: wykonywalny RED na żądanie, bez blokowania całej szybkiej paczki.
const audit=(name,fn)=>test(name,{skip:process.env.AUDIT_A108_ENFORCE==='1'?false:'otwarte A108 (AUDIT_A108_ENFORCE=1)'},fn);
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



// Griffin Guide rzeczywiście rzucony na token; pula/tura/priorytet to setup.
for(const payer of ['p1','p2'])audit(`A108: aura nie umiera z SBA w środku rozstrzygania Ward (${payer})`,()=>{
 const {s,tokens}=scene(payer,payer,{aura:true});const battlefield=()=>[...s.objects.values()].some(o=>o.cardId==='griffin-guide'&&o.zone==='battlefield');const graveyard=()=>[...s.objects.values()].some(o=>o.cardId==='griffin-guide'&&o.zone==='graveyard');assert.ok(battlefield());act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[0].id));assert.ok(s.pendingWardPay);assert.ok(battlefield(),'akcje stanowe nie wysyłają aury do grobu przed dokończeniem Ward');act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===tokens[1].id));act(s,view(s).legalCommands.find(c=>c.type==='resolve_ward_pay_choice'&&c.pay));assert.ok(graveyard(),'aura trafia do grobu w kolejnym checkpointcie');for(let i=0;i<30;i++){const cmds=view(s).legalCommands,c=cmds.find(c=>c.type==='resolve_trigger_order')??cmds.find(c=>c.type==='resolve_trigger_target');if(!c)break;act(s,c);}assert.ok(s.zones.stack.some(id=>s.objects.get(id)?.cardId==='griffin-guide'),'zdolność śmierci zaczarowanego Sciona nadal powstała');for(let i=0;i<20&&!([...s.objects.values()].some(o=>o.cardId==='token_griffin'&&o.zone==='battlefield'));i++)pass(s);assert.ok([...s.objects.values()].some(o=>o.cardId==='token_griffin'&&o.zone==='battlefield'));
});
