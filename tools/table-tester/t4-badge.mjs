// T4′: czy kafelek GOSPODARZA pokazuje badge „wyposażona: Warrior's Sword"?
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync('/home/user/mtg/src/table/index.html','utf8');
const dom = new JSDOM(html, { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.requestAnimationFrame = (cb)=>setTimeout(cb,0);

const { createCardRegistry } = await import('/home/user/mtg/src/cards/card-data.js');
const { createGameState, addObject, playerView } = await import('/home/user/mtg/src/engine/game-state.js');
const { gameObjectDataOf } = await import('/home/user/mtg/src/cards/materialize.js');
const R = createCardRegistry();
const st = createGameState({ seed: 7, players:[{id:'p1'},{id:'p2'}] });
function add(id, cardId, ctrl, extra={}) {
  const c = R.get(cardId); const d = gameObjectDataOf(c);
  d.types=c.types??[]; d.keywords=c.keywords??[]; d.subtypes=c.subtypes??[];
  addObject(st,{id,instanceId:'i'+id,cardId,controllerId:ctrl,ownerId:ctrl,zone:'battlefield',...d,...extra});
}
add('host','ainok-tracker','p1');
add('sword','warriors-sword','p1');
st.objects.set('sword', Object.freeze({ ...st.objects.get('sword'), attachedTo: 'host' }));

const view = playerView(st,'p1');
const bf = view.zones.battlefield;
console.log('obiekty na bitwisku:');
for (const o of bf) console.log('  ', o.id, '| cardId:', o.cardId, '| attachedTo:', o.attachedTo, '| equipment:', !!o.equipment, '| aura:', !!o.aura, '| bestow:', !!o.bestow);

// Tak liczy to render.js:1728 dla gospodarza:
const atts = bf.filter((o)=>o.attachedTo==='host' && o.id!=='host')
  .map((o)=>({ name: o.cardId ? (R.get(o.cardId)?.name||o.cardId) : o.cardId,
               kind: (o.aura||o.bestow)?'aura':'equip' }));
console.log('\nattachments gospodarza wg logiki render.js:', JSON.stringify(atts));
for (const a of atts) console.log('  badge →', a.kind==='aura'?`zaczarowana: ${a.name}`:`wyposażona: ${a.name}`);
