// Tail Slash ruling 2015-02-25: if either creature is an illegal target as
// Tail Slash tries to resolve, the creature won't deal damage.
// Oracle/ruling snapshot: docs/cards/scryfall-tail-slash.json.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
const reg=createCardRegistry();
function put(s,id,cardId,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry:reg});
 addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function scene(dealer='child-of-night',victim='scorpion-sentinel'){
 const s=createGameState({seed:17739,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'dealer',dealer,'battlefield');put(s,'victim',victim,'battlefield','p2');put(s,'slash','tail-slash','hand');
 addMana(s,'p1',8,{colors:['R']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'legal command');const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function cast(s,id,targets){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId===id&&JSON.stringify(c.targets??[])===JSON.stringify(targets)));}
function finish(s){for(let i=0;i<20&&s.zones.stack.length;i++)pass(s);assert.equal(s.zones.stack.length,0);}
function zone(s,instance){return [...s.objects.values()].find(o=>o.instanceId===`i-${instance}`)?.zone;}

test('A39: Child of Night zadaje obrażenia jako źródło i zyskuje życie',()=>{
 const s=scene();cast(s,'slash',['dealer','victim']);finish(s);
 assert.equal(s.objects.get('victim').damage,2);assert.equal(s.players.find(p=>p.id==='p1').life,22);
});
test('A39: Brute Force w odpowiedzi zmienia moc i lifelink Tail Slash',()=>{
 const s=scene('child-of-night','dire-fleet-ravager');put(s,'buff','brute-force','hand');
 cast(s,'slash',['dealer','victim']);cast(s,'buff',['dealer']);finish(s);
 assert.equal(zone(s,'victim'),'graveyard');assert.equal(s.players.find(p=>p.id==='p1').life,25);
});
test('A39: Deadly Recluse zadaje jedno obrażenie deathtouch większemu stworowi',()=>{
 const s=scene('deadly-recluse');cast(s,'slash',['dealer','victim']);finish(s);
 assert.equal(zone(s,'victim'),'graveyard');assert.equal(zone(s,'dealer'),'battlefield');
});
test('A39: Spare from Evil chroni cel przed obrażeniami pająka, nie przed czerwonym czarem',()=>{
 const s=scene('deadly-recluse');put(s,'spare','spare-from-evil','hand','p2');addMana(s,'p2',2,{colors:['W']});
 cast(s,'slash',['dealer','victim']);pass(s);cast(s,'spare',[]);finish(s);
 assert.equal(zone(s,'victim'),'battlefield');assert.equal(s.objects.get('victim').damage,0);
});
test('A39: Shock w odpowiedzi usuwa źródło — ocalały cel nie dostaje obrażeń',()=>{
 const s=scene();put(s,'shock','shock','hand','p2');addMana(s,'p2',1,{colors:['R']});
 cast(s,'slash',['dealer','victim']);pass(s);cast(s,'shock',['dealer']);finish(s);
 assert.equal(zone(s,'dealer'),'graveyard');assert.equal(s.objects.get('victim').damage,0);assert.equal(s.players.find(p=>p.id==='p1').life,20);
});
test('A39: Magic Damper nadaje ofierze hexproof w odpowiedzi — lifelink nie działa',()=>{
 const s=scene();put(s,'damper','magic-damper','hand','p2');addMana(s,'p2',2,{colors:['U']});
 cast(s,'slash',['dealer','victim']);pass(s);cast(s,'damper',['victim']);finish(s);
 assert.equal(zone(s,'victim'),'battlefield');assert.equal(s.objects.get('victim').damage,0);assert.equal(s.players.find(p=>p.id==='p1').life,20);
});
