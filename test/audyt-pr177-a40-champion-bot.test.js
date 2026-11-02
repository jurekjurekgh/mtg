// Changeling Berserker: champion does not target, and the exiled card returns
// under its owner's control when the champion leaves (CR 702.72a). An exiled
// token cannot return (CR 704.5d; reguła 111.8); see A31's real Ambassador Oak interaction.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone='hand',player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});
 addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function scene(){const s=createGameState({seed:17740,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';put(s,'champ','changeling-berserker');addMana(s,'p1',20,{colors:['R','G','B']});return s;}
const view=s=>playerView(s,s.turn.priorityPlayerId);
const bot=()=>createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg});
function act(s,c){assert.ok(c,'komenda');let r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function until(s,p){for(let i=0;i<25&&!p();i++)pass(s);assert.ok(p(),'oczekiwany stan');}
function cast(s,id){act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId===id));}
function pending(s){cast(s,'champ');until(s,()=>!!s.pendingSacrifice);}
function find(s,cardId,zone='battlefield'){return [...s.objects.values()].find(o=>o.cardId===cardId&&o.zone===zone);}
function makeElf(s){put(s,'oak','ambassador-oak');cast(s,'oak');until(s,()=>!s.zones.stack.length);assert.ok(find(s,'token_elf_warrior'));}

test('A40: bot nie rzuca Berserkera na pusty stół',()=>{
 const s=scene();const b=bot(), choice=b.chooseCommand(view(s));assert.notEqual(choice.type,'cast_permanent',JSON.stringify(choice));
});
test('A40: bot rzuca Berserkera z rzeczywistym sojusznikiem i wybiera jego wygnanie',()=>{
 const s=scene();put(s,'ally','greater-tanuki','battlefield');const b=bot(), choice=b.chooseCommand(view(s));assert.equal(choice.objectId,'champ',JSON.stringify(choice));act(s,choice);
 until(s,()=>!!s.pendingSacrifice);const selection=b.chooseCommand(view(s));assert.equal(selection.targetId,'ally',JSON.stringify(selection));act(s,selection);assert.ok(find(s,'greater-tanuki','exile'));
});
test('A40: po rzeczywistym ETB Oak bot może wybrać token, który nie wraca',()=>{
 const s=scene();makeElf(s);put(s,'kill-oak','terminal-agony');
 const oak=find(s,'ambassador-oak');act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='kill-oak'&&c.targets?.includes(oak.id)));until(s,()=>!s.zones.stack.length);
 pending(s);const elf=find(s,'token_elf_warrior');const b=bot();const choice=b.chooseCommand(view(s));
 assert.equal(choice.targetId,elf.id,JSON.stringify({choice,trace:b.trace().at(-1)}));act(s,choice);
 assert.ok(![...s.objects.values()].some(o=>o.instanceId===elf.instanceId));
 put(s,'kill','terminal-agony');const champion=find(s,'changeling-berserker');act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='kill'&&c.targets?.includes(champion.id)));until(s,()=>!s.zones.stack.length);
 assert.ok(!find(s,'token_elf_warrior'));assert.ok(find(s,'ambassador-oak','graveyard'));
});
test('A40: nieodwracalne wygnanie prawdziwego tokena nie dostaje rabatu powracającej karty',()=>{
 const s=scene();makeElf(s);put(s,'sentinel','scorpion-sentinel','battlefield');pending(s);
 const elf=find(s,'token_elf_warrior'), b=bot(), choice=b.chooseCommand(view(s));
 // Token 1/1: trwała strata 3; Sentinel 1/4: czasowa strata 6 × 0,25.
 // Oba wybory dają Berserkera; tylko karta może później wrócić.
 assert.equal(choice.targetId,'sentinel',JSON.stringify({choice,trace:b.trace().at(-1),elf:elf.id}));act(s,choice);
 assert.ok(find(s,'scorpion-sentinel','exile'));assert.ok(find(s,'token_elf_warrior'));
 put(s,'kill','terminal-agony');const champion=find(s,'changeling-berserker');
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='kill'&&c.targets?.includes(champion.id)));until(s,()=>!s.zones.stack.length);
 assert.ok(find(s,'scorpion-sentinel'));assert.ok(find(s,'token_elf_warrior'));
});
