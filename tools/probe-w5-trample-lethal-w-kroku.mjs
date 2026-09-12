// Sonda pomiarowa W5 (PLAN_2026-09-11b): trample i lethal z obrażeń
// PRZYDZIELANYCH w tym samym kroku przez inne stwory.
//
// CR 702.19b (pobrane 2026-09-12, tappedout.net/mtg-questions/deathtouch-and-trample/
// i reddit.com/r/askajudge — cytat dosłowny): „The controller of an attacking
// creature with trample first assigns damage to the creature(s) blocking it. Once
// all those blocking creatures are assigned lethal damage, any excess damage is
// assigned as its controller chooses among those blocking creatures and the
// player, planeswalker, or battle the creature is attacking. **When checking for
// assigned lethal damage, take into account damage already marked on the creature
// and damage from other creatures that's being assigned during the same combat
// damage step**, but not any abilities or effects that might change the amount of
// damage that's actually dealt."
// Tak samo 702.2b (deathtouch): każde niezerowe obrażenia ze źródła z deathtouch
// liczą się jako lethal.
//
// Scenariusz: p2 atakuje x (trample 5/5) i y (3/3); p1 blokuje OBA jednym w
// (2/2 z licznikiem +1/+1 = 3/3, drugi slot bloku ze statyki Cenn's Tactician).
// y przydziela w całe 3 = lethal, więc x może legalnie przydzielić 0 na w i 5 na
// gracza. Pomiar 2026-09-12: silnik ODRZUCA to jako
// `illegal_damage_assignment:trample_blocker_below_lethal` (walidator liczy
// lethal tylko z obrażeń już oznaczonych, `lethalOf` w combat.js).
//
// Uruchomienie: node tools/probe-w5-trample-lethal-w-kroku.mjs (tylko pomiar).
import { createGameState, addObject, execute, playerView } from '/home/user/mtg/src/engine/game-state.js';
import { jumpToStep } from '/home/user/mtg/src/engine/turn.js';
import { validateDamageAssignment } from '/home/user/mtg/src/engine/combat.js';
const atStep=(s,st,p,a=p)=>{s.turn={...jumpToStep(s.turn,st,p),activePlayerId:a};return s;};
function cre(state,id,ctl,power,tough,keywords=[],counters={}){
  addObject(state,{id,instanceId:'i-'+id,cardId:'c-'+id,controllerId:ctl,ownerId:ctl,zone:'battlefield',
    kind:"creature",power,toughness:tough,manaCost:2,types:['Creature'],colors:[],abilities:[],subtypes:[],keywords});
  const o=state.objects.get(id); state.objects.set(id,Object.freeze({...o,summoningSickness:false,counters}));
}
const state=createGameState({seed:122,players:[{id:'p1'},{id:'p2'}]});
atStep(state,'declare_attackers','p2');
cre(state,'tact','p1',1,1); // statyka "extra block" dodana ręcznie poniżej
cre(state,'w','p1',2,2,[],{'+1/+1':1});   // 3/3, blokuje obu
cre(state,'x','p2',5,5,['trample']);      // trample 5/5
cre(state,'y','p2',3,3);                  // 3/3 — przydzieli lethal 3 na w
// statyka Cenn's Tactician (grantsExtraBlockWithCounter) na 'tact'
state.objects.set('tact', Object.freeze({ ...state.objects.get('tact'), abilities:[{ type:'static', grantsExtraBlockWithCounter:'+1/+1' }] }));
console.log('x atakuje:', execute(state,{type:'declare_attackers',playerId:'p2',attackerIds:['x','y']}).ok);
atStep(state,'declare_blockers','p1','p2');
const b=execute(state,{type:'declare_blockers',playerId:'p1',assignments:{x:['w'],y:['w']}});
console.log('podwójny blok w:', b.ok, b.ok?'':JSON.stringify(b.events?.[0]?.reason??b.reason));
atStep(state,'combat_damage','p2');
const rc=execute(state,{type:'resolve_combat',playerId:'p2',defendingPlayerId:'p1'});
console.log('resolve_combat:', rc.ok, '| pending:', JSON.stringify(state.pendingDamageAssignment?.role), state.pendingDamageAssignment?.playerId);
const view=playerView(state,'p2').pendingDamageAssignment;
console.log('widok: wpisy', view.entries.map(e=>`${e.attackerId ?? e.blockerId} moc=${e.power} trample=${!!e.trample} cele=${(e.blockers??e.attackers).map(t=>`${t.id}(lethal ${t.lethal})`).join(',')}`).join(' | '));
const off=playerView(state,'p2').legalCommands.find(c=>c.type==='resolve_damage_assignment');
console.log('default:', JSON.stringify(off.assignments));
// CR 702.19b: w dostaje lethal 3 od y w TYM SAMYM kroku, więc x może przydzielić 0 na w i 5 na gracza.
const legal = execute(state,{type:'resolve_damage_assignment',playerId:'p2',assignments:{x:[{blockerId:'w',amount:0}]}});
console.log('x: 0 na w + 5 na gracza ->', legal.ok ? 'PRZYJĘTE (zgodnie z CR)' : 'ODRZUCONE: '+JSON.stringify(legal.events?.[0]?.reason??legal.reason));
console.log('walidator jednostkowo:', validateDamageAssignment(state,'x',[{blockerId:'w',amount:0}]));
