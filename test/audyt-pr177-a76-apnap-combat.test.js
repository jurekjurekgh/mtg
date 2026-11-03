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
function scene(active,firstStrike=false,bothDie=false){
 const other=active==='p1'?'p2':'p1',s=createGameState({seed:17776,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'declare_attackers',active);s.turn.activePlayerId=s.turn.priorityPlayerId=active;
 for(const p of [other,active]){put(s,`${p}-crow`,'murder-of-crows','battlefield',p);put(s,`${p}-occult`,'selhoff-occultist','battlefield',p);for(let i=0;i<3;i++)put(s,`${p}-lib${i}`,'basic-island','library',p);}
 put(s,'attacker',firstStrike?'ainok-tracker':bothDie?'goblin-picker':'hill-giant','battlefield',active);s.objects.set('attacker',Object.freeze({...s.objects.get('attacker'),summoningSickness:false}));put(s,'blocker','goblin-picker','battlefield',other);
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

for(const first of [false,true])test(`A76: wybory bota i replay w walce first strike ${first}`,()=>{
 const {s,active,other}=scene('p1',first),bot=createHeuristicBot({seed:177,randomness:0,lookahead:0,registry:reg});let count=0;
 while(count<12){const v=view(s);if(!v.legalCommands.some(c=>c.type==='resolve_trigger_order'||c.type==='resolve_trigger_target'))break;
  const cmd=bot.chooseCommand(v);assert.ok(['resolve_trigger_order','resolve_trigger_target'].includes(cmd.type),JSON.stringify(cmd));act(s,cmd);count++;
 }
 assert.equal(count,4);assert.deepEqual(s.zones.stack.map(id=>s.objects.get(id).controllerId),[active,active,other,other]);
 const replay=replayFromState(s),verified=verifyReplay({...replay,commands:replay.commands.slice(-count)},()=>scene('p1',first).s,execute);
 assert.ok(verified.deterministic);assert.ok(verified.results.every(r=>r.ok));assert.equal(stateFingerprint(verified.state),stateFingerprint(s));
});
test('A76: dwa walczące stwory umierają jednocześnie, osiem triggerów w APNAP',()=>{
 const {s,active,other}=scene('p1',false,true);assert.equal([...s.objects.values()].find(o=>o.instanceId==='i-attacker')?.zone,'graveyard');
 const bot=createHeuristicBot({seed:177,randomness:0,lookahead:0,registry:reg});let count=0;
 while(count<20){const v=view(s);if(!v.legalCommands.some(c=>c.type==='resolve_trigger_order'||c.type==='resolve_trigger_target'))break;const cmd=bot.chooseCommand(v);assert.ok(['resolve_trigger_order','resolve_trigger_target'].includes(cmd.type));act(s,cmd);count++;}
 assert.equal(count,10);assert.deepEqual(s.zones.stack.map(id=>s.objects.get(id).controllerId),[...Array(4).fill(active),...Array(4).fill(other)]);assert.equal(s.turn.priorityPlayerId,active);
});
test('A76: po first strike najpierw rozstrzygają się triggery, dopiero potem zwykłe obrażenia',()=>{
 const x=scene('p1',true);choose(x);const {s}=x,bot=createHeuristicBot({seed:7,randomness:0,lookahead:0,registry:reg});let didSecond=false;
 for(let i=0;i<70&&s.turn.step==='combat_damage';i++){
  const v=view(s),combat=v.legalCommands.find(c=>c.type==='resolve_combat');if(combat){assert.equal(s.zones.stack.length,0);act(s,combat);didSecond=true;break;}act(s,bot.chooseCommand(v));
 }
 assert.equal(didSecond,true);assert.equal(s.turn.step,'end_of_combat');assert.equal(s.pendingCombatSecondPass,null);assert.equal(s.objects.get('attacker').damage,0);assert.equal(s.players.find(p=>p.id==='p2').life,20);
});
