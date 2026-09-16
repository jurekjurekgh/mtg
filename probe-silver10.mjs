// Sonda Srebra v10: H41 clash, H42 forecast.
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

// H41: clash — wyższa MV wraca do ręki; remis → grób.
for (const [label, p1top, p2top, expect] of [['win', 'akroan-sergeant', 'shock', 'hand'], ['tie', 'shock', 'shock', 'graveyard']]) {
  const state = game();
  putCard(state, 'ants', 'release-the-ants', 'p1', 'hand');
  putCard(state, 't1', p1top, 'p1', 'library');
  putCard(state, 't2', p2top, 'p2', 'library');
  for (let i = 0; i < 6; i++) { putCard(state, `f1-${i}`, 'basic-forest', 'p1', 'library'); putCard(state, `f2-${i}`, 'basic-forest', 'p2', 'library'); }
  // wierzch = [0]: wymuszamy kolejność.
  const rest = state.zones.library.filter((id) => id !== 't1' && id !== 't2');
  state.zones.library = ['t1', 't2', ...rest];
  addMana(state, 'p1', 8, { colors: ['R'] });
  console.log(`H41 ${label} cast:`, execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] }).ok);
  let d = drain(state);
  let guard = 0;
  while (d.startsWith('blocked') && guard++ < 6) {
    const pend = state.pendingClash;
    const me = pend?.playerId ?? state.turn.priorityPlayerId;
    const opts = playerView(state, me).legalCommands.filter((c) => c.type === 'resolve_clash_choice');
    if (opts.length === 0) break;
    execute(state, opts[0]);
    d = drain(state);
  }
  console.log(`H41 ${label} drain:`, d, `| zone (expect ${expect}):`,
    [...state.objects.values()].filter((o) => o.cardId === 'release-the-ants').map((o) => o.zone));
}

// H42: forecast — w upkeepie TAK, w main NIE; drugi raz w turze NIE.
{
  const state = game();
  putCard(state, 'rays', 'piercing-rays', 'p1', 'hand');
  putCard(state, 'victim', 'akroan-sergeant', 'p2', 'battlefield');
  addMana(state, 'p1', 10, { colors: ['W'] });
  const mainOffers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'rays');
  console.log('H42 main offers (expect 0 forecast):', mainOffers.filter((c) => c.type === 'activate_ability').length);
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1'); state.turn.activePlayerId = 'p1';
  const upOffers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'rays' && c.type === 'activate_ability');
  console.log('H42 upkeep offers (expect 1):', upOffers.length);
  if (upOffers.length > 0) {
    console.log('H42 activate:', execute(state, upOffers[0]).ok, drain(state));
    console.log('H42 victim tapped (expect true):', state.objects.get('victim')?.tapped);
    const again = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'rays' && c.type === 'activate_ability');
    console.log('H42 second activation (expect 0):', again.length);
  }
}
