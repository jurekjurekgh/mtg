import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {renderMultiTargetWizard} from '../src/table/choice-request.js';
import {polishPluralCount,choiceGroupTitle} from '../src/table/render.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {gameObjectDataOf} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {stateFingerprint} from '../src/engine/fingerprint.js';
import * as plans from '../src/table/multi-target.js';
const registry=createCardRegistry();
function put(s,id,cardId,zone='hand',player='p1') {
 const d=registry.get(cardId);addObject(s,{...gameObjectDataOf(d),types:d.types,keywords:d.keywords,id,instanceId:`i-${id}`,cardId,ownerId:player,controllerId:player,zone});
}
function setup(madness=false) {
 const s=createGameState({seed:355,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'spell','cathartic-reunion');put(s,'a',madness?'revolutionist':'giant-spider');put(s,'b',madness?'revolutionist':'basic-forest');put(s,'c','basic-island');
 put(s,'foe','basic-swamp','hand','p2');for(let i=0;i<5;i++)put(s,`lib${i}`,'basic-mountain','library');
 addMana(s,'p1',2,{colors:['R']});assert.ok(execute(s,{type:'cast_spell',playerId:'p1',objectId:'spell'}).ok);
 return s;
}
const batch=(s,cardIds,playerId='p1')=>execute(s,{type:'resolve_discard_choice',playerId,cardIds});
function resolve(s) {for(let i=0;i<10&&s.zones.stack.length;i++)assert.ok(execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId}).ok);}
test('B: jeden wybór dwóch kart płaci cały koszt, draw dopiero po resolution',()=>{
 const s=setup(),r=batch(s,['a','b']);assert.ok(r.ok);assert.equal(s.pendingDiscardChoice,null);
 assert.equal(r.events.filter(e=>e.type==='card_discarded').length,2);assert.equal(r.events.filter(e=>e.type==='discard_choice_resolved').length,1);
 assert.equal(r.events.filter(e=>e.type==='discard_choice_required').length,0,'bez drugiego modala');
 assert.deepEqual(s.zones.hand.filter(id=>s.objects.get(id).controllerId==='p1'),['c']);
 assert.equal(s.zones.stack.length,1);resolve(s);assert.equal(s.zones.hand.filter(id=>s.objects.get(id).controllerId==='p1').length,4);
});
for(const ids of [[],['a'],['a','a'],['a','b','c'],['a','unknown'],['a','foe'],['a','lib0'],null,'ab'])test(`B: odrzuca całą błędną listę atomowo ${JSON.stringify(ids)}`,()=>{
 const s=setup(),fp=stateFingerprint(s);assert.equal(batch(s,ids).ok,false);assert.equal(stateFingerprint(s),fp);assert.equal(s.objects.get('a').zone,'hand');
});
test('B: inny gracz nie płaci cudzą ręką',()=>{const s=setup(),fp=stateFingerprint(s);assert.equal(batch(s,['a','b'],'p2').ok,false);assert.equal(stateFingerprint(s),fp);});
test('B: obie karty madness odrzucone zanim pojawi się pierwszy wybór rzutu',()=>{
 const s=setup(true),r=batch(s,['a','b']);assert.ok(r.ok);assert.equal(s.pendingDiscardChoice,null);
 assert.equal(s.zones.exile.length,2);assert.ok(s.pendingMadnessCast);assert.equal(s.madnessQueue.length,1);
 assert.ok(r.events.findLastIndex(e=>e.type==='card_discarded')<r.events.findIndex(e=>e.type==='madness_ready_required'));
 for(let i=0;i<2;i++){const c=playerView(s,'p1').legalCommands.find(c=>c.type==='resolve_madness_cast'&&!c.cast);assert.ok(c);assert.ok(execute(s,c).ok);}
 assert.equal(s.pendingMadnessCast,null);resolve(s);
});
test('B: legacy pojedynczej karty/replay nadal działa, ale UI zna pozostałą liczbę',()=>{
 const s=setup();assert.equal(playerView(s,'p1').pendingDiscardChoice.count,2);
 assert.equal(playerView(s,'p2').pendingDiscardChoice,null);
 assert.ok(execute(s,{type:'resolve_discard_choice',playerId:'p1',cardId:'a'}).ok);
 assert.equal(playerView(s,'p1').pendingDiscardChoice.count,1);assert.ok(execute(s,{type:'resolve_discard_choice',playerId:'p1',cardId:'b'}).ok);
});
test('B: plan pickera wybiera dokładnie N różnych instancji bez enumeracji kombinacji',()=>{
 const s=setup(),v=playerView(s,'p1'),cs=v.legalCommands.filter(c=>c.type==='resolve_discard_choice');
 assert.equal(typeof plans.discardPlanOf,'function');const plan=plans.discardPlanOf(cs,v);
 assert.equal(plan.minTargets,2);assert.equal(plan.maxTargets,2);assert.deepEqual(new Set(plan.targets),new Set(['a','b','c']));
 for(const ids of [[],['a'],['a','a'],['a','b','c'],['a','foe']])assert.equal(plans.commandForDiscardSelection(plan,ids),null);
 const cmd=plans.commandForDiscardSelection(plan,['a','b']);assert.ok(execute(s,cmd).ok);assert.equal(s.pendingDiscardChoice,null);
});

