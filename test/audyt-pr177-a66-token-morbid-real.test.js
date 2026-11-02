// CR 700.4: dies means put into a graveyard from the battlefield. Tokeny
// umierają zanim SBA je usunie; finality przenosi do exile zamiast do grobu.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
const reg=createCardRegistry();
function put(s,id,card,zone='hand',player='p1') {const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:player,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify({turn:s.turn,legal:view(s).legalCommands}));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));return r;}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function until(s,p){for(let i=0;i<30&&!p();i++)pass(s);assert.ok(p(),JSON.stringify({turn:s.turn,stack:s.zones.stack,legal:view(s).legalCommands}));}
function setup(){const s=createGameState({seed:17766,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 for(let i=0;i<3;i++)put(s,`forest${i}`,'basic-forest','library');put(s,'rites','village-rites');put(s,'vigil','caravan-vigil');addMana(s,'p1',9,{colors:['W','B','G']});return s;}
function oakToken(s){put(s,'oak','ambassador-oak');act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='oak'));until(s,()=>s.zones.stack.length===0);const t=[...s.objects.values()].find(o=>o.cardId==='token_elf_warrior'&&o.zone==='battlefield');assert.ok(t?.isToken);return t;}
function sacrifice(s,id){const opts=view(s).legalCommands.filter(c=>c.type==='cast_spell'&&c.objectId==='rites');act(s,opts.find(c=>c.sacrificeTargetId===id));until(s,()=>s.zones.stack.length===0);}
function vigil(s){act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='vigil'));until(s,()=>s.pendingSearchChoice!=null);return view(s).legalCommands.filter(c=>c.type==='resolve_search_choice');}
for(const dest of ['hand','battlefield'])test(`A66: umierający token pozwala Caravan Vigil wybrać ${dest}`,()=>{
 const s=setup();const t=oakToken(s);sacrifice(s,t.id);assert.equal(s.creatureDiedThisTurn,true);assert.ok(![...s.objects.values()].some(o=>o.instanceId===t.instanceId));
 const opts=vigil(s);assert.ok(opts.some(c=>c.destination==='hand'));assert.ok(opts.some(c=>c.destination==='battlefield'));act(s,opts.find(c=>c.destination===dest&&c.found!=null));
 assert.ok([...s.objects.values()].some(o=>o.cardId==='basic-forest'&&o.zone===dest));
});

test('A66: Selhoff Occultist widzi śmierć tokena poświęconego Village Rites',()=>{
 const s=setup();const t=oakToken(s);put(s,'occ','selhoff-occultist','battlefield');put(s,'enemy-lib','basic-island','library','p2');
 const cmd=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='rites'&&c.sacrificeTargetId===t.id);act(s,cmd);
 assert.ok(s.events.some(e=>e.type==='ability_triggered'&&e.cardId==='selhoff-occultist'));
 until(s,()=>s.pendingTriggerTargets?.length>0);const opt=view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId==='p2'||c.candidateIds?.includes('p2')));act(s,opt.targetId?opt:{...opt,targetId:'p2'});until(s,()=>s.zones.stack.length===0);assert.equal([...s.objects.values()].find(o=>o.instanceId==='i-enemy-lib').zone,'graveyard');
});

test('A66: Liliana’s Triumph wymusza poświęcenie tokena, który liczy się dla Morbid',()=>{
 const s=setup();const t=oakToken(s);put(s,'triumph','lilianas-triumph','hand','p2');addMana(s,'p2',2,{colors:['B']});pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='triumph'));until(s,()=>s.pendingSacrifice!=null);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId===t.id));until(s,()=>s.zones.stack.length===0);
 assert.equal(s.creatureDiedThisTurn,true);const opts=vigil(s);assert.ok(opts.some(c=>c.destination==='battlefield'));
});

test('A66: token zniszczony Spin Out także umiera',()=>{
 const s=setup();const t=oakToken(s);put(s,'spin','spin-out');act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='spin'&&c.targets?.includes(t.id)));until(s,()=>s.zones.stack.length===0);assert.equal(s.creatureDiedThisTurn,true);assert.ok(vigil(s).some(c=>c.destination==='battlefield'));
});

test('A66: stwór z finality od Zoraline poświęcony Village Rites nie umiera',()=>{
 const s=setup();put(s,'zora','zoraline');put(s,'victim','highland-game','graveyard');act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='zora'));until(s,()=>s.pendingOptionalPay!=null);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay===true));const target=view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId==='victim'||c.targetIds?.includes('victim')));act(s,target?.targetIds?{...target,targetId:'victim'}:target);until(s,()=>s.zones.stack.length===0);
 const creature=[...s.objects.values()].find(o=>o.instanceId==='i-victim'&&o.zone==='battlefield');assert.equal(creature?.counters?.finality,1);sacrifice(s,creature.id);assert.equal([...s.objects.values()].find(o=>o.instanceId==='i-victim').zone,'exile');assert.equal(s.creatureDiedThisTurn,false);assert.ok(!vigil(s).some(c=>c.destination==='battlefield'));
});
