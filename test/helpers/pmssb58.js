// PMSSB-58: sceny rzeczywistego silnika; każda wykonana komenda jest sprawdzana.
import assert from 'node:assert/strict';
import {createGameState, addObject, playerView, execute} from '../../src/engine/game-state.js';
import {createCardRegistry, BLOOD_TOKEN_EFFECT, SPAWN_TOKEN_EFFECT} from '../../src/cards/card-data.js';
import {gameObjectDataOf} from '../../src/cards/materialize.js';
import {jumpToStep} from '../../src/engine/turn.js';
import {addMana} from '../../src/engine/resources.js';
import {createBattlefieldToken} from '../../src/engine/tokens.js';
import {createHeuristicBot} from '../../src/controllers/heuristic-bot.js';
export {playerView, execute, addMana, BLOOD_TOKEN_EFFECT, SPAWN_TOKEN_EFFECT};
export const registry=createCardRegistry();
export function put(s,id,cid,pid='p1',zone='battlefield',patch={}){
 const d=registry.get(cid);assert.ok(d,cid);
 addObject(s,{id,instanceId:`i-${id}`,cardId:cid,controllerId:pid,ownerId:pid,zone,
  ...gameObjectDataOf(d),types:d.types,subtypes:d.subtypes,keywords:d.keywords});
 if(Object.keys(patch).length)s.objects.set(id,Object.freeze({...s.objects.get(id),...patch}));
 return s.objects.get(id);
}
export function game({step='main',active='p1',priority=active,lib=24}={}){
 const s=createGameState({seed:58,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,step,active);s.turn.activePlayerId=active;s.turn.priorityPlayerId=priority;
 for(const pid of ['p1','p2'])for(let i=0;i<lib;i++)put(s,`lib-${pid}-${i}`,'basic-swamp',pid,'library');
 return s;
}
export function creature(s,id,pid='p2',patch={}){
 const p=put(s,id,'maritime-guard',pid,'battlefield',{power:2,toughness:2,summoningSickness:false,...patch});return p;
}
export function lands(s,n,cid='basic-swamp',pid='p1',tapped=false){
 for(let i=0;i<n;i++)put(s,`land-${s.objects.size}-${i}`,cid,pid,'battlefield',{tapped});
}
export function token(s,effect=BLOOD_TOKEN_EFFECT,pid='p1'){return createBattlefieldToken(s,pid,effect);}
export function choices(s,pid=s.turn.priorityPlayerId){return playerView(s,pid).legalCommands;}
export function run(s,cmd){assert.ok(cmd,'oferta istnieje');const r=execute(s,cmd);assert.equal(r.ok,true,JSON.stringify(r.events));return r;}
export function pass(s){return run(s,choices(s).find(c=>c.type==='pass_priority'));}
export function settle(s,until=()=>false){
 for(let i=0;i<64;i++){
  if(until(s))return;
  const dec=choices(s).find(c=>c.type.startsWith('resolve_')&&c.type!=='resolve_combat');
  if(!s.zones.stack.length&&!dec)return;
  if(dec)run(s,dec);else pass(s);
 }
 assert.fail('limit rozstrzygania');
}
export function decide(s,{playerId=s.turn.priorityPlayerId,params,reg=registry,view=playerView(s,playerId),...rest}={}){
 const bot=createHeuristicBot({seed:58,params,registry:reg,...rest});const cmd=bot.chooseCommand(view);
 const entry=bot.trace().at(-1);return {cmd,entry,scores:new Map(entry.options.map(x=>[x.cmd,x.score])),view};
}
export function score(s,label,opts={}){
 const d=decide(s,opts);const found=[...d.scores].filter(([k])=>typeof label==='string'?k===label:label.test(k));
 assert.equal(found.length,1,`dokładnie jeden wynik ${label}: ${JSON.stringify([...d.scores])}`);return found[0][1];
}
export function variant(cid,patch){return {...registry,get:id=>id===cid?{...registry.get(id),...patch}:registry.get(id)};}
export function cast(s,cid,id='spell',pid='p1'){
 put(s,id,cid,pid,'hand');addMana(s,pid,registry.get(cid).manaCost,{colors:registry.get(cid).colors});
 const cmd=choices(s).find(c=>(c.type==='cast_permanent'||c.type==='cast_spell')&&c.objectId===id);run(s,cmd);return cmd;
}
