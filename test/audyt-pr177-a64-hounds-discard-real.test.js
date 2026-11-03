// Vampire Hounds: discard a creature card as activation cost, +2/+2 until end
// of turn. Mana-color heuristics are strategy, not an Oracle obligation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone='battlefield',player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
 if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({turn:s.turn,legal:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function bot(s,params){const b=createHeuristicBot({seed:82,randomness:0,lookahead:0,registry:reg,...(params?{params}:{})});const c=b.chooseCommand(view(s));return {c,rows:b.trace().at(-1).options};}
function zone(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`)?.zone;}
function scene({reverse=false,green=false}={}){
 const s=createGameState({seed:17764,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'declare_attackers','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'hill','hill-giant','battlefield','p2');put(s,'hounds','vampire-hounds');for(let i=0;i<5;i++)put(s,`land${i}`,green&&i===0?'basic-forest':'basic-swamp');
 if(reverse){put(s,'fat','changeling-berserker','hand');put(s,'cheap','garruks-companion','hand');}else{put(s,'cheap','garruks-companion','hand');put(s,'fat','changeling-berserker','hand');}
 put(s,'spell','shock','hand');act(s,{type:'declare_attackers',playerId:'p2',attackerIds:['hill']});pass(s);pass(s);act(s,{type:'declare_blockers',playerId:'p1',assignments:{hill:['hounds']}});return s;
}
function until(s,p){for(let i=0;i<32&&!p();i++){const v=view(s);const c=v.legalCommands.find(x=>x.type==='resolve_combat');act(s,c??v.legalCommands.find(x=>x.type==='pass_priority'));}assert.ok(p(),JSON.stringify({turn:s.turn,legal:view(s).legalCommands}));}
for(const reverse of [false,true])test(`A64: realny koszt Hounds, bot wybiera tańszego stwora niezależnie od kolejności ${reverse}`,()=>{
 const s=scene({reverse});const activation=bot(s);assert.equal(activation.c.type,'activate_ability');assert.equal(activation.c.objectId,'hounds');act(s,activation.c);
 const discard=bot(s);assert.equal(discard.c.type,'resolve_discard_choice');assert.equal(discard.c.cardId,'cheap');act(s,discard.c);
 until(s,()=>s.turn.step==='main2');assert.equal(zone(s,'cheap'),'graveyard');assert.equal(zone(s,'fat'),'hand');assert.equal(zone(s,'hill'),'graveyard');assert.equal(zone(s,'hounds'),'battlefield');
});

test('A64: dawny clamp remisuje dwa rzeczywiste niegrywalne stwory; obecny je różnicuje',()=>{
 const s=scene();act(s,bot(s).c);const choices=view(s).legalCommands.filter(c=>c.type==='resolve_discard_choice');assert.deepEqual(choices.map(c=>c.cardId).sort(),['cheap','fat']);
 const now=bot(s).rows,old=bot(s,{discardUncastableClamp:10,discardUncastableScale:0.5}).rows;const score=(rows,id)=>rows.find(r=>r.cmd===`resolve_discard_choice(${id})`).score;
 assert.equal(score(now,'cheap')-score(now,'fat'),2.25);assert.equal(score(old,'cheap'),score(old,'fat'));
});

test('A64: Forest zmienia dostępność Garruka — bot odrzuca pozbawionego koloru Berserkera',()=>{
 const s=scene({green:true});const activation=bot(s).c;assert.equal(activation.objectId,'hounds');act(s,activation);const choice=bot(s).c;assert.equal(choice.cardId,'fat');act(s,choice);
 until(s,()=>s.turn.step==='main2');assert.equal(zone(s,'fat'),'graveyard');assert.equal(zone(s,'cheap'),'hand');assert.equal(zone(s,'hill'),'graveyard');assert.equal(zone(s,'hounds'),'battlefield');
});
