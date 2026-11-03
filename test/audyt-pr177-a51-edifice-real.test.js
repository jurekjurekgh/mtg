// Bezpośredni diff #177 L: Ambulatory Edifice, decyzja zapłaty, a potem
// refleks z celem. Oracle: may pay 2 life; when you do, target creature
// gets -1/-1 until end of turn. Stwór o 0 toughness trafia do grobu (CR 704.5f).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
import {resolveUntilDecision,optionalPayOpen} from './helpers/deferred-trigger.js';
const reg=createCardRegistry();
function put(s,id,card,zone='battlefield',player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function setup(foe){
 const s=createGameState({seed:17751,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'edifice','ambulatory-edifice','hand');
 if(foe==='swooping-protector'){put(s,'foe',foe,'hand','p2');addMana(s,'p2',4,{colors:['W']});pass(s);act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='foe'));finish(s);}
 else put(s,'foe',foe,'battlefield','p2');
 addMana(s,'p1',3,{colors:['B']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='edifice'));assert.ok(resolveUntilDecision(s,optionalPayOpen));return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({step:s.turn.step,cmds:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function bot(s){return createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function decide(s){const c=bot(s);assert.equal(c.type,'resolve_optional_pay_choice',JSON.stringify(c));return c;}
function target(s){const c=bot(s);assert.equal(c.type,'resolve_trigger_target',JSON.stringify(c));assert.equal(c.targetId,card(s,'foe').id,JSON.stringify(c));act(s,c);}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function finish(s){for(let i=0;i<20&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function life(s){return s.players.find(p=>p.id==='p1').life;}

test('A51: 2/2 Highland Game przeżyje −1/−1 — bot odmawia 2 życia',()=>{
 const s=setup('highland-game');const c=decide(s);assert.equal(c.pay,false);act(s,c);assert.equal(life(s),20);assert.equal(card(s,'foe').zone,'battlefield');
});
test('A51: ważny Bog Hoodlums 4/1 za sześć — bot płaci i osłabienie usuwa stwora',()=>{
 const s=setup('bog-hoodlums');const c=decide(s);assert.equal(c.pay,true);act(s,c);assert.equal(life(s),18);target(s);finish(s);assert.equal(card(s,'foe').zone,'graveyard');
});
test('A51: jedyny latający Nefarious Imp 2/1 — bot płaci i usuwa stwora',()=>{
 const s=setup('nefarious-imp');const c=decide(s);assert.equal(c.pay,true);act(s,c);target(s);finish(s);assert.equal(card(s,'foe').zone,'graveyard');assert.equal(life(s),18);
});
test('A51: shield nie zapobiega położeniu 0 toughness w grobie',()=>{
 const s=setup('swooping-protector');assert.equal(card(s,'foe').counters.shield,1);const c=decide(s);assert.equal(c.pay,true);act(s,c);target(s);finish(s);assert.equal(card(s,'foe').zone,'graveyard');
});
test('A51: przeciwnik może odpowiedzieć Crumb and Get It po zapłacie i uratować cel',()=>{
 const s=setup('bog-hoodlums');put(s,'crumb','crumb-and-get-it','hand','p2');addMana(s,'p2',2,{colors:['W']});const c=decide(s);assert.equal(c.pay,true);act(s,c);target(s);pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='crumb'&&c.targets?.includes('foe')));finish(s);
 assert.equal(card(s,'foe').zone,'battlefield');assert.equal(life(s),18);
});
