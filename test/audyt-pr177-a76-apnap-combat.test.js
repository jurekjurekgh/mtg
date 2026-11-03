// Rzeczywiste obrażenia bojowe i osobne okno first strike.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
const reg=createCardRegistry();
function put(s,id,card,zone,player){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(active,firstStrike=false){
 const other=active==='p1'?'p2':'p1',s=createGameState({seed:17776,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'declare_attackers',active);s.turn.activePlayerId=s.turn.priorityPlayerId=active;
 for(const p of [other,active]){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<3;i++)put(s,`${p}-lib${i}`,'basic-island','library',p);}
 put(s,'attacker',firstStrike?'ainok-tracker':'hill-giant','battlefield',active);s.objects.set('attacker',Object.freeze({...s.objects.get('attacker'),summoningSickness:false}));put(s,'blocker','goblin-picker','battlefield',other);
 act(s,{type:'declare_attackers',playerId:active,attackerIds:['attacker']});pass(s);pass(s);act(s,{type:'declare_blockers',playerId:other,assignments:{attacker:['blocker']}});
 for(let i=0;i<8;i++){const c=view(s).legalCommands.find(c=>c.type==='resolve_combat');if(c){act(s,c);break;}pass(s);}
 assert.equal([...s.objects.values()].find(o=>o.instanceId==='i-blocker')?.zone,'graveyard');return {s,active,other,firstStrike};
}
function choose(x){
 const {s,active,other,firstStrike}=x;assert.equal(s.turn.priorityPlayerId,active);assert.equal(s.turn.step,firstStrike?'combat_damage':'end_of_combat');if(firstStrike)assert.ok(s.pendingCombatSecondPass);
 const opts=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(opts.length,2);const before=stateFingerprint(s);assert.equal(execute(s,{type:'resolve_trigger_order',playerId:other,stackEntryId:opts[0].stackEntryId}).ok,false);assert.equal(stateFingerprint(s),before);
 act(s,opts.find(c=>c.cardId==='murder-of-crows'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===other));assert.equal(s.turn.priorityPlayerId,other);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='selhoff-occultist'));act(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId===active));
 const stack=s.zones.stack.map(id=>s.objects.get(id));assert.deepEqual(stack.map(o=>o.controllerId),[active,active,other,other]);assert.equal(stack.at(-1).cardId,'selhoff-occultist');assert.equal(s.turn.priorityPlayerId,active);
 pass(s);pass(s);assert.equal([...s.objects.values()].find(o=>o.instanceId===`i-${active}-lib0`)?.zone,'graveyard');if(firstStrike)assert.ok(s.pendingCombatSecondPass);
}
for(const active of ['p1','p2'])for(const first of [false,true])test(`A76: walka APNAP ${active}, first strike ${first}`,()=>choose(scene(active,first)));
