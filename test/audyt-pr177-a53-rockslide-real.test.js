// Bezpośredni diff #177 PMSSB-80: liczba lądów kontrolera na potrzeby
// wyceny i rzeczywistego Rumbling Rockslide; nie syntetyzujemy statystyk celu.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone='battlefield',player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function scene(n,enemy=0){const s=createGameState({seed:17753,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'slide','rumbling-rockslide','hand');put(s,'sentinel','scorpion-sentinel','battlefield','p2');for(let i=0;i<n;i++)put(s,`l${i}`,'basic-mountain');for(let i=0;i<enemy;i++)put(s,`e${i}`,'basic-forest','battlefield','p2');addMana(s,'p1',4,{colors:['R']});return s;}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({step:s.turn.step,commands:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function finish(s){for(let i=0;i<20&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function bot(s){return createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function cast(s){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='slide'&&c.targets?.includes('sentinel')));}

test('A53: cztery lądy — bot rzuca Rockslide i usuwa prawdziwego Scorpion Sentinel 1/4',()=>{
 const s=scene(4);const c=bot(s);assert.equal(c.objectId,'slide',JSON.stringify(c));assert.deepEqual(c.targets,['sentinel']);act(s,c);finish(s);assert.equal(card(s,'sentinel').zone,'graveyard');
});
test('A53: trzy własne i cztery wrogie landy — bot nie liczy cudzych i nie rzuca',()=>{
 const s=scene(3,4);assert.notEqual(bot(s).objectId,'slide');cast(s);finish(s);assert.equal(card(s,'sentinel').zone,'battlefield');assert.equal(card(s,'sentinel').damage,3);
});
test('A53: zero landów — czar za floating mana zadaje zero i bot go zachowuje',()=>{
 const s=scene(0,3);assert.notEqual(bot(s).objectId,'slide');cast(s);finish(s);assert.equal(card(s,'sentinel').zone,'battlefield');assert.equal(card(s,'sentinel').damage,0);
});
test('A53: faktycznie animowany ląd nadal wlicza się do czterech lądów',()=>{
 const s=scene(4);put(s,'invoker','silvanuss-invoker');addMana(s,'p1',8,{colors:['G']});
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='invoker'&&c.targets?.includes('l0')));finish(s);
 assert.ok(card(s,'l0').types.includes('Land'));assert.ok(card(s,'l0').types.includes('Creature'));assert.equal(bot(s).objectId,'slide');cast(s);finish(s);assert.equal(card(s,'sentinel').zone,'graveyard');
});
test('A53: faktyczny koszt poświęcenia landu przed rozstrzygnięciem zmniejsza obrażenia',()=>{
 const s=scene(4);put(s,'monster','seismic-monstrosaur');put(s,'draw','basic-mountain','library');addMana(s,'p1',3,{colors:['R']});cast(s);
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='monster'&&c.sacrificeLandId==='l0'));finish(s);
 assert.equal(card(s,'l0').zone,'graveyard');assert.equal(card(s,'draw').zone,'hand');assert.equal(card(s,'sentinel').zone,'battlefield');assert.equal(card(s,'sentinel').damage,3);
});
test('A53: prawdziwe Roiling Regrowth w odpowiedzi zwiększa liczbę landów do czterech',()=>{
 const s=scene(3);put(s,'regrowth','roiling-regrowth','hand');put(s,'lib1','basic-forest','library');put(s,'lib2','basic-mountain','library');addMana(s,'p1',3,{colors:['G']});cast(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='regrowth'));
 for(let i=0;i<25&&s.zones.stack.length;i++){
   const cmds=view(s).legalCommands;
   const decision=cmds.find(c=>c.type==='resolve_springbloom'&&c.sacrificeLandId==='l0')
     ??cmds.find(c=>c.type==='resolve_search_choice'&&c.found!=null)
     ??cmds.find(c=>c.type==='pass_priority');act(s,decision);
 }
 assert.equal(s.zones.stack.length,0);assert.equal(card(s,'l0').zone,'graveyard');assert.equal(card(s,'lib1').zone,'battlefield');assert.equal(card(s,'lib2').zone,'battlefield');assert.equal(card(s,'sentinel').zone,'graveyard');
});
