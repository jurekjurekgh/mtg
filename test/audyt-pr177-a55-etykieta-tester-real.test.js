// A55: realna oferta Gila Courser po rozstrzygnięciu saddle -> etykieta panelu
// -> ten sam helper transkryptu, bez uruchamiania Żywego Testera ani B0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { commandLabel } from '../src/table/render.js';
import { ACTION_LABEL_LOG_CAP, actionLabelForLog } from '../tools/table-tester/labels.mjs';
import { benchmarkDecks, listRepoDeckNames } from '../tools/benchmark.mjs';
const reg=createCardRegistry();
const session={nameOf:id=>reg.get(id)?.name??id,nameOfObject:o=>reg.get(o?.cardId)?.name??o?.id,cardDetails:id=>reg.get(id)??null,abilitiesOf:id=>reg.get(id)?.abilities??[]};
function put(s,id,cardId){const def=reg.get(cardId);addObject(s,{id,instanceId:`i-${id}`,cardId,ownerId:'p1',controllerId:'p1',zone:'battlefield',...gameObjectDataOf(def)});}
function act(s,c){assert.ok(c);const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function finish(s){for(let i=0;i<12&&s.zones.stack.length;i++)act(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId});assert.equal(s.zones.stack.length,0);}

test('A55: etykieta rzeczywistej pierwszej i ponownej oferty Gila Courser trafia do helpera transkryptu w całości',()=>{
 const s=createGameState({seed:17755,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'mount','gila-courser');put(s,'first','highland-game');put(s,'second','highland-game');
 const choices=()=>playerView(s,'p1').legalCommands.filter(c=>c.type==='activate_ability'&&c.objectId==='mount');
 const first=choices().find(c=>c.crewCreatureIds?.includes('first')&&!c.crewCreatureIds?.includes('second'));assert.ok(first,JSON.stringify(choices()));
 const before=commandLabel(first,session,playerView(s,'p1'));assert.doesNotMatch(before,/UWAGA/);assert.equal(actionLabelForLog(before),before);
 act(s,first);finish(s);assert.equal(s.objects.get('mount').saddled,true);assert.equal(s.objects.get('first').tapped,true);
 const second=choices().find(c=>c.crewCreatureIds?.includes('second'));assert.ok(second,JSON.stringify(choices()));
 const label=commandLabel(second,session,playerView(s,'p1'));assert.match(label,/UWAGA.*już osiodłany.*nic nie zmieni/i);assert.ok(label.length<=ACTION_LABEL_LOG_CAP);assert.equal(actionLabelForLog(label),label);
 act(s,second);finish(s);assert.equal(s.objects.get('second').tapped,true);
});

test('A55: limit dokładny i przekroczony jest odróżnialny',()=>{
 const exact='x'.repeat(ACTION_LABEL_LOG_CAP);assert.equal(actionLabelForLog(exact),exact);assert.equal(actionLabelForLog(`${exact}x`),`${exact.slice(0,-1)}…`);
 assert.equal(actionLabelForLog('  Gila\n Courser \t Saddle  '),'Gila Courser Saddle');
});

test('A55: benchmark wybiera z katalogu talie jednoplanowe bez worków',()=>{
 const all=listRepoDeckNames();const eligible=benchmarkDecks();assert.ok(all.some(n=>n.startsWith('worek')));assert.ok(eligible.length>0);assert.deepEqual(eligible,all.filter(n=>!n.startsWith('worek')));
});
