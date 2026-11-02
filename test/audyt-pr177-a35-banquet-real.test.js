// Wretched Banquet (Oracle, katalog): "Destroy target creature if it has the
// least power or is tied for least power among creatures on the battlefield."
// Warunek efektu ocenia się przy rozstrzygnięciu, nie jako legalność celu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
const registry = createCardRegistry();
function put(s, id, cardId, zone, owner = 'p1') {
 const [{objectId, ...data}] = createCardDeck({cardIds:[cardId], ownerId:owner, registry});
 addObject(s, {...data, id, instanceId:`i-${id}`, controllerId:owner, zone});
}
function base(active='p1') {
 const s=createGameState({seed:17735, players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main',active);s.turn.activePlayerId=s.turn.priorityPlayerId=active;
 addMana(s,'p1',6,{colors:['B','U','W']});addMana(s,'p2',6,{colors:['B','U','W']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,cmd){assert.ok(cmd,'brak komendy');const r=execute(s,cmd);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function cast(s,id,target){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId===id&&c.targets?.includes(target)));}
function bot(s){return createHeuristicBot({seed:5}).chooseCommand(view(s));}
function board(s,id){return view(s).zones.battlefield.find(o=>o.id===id);}
function position() {
 const s=base();put(s,'banquet','wretched-banquet','hand');
 put(s,'small','scorpion-sentinel','battlefield','p2');put(s,'large','leafcrown-dryad','battlefield','p2');return s;
}
test('A35: bot wybiera najmniejszy realny stwór i Banquet go niszczy',()=>{
 const s=position();const choice=bot(s);assert.equal(choice.type,'cast_spell');assert.deepEqual(choice.targets,['small']);
 act(s,choice);pass(s);pass(s);assert.notEqual(s.objects.get('small')?.zone,'battlefield');assert.equal(s.objects.get('large')?.zone,'battlefield');
});
test('A35: remis dwóch prawdziwych 2-mocowych stworów działa',()=>{
 const s=base();put(s,'banquet','wretched-banquet','hand');put(s,'a','highland-game','battlefield','p2');put(s,'b','leafcrown-dryad','battlefield','p2');
 const choice=bot(s);assert.equal(choice.type,'cast_spell');assert.ok(['a','b'].includes(choice.targets[0]));
 act(s,choice);pass(s);pass(s);assert.notEqual(s.objects.get(choice.targets[0])?.zone,'battlefield');
});
test('A35: najmniejszy własny stwór uniemożliwia pożyteczne zniszczenie',()=>{
 const s=position();put(s,'own','emissary-escort','battlefield');assert.equal(board(s,'own').power,0);assert.equal(bot(s).type,'pass_priority');
});
test('A35: rzeczywisty licznik +1/+1 zmienia minimalną moc celu',()=>{
 const s=position();put(s,'flight','fleeting-flight','hand');cast(s,'flight','small');pass(s);pass(s);
 assert.equal(board(s,'small').power,2);assert.equal(board(s,'large').power,2);
 const choice=bot(s);assert.equal(choice.type,'cast_spell');assert.ok(['small','large'].includes(choice.targets[0]));
 act(s,choice);pass(s);pass(s);assert.notEqual(s.objects.get(choice.targets[0])?.zone,'battlefield');
});
test('A35: Crumb and Get It w odpowiedzi zmienia moc celu i Banquet nic nie niszczy',()=>{
 const s=position();put(s,'crumb','crumb-and-get-it','hand','p2');const choice=bot(s);assert.deepEqual(choice.targets,['small']);
 act(s,choice);pass(s);cast(s,'crumb','small');pass(s);pass(s);assert.equal(board(s,'small').power,3);pass(s);pass(s);
 assert.equal(s.objects.get('small')?.zone,'battlefield');assert.equal(s.objects.get('large')?.zone,'battlefield');
});
test('A35: Spellkeeper Weird nie jest skazany przez Banquet po obniżeniu mocy innego stwora',()=>{
 const s=base('p2');put(s,'weird','spellkeeper-weird','battlefield');put(s,'shock','shock','graveyard');
 put(s,'other','scorpion-sentinel','battlefield','p2');put(s,'banquet','wretched-banquet','hand','p2');
 put(s,'distraction','fleeting-distraction','hand');put(s,'draw','basic-island','library');
 cast(s,'banquet','weird');pass(s);cast(s,'distraction','other');pass(s);pass(s);
 assert.equal(board(s,'other').power,0);assert.equal(board(s,'weird').power,1);
 if(s.turn.priorityPlayerId!=='p1')pass(s);
 const choice=bot(s);assert.equal(choice.type,'pass_priority',JSON.stringify(choice));act(s,choice);pass(s);
 assert.equal(s.objects.get('weird')?.zone,'battlefield');
});
test('A35: remis minimalnej mocy oznacza realne zagrożenie i Weird warto poświęcić',()=>{
 const s=base('p2');put(s,'weird','spellkeeper-weird','battlefield');put(s,'shock','shock','graveyard');
 put(s,'other','scorpion-sentinel','battlefield','p2');put(s,'banquet','wretched-banquet','hand','p2');
 cast(s,'banquet','weird');pass(s);assert.equal(board(s,'other').power,board(s,'weird').power);
 const choice=bot(s);assert.equal(choice.type,'activate_ability',JSON.stringify(choice));assert.equal(choice.objectId,'weird');
});