test('B: kontrczar nie zwraca kosztu dwóch kart i nie dobiera trzech',()=>{
 const s=setup();assert.ok(batch(s,['a','b']).ok);put(s,'counter','negate','hand','p2');addMana(s,'p2',2,{colors:['U']});
 assert.ok(execute(s,{type:'pass_priority',playerId:'p1'}).ok);
 const counter=playerView(s,'p2').legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='counter');assert.ok(counter);assert.ok(execute(s,counter).ok);resolve(s);
 assert.deepEqual(s.zones.hand.filter(id=>s.objects.get(id).controllerId==='p1'),['c']);
 assert.equal(s.zones.graveyard.map(id=>s.objects.get(id).cardId).filter(id=>['giant-spider','basic-forest','cathartic-reunion'].includes(id)).length,3);
});
test('B: koszt aktywacji Plague Reaver czeka na cały wybór',()=>{
 const s=setup();assert.ok(batch(s,['a','b']).ok);resolve(s);put(s,'reaver','plague-reaver','battlefield');
 const activation=playerView(s,'p1').legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='reaver');assert.ok(activation);assert.ok(execute(s,activation).ok);
 assert.ok(s.pendingAbilityActivation);assert.equal(s.objects.get('reaver').zone,'battlefield');
 const ids=playerView(s,'p1').legalCommands.filter(c=>c.type==='resolve_discard_choice').slice(0,2).map(c=>c.cardId);
 assert.ok(batch(s,ids).ok);assert.equal(s.pendingAbilityActivation,null);assert.equal(s.pendingDiscardChoice,null);assert.notEqual(s.objects.get('reaver')?.zone,'battlefield');
});
test('B: efekt odrzuć trzy z krótszą ręką wznawia rozstrzygnięcie',()=>{
 const s=setup();assert.ok(batch(s,['a','b']).ok);resolve(s);put(s,'mind','mindstab');addMana(s,'p1',6,{colors:['B']});
 put(s,'foe2','giant-spider','hand','p2');
 const cast=playerView(s,'p1').legalCommands.find(c=>c.objectId==='mind'&&c.type==='cast_spell'&&c.targets?.[0]==='p2');assert.ok(cast);assert.ok(execute(s,cast).ok);
 for(let i=0;i<8&&!s.pendingDiscardChoice;i++)assert.ok(execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId}).ok);
 assert.equal(playerView(s,'p2').pendingDiscardChoice.count,2);assert.equal(playerView(s,'p1').pendingDiscardChoice,null);
 assert.ok(batch(s,['foe','foe2'],'p2').ok);assert.equal(s.pendingDiscardChoice,null);assert.equal(s.pendingSpell,null);
});

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.type = '';
    this.checked = false;
    this.disabled = false;
    this.name = '';
    this.dataset = {};
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type) { for (const l of this.listeners[type] ?? []) l({}); }
  /** Wszystkie elementy potomne (wraz z sobą) spełniające predykat. */
  all(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const child of this.children) child.all(pred, out);
    return out;
  }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}

