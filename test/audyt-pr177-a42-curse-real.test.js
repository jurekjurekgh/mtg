// Curse of the Bloody Tome: "At the beginning of enchanted player's upkeep,
// that player mills two cards." Snapshot: docs/cards/scryfall-curse-of-the-bloody-tome.json.
// CR 104.3c / 121.4: losing requires an attempted draw from an empty library;
// CR 113.7a: a triggered ability exists independently of its source.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
function scene(n){
 const s=createGameState({seed:17742,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'curse','curse-of-the-bloody-tome','hand','p1');addMana(s,'p1',4,{colors:['U']});
 for(let i=0;i<n;i++)put(s,`lib${i}`,['highland-game','brute-force','basic-forest'][i%3],'library','p2');
 for(let i=0;i<4;i++)put(s,`own${i}`,'basic-island','library','p1');return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){const v=view(s),c=v.legalCommands.find(c=>c.type==='pass_priority');assert.ok(c,JSON.stringify({turn:s.turn,commands:v.legalCommands}));act(s,c);}
function castCurse(s){const b=createHeuristicBot({seed:84,randomness:0,lookahead:0,registry:reg}),choice=b.chooseCommand(view(s));assert.equal(choice.objectId,'curse',JSON.stringify(choice));assert.ok(choice.targets?.includes('p2'),JSON.stringify(choice));act(s,choice);for(let i=0;i<8&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function upkeep(s){s.turn={...s.turn,number:10,activePlayerId:'p1',priorityPlayerId:'p1',phase:'ending',step:'end',stepIndex:9,passes:0};for(let i=0;i<10&&!(s.turn.activePlayerId==='p2'&&s.turn.step==='upkeep');i++)pass(s);assert.equal(s.turn.step,'upkeep');assert.equal(s.turn.activePlayerId,'p2');assert.equal(s.zones.stack.length,1);}
function resolve(s){for(let i=0;i<8&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
const milled=s=>s.events.filter(e=>e.type==='card_milled'&&e.playerId==='p2').length;
for(const n of [0,1,2,3])test(`A42: po millu z biblioteki ${n} karty przegrana zależy od kolejnego draw`,()=>{
 const s=scene(n);castCurse(s);upkeep(s);resolve(s);assert.equal(milled(s),Math.min(n,2));
 assert.equal(s.status,'active','samo millowanie nie przegrywa');
 for(let i=0;i<8&&s.turn.step==='upkeep';i++)pass(s);
 if(n<=2)assert.ok(s.events.some(e=>e.type==='player_lost'&&e.playerId==='p2'&&e.reason==='empty_library'),JSON.stringify({status:s.status,events:s.events.slice(-5)}));
 else {assert.equal(s.status,'active');assert.ok(s.events.some(e=>e.type==='card_drawn'&&e.playerId==='p2'));}
});
test('A42: Naturalize po wyzwoleniu nie zatrzymuje milla z prawdziwej klątwy',()=>{
 const s=scene(3);put(s,'remove','naturalize','hand','p2');put(s,'f1','basic-forest','battlefield','p2');put(s,'f2','basic-forest','battlefield','p2');castCurse(s);upkeep(s);
 const curse=[...s.objects.values()].find(o=>o.cardId==='curse-of-the-bloody-tome'&&o.zone==='battlefield');
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='remove'&&c.targets?.includes(curse.id)));resolve(s);
 assert.equal(milled(s),2);assert.ok([...s.objects.values()].some(o=>o.instanceId==='i-curse'&&o.zone==='graveyard'));
});
test('A42: Naturalize przed upkeep usuwa klątwę przed wyzwoleniem',()=>{
 const s=scene(3);put(s,'remove','naturalize','hand','p2');put(s,'f1','basic-forest','battlefield','p2');put(s,'f2','basic-forest','battlefield','p2');castCurse(s);
 pass(s);const curse=[...s.objects.values()].find(o=>o.cardId==='curse-of-the-bloody-tome'&&o.zone==='battlefield');
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='remove'&&c.targets?.includes(curse.id)));resolve(s);
 s.turn={...s.turn,number:10,activePlayerId:'p1',priorityPlayerId:'p1',phase:'ending',step:'end',stepIndex:9,passes:0};
 for(let i=0;i<10&&!(s.turn.activePlayerId==='p2'&&s.turn.step==='upkeep');i++)pass(s);
 assert.equal(s.turn.step,'upkeep');assert.equal(s.zones.stack.length,0);assert.equal(milled(s),0);
});
test('A42: ocena presji deck-out rośnie na rzeczywistych bibliotekach',()=>{
 function score(n){const s=scene(n),b=createHeuristicBot({seed:84,randomness:0,lookahead:0,registry:reg});b.chooseCommand(view(s));return b.trace().at(-1).options.find(o=>o.cmd==='cast_permanent(curse->p2)')?.score;}
 const thick=score(25),thin=score(4),critical=score(1);assert.ok(critical>thin&&thin>thick,JSON.stringify({thick,thin,critical}));
});
