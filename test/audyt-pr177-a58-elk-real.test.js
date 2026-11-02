// A58: #177 koszt ciała Dawntreader Elk i realny tutor lądu.
// Oracle: {G}, Sacrifice this creature: search for a basic land card,
// put it onto the battlefield tapped, then shuffle.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone='library',player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function game({basics=true,green=true,count=24}={}){
 const s=createGameState({seed:17758,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'elk','dawntreader-elk','battlefield');for(let i=0;i<count;i++)put(s,`lib${i}`,basics&&i===0?'basic-forest':basics&&i===1?'basic-swamp':'highland-game');
 addMana(s,'p1',1,{colors:[green?'G':'R']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function until(s,p){for(let i=0;i<20&&!p();i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.ok(p());}
function bot(s){const b=createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg});const c=b.chooseCommand(view(s));return {c,rows:b.trace().at(-1)?.options??[]};}
function object(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}

test('A58: bot aktywuje Elka, poświęca jako koszt i wyszukuje prawdziwy bazowy ląd tapnięty',()=>{
 const s=game();const {c,rows}=bot(s);assert.equal(rows.find(r=>r.cmd==='activate_ability(elk#0)').score,3,'koszt utraty rzeczywistego 2/2 MV2 jest ujęty');assert.equal(c.type,'activate_ability',JSON.stringify({c,rows}));assert.equal(c.objectId,'elk');act(s,c);
 assert.equal(object(s,'elk').zone,'graveyard');assert.equal(s.zones.stack.length,1);assert.equal(s.creatureDiedThisTurn,true);
 until(s,()=>s.pendingSearchChoice!=null);const choices=view(s).legalCommands.filter(c=>c.type==='resolve_search_choice');
 assert.ok(choices.some(c=>c.found==='lib0'));assert.ok(choices.some(c=>c.found==='lib1'));assert.ok(!choices.some(c=>c.found==='lib2'));
 const picked=bot(s).c;assert.equal(picked.type,'resolve_search_choice');assert.ok(['lib0','lib1'].includes(picked.found));const result=act(s,picked);
 assert.equal(object(s,picked.found).zone,'battlefield');assert.equal(object(s,picked.found).tapped,true);assert.equal(result.events.filter(e=>e.type==='library_searched'&&e.shuffled).length,1);
});

test('A58: Elk nie jest legalny bez zielonej many',()=>{
 const s=game({green:false});assert.ok(!view(s).legalCommands.some(c=>c.type==='activate_ability'&&c.objectId==='elk'));assert.equal(object(s,'elk').zone,'battlefield');
});

test('A58: przy braku podstawowego lądu legalne wyszukiwanie może nic nie znaleźć',()=>{
 const s=game({basics:false});act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='elk'));until(s,()=>s.pendingSearchChoice||s.zones.stack.length===0);
 assert.equal(object(s,'elk').zone,'graveyard');if(s.pendingSearchChoice){const choices=view(s).legalCommands.filter(c=>c.type==='resolve_search_choice');assert.ok(!choices.some(c=>c.found));act(s,choices.find(c=>c.found===null));}
 assert.equal(s.zones.stack.length,0);assert.equal(s.events.filter(e=>e.type==='library_searched'&&e.shuffled).length,1);
});

test('A58: cienka rzeczywista biblioteka z bazowymi lądami — bot zachowuje Elka',()=>{
 const s=game({count:4});const {c,rows}=bot(s);assert.ok(view(s).legalCommands.some(c=>c.type==='activate_ability'&&c.objectId==='elk'));assert.notEqual(c.type,'activate_ability',JSON.stringify({c,rows}));assert.equal(object(s,'elk').zone,'battlefield');
});

test('A58: pusta biblioteka — poświęcenie nadal opłacone, bez oczekiwania na wybór',()=>{
 const s=game({count:0});act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='elk'));until(s,()=>s.zones.stack.length===0);
 assert.equal(object(s,'elk').zone,'graveyard');assert.equal(s.pendingSearchChoice,null);assert.equal(s.events.filter(e=>e.type==='library_searched'&&e.shuffled).length,1);
});
