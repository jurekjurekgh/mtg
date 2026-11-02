// Search destinations are defined by the resolving effect, not the player's
// command. Caravan Vigil additionally allows battlefield only with morbid.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';import {addMana} from '../src/engine/resources.js';import {stateFingerprint} from '../src/engine/fingerprint.js';
const reg=createCardRegistry();function put(s,id,card,zone='hand',player='p1'){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function until(s,p){for(let i=0;i<30&&!p();i++)act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));assert.ok(p());}function card(s,id){return [...s.objects.values()].find(o=>o.instanceId===`i-${id}`);}
function scene(spell,{death=false}={}){const s=createGameState({seed:17773,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 put(s,'spell',spell);put(s,'forest','basic-forest','library');put(s,'animal','woolly-loxodon','library');put(s,'town','balamb-garden-seed-academy','library');addMana(s,'p1',10,{colors:['G','B','R']});
 if(death){put(s,'shock','shock');put(s,'victim','goblin-picker','battlefield','p2');act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='shock'&&c.targets?.includes('victim')));until(s,()=>s.zones.stack.length===0);assert.equal(card(s,'victim').zone,'graveyard');}
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spell'));until(s,()=>s.pendingSearchChoice!=null);return s;}
function rejectDestination(s,found,destination){const before=stateFingerprint(s);const r=execute(s,{type:'resolve_search_choice',playerId:'p1',found,destination});assert.equal(r.ok,false,`nielegalne ${found} → ${destination}`);assert.equal(stateFingerprint(s),before,'odrzucenie musi być atomowe');}

test('A73: Caravan Vigil bez Morbid nie pozwala ręcznie wysłać lądu na pole ani do grobu',()=>{
 const s=scene('caravan-vigil');assert.equal(s.creatureDiedThisTurn,false);const options=view(s).legalCommands.filter(c=>c.type==='resolve_search_choice'&&c.found==='forest');assert.deepEqual(options.map(c=>c.destination),['hand']);
 rejectDestination(s,'forest','battlefield');rejectDestination(s,'forest','graveyard');act(s,options[0]);until(s,()=>s.zones.stack.length===0);assert.equal(card(s,'forest').zone,'hand');
});
for(const destination of ['hand','battlefield'])test(`A73: Caravan Vigil po rzeczywistej śmierci pozwala na ${destination}, ale nie grób`,()=>{
 const s=scene('caravan-vigil',{death:true});assert.equal(s.creatureDiedThisTurn,true);const options=view(s).legalCommands.filter(c=>c.type==='resolve_search_choice'&&c.found==='forest');assert.deepEqual(options.map(c=>c.destination).sort(),['battlefield','hand']);rejectDestination(s,'forest','graveyard');act(s,options.find(c=>c.destination===destination));until(s,()=>s.zones.stack.length===0);assert.equal(card(s,'forest').zone,destination);
});
test('A73: Prishe wysyła Town na pole, nie do ręki ani grobu',()=>{
 const s=scene('prishes-wanderings');rejectDestination(s,'town','hand');rejectDestination(s,'town','graveyard');
 // starsze replaye mogą pominąć domyślną strefę
 act(s,{type:'resolve_search_choice',playerId:'p1',found:'town'});until(s,()=>s.zones.stack.length===0);assert.equal(card(s,'town').zone,'battlefield');assert.equal(card(s,'town').tapped,true);
});
test('A73: Final Parting nie pozwala położyć wielkiego stwora na pole zamiast do ręki i grobu',()=>{
 const s=scene('final-parting');rejectDestination(s,'animal','battlefield');rejectDestination(s,'animal','graveyard');act(s,view(s).legalCommands.find(c=>c.type==='resolve_search_choice'&&c.found==='animal'));assert.equal(card(s,'animal').zone,'hand');assert.ok(s.pendingSearchChoice);rejectDestination(s,'town','battlefield');rejectDestination(s,'town','hand');act(s,view(s).legalCommands.find(c=>c.type==='resolve_search_choice'&&c.found==='town'));until(s,()=>s.zones.stack.length===0);assert.equal(card(s,'town').zone,'graveyard');
});
