// Sonda pomiarowa W4 (PLAN_2026-09-11b): przydział obrażeń liczony W TRAKCIE
// kroku zamiast na jego początku (CR 510.1/510.2 — obrażenia bojowe zadawane
// są równocześnie, więc liczniki −1/−1 z infect w tym samym kroku nie mogą
// zmniejszać mocy, którą stwór przydziela).
//
// Scenariusz (podwójny blok dzięki statyce Cenn's Tactician, M166/E):
//   p2 atakuje: Chained Throatseeker 5/5 (infect; „can't attack unless
//   defending player is poisoned" — więc p1 ma 1 poison) + Gurmag Drowner 2/4
//   p1 blokuje OBA: Segmented Krotiq 6/5 z licznikiem +1/+1 (7/6)
// CR: krotiq przydziela 7 (lethal-first 5 na Throatseekera = śmierć, 2 na
// Drownera) i ginie DOPIERO po zadaniu swoich obrażeń.
// Pomiar 2026-09-12 (po W3): kolejność zdarzeń to counter_added:5,
// damage_dealt:5, damage_marked:2, damage_dealt:2, damage_assignment_required,
// creature_destroyed — bloker ginie przed swoją fazą i nie zadaje NIC (0).
//
// Uruchomienie: node tools/probe-w4-infect-przydzial.mjs (tylko pomiar, nic
// nie zapisuje; nie jest częścią `npm test` — służy do odtworzenia liczby
// z planu przed implementacją W4).
import { createGameState, addObject, execute, playerView } from '/home/user/mtg/src/engine/game-state.js';
import { createCardRegistry } from '/home/user/mtg/src/cards/card-data.js';
import { gameObjectDataOf } from '/home/user/mtg/src/cards/materialize.js';
import { jumpToStep } from '/home/user/mtg/src/engine/turn.js';
const R = createCardRegistry();
function put(state,id,cardId,ctl){const d=R.get(cardId);addObject(state,{id,instanceId:'i-'+id,cardId,controllerId:ctl,ownerId:ctl,zone:'battlefield',...gameObjectDataOf(d),types:d.types??[],keywords:d.keywords??[],subtypes:d.subtypes??[],spell:d.spell});const o=state.objects.get(id);state.objects.set(id,Object.freeze({...o,summoningSickness:false}));return state.objects.get(id);}
function atStep(s,step,pri,act=pri){s.turn={...jumpToStep(s.turn,step,pri),activePlayerId:act};return s;}
const state = createGameState({ seed:116, players:[{id:'p1'},{id:'p2'}] });
state.players = state.players.map((pl) => (pl.id === 'p1' ? { ...pl, poison: 1 } : pl)); // Throatseeker: „can't attack unless defending player is poisoned"
atStep(state,'declare_attackers','p2');
put(state,'tact','cenns-tactician','p1');
const w=put(state,'wall','segmented-krotiq','p1');
state.objects.set('wall',Object.freeze({...w,counters:{'+1/+1':1}}));
put(state,'a1','chained-throatseeker','p2'); // 5/5 infect
put(state,'a2','gurmag-drowner','p2');      // 2/4
console.log('moc blokera przed walką:', state.objects.get('wall').power, '+1/+1:', state.objects.get('wall').counters['+1/+1']);
const at=execute(state,{type:'declare_attackers',playerId:'p2',attackerIds:['a1','a2']});
console.log('declare_attackers:', at.ok, JSON.stringify(at.events?.[0]?.reason ?? at.reason ?? '').slice(0,140));
atStep(state,'declare_blockers','p1','p2');
const b=execute(state,{type:'declare_blockers',playerId:'p1',assignments:{a1:['wall'],a2:['wall']}});
console.log('podwójny blok:', b.ok, JSON.stringify(b.events?.[0]?.reason ?? b.reason ?? '').slice(0,140));
atStep(state,'combat_damage','p2');
const rc=execute(state,{type:'resolve_combat',playerId:'p2',defendingPlayerId:'p1'});
console.log('resolve_combat:', rc.ok, 'pending role:', state.pendingDamageAssignment?.role);
console.log('pending:', JSON.stringify(state.pendingDamageAssignment));
console.log('wall w objects:', state.objects.has('wall'), '| strefy:', JSON.stringify({bf:state.zones.battlefield,gy:state.zones.graveyard}));
console.log('zdarzenia:', state.events.slice(-14).map(e=>e.type+(e.amount!=null?':'+e.amount:'')+(e.target?'->'+e.target:'')).join(' | '));
const wallNow=state.objects.get('wall') ?? {};
console.log('PO fazie atakujących — liczniki -1/-1 na blokerze:', wallNow.counters?.['-1/-1'] ?? 0, 'damage:', wallNow.damage);
const view = playerView(state, 'p1').pendingDamageAssignment;
console.log('decyzja zakolejkowana:', Boolean(view), '| wpisów w widoku:', view?.entries?.length ?? 0);
if (!view || view.entries.length === 0) {
  // Właśnie ten przypadek mierzymy: bloker zginął w SBA po komendzie, więc
  // widok decyzji jest pusty, a po wznowieniu jego faza nie zadaje nic.
  const off = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_damage_assignment');
  console.log('oferta mimo pustego widoku:', JSON.stringify(off?.assignments ?? null));
  if (off) execute(state, off);
} else {
  const entry = view.entries[0];
  console.log('widok: moc blokera =', entry.power, '| lethale celów =', entry.attackers.map((a) => a.lethal).join(','));
  const off = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_damage_assignment');
  console.log('wariant domyślny:', JSON.stringify(off.assignments));
  execute(state, off);
}
console.log('--- stan końcowy ---');
for (const id of ['a1', 'a2', 'wall']) {
  const o = state.objects.get(id);
  console.log(id, o ? `${o.zone} dmg=${o.damage ?? 0} -1/-1=${o.counters?.['-1/-1'] ?? 0}` : 'poza state.objects (zginął)');
}
console.log('WNIOSEK: CR 510.1/510.2 wymaga, by bloker przydzielił 7 (5 na a1, 2 na a2)');
console.log('i zadał te obrażenia równocześnie, ginąc dopiero po SBA — patrz plan, sekcja W4.');
