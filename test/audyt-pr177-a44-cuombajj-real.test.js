// Cuombajj Witches has two distinct instances of "target", and the second
// is chosen by the opponent. CR 601.2c, applied via CR 602.2b, permits the
// same object for distinct instances; CR 608.2b preserves the legal part when
// only one target is illegal. CR 2026-09-25 SHA-256
// 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
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
 if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
function scene(victim='hill-giant'){
 const s=createGameState({seed:17744,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'witches','cuombajj-witches');put(s,'victim',victim,'battlefield','p2');return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'komenda');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){const v=view(s),cmd=v.legalCommands.find(c=>c.type==='pass_priority');assert.ok(cmd,JSON.stringify(v.legalCommands));act(s,cmd);}
function finish(s){for(let i=0;i<16&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function bot(s){return createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg}).chooseCommand(view(s));}
function shock(s){put(s,'shock','shock','hand');addMana(s,'p1',1,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));finish(s);}
function activate(s,id){act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='witches'&&c.targets?.[0]===id));assert.equal(s.turn.priorityPlayerId,'p2');}
function other(s,id){const options=view(s).legalCommands;act(s,options.find(c=>c.type==='resolve_opponent_target'&&c.targetId===id));}
function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}

test('A44: bot dobija faktycznie uszkodzonego Hill Gianta, przeciwnik wybiera drugie obrażenie',()=>{
 const s=scene();shock(s);assert.equal(card(s,'victim').damage,2);const choice=bot(s);assert.equal(choice.type,'activate_ability',JSON.stringify(choice));assert.deepEqual(choice.targets,['victim']);act(s,choice);
 assert.equal(card(s,'witches').tapped,false);assert.equal(s.turn.priorityPlayerId,'p2');other(s,'p1');assert.equal(card(s,'witches').tapped,true);finish(s);
 assert.equal(card(s,'victim').zone,'graveyard');assert.equal(s.players.find(p=>p.id==='p1').life,19);
});
test('A44: oba słowa target pozwalają przeciwnikowi wskazać ten sam cel',()=>{
 const s=scene('scorpion-sentinel');activate(s,'victim');assert.ok(view(s).legalCommands.some(c=>c.type==='resolve_opponent_target'&&c.targetId==='victim'));other(s,'victim');finish(s);assert.equal(card(s,'victim').damage,2);
});
test('A44: Magic Damper unieważnia pierwszy cel, drugie obrażenie pozostaje',()=>{
 const s=scene('scorpion-sentinel');put(s,'damper','magic-damper','hand','p2');addMana(s,'p2',2,{colors:['U']});activate(s,'victim');other(s,'p1');pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='damper'&&c.targets?.includes('victim')));finish(s);
 assert.equal(card(s,'victim').damage,0);assert.equal(s.players.find(p=>p.id==='p1').life,19);
});
test('A44: bot przy 2 życiach nie ryzykuje drugiego pingu dla dobijania',()=>{
 const s=scene();shock(s);s.players.find(p=>p.id==='p1').life=2;assert.notEqual(bot(s).type,'activate_ability');
});
test('A44: nielegalny drugi cel nie powstrzymuje obrażeń pierwszego',()=>{
 const s=scene('scorpion-sentinel');put(s,'damper','magic-damper','hand','p2');addMana(s,'p2',2,{colors:['U']});activate(s,'p2');other(s,'victim');pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='damper'&&c.targets?.includes('victim')));finish(s);
 assert.equal(card(s,'victim').damage,0);assert.equal(s.players.find(p=>p.id==='p2').life,19);
});
