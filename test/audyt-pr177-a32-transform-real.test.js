// Audyt #177/H: nazwa zmienia się z widoczną twarzą realnej karty/tokena.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { commandLabel } from '../src/table/render.js';
const registry=createCardRegistry();
function scene(){
 const decks=new Map([[HUMAN_ID,Array(20).fill('basic-island')],[BOT_ID,Array(20).fill('basic-mountain')]]);
 const session=createSession({registry,decks,seed:17732});const s=session.state;
 while(s.pendingMulligans.length) act(s,{type:'resolve_mulligan_choice',playerId:s.pendingMulligans[0],keep:true,mulligans:0});
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';return {s,session};
}
function put(s,id,cardId,zone,playerId='p1'){
 const [{objectId: _deckId, ...entry}]=createCardDeck({cardIds:[cardId],ownerId:playerId,registry});
 addObject(s,{...entry,id,instanceId:`i-${id}`,zone,controllerId:playerId});
 if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,cmd){assert.ok(cmd,'oczekiwana legalna komenda');const r=execute(s,cmd);assert.ok(r.ok,JSON.stringify(r));}
function drain(s,stop=()=>false){
 for(let i=0;i<30&&s.zones.stack.length&&!stop();i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));
 assert.ok(!s.zones.stack.length||stop(),'stos nie jest opróżniony');
}
function labelForShock(s,session,targetId){
 put(s,'shock','shock','hand');addMana(s,'p1',1,{colors:['R']});
 const c=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes(targetId));
 assert.ok(c,'cel jest legalny dla Shock');return commandLabel(c,session,view(s)).replace(/<[^>]*>/g,'');
}

test('A32: Merciless Repurposing tworzy Incubator, którego widoczną nazwą po transformie jest Phyrexian',()=>{
 const {s,session}=scene();put(s,'bear','ordinary-bear','battlefield','p2');put(s,'rep','merciless-repurposing','hand');
 addMana(s,'p1',8,{colors:['B']});act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='rep'&&c.targets?.includes('bear')));drain(s);
 const token=[...s.objects.values()].find(o=>o.zone==='battlefield'&&o.cardId==='token_incubator');assert.ok(token);
 assert.equal(session.nameOfObject(token.id),'Incubator');assert.equal(token.counters['+1/+1'],3);
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId===token.id));drain(s);
 const result=s.objects.get(token.id);assert.equal(result.cardId,'token_phyrexian');assert.equal(result.counters['+1/+1'],3);
 assert.equal(session.nameOfObject(token.id),'Phyrexian');assert.match(labelForShock(s,session,token.id),/Phyrexian/);
});

test('A32: Civilized Scholar odrzuca stwora i po transformie w miejscu jest Homicidal Brute w widoku',()=>{
 const {s,session}=scene();put(s,'scholar','civilized-scholar','battlefield');put(s,'creature','highland-game','hand');
 assert.equal(session.nameOfObject('scholar'),'Civilized Scholar');
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='scholar'&&c.abilityIndex===0));
 drain(s,()=>s.pendingDiscard!=null);const choice=view(s).legalCommands.find(c=>c.type==='resolve_discard_choice');
 act(s,{...choice,cardId:'creature'});const result=s.objects.get('scholar');assert.equal(result.cardId,'homicidal-brute');
 assert.equal(session.nameOfObject('scholar'),'Homicidal Brute');assert.match(labelForShock(s,session,'scholar'),/Homicidal Brute/);
});

test('A32: Jill wraca przemieniona jako Shiva i rzeczywisty stół pokazuje nazwę nowej twarzy',()=>{
 const {s,session}=scene();put(s,'jill','jill-shivas-dominant','battlefield');addMana(s,'p1',5,{colors:['U','U']});
 assert.equal(session.nameOfObject('jill'),"Jill, Shiva's Dominant");
 act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='jill'&&c.abilityIndex===1));
 drain(s,()=>[...s.objects.values()].some(o=>o.cardId==='shiva-warden-of-ice'&&o.zone==='battlefield'));
 const shiva=[...s.objects.values()].find(o=>o.cardId==='shiva-warden-of-ice'&&o.zone==='battlefield');
 assert.ok(shiva);assert.notEqual(shiva.id,'jill');assert.equal(session.nameOfObject(shiva.id),'Shiva, Warden of Ice');
 assert.equal(shiva.cardName,'Shiva, Warden of Ice');assert.equal(shiva.name,null);
});
