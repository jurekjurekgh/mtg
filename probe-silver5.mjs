// Sonda Srebra v5: H18 unearth+replacement; H19 embalm; H20 persist; H21 renown?
import { createGameState, addObject, execute, playerView } from './src/engine/game-state.js';
import { createCardRegistry } from './src/cards/card-data.js';
import { gameObjectDataOf } from './src/cards/materialize.js';
import { addMana } from './src/engine/resources.js';

const REGISTRY = createCardRegistry();
const game = () => createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
function putCard(state, id, cardId, controllerId, zone, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, aura: def.aura ?? null, ...over,
  });
  return state.objects.get(id);
}
function mainPhase(state, pid = 'p1') {
  state.turn.phase = 'precombat_main'; state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid; state.turn.step = 'precombat_main'; state.turn.passes = 0;
}
function drain(state) {
  let guard = 0;
  const blocked = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  while (state.zones.stack.length > 0 && guard++ < 14) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (blocked(r)) return 'blocked:' + r.events[0]?.reason;
    if (!r.ok) return 'fail:' + r.events[0]?.reason;
  }
  return 'resolved';
}

// H18: unearth Abomination → Force Away → ma trafić do EXILE (nie ręki).
{
  const state = game(); mainPhase(state);
  putCard(state, 'abom', 'etherium-abomination', 'p1', 'graveyard');
  putCard(state, 'bounce', 'force-away', 'p1', 'hand');
  addMana(state, 'p1', 12, { colors: ['U', 'U', 'B'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'abom');
  console.log('H18 unearth offers:', offers.length);
  if (offers.length > 0) {
    console.log('H18 activate:', execute(state, offers[0]).ok);
    console.log('H18 drain:', drain(state));
    const bf = [...state.objects.values()].find((o) => o.cardId === 'etherium-abomination' && o.zone === 'battlefield');
    console.log('H18 unearthed on battlefield:', Boolean(bf), '| unearthExile:', bf?.unearthExile, '| haste:', (bf?.keywords ?? []).includes('haste'));
    if (bf) {
      const b = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bounce', targets: [bf.id] });
      console.log('H18 bounce cast:', b.ok, b.events?.[0]?.reason ?? '');
      console.log('H18 drain2:', drain(state));
      const zones = [...state.objects.values()].filter((o) => o.cardId === 'etherium-abomination').map((o) => `${o.zone}${o.id.startsWith('hand-') ? '' : ''}`);
      console.log('H18 abomination zones (expect exile):', JSON.stringify(zones));
    }
  }
}

// H19: embalm Tah-Crop → token biały Zombie bez kosztu?
{
  const state = game(); mainPhase(state);
  putCard(state, 'skirm', 'tah-crop-skirmisher', 'p1', 'graveyard');
  addMana(state, 'p1', 10, { colors: ['U'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'skirm');
  console.log('H19 embalm offers:', offers.map((c) => c.type).join(','));
  if (offers.length > 0) {
    console.log('H19 activate:', execute(state, offers[0]).ok);
    console.log('H19 drain:', drain(state));
    const tok = [...state.objects.values()].find((o) => o.isToken && o.zone === 'battlefield');
    console.log('H19 token:', tok ? `${tok.name} ${tok.power}/${tok.toughness} colors=${JSON.stringify(tok.colors)} subtypes=${JSON.stringify(tok.subtypes)} manaCost=${tok.manaCost}` : '(none)');
    const sk = [...state.objects.values()].filter((o) => o.cardId === 'tah-crop-skirmisher').map((o) => o.zone);
    console.log('H19 skirmisher zones (expect exile):', JSON.stringify(sk));
  }
}
