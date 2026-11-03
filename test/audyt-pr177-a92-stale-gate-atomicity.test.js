// Rzeczywista komenda Heap Gate; przestarzały wybór testuje atomowość kosztu.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import {replayFromState,verifyReplay} from '../src/engine/replay.js';
const reg=createCardRegistry();
function put(s,id,card,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone:'battlefield',controllerId:p});}
function scene(p='p1'){const opp=p==='p1'?'p2':'p1',s=createGameState({seed:17792,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;put(s,'heap','heap-gate',p);put(s,'gate','basilisk-gate',p);put(s,'forest','basic-forest',p);put(s,'opponent-gate','basilisk-gate',opp);const cmd=playerView(s,p).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='heap'&&c.abilityIndex===2&&c.tapPermanentCostId==='gate');assert.ok(cmd,'rzeczywista legalna oferta');return {s,cmd};}
for(const p of ['p1','p2'])test(`A92: przestarzała wskazana brama nie tapuje Heap Gate ani nie wydaje many (${p})`,()=>{const {s,cmd}=scene(p);assert.ok(execute(s,{type:'tap_for_mana',playerId:p,objectId:'gate'}).ok);const before=stateFingerprint(s),r=execute(s,cmd);assert.equal(r.ok,false);assert.equal(s.objects.get('heap').tapped,false);assert.equal(s.objects.get('forest').tapped,false);assert.equal(stateFingerprint(s),before);});
for(const costId of ['heap','forest','opponent-gate','missing'])test(`A92: nielegalna brama kosztu ${costId} odrzucona bez częściowego tapu`,()=>{const {s,cmd}=scene(),before=stateFingerprint(s),r=execute(s,{...cmd,tapPermanentCostId:costId});assert.equal(r.ok,false);assert.equal(s.objects.get('heap').tapped,false);assert.equal(stateFingerprint(s),before);});
test('A92: poprawna aktywacja nadal tapuje oba permanenty, płaci i tworzy skarb',()=>{const {s,cmd}=scene(),r=execute(s,cmd);assert.ok(r.ok);assert.equal(s.objects.get('heap').tapped,true);assert.equal(s.objects.get('gate').tapped,true);assert.equal(s.objects.get('forest').tapped,true);for(let i=0;i<2;i++)assert.ok(execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId}).ok);assert.ok([...s.objects.values()].some(o=>o.cardId==='token_treasure'&&o.zone==='battlefield'));const replay=replayFromState(s),result=verifyReplay({...replay,commands:replay.commands.slice(-3)},()=>scene().s,execute);assert.ok(result.deterministic);assert.ok(result.results.every(x=>x.ok));assert.equal(stateFingerprint(result.state),stateFingerprint(s));});
