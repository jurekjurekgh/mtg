// Diff #177 G: zmieniona waga many kontrowanego czaru. Zamiast wstawiać
// syntetyczny obiekt stosu, rzucamy prawdziwe instants i korzystamy z priorytetu.
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
function scene(){const s=createGameState({seed:17752,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';put(s,'negate','negate','hand');put(s,'victim','highland-game');addMana(s,'p1',2,{colors:['U']});return s;}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({step:s.turn.step,commands:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function bot(s){return createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function finish(s){for(let i=0;i<20&&s.zones.stack.length;i++){const choice=view(s).legalCommands.find(c=>c.type==='resolve_optional_spell_effect'&&c.apply===true);if(choice)act(s,choice);else pass(s);}assert.equal(s.zones.stack.length,0);}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function cast(s,id,target){const c=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId===id&&(!target||c.targets?.includes(target)));act(s,c);}

test('A52: Negate bota kontruje faktycznie rzucony Shock i ratuje Highland Game',()=>{
 const s=scene();put(s,'shock','shock','hand','p2');addMana(s,'p2',1,{colors:['R']});cast(s,'shock','victim');pass(s);
 const c=bot(s);assert.equal(c.objectId,'negate',JSON.stringify(c));assert.ok(c.targets.includes(card(s,'shock').id));act(s,c);finish(s);
 assert.equal(card(s,'victim').zone,'battlefield');assert.equal(card(s,'shock').zone,'graveyard');assert.equal(card(s,'negate').zone,'graveyard');
});
test('A52: bot zachowuje Negate przeciw rzeczywistemu Twiddle',()=>{
 const s=scene();put(s,'twiddle','twiddle','hand','p2');put(s,'elf','druid-of-the-cowl');addMana(s,'p2',1,{colors:['U']});cast(s,'twiddle','elf');pass(s);
 const c=bot(s);assert.equal(c.type,'pass_priority',JSON.stringify(c));act(s,c);finish(s);assert.equal(card(s,'negate').zone,'hand');assert.equal(card(s,'elf').tapped,true);
});
test('A52: własny Shock, wrogie Negate i odpowiedź bota własnym Negate',()=>{
 const s=scene();s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'shock','shock','hand');put(s,'enemy-negate','negate','hand','p2');addMana(s,'p1',1,{colors:['R']});addMana(s,'p2',2,{colors:['U']});
 cast(s,'shock','p2');pass(s);cast(s,'enemy-negate',card(s,'shock').id);pass(s);
 const c=bot(s);assert.equal(c.objectId,'negate',JSON.stringify(c));assert.ok(c.targets.includes(card(s,'enemy-negate').id));act(s,c);finish(s);
 assert.equal(s.players.find(p=>p.id==='p2').life,18);assert.equal(card(s,'shock').zone,'graveyard');assert.equal(card(s,'enemy-negate').zone,'graveyard');
});
test('A52: prawdziwy Steel Sabotage kontruje Seer’s Lantern zamiast odbijać Brawler’s Plate',()=>{
 const s=scene();put(s,'sabotage','steel-sabotage','hand');put(s,'plate','brawlers-plate','battlefield','p2');put(s,'lantern','seers-lantern','hand','p2');
 addMana(s,'p1',1,{colors:['U']});addMana(s,'p2',3,{colors:['C']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='lantern'));pass(s);
 const c=bot(s);assert.equal(c.objectId,'sabotage',JSON.stringify(c));assert.equal(c.modeIndex,0,JSON.stringify(c));assert.ok(c.targets.includes(card(s,'lantern').id));act(s,c);finish(s);
 assert.equal(card(s,'lantern').zone,'graveyard');assert.equal(card(s,'plate').zone,'battlefield');
});
test('A52: realne zagrożenie Marut 7/7 odbijane zamiast kontrowania Seer’s Lantern',()=>{
 const s=scene();put(s,'sabotage','steel-sabotage','hand');put(s,'marut','marut','battlefield','p2');put(s,'lantern','seers-lantern','hand','p2');
 addMana(s,'p1',1,{colors:['U']});addMana(s,'p2',3,{colors:['C']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='lantern'));pass(s);
 const c=bot(s);assert.equal(c.objectId,'sabotage',JSON.stringify(c));assert.equal(c.modeIndex,1,JSON.stringify(c));assert.ok(c.targets.includes('marut'));act(s,c);finish(s);
 assert.equal(card(s,'marut').zone,'hand');assert.equal(card(s,'lantern').zone,'battlefield');
});
