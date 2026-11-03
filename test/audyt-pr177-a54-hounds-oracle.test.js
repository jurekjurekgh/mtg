// EXO Vampire Hounds: Discard a creature card: this creature gets +2/+2
// until end of turn. No {B} in activation cost and no once-per-turn limit.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {effectivePower,effectiveToughness} from '../src/engine/permanents.js';
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function scene(){const s=createGameState({seed:17754,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'hounds','vampire-hounds','battlefield');return s;}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({commands:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function finish(s){for(let i=0;i<20&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function activate(s){act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='hounds'));}

test('A54: bez many i bez karty stwora nie można aktywować Hounds',()=>{
 const s=scene();put(s,'spell','shock');put(s,'land','basic-swamp');assert.equal(s.players[0].mana,0);assert.ok(!view(s).legalCommands.some(c=>c.type==='activate_ability'&&c.objectId==='hounds'));
});
test('A54: dwa discardy stworów bez many — dwie aktywacje, kumulacja +4/+4',()=>{
 const s=scene();put(s,'weak','highland-game');put(s,'strong','woolly-loxodon');put(s,'spell','shock');
 assert.equal(s.players[0].mana,0);activate(s);
 const illegal=execute(s,{type:'resolve_discard_choice',playerId:'p1',cardId:'spell'});assert.equal(illegal.ok,false);assert.equal(card(s,'spell').zone,'hand');
 const discard=view(s).legalCommands.filter(c=>c.type==='resolve_discard_choice');assert.ok(discard.some(c=>c.cardId==='weak'));assert.ok(discard.some(c=>c.cardId==='strong'));assert.ok(!discard.some(c=>c.cardId==='spell'));
 act(s,discard.find(c=>c.cardId==='weak'));assert.equal(card(s,'weak').zone,'graveyard');assert.equal(card(s,'spell').zone,'hand');
 activate(s);assert.equal(card(s,'strong').zone,'graveyard');assert.equal(s.players[0].mana,0);assert.equal(s.zones.stack.length,2);
 finish(s);assert.equal(effectivePower(card(s,'hounds'),s),6);assert.equal(effectiveToughness(card(s,'hounds'),s),6);assert.equal(card(s,'spell').zone,'hand');
});
