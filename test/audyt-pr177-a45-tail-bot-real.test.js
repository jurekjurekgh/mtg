// Tail Slash deals damage from the chosen creature, using its current power;
// see Oracle and 2015-02-25 ruling in docs/cards/scryfall-tail-slash.json.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone='battlefield',player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function scene(dealer='goldmeadow-nomad',victim='hill-giant'){
 const s=createGameState({seed:17745,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'dealer',dealer);put(s,'victim',victim,'battlefield','p2');put(s,'slash','tail-slash','hand');addMana(s,'p1',5,{colors:['R']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function finish(s){for(let i=0;i<16&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function bot(s){return createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function zone(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`)?.zone;}

test('A45: 1/2 Goldmeadow Nomad nie dobija Hill Gianta, bot nie marnuje Tail Slash',()=>{
 const s=scene();const cmd=bot(s);assert.notEqual(cmd.objectId,'slash',JSON.stringify(cmd));
});
test('A45: bot wybiera 3/2 Invokera zamiast 1/2 Nomada i usuwa Hill Gianta',()=>{
 const s=scene();put(s,'strong','silvanuss-invoker');const cmd=bot(s);assert.equal(cmd.objectId,'slash',JSON.stringify(cmd));assert.deepEqual(cmd.targets,['strong','victim']);act(s,cmd);finish(s);assert.equal(zone(s,'victim'),'graveyard');
});
test('A45: Deadly Recluse ma deathtouch i zabija Hill Gianta jednym obrażeniem',()=>{
 const s=scene('deadly-recluse');const cmd=bot(s);assert.equal(cmd.objectId,'slash',JSON.stringify(cmd));act(s,cmd);finish(s);assert.equal(zone(s,'victim'),'graveyard');
});
test('A45: Spare from Evil chroni przeciwnika przed pająkiem, bot nie marnuje czaru',()=>{
 const s=scene('deadly-recluse');put(s,'spare','spare-from-evil','hand','p2');addMana(s,'p2',2,{colors:['W']});pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spare'));finish(s);assert.equal(s.turn.priorityPlayerId,'p1');
 const cmd=bot(s);assert.notEqual(cmd.objectId,'slash',JSON.stringify(cmd));assert.equal(zone(s,'victim'),'battlefield');
});
test('A45: chroniony Hill Giant nie dostaje obrażeń od pająka, mimo legalnego czerwonego czaru',()=>{
 const s=scene('deadly-recluse');put(s,'spare','spare-from-evil','hand','p2');addMana(s,'p2',2,{colors:['W']});pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spare'));finish(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='slash'&&JSON.stringify(c.targets)===JSON.stringify(['dealer','victim'])));finish(s);
 assert.equal(zone(s,'victim'),'battlefield');assert.equal(s.objects.get('victim').damage,0);
});
test('A45: Spare nie chroni Hill Gianta przed ludzkim Academy Journeymage',()=>{
 const s=scene('academy-journeymage');put(s,'spare','spare-from-evil','hand','p2');addMana(s,'p2',2,{colors:['W']});pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spare'));finish(s);
 const cmd=bot(s);assert.equal(cmd.objectId,'slash',JSON.stringify(cmd));act(s,cmd);finish(s);assert.equal(zone(s,'victim'),'graveyard');
});
test('A45: bot wybiera ludzkie źródło zamiast pająka przeciwko Spare',()=>{
 const s=scene('deadly-recluse');put(s,'human','academy-journeymage');put(s,'spare','spare-from-evil','hand','p2');addMana(s,'p2',2,{colors:['W']});pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spare'));finish(s);
 const cmd=bot(s);assert.equal(cmd.objectId,'slash',JSON.stringify(cmd));assert.deepEqual(cmd.targets,['human','victim']);act(s,cmd);finish(s);assert.equal(zone(s,'victim'),'graveyard');
});
test('A45: w oknie ataku ochrona nadal nie pozwala ratować się jałowym Tail Slash',()=>{
 const s=scene('deadly-recluse');s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'spare','spare-from-evil','hand','p2');addMana(s,'p2',2,{colors:['W']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spare'));finish(s);
 for(let i=0;i<8&&s.turn.step!=='declare_attackers';i++)pass(s);
 assert.equal(s.turn.step,'declare_attackers');
 s.objects.set('victim',Object.freeze({...s.objects.get('victim'),summoningSickness:false}));
 act(s,{type:'declare_attackers',playerId:'p2',attackerIds:['victim']});pass(s);assert.equal(s.turn.priorityPlayerId,'p1');addMana(s,'p1',5,{colors:['R']});
 assert.notEqual(bot(s).objectId,'slash');
});
