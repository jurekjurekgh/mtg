// Sonda Srebra v9: H37 bloodrush, H38 phyrexian-życie, H39 charm-mody, H40 regen, H41 clash.
import { createGameState, addObject, execute, playerView } from './src/engine/game-state.js';
import { createCardRegistry } from './src/cards/card-data.js';
import { gameObjectDataOf } from './src/cards/materialize.js';
import { addMana } from './src/engine/resources.js';
import { jumpToStep } from './src/engine/turn.js';

const REGISTRY = createCardRegistry();
function game(pid = 'p1') {
  const state = createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid; state.turn.priorityPlayerId = pid;
  return state;
}
function putCard(state, id, cardId, controllerId, zone, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, aura: def.aura ?? null, ...over,
  });
  const o = state.objects.get(id);
  if (zone === 'battlefield') state.objects.set(id, Object.freeze({ ...o, summoningSickness: false }));
  return state.objects.get(id);
}
function drain(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 16) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return 'fail:' + r.events[0]?.reason;
    if (/(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) return 'blocked:' + r.events[0]?.reason;
  }
  return 'resolved';
}

// H37: bloodrush — odrzutek z ręki pompuje ATAKUJĄCEGO (tylko w walce).
{
  const state = game();
  putCard(state, 'atk', 'akroan-sergeant', 'p1', 'battlefield');
  putCard(state, 'gob', 'skinbrand-goblin', 'p1', 'hand');
  for (let i = 0; i < 10; i++) { putCard(state, `l1-${i}`, 'basic-forest', 'p1', 'library'); putCard(state, `l2-${i}`, 'basic-forest', 'p2', 'library'); }
  addMana(state, 'p1', 6, { colors: ['R'] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1'); state.turn.activePlayerId = 'p1';
  console.log('H37 declare:', execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'gob');
  console.log('H37 bloodrush offers:', offers.length);
  if (offers.length > 0) {
    console.log('H37 activate:', execute(state, offers[0]).ok, drain(state));
    console.log('H37 gob zone (expect graveyard):', [...state.objects.values()].filter((o) => o.cardId === 'skinbrand-goblin').map((o) => o.zone));
    const atk = state.objects.get('atk');
    console.log('H37 atk pump (expect +2/+1):', atk?.powerModifier, atk?.toughnessModifier);
  }
}

// H38: Porcelain Legionnaire za życie ({2} + 2 życia, bez białej).
{
  const state = game();
  putCard(state, 'leg', 'porcelain-legionnaire', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: [] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'leg');
  console.log('H38 offers:', offers.map((c) => JSON.stringify({ t: c.type, life: c.phyrexianPayWithLife ?? null })).join(' | '));
  const lifeOffer = offers.find((c) => (c.phyrexianPayWithLife ?? 0) > 0);
  if (lifeOffer) {
    const lifeBefore = state.players.find((p) => p.id === 'p1').life;
    console.log('H38 cast-for-life:', execute(state, lifeOffer).ok, drain(state), '| life:', lifeBefore, '->', state.players.find((p) => p.id === 'p1').life);
    console.log('H38 zone:', [...state.objects.values()].filter((o) => o.cardId === 'porcelain-legionnaire').map((o) => o.zone));
  }
}

// H39: Selesnya Charm — wybór modu (token bez celu).
{
  const state = game();
  putCard(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['G', 'W'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'charm');
  console.log('H39 offers:', offers.length);
  for (const o of offers.slice(0, 4)) console.log('   ', JSON.stringify(o).slice(0, 130));
}

// H40: regeneracja jednorazowa — tarcza zużywa się po pierwszym destroy.
{
  const state = game();
  putCard(state, 'troll', 'trestle-troll', 'p1', 'battlefield');
  addMana(state, 'p1', 12, { colors: ['G'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'troll' && c.type === 'activate_ability');
  console.log('H40 regen offers:', offers.length);
  if (offers.length > 0) {
    console.log('H40 shield:', execute(state, offers[0]).ok, drain(state));
    const { destroyPermanent } = await import('./src/engine/destruction.js');
    console.log('H40 destroy#1:', destroyPermanent(state, state.objects.get('troll')), '| zone:', state.objects.get('troll')?.zone, '| tapped:', state.objects.get('troll')?.tapped);
    // druga destrukcja — tarcza zużyta → grób (wybór gracza? destroyPermanent bez wyboru?)
    const r2 = destroyPermanent(state, state.objects.get('troll'));
    console.log('H40 destroy#2:', r2, '| zone:', state.objects.get('troll')?.zone);
  }
}
