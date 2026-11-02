// Edifice: ochrona przed czarnym zabrania celowania czarną zdolnością.
// https://gatherer.wizards.com/ONE/en-us/79/ambulatory-edifice
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone='battlefield',player='p1'){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({turn:s.turn,legal:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function until(s,p){for(let i=0;i<24&&!p();i++)pass(s);assert.ok(p(),JSON.stringify({turn:s.turn,commands:view(s).legalCommands}));}
function scene(color){
 const s=createGameState({seed:17763,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'target','bog-hoodlums','battlefield','p2');put(s,'aura','benevolent-blessing','hand','p2');addMana(s,'p2',2,{colors:['W']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='aura'&&c.targets?.includes('target')));until(s,()=>!!s.pendingColorChoice);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_color_choice'&&c.color===color));until(s,()=>s.zones.stack.length===0);
 s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'edifice','ambulatory-edifice','hand');addMana(s,'p1',3,{colors:['B']});return s;
}
function bot(s){const b=createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg});const c=b.chooseCommand(view(s));return {c,options:b.trace().at(-1).options};}
function score(s){return bot(s).options.find(o=>o.cmd.startsWith('cast_permanent(edifice')).score;}

test('A63: wycena ETB nie nagradza celu chronionego przed czarną zdolnością',()=>{
 const forbidden=scene('B'),allowed=scene('W');const black=score(forbidden),white=score(allowed);assert.ok(white>black,`${white} powinno przewyższać ${black}`);
});

for(const [color,expectTarget] of [['B',false],['W',true]]) test(`A63: rzeczywisty refleks Edifice i ochrona ${color}`,()=>{
 const s=scene(color);const choice=bot(s).c;assert.equal(choice.objectId,'edifice');act(s,choice);until(s,()=>!!s.pendingOptionalPay);
 const pay=view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay);assert.equal(pay.reflexiveTargetIds.includes('target'),expectTarget,JSON.stringify(pay));
 const decision=bot(s).c;assert.equal(decision.type,'resolve_optional_pay_choice');assert.equal(decision.pay,expectTarget);act(s,decision);
 if(expectTarget){until(s,()=>s.pendingTriggerTargets.length>0);const target=bot(s).c;assert.equal(target.targetId,'target');act(s,target);until(s,()=>s.zones.stack.length===0);assert.equal([...s.objects.values()].find(o=>o.instanceId==='i-target').zone,'graveyard');}
 else assert.equal([...s.objects.values()].find(o=>o.instanceId==='i-target').zone,'battlefield');
});
