// T4′: token Hero z job select — czy jego kafelek ma badge „wyposażona: …"?
import { createCardRegistry } from '/home/user/mtg/src/cards/card-data.js';
import { createGameState, addObject, playerView } from '/home/user/mtg/src/engine/game-state.js';
import { gameObjectDataOf } from '/home/user/mtg/src/cards/materialize.js';
import { applyEffect } from '/home/user/mtg/src/engine/effects.js';
const R = createCardRegistry();
const st = createGameState({ seed: 7, players:[{id:'p1'},{id:'p2'}] });
const c = R.get('warriors-sword'); const d = gameObjectDataOf(c);
d.types=c.types??[]; d.keywords=c.keywords??[]; d.subtypes=c.subtypes??[];
addObject(st,{id:'sword',instanceId:'isword',cardId:'warriors-sword',controllerId:'p1',ownerId:'p1',zone:'battlefield',...d});
console.log('equipment?', !!st.objects.get('sword').equipment);
applyEffect(st, { type:'job_select' }, st.objects.get('sword'), []);
const view = playerView(st,'p1');
for (const o of view.zones.battlefield)
  console.log('  ', o.id, '| cardId:', o.cardId, '| attachedTo:', o.attachedTo, '| equipment:', !!o.equipment);
const hero = view.zones.battlefield.find((o)=>o.cardId==='token_hero');
if (!hero) { console.log('BRAK tokenu Hero'); process.exit(0); }
const atts = view.zones.battlefield.filter((o)=>o.attachedTo===hero.id && o.id!==hero.id)
  .map((o)=>({ name: o.cardId ? (R.get(o.cardId)?.name||o.cardId) : o.cardId, kind:(o.aura||o.bestow)?'aura':'equip' }));
console.log('\nattachments Hero:', JSON.stringify(atts));
for (const a of atts) console.log('  badge →', a.kind==='aura'?`zaczarowana: ${a.name}`:`wyposażona: ${a.name}`);
if (!atts.length) console.log('  >>> BRAK BADGE (T4′ potwierdzony)');
