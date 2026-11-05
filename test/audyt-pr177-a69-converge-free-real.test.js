// Kaleidoscorch counts colors spent to cast that spell, not mana spent on
// the spell or ability that enables casting it without paying its mana cost.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana,countColorsOfManaSpent} from '../src/engine/resources.js';
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1'){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function until(s,p){for(let i=0;i<30&&!p();i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.ok(p());}
function setup(){const s=createGameState({seed:17769,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';return s;}
function mana(s,colors){for(const c of colors)addMana(s,'p1',1,{colors:c?[c]:[]});}
function stack(s){return [...s.objects.values()].find(o=>o.cardId==='kaleidoscorch'&&o.zone==='stack');}
function kal(s){return [...s.objects.values()].find(o=>o.instanceId==='i-kal');}
function life(s){return s.players.find(p=>p.id==='p2').life;}

test('A69: zwykły Kaleidoscorch wykorzystuje dwa kolory zamiast dwóch czerwonych',()=>{
 const s=setup();put(s,'kal','kaleidoscorch');mana(s,['R','R','G']);act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='kal'&&c.targets?.includes('p2')));
 assert.equal(countColorsOfManaSpent(stack(s).manaColorsSpent),2);until(s,()=>s.zones.stack.length===0);assert.equal(life(s),18);assert.equal(kal(s).zone,'graveyard');assert.equal(s.players[0].mana,1);
});

test('A69: Appraiser znajduje Kaleidoscorch w bibliotece i rzuca go bez kosztu',()=>{
 const s=setup();put(s,'kal','kaleidoscorch','library');put(s,'appraiser','geological-appraiser');mana(s,['R','G','U','B','R']);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='appraiser'));until(s,()=>s.pendingDiscover!=null);
 const choice=view(s).legalCommands.find(c=>c.type==='resolve_discover_choice'&&c.castFree&&c.targets?.includes('p2'));act(s,choice);
 const cast=stack(s);assert.ok(cast);assert.equal(countColorsOfManaSpent(cast.manaColorsSpent),0);assert.equal(s.players[0].mana,1);
 until(s,()=>s.zones.stack.length===0);assert.equal(life(s),20);assert.equal(kal(s).zone,'graveyard');
});

test('A69: Halo Forager wydaje kolory na zdolność, nie na darmowy Kaleidoscorch',()=>{
 const s=setup();put(s,'kal','kaleidoscorch','graveyard');put(s,'halo','halo-forager');mana(s,['U','B','R','G','W']);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='halo'));until(s,()=>s.pendingGraveFreeCast!=null);
 assert.equal(s.players[0].mana,2);const choice=view(s).legalCommands.find(c=>c.type==='resolve_grave_free_cast'&&c.xValue===2&&!c.decline);act(s,choice);
 const found=view(s).legalCommands.find(c=>c.type==='resolve_grave_free_cast'&&c.objectId==='kal');act(s,found);act(s,view(s).legalCommands.find(c=>c.type==='resolve_grave_free_cast'&&c.targets?.includes('p2')));
 const cast=stack(s);assert.ok(cast);assert.equal(s.players[0].mana,0);assert.ok(s.events.some(e=>e.type==='grave_free_cast_resolved'&&e.xPaid===2));assert.equal(countColorsOfManaSpent(cast.manaColorsSpent),0);until(s,()=>s.zones.stack.length===0);assert.equal(life(s),20);assert.equal(kal(s).zone,'exile');
});

test('A69: Epic Experiment płaci kolorową manę, ale odnaleziony Kaleidoscorch jest darmowy',()=>{
 const s=setup();put(s,'kal','kaleidoscorch','library');put(s,'forest','basic-forest','library');put(s,'epic','epic-experiment');mana(s,['U','R','G','B','W']);
 const epicSzablon=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='epic');assert.ok(epicSzablon,'ziarno Epic Experiment');act(s,{...epicSzablon,xValue:2});until(s,()=>s.pendingEpicExperiment!=null);
const choice=view(s).legalCommands.find(c=>c.type==='resolve_epic_choice'&&c.targets?.includes('p2'));act(s,choice);
 assert.equal(countColorsOfManaSpent(stack(s).manaColorsSpent),0);act(s,view(s).legalCommands.find(c=>c.type==='resolve_epic_choice'&&c.done));until(s,()=>s.zones.stack.length===0);assert.equal(life(s),20);assert.equal(kal(s).zone,'graveyard');
});

test('A69: flashback z pięciu prawdziwych kolorów zadaje pięć i wygania czar',()=>{
 const s=setup();put(s,'kal','kaleidoscorch','graveyard');mana(s,['R','G','U','B','W']);act(s,view(s).legalCommands.find(c=>c.type==='cast_flashback'&&c.objectId==='kal'&&c.targets?.includes('p2')));
 assert.equal(countColorsOfManaSpent(stack(s).manaColorsSpent),5);until(s,()=>s.zones.stack.length===0);assert.equal(life(s),15);assert.equal(kal(s).zone,'exile');
});
