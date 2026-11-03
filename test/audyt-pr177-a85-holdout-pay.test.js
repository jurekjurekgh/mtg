import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana,spendMana} from '../src/engine/resources.js';
import {manaSourcesOf} from '../src/table/mana-wizard.js';
// Otwarte: wymuszenie RED bez blokowania pozostałych testów.
const audit=(name,fn)=>test(name,{skip:process.env.AUDIT_A85_ENFORCE==='1'?false:'otwarte A85 (AUDIT_A85_ENFORCE=1)'},fn);
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(p,{reserve=0,ally=true}={}){const opp=p==='p1'?'p2':'p1',s=createGameState({seed:17785,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;put(s,'bomb','panic-spellbomb','battlefield',p);put(s,'settlement','holdout-settlement','battlefield',p);if(ally)put(s,'ally','goblin-piker','battlefield',p);put(s,'enemy','highland-game','battlefield',opp);put(s,'top','basic-forest','library',p);if(reserve)addMana(s,p,reserve,{colors:['R']});act(s,view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='bomb'&&c.targets?.includes('enemy')));pass(s);pass(s);return s;}
for(const payer of ['p1','p2'])audit(`A85: Holdout produkuje {R} dla Panic Spellbomb (${payer})`,()=>{const s=scene(payer);assert.ok(s.pendingOptionalPay,'kontroler musi mieć szansę aktywować Holdout');assert.ok(view(s).legalCommands.some(c=>c.type==='resolve_optional_pay_choice'&&c.pay));const ability=view(s).legalCommands.find(c=>c.type==='activate_ability'&&c.objectId==='settlement'&&c.abilityIndex===1&&c.tapCreatureId==='ally');act(s,ability);assert.equal(s.objects.get('ally').tapped,true);act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay));assert.ok([...s.objects.values()].some(o=>o.instanceId==='i-top'&&o.zone==='hand'));});
test('A85: bez stwora Holdout nie produkuje {R}',()=>{const s=scene('p1',{ally:false});assert.equal(s.pendingOptionalPay,null);assert.equal(s.objects.get('settlement').tapped,false);});
// Syntetyczne usunięcie dostępnej wcześniej {R}: bada wyłącznie listę źródeł
// kreatora w prawdziwym oknie decyzji, niezależnie od aktualnej bramki otwarcia.
audit('A85: kreator pokazuje wariant kosztu tapnięcia stwora Holdout',()=>{const s=scene('p1',{reserve:1});assert.ok(s.pendingOptionalPay);spendMana(s,'p1',1,[['R']]);const v=view(s);assert.ok(v.legalCommands.some(c=>c.type==='activate_ability'&&c.objectId==='settlement'&&c.abilityIndex===1&&c.tapCreatureId==='ally'));const sources=manaSourcesOf(v,'p1',(id,i)=>{const o=s.objects.get(id);if(!o||i==null)return null;const a=o.activatableAbilities?.[i]??o.abilities?.[i],es=Array.isArray(a?.effect)?a.effect:[a?.effect],e=es.find(x=>x?.type==='add_mana');return e?{cardId:o.cardId,colors:e.colors??[],amount:e.amount??1,manaCost:a.cost?.mana??0,costColors:a.cost?.colors??[],isLand:o.kind==='land'||o.types?.includes('Land')}:null;});const source=sources.find(x=>x.id==='settlement'&&x.command?.abilityIndex===1&&x.command?.tapCreatureId==='ally');assert.ok(source,'wariant produkcji dowolnego koloru z rzeczywistą komendą płacącą stworem');assert.ok(source.colors.includes('R'));});
