// Benevolent Blessing: Flash, choose a color, enchanted creature has protection
// from that color. Protection prevents damage from a matching source (CR 702.16).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){const v=view(s),c=v.legalCommands.find(c=>c.type==='pass_priority');assert.ok(c,JSON.stringify({step:s.turn.step,options:v.legalCommands}));act(s,c);}
function bot(s){return createHeuristicBot({seed:5,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function game({attacker='leafcrown-dryad',blocker='scorpion-sentinel',owner='p2',protectAttacker=false}={}){
 const other=owner==='p2'?'p1':'p2', attackPlayer=protectAttacker?owner:other,blockerPlayer=protectAttacker?other:owner;
 const s=createGameState({seed:17746,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'declare_attackers',attackPlayer);s.turn.activePlayerId=s.turn.priorityPlayerId=attackPlayer;
 put(s,'attacker',attacker,'battlefield',attackPlayer);put(s,'blocker',blocker,'battlefield',blockerPlayer);put(s,'aura','benevolent-blessing','hand',owner);
 for(let i=0;i<3;i++)put(s,`bias${i}`,protectAttacker?'emissary-escort':'goblin-piker','battlefield',other);
 act(s,{type:'declare_attackers',playerId:attackPlayer,attackerIds:['attacker']});pass(s);pass(s);assert.equal(s.turn.step,'declare_blockers');
 act(s,{type:'declare_blockers',playerId:blockerPlayer,assignments:{attacker:['blocker']}});if(s.turn.priorityPlayerId!==owner)pass(s);
 assert.equal(s.turn.priorityPlayerId,owner);addMana(s,owner,3,{colors:['W']});return s;
}
function protect(s,target,expected){
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='aura'&&c.targets?.includes(target)));
 for(let i=0;i<12&&!s.pendingColorChoice;i++)pass(s);assert.ok(s.pendingColorChoice,'wybór koloru');
 const choice=bot(s);assert.equal(choice.type,'resolve_color_choice',JSON.stringify(choice));assert.equal(choice.color,expected,JSON.stringify(choice));act(s,choice);
}
function finishCombat(s){for(let i=0;i<25&&!['main2','end'].includes(s.turn.step);i++){
 const cmd=view(s).legalCommands.find(c=>c.type==='resolve_combat');if(cmd)act(s,cmd);else pass(s);
 }assert.equal(s.turn.step,'main2');}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
for(const attacker of ['leafcrown-dryad','woolly-loxodon'])test(`A46: po realnym bloku ${attacker} bot wybiera zielony zamiast czerwonego`,()=>{
 const s=game({attacker});protect(s,'blocker','G');finishCombat(s);assert.equal(card(s,'blocker').zone,'battlefield');assert.equal(card(s,'blocker').damage,0);
});
test('A46: atakujący Scorpion Sentinel wybiera ochronę przed czerwonym blokerem',()=>{
 const s=game({owner:'p1',protectAttacker:true,attacker:'scorpion-sentinel',blocker:'goblin-piker'});
 protect(s,'attacker','R');finishCombat(s);assert.equal(card(s,'attacker').zone,'battlefield');assert.equal(card(s,'attacker').damage,0);
});
test('A46: poza walką liczniejsze czerwone stwory zachowują wycenę koloru',()=>{
 const s=createGameState({seed:17746,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'host','scorpion-sentinel','battlefield','p1');put(s,'aura','benevolent-blessing','hand','p1');
 for(let i=0;i<3;i++)put(s,`bias${i}`,'goblin-piker','battlefield','p2');put(s,'other','emissary-escort','battlefield','p2');addMana(s,'p1',3,{colors:['W']});protect(s,'host','R');
});
test('A46: w odpowiedzi na Tail Slash bot wybiera zielone źródło, nie czerwony czar',()=>{
 const s=createGameState({seed:17746,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'dealer','deadly-recluse','battlefield','p1');put(s,'host','scorpion-sentinel','battlefield','p2');put(s,'slash','tail-slash','hand','p1');put(s,'aura','benevolent-blessing','hand','p2');
 for(let i=0;i<3;i++)put(s,`bias${i}`,'goblin-piker','battlefield','p1');addMana(s,'p1',3,{colors:['R']});addMana(s,'p2',3,{colors:['W']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='slash'&&JSON.stringify(c.targets)===JSON.stringify(['dealer','host'])));pass(s);protect(s,'host','G');
 for(let i=0;i<12&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);assert.equal(card(s,'host').zone,'battlefield');assert.equal(card(s,'host').damage,0);
});
