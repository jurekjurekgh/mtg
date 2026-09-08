import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {gameObjectDataOf} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {moveObjectDirectly} from '../src/engine/objects.js';
import {replaceObject} from '../src/engine/permanents.js';
import {cardInfo,buildStateOverlay} from '../src/table/render.js';
const registry=createCardRegistry();
const session={cardDetails:id=>registry.get(id),nameOf:id=>registry.get(id)?.name??id,colorsOf:id=>registry.get(id)?.colors??[]};
function put(s,id,cardId,zone='battlefield') {
 const d=registry.get(cardId);addObject(s,{...gameObjectDataOf(d),types:d.types,keywords:d.keywords,id,instanceId:`i-${id}`,cardId,ownerId:'p1',controllerId:'p1',zone});
}
function setup() {
 const s=createGameState({seed:204,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'relic','seers-lantern');put(s,'animator','skilled-animator','hand');addMana(s,'p1',3,{colors:['U']});
 assert.ok(execute(s,{type:'cast_permanent',playerId:'p1',objectId:'animator'}).ok);
 for(let i=0;i<10&&s.zones.stack.length;i++)assert.ok(execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId}).ok);
 assert.equal(s.linkedAnimations.length,1);return s;
}
function info(s,player='p1',id='relic') {return cardInfo({...session,view:()=>playerView(s,player)},playerView(s,player).zones.battlefield.find(o=>o.id===id));}
function overlayText(data) {
 class El {constructor(){this.children=[];this.dataset={};this.text='';}appendChild(c){this.children.push(c);return c;}addEventListener(){}set textContent(v){this.text=String(v);}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}}
 const old=globalThis.document;globalThis.document={createElement:()=>new El()};
 try{return buildStateOverlay(new El(),{...data,isBattlefield:true})?.textContent??'';}finally{globalThis.document=old;}
}
test('A: rzeczywisty ETB Animatora → oba widoki → badge i statystyki 5/5',()=>{
 const s=setup();for(const p of ['p1','p2']) {
  const data=info(s,p);assert.equal(data.power,5);assert.equal(data.toughness,5);
  assert.match(overlayText(data),/animowany przez Skilled Animator/);
 }
});
for(const zone of ['graveyard','exile','hand'])test(`A: odejście Animatora do ${zone} usuwa badge i animację`,()=>{
 const s=setup();assert.match(overlayText(info(s)),/animowany przez/);
 const src=s.linkedAnimations[0].sourceId;moveObjectDirectly(s,src,zone,'departed');
 assert.doesNotMatch(overlayText(info(s)),/animowany przez/);assert.equal(info(s).kind,'artifact');
});
test('A: nowy obiekt artefaktu nie dziedziczy badge po powrocie',()=>{
 const s=setup();moveObjectDirectly(s,'relic','hand','back');moveObjectDirectly(s,'back','battlefield','returned');
 assert.doesNotMatch(overlayText(info(s,'p1','returned')),/animowany przez/);
});
test('A: kontrola źródła nie kończy linku, ale zakryte źródło nie ujawnia nazwy',()=>{
 const s=setup(),src=s.objects.get(s.linkedAnimations[0].sourceId);
 replaceObject(s,src,{controllerId:'p2'});assert.match(overlayText(info(s)),/animowany przez Skilled Animator/);
 replaceObject(s,s.objects.get(src.id),{faceDown:true});
 assert.doesNotMatch(JSON.stringify(playerView(s,'p1').zones.battlefield.find(o=>o.id==='relic').linkedAnimationSource),/skilled-animator/);
 assert.match(overlayText(info(s)),/animowany przez zakrytą kartę/);
});
test('A: zwykły stwór 5/5 nie dostaje badge źródła',()=>{
 const s=setup();put(s,'body','rotting-legion');replaceObject(s,s.objects.get('body'),{power:5,toughness:5});
 assert.doesNotMatch(overlayText(info(s,'p1','body')),/animowany przez/);
});