test('B UI: prawdziwy main otwiera jeden multiselect; 0/1/3 niedozwolone, Anuluj bez odrzucenia',()=>{
 const s=setup(),host=new MiniEl('div'),calls=[],peeks=[];let shown=0,hidden=0;
 const session={view:()=>playerView(s,'p1'),nameOf:id=>registry.get(id)?.name??id,nameOfObject:id=>registry.get(s.objects.get(id)?.cardId)?.name??id};
 const source=readFileSync('src/table/main.js','utf8'),from=source.indexOf('  function openChoiceRequest('),to=source.indexOf('\n  }',from)+4;
 assert.ok(from>0&&to>from);
 const ctx=createContext({...plans,session,els:{choiceRequestBody:host},renderMultiTargetWizard,polishPluralCount,
  openCardFullscreen:id=>peeks.push(id),showModal:()=>shown++,hideModal:()=>hidden++,
  play:cmd=>{calls.push(cmd);assert.ok(execute(s,cmd).ok);}});
 const open=runInContext(source.slice(from,to)+'\nopenChoiceRequest;',ctx);
 const req={id:'discard',type:'target',options:session.view().legalCommands.filter(c=>c.type==='resolve_discard_choice')};
 const old=globalThis.document;globalThis.document={createElement:tag=>new MiniEl(tag)};
 try {
  const before=stateFingerprint(s);open(req);assert.equal(shown,1);
  assert.match(host.textContent,/Cathartic Reunion.*zaznacz 2 karty do odrzucenia jako koszt/);
  let inputs=host.byClass('picker-toggle'),confirm=host.byClass('multi-target-confirm')[0];
  assert.equal(inputs.length,3);assert.ok(inputs.every(i=>i.type==='checkbox'));assert.equal(confirm.disabled,true);
  inputs[0].checked=true;inputs[0].emit('change');assert.equal(confirm.disabled,true);
  assert.match(host.textContent,/1 \/ 2/);assert.equal(stateFingerprint(s),before);
  host.byClass('multi-target-cancel')[0].click();assert.equal(hidden,1);assert.equal(calls.length,0);assert.equal(stateFingerprint(s),before);
  open(req);inputs=host.byClass('picker-toggle');confirm=host.byClass('multi-target-confirm')[0];
  for(const input of inputs){input.checked=true;input.emit('change');}
  assert.equal(confirm.disabled,true);assert.match(host.textContent,/3 \/ 2/);confirm.click();assert.equal(calls.length,0);
  inputs[2].checked=false;inputs[2].emit('change');assert.equal(confirm.disabled,false);assert.match(host.textContent,/2 \/ 2/);
  assert.equal(stateFingerprint(s),before);confirm.click();assert.equal(calls.length,1);assert.equal(calls[0].cardIds.length,2);assert.equal(s.pendingDiscardChoice,null);
  assert.equal(shown,2,'otwarcie + ponowne otwarcie po anulowaniu; nie ma modala drugiej karty');
 } finally {globalThis.document=old;}
});

test('B: Nightsnare zachowuje odmowę i przenosi wspólny wybór dwóch kart na właściciela ręki',()=>{
 const s=setup();assert.ok(batch(s,['a','b']).ok);resolve(s);put(s,'night','nightsnare');put(s,'foe2','giant-spider','hand','p2');addMana(s,'p1',4,{colors:['B']});
 const cast=playerView(s,'p1').legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='night'&&c.targets?.[0]==='p2');assert.ok(cast);assert.ok(execute(s,cast).ok);
 for(let i=0;i<8&&!s.pendingDiscardChoice;i++)assert.ok(execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId}).ok);
 let v=playerView(s,'p1');assert.equal(plans.discardPlanOf(v.legalCommands.filter(c=>c.type==='resolve_discard_choice'),v),null,'pierwszy wybór pozostaje opcjonalnym single');
 assert.ok(execute(s,{type:'resolve_discard_choice',playerId:'p1',cardId:null}).ok);
 v=playerView(s,'p2');const plan=plans.discardPlanOf(v.legalCommands.filter(c=>c.type==='resolve_discard_choice'),v);assert.ok(plan);assert.equal(plan.count,2);
 assert.ok(execute(s,plans.commandForDiscardSelection(plan,['foe','foe2'])).ok);assert.equal(s.pendingDiscardChoice,null);
});

test('B UI: nagłówek grupy nazywa liczbę kart i koszt, nie pojedynczą kartę',()=>{
 const s=setup(),v=playerView(s,'p1');const title=choiceGroupTitle({type:'target',options:v.legalCommands.filter(c=>c.type==='resolve_discard_choice')},{nameOf:id=>registry.get(id)?.name},v);
 assert.equal(title,'Cathartic Reunion — koszt: odrzuć 2 karty');
});

for(const change of ['gone','control']) test(`B: nieaktualny wybór (${change}) odrzucony przed ruszeniem pierwszej karty`,()=>{
 const s=setup();if(change==='gone')s.objects.delete('b');else s.objects.set('b',Object.freeze({...s.objects.get('b'),controllerId:'p2'}));
 const before=stateFingerprint(s);assert.equal(batch(s,['a','b']).ok,false);assert.equal(stateFingerprint(s),before);assert.equal(s.objects.get('a').zone,'hand');
});
test('B: niejednoznaczne cardId + cardIds odrzucone atomowo',()=>{
 const s=setup(),before=stateFingerprint(s);assert.equal(execute(s,{type:'resolve_discard_choice',playerId:'p1',cardId:'a',cardIds:['a','b']}).ok,false);assert.equal(stateFingerprint(s),before);
});
