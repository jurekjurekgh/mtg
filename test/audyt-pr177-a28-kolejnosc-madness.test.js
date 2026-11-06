// CR 603.3b: "each player, in APNAP order, puts triggered abilities they
// control on the stack in any order they choose."
// https://boardgames.stackexchange.com/questions/14434/mtg-multiple-card-stack-confusion/14436
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { commandOptionKey, hasMeaningfulDecisionOf } from '../src/table/session.js';
import { commandLabel, choiceRequestGroupKey, choiceGroupTitle } from '../src/table/render.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
const reg = createCardRegistry();
function put(s,id,cardId,zone='hand',player='p1') {
 const d=reg.get(cardId); assert.ok(d); addObject(s,{id,instanceId:`i-${id}`,cardId,ownerId:player,controllerId:player,zone,
 ...gameObjectDataOf(d),types:d.types??[],subtypes:d.subtypes??[],keywords:d.keywords??[]});
}
function scene() {
 const s=createGameState({seed:17828,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'spell','cathartic-reunion');put(s,'rev','revolutionist');put(s,'agony','terminal-agony');
 put(s,'victim','vampire-hounds','battlefield','p2');for(let i=0;i<3;i++)put(s,`lib${i}`,'basic-island','library');
 addMana(s,'p1',4,{colors:['R','B']});
 const cast=playerView(s,'p1').legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spell');
 assert.ok(cast); assert.ok(execute(s,cast).ok); return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function pass(s){const c=view(s).legalCommands.find(c=>c.type==='pass_priority');assert.ok(c);assert.ok(execute(s,c).ok);}
function round(s){pass(s);pass(s);}
for(const first of ['revolutionist','terminal-agony']) test(`A28: kontroler wybiera ${first} do rozstrzygnięcia jako pierwszą`,()=>{
 const s=scene();const options=view(s).legalCommands;
 assert.ok(!options.some(c=>c.type==='pass_priority'),'bez priorytetu przed wyborem kolejności');
 const choices=options.filter(c=>c.type==='resolve_trigger_order');
 assert.deepEqual(choices.map(c=>c.cardId).sort(),['revolutionist','terminal-agony']);
 const pick=choices.find(c=>c.cardId===first);assert.ok(execute(s,pick).ok);
 assert.equal(s.turn.priorityPlayerId,'p1');
 const top=s.objects.get(s.zones.stack.at(-1));assert.equal(top.cardId,first);
 round(s);assert.equal(s.pendingMadnessCast?.cardId,first);
 const decline=view(s).legalCommands.find(c=>c.type==='resolve_madness_cast'&&!c.cast);
 assert.ok(decline&&execute(s,decline).ok);round(s);
 assert.notEqual(s.pendingMadnessCast?.cardId,first);
});
test('A28: błędny wybór kolejności odrzucony atomowo, także przez przeciwnika',()=>{
 const s=scene(),fp=stateFingerprint(s);const choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');
 assert.equal(choices.length,2);
 assert.equal(execute(s,{...choices[0],playerId:'p2'}).ok,false);
 assert.equal(execute(s,{...choices[0],stackEntryId:'inny'}).ok,false);
 assert.equal(execute(s,{type:'pass_priority',playerId:'p1'}).ok,false);
 assert.equal(stateFingerprint(s),fp);
});

for (const first of ['madness','reflexive_discard']) test(`A28: Talion's Messenger + Revolutionist — najpierw ${first}`,()=>{
 const s=createGameState({seed:17829,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'declare_attackers','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'talion','talions-messenger','battlefield');
 put(s,'clique','puppeteer-clique','battlefield');
 s.objects.set('talion',Object.freeze({...s.objects.get('talion'),summoningSickness:false}));
 s.objects.set('clique',Object.freeze({...s.objects.get('clique'),summoningSickness:false}));
 put(s,'rev','revolutionist');put(s,'draw','basic-island','library');
 assert.ok(execute(s,{type:'declare_attackers',playerId:'p1',attackerIds:['talion']}).ok);
 round(s);
 const discard=view(s).legalCommands.find(c=>c.type==='resolve_discard_choice'&&c.cardId==='rev');
 assert.ok(discard);assert.ok(execute(s,discard).ok);
 // ADR 0032: najpierw kolejność całej partii, dopiero potem cel refleksu
 // przy umieszczaniu tej zdolności na stosie (CR 603.3b–d).
 const choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');
 assert.deepEqual(choices.map(c=>c.trigger).sort(),['madness','reflexive_discard']);
 assert.ok(!view(s).legalCommands.some(c=>c.type==='resolve_trigger_target'),'cel nie wyprzedza kolejności');
 assert.ok(execute(s,choices.find(c=>c.trigger===first)).ok);
 const target=view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&c.targetId==='clique');
 assert.ok(target,'cel refleksu ogłoszony po wyborze kolejności'); assert.ok(execute(s,target).ok);
 assert.equal(s.objects.get(s.zones.stack.at(-1)).triggerEntry.ability.trigger.event,first);
 round(s);
 if(first==='madness') {
   assert.equal(s.pendingMadnessCast?.cardId,'revolutionist');
   const decline=view(s).legalCommands.find(c=>c.type==='resolve_madness_cast'&&!c.cast);
   assert.ok(execute(s,decline).ok);round(s);
 } else {
   assert.equal(s.objects.get('clique').counters?.['+1/+1'],1);
   round(s);assert.equal(s.pendingMadnessCast?.cardId,'revolutionist');
 }
 assert.equal(s.objects.get('clique').counters?.['+1/+1'],1);
});

test('A28: Mindstab przeciwnika — nieaktywny gracz układa oba triggery, priorytet wraca do aktywnego',()=>{
 const s=createGameState({seed:17830,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'mind','mindstab');put(s,'rev','revolutionist','hand','p2');put(s,'agony','terminal-agony','hand','p2');
 addMana(s,'p1',6,{colors:['B']});
 const cast=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='mind'&&c.targets?.includes('p2'));
 assert.ok(cast&&execute(s,cast).ok);round(s);
 assert.equal(s.turn.priorityPlayerId,'p2','wybiera właściciel obu triggerów');
 const choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');
 assert.equal(choices.length,2);assert.ok(execute(s,choices.find(c=>c.cardId==='revolutionist')).ok);
 assert.equal(s.turn.priorityPlayerId,'p1','priorytet po rozwiązaniu czaru ma aktywny gracz');
 assert.equal(s.objects.get(s.zones.stack.at(-1)).cardId,'revolutionist');
 round(s); assert.equal(s.pendingMadnessCast?.playerId,'p2');
});

test('A28: dwa odrzucenia w cleanupie dają wybór przed priorytetem i nadal otwierają cleanup',()=>{
 const s=createGameState({seed:17831,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'end','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'rev','revolutionist');put(s,'agony','terminal-agony');for(let i=0;i<7;i++)put(s,`f${i}`,'basic-forest');
 round(s);assert.equal(s.turn.step,'cleanup');assert.equal(s.pendingDiscardChoice?.count,2);
 assert.ok(execute(s,{type:'resolve_discard_choice',playerId:'p1',cardIds:['rev','agony']}).ok);
 const options=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(options.length,2);
 assert.ok(execute(s,options.find(c=>c.cardId==='terminal-agony')).ok);round(s);
 assert.equal(s.pendingMadnessCast?.cardId,'terminal-agony');
 assert.ok(execute(s,view(s).legalCommands.find(c=>c.type==='resolve_madness_cast'&&!c.cast)).ok);
 round(s);assert.equal(s.pendingMadnessCast?.cardId,'revolutionist');
 assert.ok(execute(s,view(s).legalCommands.find(c=>c.type==='resolve_madness_cast'&&!c.cast)).ok);
 assert.equal(s.turn.step,'cleanup');assert.ok(view(s).legalCommands.some(c=>c.type==='pass_priority'));
});


test('A28 UI: jeden czytelny wybór, różne klucze i zatrzymanie autopassu',()=>{
 const s=scene(),v=view(s),choices=v.legalCommands.filter(c=>c.type==='resolve_trigger_order');
 const session={nameOf:id=>reg.get(id)?.name??id};
 assert.equal(new Set(choices.map(choiceRequestGroupKey)).size,1);
 assert.equal(new Set(choices.map(commandOptionKey)).size,2);
 assert.ok(hasMeaningfulDecisionOf(v));
 assert.match(commandLabel(choices.find(c=>c.cardId==='revolutionist'),session,v),/Najpierw: Revolutionist/);
 assert.match(commandLabel(choices.find(c=>c.cardId==='terminal-agony'),session,v),/Najpierw: Terminal Agony/);
 const title=choiceGroupTitle({type:'command',options:choices},session,v);
 assert.match(title,/zdolnoś|kolejnoś|następna/i);
});
for(const [name,factory] of [['aggro',()=>createAggroBot()],['heuristic',()=>createHeuristicBot({seed:55})]]) {
 test(`A28 bot ${name} wykonuje legalny wybór kolejności`,()=>{
  const s=scene(),v=view(s),choice=factory().chooseCommand(v);
  assert.equal(choice.type,'resolve_trigger_order');assert.ok(execute(s,choice).ok);
 });
}
test('A28 wybór kolejności jest deterministyczny w replay i zmienia fingerprint',()=>{
 const s=scene(),base=stateFingerprint(s);
 const pick=view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='revolutionist');
 assert.ok(execute(s,pick).ok);assert.notEqual(stateFingerprint(s),base);
 const replay=replayFromState(s);
 // Inicjalizacja sceny jest bezpośrednia, a jedyna poprzedzająca komenda
 // to rzeczywisty rzut: powtórz ją z tego samego deterministycznego setupu.
 const result=verifyReplay({...replay,commands:replay.commands.slice(-1)},()=>scene(),execute);
 assert.ok(result.deterministic);assert.ok(result.results.every(r=>r.ok));
 assert.equal(stateFingerprint(result.state),stateFingerprint(s));
});


test('A28: Mindstab i trzy karty madness — wybór wieloetapowy zachowuje dowolną kolejność',()=>{
 const s=createGameState({seed:17832,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'mind','mindstab');put(s,'rev','revolutionist','hand','p2');
 put(s,'agony1','terminal-agony','hand','p2');put(s,'agony2','terminal-agony','hand','p2');
 addMana(s,'p1',6,{colors:['B']});
 const cast=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='mind'&&c.targets?.includes('p2'));
 assert.ok(execute(s,cast).ok);round(s);
 let choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(choices.length,3);
 const rev=choices.find(c=>c.cardId==='revolutionist');assert.ok(execute(s,rev).ok);
 choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');assert.equal(choices.length,2);
 const second=choices[0];assert.ok(execute(s,second).ok);
 assert.equal(s.turn.priorityPlayerId,'p1');
 assert.deepEqual(s.zones.stack.map(id=>s.objects.get(id).cardId),['terminal-agony','terminal-agony','revolutionist']);
 assert.equal(s.zones.stack.at(-2),second.stackEntryId,'drugi wybrany rozstrzygnie się po pierwszym');
});

test('A28: trigger dobrania Coatl, refleks Taliona i madness z jednego efektu tworzą wspólny wybór',()=>{
 const s=createGameState({seed:17833,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'declare_attackers','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'talion','talions-messenger','battlefield');put(s,'coatl','lorescale-coatl','battlefield');
 s.objects.set('talion',Object.freeze({...s.objects.get('talion'),summoningSickness:false}));
 put(s,'rev','revolutionist');put(s,'draw','basic-island','library');
 assert.ok(execute(s,{type:'declare_attackers',playerId:'p1',attackerIds:['talion']}).ok);round(s);
 assert.ok(s.pendingDiscardChoice,'dobranie nastąpiło, discard jeszcze nie');
 const discard=view(s).legalCommands.find(c=>c.type==='resolve_discard_choice'&&c.cardId==='rev');
 assert.ok(discard&&execute(s,discard).ok);
 const choices=view(s).legalCommands.filter(c=>c.type==='resolve_trigger_order');
 assert.deepEqual(choices.map(c=>c.cardId).sort(),['lorescale-coatl','revolutionist','talions-messenger']);
 assert.ok(execute(s,choices.find(c=>c.cardId==='lorescale-coatl')).ok);
 assert.ok(execute(s,view(s).legalCommands.find(c=>c.type==='resolve_trigger_order'&&c.cardId==='revolutionist')).ok);
 assert.equal(s.objects.get(s.zones.stack.at(-1)).cardId,'lorescale-coatl');
 round(s);assert.equal(s.objects.get('coatl').counters?.['+1/+1'],1);
});
