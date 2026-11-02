// Frightful Delusion: 2011-09-22 ruling — player discards even if {1} paid;
// if the only target is illegal as the spell resolves, no instruction applies.
// https://gatherer.wizards.com/Pages/Card/Details.aspx?name=frightful+delusion
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function game({extraMana=0,hand=true}={}){
 const s=createGameState({seed:17760,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'delusion','frightful-delusion');put(s,'shock','shock','hand','p2');if(hand){put(s,'card1','highland-game','hand','p2');put(s,'card2','basic-forest','hand','p2');}
 addMana(s,'p1',3,{colors:['U']});addMana(s,'p2',1+extraMana,{colors:['R']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({turn:s.turn,commands:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function until(s,p){for(let i=0;i<25&&!p();i++)pass(s);assert.ok(p(),JSON.stringify({stack:s.zones.stack,commands:view(s).legalCommands}));}
function obj(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function bot(s,params=undefined){const b=createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg,...(params?{params}:{})});const c=b.chooseCommand(view(s));return {c,rows:b.trace().at(-1)?.options??[]};}
function shock(s){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('p1')));pass(s);}
function castDelusion(s){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='delusion'&&c.targets?.includes(obj(s,'shock').id)));}
function discard(s){if(s.pendingDiscardChoice){const commands=view(s).legalCommands.filter(c=>c.type==='resolve_discard_choice');assert.ok(commands.length);act(s,commands[0]);}}

test('A60: bot kontruje prawdziwy Shock przy braku many, jego kontroler wybiera odrzut',()=>{
 const s=game();shock(s);const {c,rows}=bot(s);const key=`cast_spell(delusion->${obj(s,'shock').id})`;const old=bot(s,{counterspellTmcWeight:6}).rows;assert.equal(rows.find(r=>r.cmd===key).score-old.find(r=>r.cmd===key).score,4);assert.equal(c.objectId,'delusion',JSON.stringify({c,rows}));assert.ok(c.targets.includes(obj(s,'shock').id));act(s,c);
 until(s,()=>s.pendingDiscardChoice!=null);assert.equal(s.turn.priorityPlayerId,'p2');assert.equal(obj(s,'shock').zone,'graveyard');discard(s);until(s,()=>s.zones.stack.length===0);
 assert.equal(s.players.find(p=>p.id==='p1').life,20);assert.equal([obj(s,'card1'),obj(s,'card2')].filter(o=>o.zone==='graveyard').length,1);
});
for(const pay of [true,false])test(`A60: przeciwnik ${pay?'płaci':'odmawia'} {1}, lecz zawsze odrzuca kartę`,()=>{
 const s=game({extraMana:1});shock(s);castDelusion(s);until(s,()=>s.pendingCounterPay!=null);assert.equal(s.turn.priorityPlayerId,'p2');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_counter_pay_choice'&&c.pay===pay));assert.ok(s.pendingDiscardChoice);discard(s);until(s,()=>s.zones.stack.length===0);
 assert.equal(s.players.find(p=>p.id==='p1').life,pay?18:20);assert.equal([obj(s,'card1'),obj(s,'card2')].filter(o=>o.zone==='graveyard').length,1);
});
test('A60: brak kart w ręce nie przeszkadza skontrować prawdziwego czaru',()=>{
 const s=game({hand:false});shock(s);castDelusion(s);until(s,()=>s.zones.stack.length===0);assert.equal(obj(s,'shock').zone,'graveyard');assert.equal(s.pendingDiscardChoice,null);assert.equal(s.players.find(p=>p.id==='p1').life,20);
});
test('A60: cel usunięty przez Negate zanim Delusion się rozstrzygnie — brak odrzucenia',()=>{
 const s=game({extraMana:2});put(s,'negate','negate','hand','p2');addMana(s,'p2',2,{colors:['U']});shock(s);castDelusion(s);pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='negate'&&c.targets?.includes(obj(s,'shock').id)));
 until(s,()=>s.zones.stack.length===0);assert.equal(obj(s,'shock').zone,'graveyard');assert.equal(obj(s,'card1').zone,'hand');assert.equal(obj(s,'card2').zone,'hand');assert.equal(s.players.find(p=>p.id==='p1').life,20);
});

test('A60: gdy kontroler Shocka ma manę, bot nie musi marnować kontry mimo ridera',()=>{
 const s=game({extraMana:1});shock(s);const {c,rows}=bot(s);assert.equal(c.type,'pass_priority',JSON.stringify({c,rows}));act(s,c);until(s,()=>s.zones.stack.length===0);assert.equal(obj(s,'delusion').zone,'hand');assert.equal(s.players.find(p=>p.id==='p1').life,18);assert.equal(obj(s,'card1').zone,'hand');assert.equal(obj(s,'card2').zone,'hand');
});
