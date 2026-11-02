// Audyt zmiany rankingu Sea God's Scorn w #177: rzeczywiste karty i komendy.
// CR 122.1d: "If a permanent with a stun counter on it would become untapped,
// instead remove a stun counter from it." CR 122.1h: "If this permanent would
// be put into a graveyard from the battlefield, exile it instead."
// CR 122.2: "Counters on an object are not retained if that object moves from
// one zone to another. The counters are not removed; they simply cease to exist."
// https://github.com/nwgarne/mtg-data/blob/main/rules/cr-raw.txt
// wydanie 2026-09-25, SHA-256 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState,addObject,execute,playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
const registry=createCardRegistry();
function put(s,id,cardId,zone,player='p1'){
 const [{objectId,...entry}]=createCardDeck({cardIds:[cardId],ownerId:player,registry});
 addObject(s,{...entry,id,instanceId:`i-${id}`,zone,controllerId:player});
}
function scene(withNeedle=true){
 const s=createGameState({seed:17733,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';s.turn.number=6;
 put(s,'scorn','sea-gods-scorn','hand');if(withNeedle)put(s,'needle','lodestone-needle','hand');
 for(let i=0;i<6;i++)put(s,`land${i}`,'basic-island','battlefield');
 for(let i=0;i<4;i++)put(s,`enemy${i}`,'highland-game','battlefield','p2');
 addMana(s,'p1',10,{colors:['U','U','U','U']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,cmd){assert.ok(cmd,'oferta istnieje');const r=execute(s,cmd);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function needleStun(s,id){
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='needle'));pass(s);pass(s);
 const choice=view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId===id||c.targetIds?.includes(id)));
 act(s,choice?.targetIds?{...choice,targetId:id}:choice);pass(s);pass(s);
 assert.equal(s.objects.get(id).counters?.stun,2);assert.equal(s.objects.get(id).tapped,true);
}
function botChoice(s){
 const bot=createHeuristicBot({seed:1});const v=view(s);const chosen=bot.chooseCommand(v);
 assert.equal(chosen.type,'cast_spell',JSON.stringify(chosen));assert.equal(chosen.objectId,'scorn');
 return {chosen,trace:bot.trace().at(-1)};
}

test('A33: Sea God’s Scorn nie premiuje zdjęcia negatywnych stun z unieruchomionego przeciwnika',()=>{
 const s=scene();needleStun(s,'enemy0');const {chosen,trace}=botChoice(s);
 assert.equal(chosen.targets.length,3);
 assert.ok(!chosen.targets.includes('enemy0'),`wrogie stun powinny pozostać: ${JSON.stringify(chosen)}; ${JSON.stringify(trace.options.filter(o=>o.cmd.includes('enemy0')).slice(0,3))}`);
 act(s,chosen);pass(s);pass(s);
 assert.equal(s.objects.get('enemy0').counters.stun,2);assert.equal(s.objects.get('enemy0').tapped,true);
 for(let i=1;i<4;i++)assert.ok([...s.objects.values()].some(o=>o.instanceId===`i-enemy${i}`&&o.zone==='hand'));
});

test('A33: rzeczywisty dodatni licznik z Fleeting Flight nadal zwiększa wartość celu',()=>{
 const s=scene();put(s,'flight','fleeting-flight','hand');addMana(s,'p1',1,{colors:['W']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='flight'&&c.targets?.includes('enemy0')));pass(s);pass(s);
 assert.equal(s.objects.get('enemy0').counters?.['+1/+1'],1);
 const {chosen,trace}=botChoice(s);assert.ok(chosen.targets.includes('enemy0'),JSON.stringify(chosen));
 const single=trace.options.find(o=>o.cmd==='cast_spell(scorn->enemy0)');
 const baseline=trace.options.find(o=>o.cmd==='cast_spell(scorn->enemy1)');
 assert.ok(single.score-baseline.score>=10,'licznik daje wycenie dodaną wartość');
});

test('A33: własna Capture Sphere unieruchamia jednego z czterech równych przeciwników — Scorn zachowuje aurę',()=>{
 const s=scene(false);put(s,'sphere','capture-sphere','hand');
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='sphere'&&c.targets?.includes('enemy0')));pass(s);pass(s);
 for(let i=0;i<10&&s.zones.stack.length;i++)pass(s);
 const aura=[...s.objects.values()].find(o=>o.cardId==='capture-sphere'&&o.zone==='battlefield');assert.ok(aura);assert.equal(aura.attachedTo,'enemy0');
 addMana(s,'p1',2,{colors:['U']});const {chosen}=botChoice(s);assert.ok(!chosen.targets.includes('enemy0'),JSON.stringify(chosen));
});

test('A33: finality z realnej Zoraline nie jest inwestycją przeciwnika wartą premiowania',()=>{
 const s=scene(false);s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'dead','highland-game','graveyard','p2');put(s,'zora','zoraline','hand','p2');addMana(s,'p2',6,{colors:['W','B']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='zora'));
 for(let i=0;i<10&&!s.pendingOptionalPay;i++)pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_optional_pay_choice'&&c.pay===true));
 const target=view(s).legalCommands.find(c=>c.type==='resolve_trigger_target'&&(c.targetId==='dead'||c.targetIds?.includes('dead')));
 act(s,target?.targetIds?{...target,targetId:'dead'}:target);pass(s);pass(s);
 const returned=[...s.objects.values()].find(o=>o.instanceId==='i-dead'&&o.zone==='battlefield');assert.equal(returned?.counters?.finality,1);
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 const {trace}=botChoice(s);const finality=trace.options.find(o=>o.cmd===`cast_spell(scorn->${returned.id})`);
 const plain=trace.options.find(o=>o.cmd==='cast_spell(scorn->enemy0)');assert.ok(finality&&plain);
 assert.ok(finality.score<=plain.score,`finality ${finality.score}, bez licznika ${plain.score}`);
});

test('A33: własna Capture Sphere nie staje się inwestycją przeciwnika gdy więziony stwór ma +1/+1',()=>{
 const s=scene(false);put(s,'sphere','capture-sphere','hand');put(s,'flight','fleeting-flight','hand');addMana(s,'p1',2,{colors:['W']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='sphere'&&c.targets?.includes('enemy0')));
 for(let i=0;i<10&&s.zones.stack.length;i++)pass(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='flight'&&c.targets?.includes('enemy0')));pass(s);pass(s);
 const {chosen}=botChoice(s);assert.ok(!chosen.targets.includes('enemy0'),JSON.stringify(chosen));
});

test('A33: własna aura przeciwnika Curiosity podnosi wartość jego rzeczywistego stwora',()=>{
 const s=scene(false);s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'aura','curiosity','hand','p2');addMana(s,'p2',1,{colors:['U']});
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='aura'&&c.targets?.includes('enemy0')));pass(s);pass(s);
 assert.ok([...s.objects.values()].some(o=>o.cardId==='curiosity'&&o.zone==='battlefield'&&o.attachedTo==='enemy0'&&o.controllerId==='p2'));
 s.turn=jumpToStep(s.turn,'main','p1');s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 const {chosen,trace}=botChoice(s);assert.ok(chosen.targets.includes('enemy0'));
 const buff=trace.options.find(o=>o.cmd==='cast_spell(scorn->enemy0)');const plain=trace.options.find(o=>o.cmd==='cast_spell(scorn->enemy1)');
 assert.ok(buff.score>plain.score,`aura przeciwnika: ${buff.score} vs ${plain.score}`);
});
