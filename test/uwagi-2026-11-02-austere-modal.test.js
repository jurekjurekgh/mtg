import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import * as plans from '../src/table/multi-target.js';
import { renderMultiTargetWizard, renderChoiceRequest } from '../src/table/choice-request.js';
import { describeSpellEffects } from '../src/table/render.js';
const reg=createCardRegistry();
function scene(){const s=createGameState({seed:1,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';const d=reg.get('austere-command');addObject(s,{id:'a',instanceId:'ia',cardId:d.id,ownerId:'p1',controllerId:'p1',zone:'hand',...gameObjectDataOf(d),types:d.types});addMana(s,'p1',6,{colors:['W']});return s;}
function el(){class E{constructor(t){this.tagName=t.toUpperCase();this.children=[];this.listeners={};this.className='';this.text='';this.type='';this.checked=false;this.disabled=false;this.dataset={};}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set innerHTML(v){this.text=String(v).replace(/<[^>]*>/g,'');this.children=[];}get innerHTML(){return this.textContent;}appendChild(c){this.children.push(c);return c;}replaceChildren(...c){this.children=c.flat();}addEventListener(t,f){(this.listeners[t]??=[]).push(f);}click(){for(const f of this.listeners.click??[])f({});}emit(t){for(const f of this.listeners[t]??[])f({});}}globalThis.document={createElement:t=>new E(t)};return new E('div');}
const walk=e=>[e,...e.children.flatMap(walk)];
function plan(s){const opts=playerView(s,'p1').legalCommands.filter(c=>c.type==='cast_spell'&&c.objectId==='a');assert.equal(opts.length,6);assert.equal(typeof plans.chooseModesPlanOf,'function','kombinacje nie mogą być listą gotowych opcji');return {opts,p:plans.chooseModesPlanOf(opts,s.objects.get('a').spell)};}
test('Austere Command: cztery osobne tryby, dokładnie dwa i sześć poprawnych komend',()=>{const s=scene();const {opts,p}=plan(s);assert.ok(p);assert.equal(p.rows.length,4);assert.deepEqual(p.rows.map(r=>r.label),['Zniszcz wszystkie artefakty','Zniszcz wszystkie zaklęcia','Zniszcz stwory o MV ≤3','Zniszcz stwory o MV ≥4']);for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const cmd=plans.commandForChooseModes(p,[p.rows[i].id,p.rows[j].id]);assert.ok(opts.includes(cmd));assert.ok(execute(structuredClone(s),cmd).ok);}assert.equal(plans.commandForChooseModes(p,[]),null);assert.equal(plans.commandForChooseModes(p,[p.rows[0].id]),null);assert.equal(plans.commandForChooseModes(p,p.rows.slice(0,3).map(r=>r.id)),null);});
test('Austere DOM: cztery checkboxy i Zatwierdź tylko po wyborze dwóch',()=>{const s=scene(),{opts,p}=plan(s),host=el();let done=null;renderMultiTargetWizard(host,{view:playerView(s,'p1'),session:{nameOf:x=>x},plan:p,commands:opts,onComplete:c=>{done=c;},onCancel:()=>{}});const rows=walk(host).filter(e=>String(e.className).includes('multi-target-toggle'));assert.equal(rows.length,4);assert.ok(rows.every(r=>r.type==='checkbox'&&!r.checked));const confirm=walk(host).find(e=>e.tagName==='BUTTON'&&/Zatwierdź/.test(e.textContent));assert.ok(confirm.disabled);rows[1].checked=true;rows[1].emit('change');assert.ok(confirm.disabled);rows[3].checked=true;rows[3].emit('change');assert.equal(confirm.disabled,false);confirm.click();assert.equal(done.modeIndex,4);});

test('Strażnik wspólnego modala blokuje listy permutacji i podzbiorów dla wielu pól, nie jednowybór',async()=>{
 const {assertNoCombinationRows}=await import('../src/table/no-combination-rows.js');
 for(const key of ['targets','targetIds','cardIds','topOrder','discardCardIds','exileIds']){
   for(const values of [[['x','y'],['y','x']],[['x','y'],['x','z']],[[],['x','y']]]){
     const opts=values.map(v=>({type:'future_decision',playerId:'p1',[key]:v}));
     assert.throws(()=>assertNoCombinationRows(opts),/Zakazany modal/,key);
     assert.throws(()=>renderMultiTargetWizard(el(),{view:{},session:{},plan:{buttonsMode:true},commands:opts}),/Zakazany modal/,`fallback ${key}`);
   }
 }
 assert.doesNotThrow(()=>assertNoCombinationRows([{type:'color',value:'W'},{type:'color',value:'U'}]));
 assert.doesNotThrow(()=>assertNoCombinationRows([{type:'cast',targets:['a']},{type:'cast',targets:['b']}]));
});
test('Strażnik wychwytuje zakodowane kombinacje trybów nawet bez permutacji tablic',()=>{
 const s=scene(),{opts}=plan(s);assert.throws(()=>renderMultiTargetWizard(el(),{view:{},session:{state:s},plan:{castWindowMode:true},commands:opts}),/Zakazany modal/);
});

test('Inwentarz: każdy katalogowy czar choose-two wymaga metadanych pojedynczych trybów',()=>{
 for(const card of reg.all()){
  if(!/^choose two\s*[—-]/i.test(card.oracleText??'') || !card.spell?.modes)continue;
  const cmds=card.spell.modes.map((_,modeIndex)=>({type:'cast_spell',objectId:'spell',modeIndex,targets:[]}));
  const p=plans.chooseModesPlanOf(cmds,card.spell);
  assert.ok(p,`${card.id}: brak kreatora składników, nie wolno pokazywać par`);
  assert.ok(p.rows.length >= 2);
 }
});

test('Opis karty nie pokazuje par jako sześciu trybów',()=>{const description=describeSpellEffects(reg.get('austere-command').spell);assert.match(description,/wybierz 2/);assert.equal(description.split(' / ').length,4);});
test('Także surowy fallback modala odrzuca wielokrotne kombinacje',()=>{const opts=[{type:'future',cardIds:['a','b']},{type:'future',cardIds:['b','a']}];assert.throws(()=>renderChoiceRequest(el(),{type:'command',options:opts},{}),/Zakazany modal/);});

test('Wszystkie sześć par Austere rozstrzyga wskazane dwa rodzaje permanentów',()=>{
 for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
  const s=scene();for(const [id,cardId] of [['artifact','meteorite'],['enchant','veiled-ascension'],['small','goblin-piker'],['large','hill-giant']]){
   const d=reg.get(cardId);addObject(s,{id,instanceId:`i-${id}`,cardId,controllerId:'p2',ownerId:'p2',zone:'battlefield',...gameObjectDataOf(d),types:d.types,subtypes:d.subtypes,keywords:d.keywords??[]});
  }
  const {p}=plan(s),cmd=plans.commandForChooseModes(p,[String(i),String(j)]);assert.ok(execute(s,cmd).ok);
  for(let k=0;k<2;k++)assert.ok(execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId}).ok);
  for(const [index,cardId] of ['meteorite','veiled-ascension','goblin-piker','hill-giant'].entries()){
   const present=s.zones.battlefield.some(id=>s.objects.get(id)?.cardId===cardId);
   assert.equal(present,index!==i&&index!==j,`para ${i},${j}: ${cardId}`);
  }
 }
});
