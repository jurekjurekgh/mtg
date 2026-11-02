// A56: PMSSB-82 na rzeczywistych kartach i legalnej walce.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {effectiveKeywords,effectivePower} from '../src/engine/permanents.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});
 addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
 if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({step:s.turn.step,commands:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function stack(s){for(let i=0;i<24&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function combat(s){for(let i=0;i<24&&s.turn.step!=='main2';i++){const c=view(s).legalCommands.find(c=>c.type==='resolve_combat');if(c)act(s,c);else pass(s);}assert.equal(s.turn.step,'main2');}
function zone(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`)?.zone;}
function game({foe='druid-of-the-cowl',delirium=false,opponentGrave=false}={}){
 const s=createGameState({seed:17756,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'declare_attackers','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'mine','highland-game','battlefield');put(s,'foe',foe,'battlefield','p2');put(s,'urge','violent-urge','hand');put(s,'mountain','basic-mountain','battlefield');
 if(delirium||opponentGrave){const p=opponentGrave?'p2':'p1';put(s,'grave-art','halo-scarab','graveyard',p);put(s,'grave-land','basic-forest','graveyard',p);put(s,'grave-sorc','caravan-vigil','graveyard',p);}
 act(s,{type:'declare_attackers',playerId:'p1',attackerIds:['mine']});pass(s);pass(s);
 act(s,{type:'declare_blockers',playerId:'p2',assignments:{mine:['foe']}});pass(s);assert.equal(s.turn.priorityPlayerId,'p1');return s;
}
function choice(s){const bot=createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg});const c=bot.chooseCommand(view(s));const rows=bot.trace().at(-1)?.options??[];return {c,rows};}
function chooseUrge(s){const {c,rows}=choice(s);assert.equal(c.type,'cast_spell',JSON.stringify({c,rows}));assert.equal(c.objectId,'urge');assert.deepEqual(c.targets,['mine']);act(s,c);stack(s);}

test('A56: bot stosuje prawdziwy Urge: +1 i first strike ratują Highland Game przeciw Druidowi',()=>{
 const s=game();chooseUrge(s);assert.equal(effectivePower(s.objects.get('mine'),s),3);assert.ok(effectiveKeywords(s.objects.get('mine'),s).includes('first_strike'));assert.ok(!effectiveKeywords(s.objects.get('mine'),s).includes('double_strike'));
 combat(s);assert.equal(zone(s,'mine'),'battlefield');assert.equal(zone(s,'foe'),'graveyard');
});

test('A56: delirium z własnego grobu umożliwia wymianę Highland Game na Scorpion Sentinel',()=>{
 const s=game({foe:'scorpion-sentinel',delirium:true});chooseUrge(s);assert.ok(effectiveKeywords(s.objects.get('mine'),s).includes('double_strike'));combat(s);assert.equal(zone(s,'mine'),'graveyard');assert.equal(zone(s,'foe'),'graveyard');
});

test('A56: bez delirium czar nie daje double strike nawet przy czterech typach w grobie przeciwnika',()=>{
 const s=game({foe:'scorpion-sentinel',opponentGrave:true});const {c,rows}=choice(s);assert.equal(c.type,'resolve_combat',JSON.stringify({c,rows}));
 const empty=choice(game({foe:'scorpion-sentinel'}));const score=rows.find(r=>r.cmd==='cast_spell(urge->mine)').score;assert.equal(score,empty.rows.find(r=>r.cmd==='cast_spell(urge->mine)').score);
 const urge=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='urge'&&c.targets?.[0]==='mine');act(s,urge);stack(s);assert.ok(!effectiveKeywords(s.objects.get('mine'),s).includes('double_strike'));combat(s);assert.equal(zone(s,'mine'),'graveyard');assert.equal(zone(s,'foe'),'battlefield');
});

test('A56: przed atakiem bot nie marnuje Urge, mimo że ma legalny cel i czerwoną manę',()=>{
 const s=createGameState({seed:17756,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'mine','highland-game','battlefield');put(s,'foe','druid-of-the-cowl','battlefield','p2');put(s,'urge','violent-urge','hand');put(s,'mountain','basic-mountain','battlefield');
 assert.ok(view(s).legalCommands.some(c=>c.type==='cast_spell'&&c.objectId==='urge'));const {c,rows}=choice(s);assert.notEqual(c.type,'cast_spell',JSON.stringify({c,rows}));
});
