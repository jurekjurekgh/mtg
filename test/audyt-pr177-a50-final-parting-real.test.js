// Final Parting Oracle: search two cards, one to hand, other to graveyard,
// then shuffle. CR 701.23e: without instructions to reveal, do not reveal.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
import {describeGameEvent,PLAYER_NAMES} from '../src/table/session.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone='library'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:'p2',registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:'p2'});
}
function scene(card='final-parting'){
 const s=createGameState({seed:17750,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'spell',card,'hand');put(s,'one','woolly-loxodon');put(s,'two','highland-game');put(s,'three','basic-forest');addMana(s,'p2',5,{colors:['B','G']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spell'));
 for(let i=0;i<8&&!s.pendingSearchChoice;i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));
 assert.ok(s.pendingSearchChoice);return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
const bot=s=>createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));
const helpers={nameOf:id=>reg.get(id)?.name??id,nameOfObject:()=>'?'};
const desc=e=>describeGameEvent(e,helpers,PLAYER_NAMES,{fogOfWar:true});
function choose(s){const cmd=bot(s);assert.equal(cmd.type,'resolve_search_choice');return act(s,cmd);}

test('A50: bot nie ujawnia wyszukanej do ręki karty Final Parting',()=>{
 const s=scene();const r=choose(s);const moved=r.events.find(e=>e.type==='object_moved'&&e.toZone==='hand');assert.ok(moved);const name=reg.get(moved.object.cardId).name;
 assert.ok(!r.events.some(e=>e.type==='card_revealed'&&e.cardId===moved.object.cardId),'wyszukiwana karta nie jest odsłaniana');
 for(const e of r.events)assert.ok(!String(desc(e)).includes(name),`nazwa ukrytej karty w opisie ${e.type}: ${desc(e)}`);
 const second=choose(s);const grave=second.events.find(e=>e.type==='object_moved'&&e.toZone==='graveyard');assert.ok(grave,'inna karta jest w publicznym grobie');assert.notEqual(grave.object.instanceId,moved.object.instanceId);
});
test('A50: jedno szukanie i jedno tasowanie dopiero po obu wyborach Final Parting',()=>{
 const s=scene();const first=choose(s);assert.ok(!first.events.some(e=>e.type==='library_searched'&&e.shuffled),'brak przedwczesnego tasowania');assert.ok(s.pendingSearchChoice);
 const second=choose(s);assert.equal(second.events.filter(e=>e.type==='library_searched'&&e.shuffled).length,1);assert.equal(s.pendingSearchChoice,null);
});
test('A50: Caravan Vigil naprawdę odsłania wybraną kartę',()=>{
 const s=scene('caravan-vigil');const r=choose(s);assert.ok(r.events.some(e=>e.type==='card_revealed'&&e.cardId==='basic-forest'));assert.ok(r.events.some(e=>String(desc(e)).includes('Forest')));
});
