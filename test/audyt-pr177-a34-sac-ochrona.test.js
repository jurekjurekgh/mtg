// CR 608.2b: "If all its targets ... are now illegal, the spell or ability
// doesn't resolve." CR 702.11b: a permanent with hexproof "can't be the target
// of spells or abilities your opponents control." CR 702.12b: indestructible
// means "can't be destroyed" and is not destroyed by lethal damage.
// Źródło: https://github.com/nwgarne/mtg-data/blob/main/rules/cr-raw.txt,
// 2026-09-25, SHA-256 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,addObject,execute,playerView} from '../src/engine/game-state.js';
import {createCardRegistry} from '../src/cards/card-data.js';
import {createCardDeck} from '../src/cards/materialize.js';
import {jumpToStep} from '../src/engine/turn.js';
import {addMana} from '../src/engine/resources.js';
import {createHeuristicBot} from '../src/controllers/heuristic-bot.js';
const registry=createCardRegistry();
function put(s,id,cardId,zone,player='p1'){
 const [{objectId,...data}]=createCardDeck({cardIds:[cardId],ownerId:player,registry});
 addObject(s,{...data,id,instanceId:`i-${id}`,zone,controllerId:player});
 if(zone==='battlefield')s.objects.set(id,Object.freeze({...s.objects.get(id),summoningSickness:false}));
}
function scene(threat,defense=null){
 const s=createGameState({seed:17734,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
 put(s,'weird','spellkeeper-weird','battlefield');put(s,'shock','shock','graveyard');
 if(defense)put(s,'defense',defense,'hand');put(s,'danger',threat,'hand','p2');
 addMana(s,'p1',5,{colors:['U','W']});addMana(s,'p2',8,{colors:['R','B']});return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,c){assert.ok(c,'brak legalnej komendy');let r=execute(s,c);assert.ok(r.ok,JSON.stringify(r));}
function pass(s){act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));}
function launchThreat(s){
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='danger'&&c.targets?.includes('weird')));
 pass(s);assert.equal(s.turn.priorityPlayerId,'p1');
}
function protect(s,{gift=false}={}){
 const option=view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='defense'&&c.targets?.includes('weird')&&Boolean(c.gifted)===gift);
 act(s,option);pass(s);pass(s); // rozstrzyga się osłona, zagrożenie nadal na stosie
 if(s.turn.priorityPlayerId!=='p1')pass(s);
 assert.equal(s.turn.priorityPlayerId,'p1');assert.ok(s.zones.stack.length);
}
function bot(s){return createHeuristicBot({seed:5}).chooseCommand(view(s));}
function isSacrifice(cmd){return cmd.type==='activate_ability'&&cmd.objectId==='weird';}
for(const threat of ['fiery-fall','expunge']) test(`A34: po Magic Damper cel ${threat} jest nielegalny, bot nie poświęca Weird`,()=>{
 const s=scene(threat,'magic-damper');launchThreat(s);protect(s);
 const weird=view(s).zones.battlefield.find(o=>o.id==='weird');assert.ok(weird.keywords.includes('hexproof'));
 const choice=bot(s);assert.equal(choice.type,'pass_priority',JSON.stringify(choice));
 act(s,choice);pass(s);assert.equal(s.objects.get('weird')?.zone,'battlefield');
});
test('A34: niezniszczalny Weird wobec Expunge nie jest skazany',()=>{
 const threat='expunge';
 const s=scene(threat,'crumb-and-get-it');launchThreat(s);protect(s,{gift:true});
 assert.ok(view(s).zones.battlefield.find(o=>o.id==='weird').keywords.includes('indestructible'));
 act(s,bot(s));pass(s);assert.equal(s.objects.get('weird')?.zone,'battlefield');
});
for(const threat of ['fiery-fall','expunge','merciless-repurposing']) test(`A34: realny ${threat} bez ochrony uzasadnia poświęcenie`,()=>{
 const s=scene(threat);launchThreat(s);const choice=bot(s);assert.ok(isSacrifice(choice),JSON.stringify(choice));
 act(s,choice);assert.notEqual(s.objects.get('weird')?.zone,'battlefield');pass(s);pass(s);
 assert.ok([...s.objects.values()].some(o=>o.zone==='hand'&&o.ownerId==='p1'&&o.cardId==='shock'));
});
test('A34: niezniszczalność nie powstrzyma wygnania, więc Weird warto poświęcić',()=>{
 const s=scene('merciless-repurposing','crumb-and-get-it');launchThreat(s);protect(s,{gift:true});
 assert.ok(view(s).zones.battlefield.find(o=>o.id==='weird').keywords.includes('indestructible'));
 assert.ok(isSacrifice(bot(s)),JSON.stringify(bot(s)));
});

test('A34: niezniszczalność chroni przed śmiertelnym Fiery Fall mimo wcześniejszych obrażeń',()=>{
 const s=scene('fiery-fall','crumb-and-get-it');put(s,'prior','shock','hand','p2');
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='prior'&&c.targets?.includes('weird')));pass(s);pass(s);
 assert.equal(s.objects.get('weird').damage,2);launchThreat(s);protect(s,{gift:true});
 assert.ok(view(s).zones.battlefield.find(o=>o.id==='weird').keywords.includes('indestructible'));
 assert.equal(bot(s).type,'pass_priority',JSON.stringify(view(s).zones.stack));
});

for(const colorName of ['R','B']) test(`A34: Benevolent Blessing (${colorName}) wobec czerwonego Fiery Fall`,()=>{
 const s=scene('fiery-fall','benevolent-blessing');launchThreat(s);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId==='defense'&&c.targets?.includes('weird')));
 pass(s);pass(s);
 const cmds=view(s).legalCommands;
 const color=cmds.find(c=>c.color===colorName);assert.ok(color,JSON.stringify(cmds));act(s,color);
 if(s.turn.priorityPlayerId!=='p1')pass(s);
 const weird=view(s).zones.battlefield.find(o=>o.id==='weird');
 assert.ok(weird.protection?.some(q=>q.colors?.includes(colorName)),JSON.stringify(weird));
 const choice=bot(s);
 if(colorName==='R'){assert.equal(choice.type,'pass_priority');act(s,choice);pass(s);assert.equal(s.objects.get('weird')?.zone,'battlefield');}
 else assert.ok(isSacrifice(choice),JSON.stringify(choice));
});

test('A34: Shock nie jest śmiertelny dla Weird i nie uzasadnia ofiary',()=>{
 const s=scene('shock');launchThreat(s);assert.equal(bot(s).type,'pass_priority');
});
