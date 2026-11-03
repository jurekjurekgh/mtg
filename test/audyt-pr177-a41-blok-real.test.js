// CR 509.1: legal blockers are declared during the declare blockers step.
// CR 510.1: combat damage is assigned based on the combat participants.
// P/T and keywords below are from the catalog, not altered test doubles.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,cardId,player){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});
 addObject(s,{...data,id,instanceId:`i-${id}`,zone:'battlefield',controllerId:player});
 s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
function game(attackers,blocker){
 const s=createGameState({seed:17741,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'declare_attackers','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 attackers.forEach((card,i)=>put(s,`a${i}`,card,'p1'));put(s,'blocker',blocker,'p2');
 act(s,{type:'declare_attackers',playerId:'p1',attackerIds:attackers.map((_,i)=>`a${i}`)});pass(s);pass(s);
 assert.equal(s.turn.step,'declare_blockers');return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){const v=view(s);const cmd=v.legalCommands.find(c=>c.type==='pass_priority');assert.ok(cmd,JSON.stringify({step:s.turn.step,priority:s.turn.priorityPlayerId,commands:v.legalCommands}));act(s,cmd);}
function choose(s){return createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function finishCombat(s){for(let i=0;i<24&&!['main2','end'].includes(s.turn.step);i++){const c=view(s).legalCommands.find(c=>c.type==='resolve_combat');if(c)act(s,c);else pass(s);}assert.equal(s.turn.step,'main2');}
function zone(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`)?.zone;}

test('A41: Healer of the Glade bezpiecznie blokuje jednego z rzeczywistych atakujących',()=>{
 const s=game(['silvanuss-invoker','goldmeadow-nomad','maritime-guard'],'healer-of-the-glade');
 const choice=choose(s);assert.equal(choice.type,'declare_blockers');const assignments=choice.assignments??{};
 assert.equal(Object.keys(assignments).length,1,JSON.stringify(choice));const [blocked]=Object.keys(assignments);
 assert.ok(['a1','a2'].includes(blocked),JSON.stringify(choice));assert.deepEqual(assignments[blocked],['blocker']);
 act(s,choice);finishCombat(s);assert.equal(zone(s,'blocker'),'battlefield');assert.equal(s.players.find(p=>p.id==='p2').life,16);
});
test('A41: Leafcrown Dryad nie ginie w niekorzystnym bloku Hill Gianta bez presji',()=>{
 const s=game(['hill-giant'],'leafcrown-dryad');const choice=choose(s);assert.deepEqual(choice.assignments??{},{});
 act(s,choice);finishCombat(s);assert.equal(zone(s,'blocker'),'battlefield');assert.equal(s.players.find(p=>p.id==='p2').life,17);
});
test('A41: latającego Rustwing Falcona nie można zablokować Healer of the Glade',()=>{
 const s=game(['rustwing-falcon'],'healer-of-the-glade');const choice=choose(s);assert.deepEqual(choice.assignments??{},{});
 act(s,choice);finishCombat(s);assert.equal(s.players.find(p=>p.id==='p2').life,19);assert.equal(zone(s,'blocker'),'battlefield');
});
test('A41: Deadly Recluse z deathtouch blokuje i niszczy Hill Gianta',()=>{
 const s=game(['hill-giant'],'deadly-recluse');const choice=choose(s);assert.deepEqual(choice.assignments,{a0:['blocker']},JSON.stringify(choice));
 act(s,choice);finishCombat(s);assert.equal(zone(s,'blocker'),'graveyard');assert.equal(zone(s,'a0'),'graveyard');assert.equal(s.players.find(p=>p.id==='p2').life,20);
});
