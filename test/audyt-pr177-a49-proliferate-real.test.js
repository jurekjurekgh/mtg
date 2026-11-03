// CR 701.34: proliferate chooses any number of permanents and/or players with
// counters and gives each another of each kind already there. Infect damage is
// represented by poison or -1/-1 counters, not synthetic test-state changes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
 if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
function scene(blocked=false){
 const s=createGameState({seed:17749,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'declare_attackers','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'myr','ichorclaw-myr','battlefield');put(s,'ally','highland-game','battlefield');put(s,'courage','courage-in-crisis','hand');
 for(let i=0;i<3;i++)put(s,`land${i}`,'basic-forest','battlefield');if(blocked)put(s,'victim','scorpion-sentinel','battlefield','p2');
 return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){const v=view(s),c=v.legalCommands.find(c=>c.type==='pass_priority');assert.ok(c,JSON.stringify({step:s.turn.step,commands:v.legalCommands}));act(s,c);}
function bot(s){return createHeuristicBot({seed:99,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function until(s,p){for(let i=0;i<30&&!p();i++){const c=view(s).legalCommands.find(c=>c.type==='resolve_combat');if(c)act(s,c);else pass(s);}assert.ok(p(),'oczekiwany stan');}
function combat(s,blocked){act(s,{type:'declare_attackers',playerId:'p1',attackerIds:['myr']});until(s,()=>s.turn.step==='declare_blockers');act(s,{type:'declare_blockers',playerId:'p2',assignments:blocked?{myr:['victim']}: {}});until(s,()=>s.turn.step==='main2');}
function choice(s){const cast=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='courage'&&c.targets?.includes('ally'));act(s,cast);until(s,()=>!!s.pendingProliferate);const c=bot(s);assert.equal(c.type,'resolve_proliferate',JSON.stringify(c));return c;}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}

test('A49: rzeczywisty infect gracza i Courage — bot proliferuje poison i nowy licznik',()=>{
 const s=scene();combat(s,false);assert.equal(s.players.find(p=>p.id==='p2').poison,1);
 const c=choice(s);assert.equal(card(s,'ally').counters['+1/+1'],1);assert.ok(c.targetIds.includes('ally'),JSON.stringify(c));assert.ok(c.targetIds.includes('p2'),JSON.stringify(c));act(s,c);
 assert.equal(card(s,'ally').counters['+1/+1'],2);assert.equal(s.players.find(p=>p.id==='p2').poison,2);
});
test('A49: rzeczywisty infect w blokera — proliferate dobija osłabionego Sentinel',()=>{
 const s=scene(true);combat(s,true);assert.equal(card(s,'victim').counters['-1/-1'],3);assert.equal(card(s,'victim').zone,'battlefield');
 const c=choice(s);assert.ok(c.targetIds.includes('ally'),JSON.stringify(c));assert.ok(c.targetIds.includes('victim'),JSON.stringify(c));act(s,c);
 assert.equal(card(s,'ally').counters['+1/+1'],2);assert.equal(card(s,'victim').zone,'graveyard');
});
test('A49: bot nie proliferuje szkodliwego licznika na własnym Sentinel',()=>{
 const s=createGameState({seed:17749,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'declare_attackers','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'myr','ichorclaw-myr','battlefield','p2');put(s,'ally','highland-game','battlefield');put(s,'own','scorpion-sentinel','battlefield');put(s,'courage','courage-in-crisis','hand');put(s,'draw','basic-forest','library');
 for(let i=0;i<3;i++)put(s,`land${i}`,'basic-forest','battlefield');
 act(s,{type:'declare_attackers',playerId:'p2',attackerIds:['myr']});until(s,()=>s.turn.step==='declare_blockers');act(s,{type:'declare_blockers',playerId:'p1',assignments:{myr:['own']}});
 until(s,()=>s.turn.step==='main2');assert.equal(card(s,'own').counters['-1/-1'],3);assert.equal(card(s,'own').zone,'battlefield');
 until(s,()=>s.turn.activePlayerId==='p1'&&s.turn.step==='main1');const c=choice(s);assert.ok(c.targetIds.includes('ally'),JSON.stringify(c));assert.ok(!c.targetIds.includes('own'),JSON.stringify(c));act(s,c);
 assert.equal(card(s,'own').counters['-1/-1'],3);assert.equal(card(s,'own').zone,'battlefield');assert.equal(card(s,'ally').counters['+1/+1'],2);
});
