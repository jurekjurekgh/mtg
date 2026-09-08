import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { replaceObject, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { applyEffect, destroyPermanentByEffect } from '../src/engine/effects.js';
import { runStateBasedActions, addRegenerationShield } from '../src/engine/state-based.js';
import { addCounter } from '../src/engine/counters.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { resolveCombatDamage, validateDamageAssignment, buildDamageAssignmentView } from '../src/engine/combat.js';
const registry = createCardRegistry();
function put(s,id,cardId,owner='p1',zone='battlefield') {
  const d=registry.get(cardId); assert.ok(d,cardId);
  addObject(s,{...gameObjectDataOf(d),types:d.types,keywords:d.keywords,id,instanceId:`i-${id}`,cardId,ownerId:owner,controllerId:owner,zone});
  return s.objects.get(id);
}
function board(n=1) {
  const s=createGameState({seed:606,players:[{id:'p1'},{id:'p2'}]}); s.turn=jumpToStep(s.turn,'main','p1');
  s.turn.priorityPlayerId=s.turn.activePlayerId='p1'; put(s,'host','giant-spider');
  for(let i=0;i<n;i++){const a=put(s,`a${i}`,'treefolk-umbra');replaceObject(s,a,{kind:'aura',attachedTo:'host'});}
  return s;
}
function pick(s,choice,p=s.pendingReplacementChoice?.playerId) {
  const cmd=playerView(s,p).legalCommands.find(c=>c.type==='resolve_replacement_choice' && c.choice===choice);
  assert.ok(cmd,`oferta ${choice}`);const r=execute(s,cmd);assert.ok(r.ok,JSON.stringify(r));return r;
}
function resolve(s) {for(let i=0;i<30 && s.zones.stack.length && !s.pendingReplacementChoice;i++) {
  const v=playerView(s,s.turn.priorityPlayerId);const c=v.legalCommands.find(c=>c.type==='pass_priority');assert.ok(c);assert.ok(execute(s,c).ok);
}}
// CR702.89a https://mtg.wiki/page/Umbra_armor (CR2026-08-07, fetched2026-09-08):
// “If enchanted permanent would be destroyed, instead remove all damage
// marked on it and destroy this Aura.” WotC rulingi MH1 w snapshotcie.
test('606: druk/Oracle, pełny koszt, legalny cast i statystyki',()=>{
 const d=registry.get('treefolk-umbra');assert.ok(d);const src=JSON.parse(fs.readFileSync('docs/cards/scryfall-treefolk-umbra.json'));
 assert.equal(d.oracleText,src.oracle_text);assert.equal(d.artId,606);assert.equal(d.plan,'Śródziemie');assert.equal(d.set,'MH1');assert.equal(d.imageUri,src.image_uris.large);
 const s=board(0);put(s,'a','treefolk-umbra','p1','hand');addMana(s,'p1',3,{colors:['G']});
 const c=playerView(s,'p1').legalCommands.find(c=>c.objectId==='a' && c.targets?.[0]==='host');assert.ok(c);assert.ok(execute(s,c).ok);resolve(s);
 assert.equal(s.players[0].mana,0);assert.equal(effectivePower(s.objects.get('host'),s),2);assert.equal(effectiveToughness(s.objects.get('host'),s),6);
});
for(const cause of ['effect','lethal','deathtouch'])test(`606 armor: ${cause}, mandatory, bez tap/wyjścia z walki`,()=>{
 const s=board();s.combat={attackers:['host'],blockers:new Map(),blockedAttackers:new Set(),attackingPlayerId:'p1'};
 replaceObject(s,s.objects.get('host'),{damage:cause==='lethal'?6:1,damagedByDeathtouch:cause==='deathtouch'});
 if(cause==='effect')destroyPermanentByEffect(s,'host');else runStateBasedActions(s);
 assert.equal(s.objects.get('host').zone,'battlefield');assert.equal(s.objects.get('host').damage,0);assert.equal(s.objects.get('host').tapped,false);
 assert.ok(s.combat.attackers.includes('host'));assert.notEqual(s.objects.get('a0')?.zone,'battlefield');
});
for(const choice of ['umbra:a0','umbra:a1','regenerate','shield'])test(`606: kontroler wybiera ${choice}`,()=>{
 const s=board(2);replaceObject(s,s.objects.get('host'),{controllerId:'p2'});addRegenerationShield(s,'host');addCounter(s,'host','shield',1);
 destroyPermanentByEffect(s,'host');assert.equal(s.pendingReplacementChoice.playerId,'p2');
 assert.equal(playerView(s,'p1').legalCommands.some(c=>c.type==='resolve_replacement_choice'),false);
 assert.equal(execute(s,{type:'resolve_replacement_choice',playerId:'p1',choice}).ok,false);
 pick(s,choice);assert.equal(s.objects.get('host').zone,'battlefield');
 assert.equal(s.objects.get('host').tapped,choice==='regenerate');
 assert.equal(s.objects.get('host').counters.shield??0,choice==='shield'?0:1);
 assert.equal(['a0','a1'].filter(id=>s.objects.get(id)?.zone==='battlefield').length,choice.startsWith('umbra')?1:2);
});
for(const mode of ['sacrifice','zero','indestructible','cant-regenerate'])test(`606: granica ${mode}`,()=>{
 const s=board();if(mode==='sacrifice')applyEffect(s,{type:'sacrifice_permanent'},s.objects.get('host'),['host']);
 if(mode==='zero'){replaceObject(s,s.objects.get('host'),{toughnessModifier:-6});runStateBasedActions(s);}
 if(mode==='indestructible'){replaceObject(s,s.objects.get('host'),{keywords:['indestructible'],damage:9});destroyPermanentByEffect(s,'host');runStateBasedActions(s);assert.equal(s.objects.get('a0').zone,'battlefield');}
 if(mode==='cant-regenerate'){s.cantBeRegeneratedThisTurn=['host'];destroyPermanentByEffect(s,'host');}
 assert.equal(s.objects.get('host')?.zone==='battlefield',['indestructible','cant-regenerate'].includes(mode));
});
for(const reverse of [false,true])test(`606: równoczesne destroy aura+host, reverse=${reverse}`,async()=>{
 const {destroyPermanents}=await import('../src/engine/destruction.js');const s=board();destroyPermanents(s,reverse?['host','a0']:['a0','host']);
 assert.equal(s.objects.get('host').zone,'battlefield');assert.notEqual(s.objects.get('a0')?.zone,'battlefield');
});
for(const kw of [[],['double_strike'],['infect'],['lifelink']])test(`606 combat: niezablokowany ${kw}`,()=>{
 const s=board();replaceObject(s,s.objects.get('host'),{keywords:kw,damage:1});
 s.combat={attackers:['host'],blockers:new Map(),blockedAttackers:new Set(),attackingPlayerId:'p1'};
 resolveCombatDamage(s,'p2');const amount=kw.includes('double_strike')?12:6;
 if(kw.includes('infect'))assert.equal(s.players[1].poison,6);else assert.equal(s.players[1].life,20-amount);
 if(kw.includes('lifelink'))assert.equal(s.players[0].life,26);
 assert.equal(effectivePower(s.objects.get('host'),s),2);
});
test('606: przydział/widok używa toughness, bloker też; fight używa power',()=>{
 const s=board();put(s,'b','rotting-legion','p2');s.combat={attackers:['host'],blockers:new Map([['host',['b']]]),blockedAttackers:new Set(['host']),attackingPlayerId:'p1'};
 assert.equal(validateDamageAssignment(s,'host',[{blockerId:'b',amount:6}]),null);
 assert.equal(validateDamageAssignment(s,'host',[{blockerId:'b',amount:2}]),'damage_must_be_fully_assigned');
 s.pendingDamageAssignment={playerId:'p1',pass:false,resumeFrom:0};replaceObject(s,s.objects.get('host'),{keywords:['trample']});
 assert.equal(buildDamageAssignmentView(s).entries[0].power,6);
 s.pendingDamageAssignment=null;applyEffect(s,{type:'fight'},s.objects.get('host'),['host','b']);
 assert.equal(s.objects.get('b').damage,2,'fight bierze power2, nie toughness6');
});

for(const family of ['normal','modal','activated','triggered'])test(`606 replacement: ${family} trzyma stos i dalszy efekt do wyboru`,async()=>{
 const s=board(2);replaceObject(s,s.objects.get('host'),{types:['Creature','Artifact']});
 if(family==='normal'||family==='modal') {
   const card=family==='normal'?'divine-offering':'vandalize';put(s,'spell',card,'p1','hand');addMana(s,'p1',5,{colors:['W','R']});
   const cmd=playerView(s,'p1').legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spell'&&c.targets?.[0]==='host'&&(family!=='modal'||c.modeIndex===0));
   assert.ok(cmd);assert.ok(execute(s,cmd).ok);
 } else {
   const src=put(s,'source','giant-spider');
   const ability={type:family==='activated'?'activated':'triggered',trigger:{event:'enter_battlefield'},targets:[{type:'creature'}],effect:[{type:'destroy_permanent'},{type:'gain_life',amount:4}]};
   if(family==='activated') {
     const {queueActivatedAbilityToStack}=await import('../src/engine/abilities.js');
     queueActivatedAbilityToStack(s,{playerId:'p1',objectId:'source',abilityIndex:0,ability,effectSourceId:'source',effectTargets:['host']});
   } else {
     const {queueTriggerToStack}=await import('../src/engine/triggers.js');queueTriggerToStack(s,ability,src,['host'],[]);
   }
 }
 const stackId=s.zones.stack.at(-1);resolve(s);assert.ok(s.pendingReplacementChoice);
 assert.equal(s.players[0].life,20,'ogon nie wykonał się przed decyzją');assert.ok(s.zones.stack.includes(stackId),'rozstrzygany wpis pozostaje na stosie');
 assert.equal(execute(s,{type:'pass_priority',playerId:'p1'}).ok,false,'bez obcych akcji w środku resolution');
 pick(s,'umbra:a0');assert.equal(s.zones.stack.includes(stackId),false);assert.equal(s.objects.get('host').zone,'battlefield');
 assert.equal(s.players[0].life,family==='modal'?20:24);
});
test('606: kilka decyzji w jednym równoczesnym destroy nie gubi kontynuacji',async()=>{
 const {destroyPermanents}=await import('../src/engine/destruction.js');const s=board(2);put(s,'host2','giant-spider','p2');
 for(const id of ['b0','b1']){const a=put(s,id,'treefolk-umbra','p2');replaceObject(s,a,{kind:'aura',attachedTo:'host2'});}
 destroyPermanents(s,['host','host2']);pick(s,'umbra:a0');assert.ok(s.pendingReplacementChoice);assert.equal(s.objects.get('a0').zone,'battlefield','ruchy czekają na wszystkie wybory');
 pick(s,'umbra:b1');assert.equal(s.objects.get('host').zone,'battlefield');assert.equal(s.objects.get('host2').zone,'battlefield');
 assert.notEqual(s.objects.get('a0')?.zone,'battlefield');assert.notEqual(s.objects.get('b1')?.zone,'battlefield');
});
for(const cause of ['effect','sba'])test(`606: shield na aurze zachowuje przyczynę destroy ${cause}`,()=>{
 const s=board();addCounter(s,'a0','shield',1);replaceObject(s,s.objects.get('host'),{damage:6});
 if(cause==='effect')destroyPermanentByEffect(s,'host');else runStateBasedActions(s);
 assert.equal(s.objects.get('host').damage,0);assert.equal(s.objects.get('a0')?.zone==='battlefield',cause==='effect');
 assert.equal(s.events.filter(e=>e.type==='shield_consumed').length,cause==='effect'?1:0);
});
test('606: niezniszczalna aura nadal usuwa obrażenia hosta',()=>{
 const s=board();replaceObject(s,s.objects.get('a0'),{keywords:['indestructible']});replaceObject(s,s.objects.get('host'),{damage:6});runStateBasedActions(s);
 assert.equal(s.objects.get('host').damage,0);assert.equal(s.objects.get('a0').zone,'battlefield');
});
test('606: bloker zadaje toughness, nie power; obrażenia nie zmniejszają toughness',()=>{
 const s=board();put(s,'att','rotting-legion','p2');replaceObject(s,s.objects.get('host'),{damage:1});
 s.combat={attackers:['att'],blockers:new Map([['att',['host']]]),blockedAttackers:new Set(['att']),attackingPlayerId:'p2'};
 resolveCombatDamage(s,'p1');assert.equal(s.events.find(e=>e.type==='damage_dealt'&&e.source==='host')?.amount,6);
 assert.notEqual(s.objects.get('att')?.zone,'battlefield');assert.equal(s.objects.get('host').zone,'battlefield');
});
test('606: zły kolor aury odrzucany atomowo',()=>{
 const s=board(0);put(s,'card','treefolk-umbra','p1','hand');addMana(s,'p1',3,{colors:['U']});
 assert.equal(execute(s,{type:'cast_permanent',playerId:'p1',objectId:'card',targets:['host']}).ok,false);
 assert.equal(s.players[0].mana,3);assert.equal(s.objects.get('card').zone,'hand');
});
test('606 UI/FoW: prawdziwe power i cecha combat oraz armor mają opis',async()=>{
 const {rulesText,commandLabel}=await import('../src/table/render.js');const {stateFingerprint}=await import('../src/engine/fingerprint.js');
 const s=board(2);const v=playerView(s,'p2'),host=v.zones.battlefield.find(o=>o.id==='host');
 assert.equal(host.power,2);assert.equal(host.toughness,8);assert.equal(host.combatDamageByToughness,true);
 assert.match(rulesText(host),/wytrzymałości/);assert.match(rulesText(registry.get('treefolk-umbra')),/Umbra armor/);
 destroyPermanentByEffect(s,'host');const cmd=playerView(s,'p1').legalCommands.find(c=>c.choice==='umbra:a0');
 assert.match(commandLabel(cmd,{nameOf:id=>id},playerView(s,'p1')),/Umbra armor/);
 const before=stateFingerprint(s);pick(s,'umbra:a0');assert.notEqual(stateFingerprint(s),before);
});
test('606: Vandalize oba niszczy aurę-artefakt i host-ląd jednocześnie',()=>{
 const s=board();replaceObject(s,s.objects.get('host'),{types:['Land','Creature']});replaceObject(s,s.objects.get('a0'),{types:['Enchantment','Artifact']});
 put(s,'spell','vandalize','p1','hand');addMana(s,'p1',5,{colors:['R']});
 const cmd=playerView(s,'p1').legalCommands.find(c=>c.objectId==='spell'&&c.modeIndex===2&&c.targets?.[0]==='a0'&&c.targets?.[1]==='host');
 assert.ok(cmd);assert.ok(execute(s,cmd).ok);resolve(s);
 assert.equal(s.objects.get('host')?.zone,'battlefield');assert.notEqual(s.objects.get('a0')?.zone,'battlefield');
});
test('606: first strike czeka na wybór armor przed regularnym przebiegiem',()=>{
 const s=board(2);put(s,'block','rotting-legion','p2');replaceObject(s,s.objects.get('block'),{power:8,toughness:20,keywords:['first_strike']});
 replaceObject(s,s.objects.get('host'),{keywords:['double_strike']});
 s.combat={attackers:['host'],blockers:new Map([['host',['block']]]),blockedAttackers:new Set(['host']),attackingPlayerId:'p1'};
 resolveCombatDamage(s,'p2');assert.ok(s.pendingReplacementChoice);assert.equal(s.objects.get('block').damage,8,'brak drugiego przebiegu przed wyborem');
 pick(s,'umbra:a0');assert.equal(s.objects.get('block').damage,14,'drugi przebieg wg nowej toughness6 po stracie aury');
});
