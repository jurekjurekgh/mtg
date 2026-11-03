// Faktyczne okno A80/A81: token z rzutu i prawdziwe triggery, nie sztuczna oferta.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
import {createRandomBot} from '../src/controllers/random-bot.js';
import {createAggroBot} from '../src/controllers/aggro-bot.js';
const reg=createCardRegistry();
function put(s,id,card,zone,p){const [{objectId,...data}]=createCardDeck({cardIds:[card],ownerId:p,registry:reg});addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:p});}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,JSON.stringify(view(s).legalCommands));const r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function scene(p,kind){const s=createGameState({seed:17789,players:[{id:'p1'},{id:'p2'}]});s.turn=jumpToStep(s.turn,'main1',p);s.turn.activePlayerId=s.turn.priorityPlayerId=p;put(s,'summoner','scion-summoner','hand',p);addMana(s,p,3,{colors:['G']});act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='summoner'));pass(s);pass(s);pass(s);pass(s);const token=[...s.objects.values()].find(o=>o.cardId==='token_eldrazi_scion'&&o.zone==='battlefield');assert.ok(token);if(kind==='spire'){put(s,'spire','rupture-spire','hand',p);act(s,view(s).legalCommands.find(c=>c.type==='play_land'&&c.objectId==='spire'));pass(s);pass(s);assert.ok(s.pendingPayOrSacrifice);}else{put(s,'pangolin','oreplate-pangolin','battlefield',p);put(s,'bomb','panic-spellbomb','hand',p);addMana(s,p,1);act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='bomb'));pass(s);pass(s);pass(s);pass(s);assert.ok(s.pendingOptionalPay);}return {s,token};}
for(const kind of ['spire','pangolin'])for(const p of ['p1','p2'])test(`A89: heurystyczny bot wykonuje ręczne źródło i dopłatę ${kind} (${p})`,()=>{const {s,token}=scene(p,kind),bot=createHeuristicBot({seed:177,randomness:0,lookahead:0,registry:reg});const chosen=bot.chooseCommand(view(s));assert.equal(chosen.type,'activate_ability',JSON.stringify(chosen));assert.equal(chosen.objectId,token.id);act(s,chosen);act(s,bot.chooseCommand(view(s)));if(kind==='pangolin'){pass(s);pass(s);assert.equal(s.objects.get('pangolin').counters?.['+1/+1'],1);}else assert.ok([...s.objects.values()].some(o=>o.cardId==='rupture-spire'&&o.zone==='battlefield'));});
for(const kind of ['spire','pangolin'])test(`A89: random i aggro nie wybierają odrzuconej dopłaty ${kind}`,()=>{for(let seed=1;seed<=15;seed++){const {s}=scene('p1',kind),bot=createRandomBot({seed,allowConcede:false}),c=bot.chooseCommand(view(s));assert.ok(execute(s,c).ok,`seed ${seed}: ${JSON.stringify(c)}`);}const {s}=scene('p1',kind),c=createAggroBot().chooseCommand(view(s));assert.ok(execute(s,c).ok,`aggro ${JSON.stringify(c)}`);});

test('A89: dostępna ograniczona mana może opłacić zdolność bez poświęcenia Sciona (pula dodana syntetycznie)',()=>{const {s,token}=scene('p1','pangolin');addMana(s,'p1',1,{colors:[],spendOnly:'artifact'});const bot=createHeuristicBot({seed:177,registry:reg}),c=bot.chooseCommand(view(s));assert.equal(c.type,'resolve_optional_pay_choice');assert.equal(c.pay,true);act(s,c);assert.ok(s.objects.has(token.id));pass(s);pass(s);assert.equal(s.objects.get('pangolin').counters?.['+1/+1'],1);});
test('A89: nie finansuj ręcznie niekorzystnego refleksu (syntetyczny brak celów w rzeczywistym widoku)',()=>{const {s,token}=scene('p1','pangolin'),v=view(s);const altered={...v,legalCommands:v.legalCommands.map(c=>c.type==='resolve_optional_pay_choice'&&c.pay?{...c,reflexiveTargetCount:0}:c)};const c=createHeuristicBot({seed:177,registry:reg}).chooseCommand(altered);assert.equal(c.type,'resolve_optional_pay_choice');assert.equal(c.pay,false);act(s,c);assert.ok(s.objects.has(token.id));});
