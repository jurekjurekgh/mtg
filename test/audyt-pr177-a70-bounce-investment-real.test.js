// Sea God's Scorn returns up to three target creatures/enchantments. Bestow
// stops being an Aura when unattached; an Equipment remains on the battlefield.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1'){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function until(s,p){for(let i=0;i<30&&!p();i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.ok(p());}
function find(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function game(){const s=createGameState({seed:17770,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';put(s,'host','highland-game','battlefield','p2');return s;}
function switchToScorn(s){s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'scorn','sea-gods-scorn');addMana(s,'p1',6,{colors:['U']});}
function bot(s,params){const b=createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg,...(params?{params}:{})});const c=b.chooseCommand(view(s));return {c,rows:b.trace().at(-1).options};}
function score(rows,target){return rows.find(o=>o.cmd===`cast_spell(scorn->${target})`)?.score;}
function cast(s,c){act(s,c);until(s,()=>s.zones.stack.length===0);}

test('A70: bot odbija hosta z Curiosity i dwóch innych, nie marnuje celu na aurę',()=>{
 const s=game();put(s,'aura','curiosity','hand','p2');addMana(s,'p2',1,{colors:['U']});cast(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='aura'&&c.targets?.includes('host')));
 const aura=find(s,'aura');for(let i=1;i<=3;i++)put(s,`foe${i}`,'highland-game','battlefield','p2');switchToScorn(s);
 const {c,rows}=bot(s);assert.equal(c.objectId,'scorn');assert.ok(c.targets.includes('host'));assert.ok(!c.targets.includes(aura.id));assert.equal(c.targets.length,3);
 const variant=rows.find(o=>o.cmd.includes(`host+${aura.id}+foe1`));assert.ok(variant);assert.ok(variant.score<rows.find(o=>o.cmd===`cast_spell(scorn->${c.targets.join('+')})`).score);
 cast(s,c);assert.equal(find(s,'host').zone,'hand');assert.equal(find(s,'aura').zone,'graveyard');assert.equal(['foe1','foe2','foe3'].filter(id=>find(s,id).zone==='hand').length,2);
});

test('A70: prawdziwy bestow Dryad nie jest tracony przy odbiciu hosta',()=>{
 const s=game();put(s,'dryad','leafcrown-dryad','hand','p2');addMana(s,'p2',4,{colors:['G']});cast(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='dryad'&&c.bestow&&c.targets?.includes('host')));
 const dryad=find(s,'dryad');assert.equal(dryad.kind,'aura');assert.equal(dryad.attachedTo,'host');switchToScorn(s);
 const {rows}=bot(s);const zero=bot(s,{bounceAuraTmcWeight:0}).rows;assert.equal(score(rows,'host'),score(zero,'host'),'bestow nie jest traconym kosztem aury');
 cast(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='scorn'&&c.targets?.length===1&&c.targets[0]==='host'));
 assert.equal(find(s,'host').zone,'hand');assert.equal(find(s,'dryad').zone,'battlefield');assert.equal(find(s,'dryad').kind,'creature');assert.equal(find(s,'dryad').attachedTo,null);
});

test('A70: living weapon Strandwalker zostaje, zwrócony Germ przestaje istnieć',()=>{
 const s=game();put(s,'equipment','strandwalker','hand','p2');addMana(s,'p2',5);cast(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='equipment'));
 const equipment=find(s,'equipment');const germ=s.objects.get(equipment.attachedTo);assert.ok(germ?.isToken);assert.equal(germ.cardId,'token_germ');switchToScorn(s);
 const {rows}=bot(s);const zero=bot(s,{bounceEquipmentTmcWeight:0}).rows;assert.equal(score(rows,germ.id)-score(zero,germ.id),10,'5 many Equipment × waga 2');
 cast(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='scorn'&&c.targets?.length===1&&c.targets[0]===germ.id));
 assert.equal(find(s,'equipment').zone,'battlefield');assert.equal(find(s,'equipment').attachedTo,null);assert.ok(![...s.objects.values()].some(o=>o.instanceId===germ.instanceId));
});
