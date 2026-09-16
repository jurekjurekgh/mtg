// Sonda Srebra v3: H2/H3a/H3b/H7 z poprawnymi przepływami.
import { createGameState, addObject, execute } from './src/engine/game-state.js';
import { createCardRegistry } from './src/cards/card-data.js';
import { gameObjectDataOf } from './src/cards/materialize.js';
import { jumpToStep } from './src/engine/turn.js';

const REGISTRY = createCardRegistry();
const game = () => createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
function putCard(state, id, cardId, controllerId, zone, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...over,
  });
  return state.objects.get(id);
}
function sick(state, id, val = true) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: val }));
}
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 12) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return r.events?.[0]?.reason;
  }
  return 'resolved';
}

// H2: Scroll Thief + double strike, niezablokowany → 2 draw?
{
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  putCard(state, 'thief', 'scroll-thief', 'p1', 'battlefield', { keywords: ['double_strike'] });
  sick(state, 'thief', false);
  putCard(state, 'd1', 'basic-island', 'p1', 'library');
  putCard(state, 'd2', 'basic-island', 'p1', 'library');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['thief'] });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'declare_blockers', playerId: 'p2', blocks: [] });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const rc = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  console.log('H2 resolve:', rc.ok, rc.events?.[0]?.reason ?? '', '| stack:', state.zones.stack.length);
  console.log('H2 stack drain:', resolveStack(state), '| stack:', state.zones.stack.length);
  const draws = state.events.filter((e) => e.type === 'card_drawn' && e.playerId === 'p1').length;
  const trigs = state.events.filter((e) => e.type === 'ability_triggered').length;
  console.log('H2 draws (expect 2):', draws, '| triggers total:', trigs);
}

// H3a: chory Vehicle + crew (rozstrzygnięte) → atak? (oczekiwane: ODRZUĆ)
{
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  putCard(state, 'veh', 'irontread-crusher', 'p1', 'battlefield');
  putCard(state, 'c1', 'tenth-district-veteran', 'p1', 'battlefield');
  putCard(state, 'c2', 'tenth-district-veteran', 'p1', 'battlefield');
  sick(state, 'c1', false); sick(state, 'c2', false);
  console.log('H3a veh sick:', state.objects.get('veh').summoningSickness);
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewCreatureIds: ['c1', 'c2'] });
  console.log('H3a stack drain:', resolveStack(state));
  console.log('H3a veh kind:', state.objects.get('veh').kind, '| crewed:', state.objects.get('veh').crewed);
  const atk = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['veh'] });
  console.log('H3a sick crewed attack (expect reject):', atk.ok, atk.events?.[0]?.reason ?? '');
}

// H3b: zdrowy Vehicle + CHORA załoga → crew? (oczekiwane: OK)
{
  const state = game();
  state.turn.phase = 'precombat_main'; state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1'; state.turn.step = 'precombat_main'; state.turn.passes = 0;
  putCard(state, 'veh', 'irontread-crusher', 'p1', 'battlefield');
  putCard(state, 'c1', 'tenth-district-veteran', 'p1', 'battlefield');
  putCard(state, 'c2', 'tenth-district-veteran', 'p1', 'battlefield');
  sick(state, 'veh', false);
  console.log('H3b c1 sick:', state.objects.get('c1').summoningSickness);
  const crew = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewCreatureIds: ['c1', 'c2'] });
  console.log('H3b sick crew (expect ok):', crew.ok, crew.events?.[0]?.reason ?? '');
  console.log('H3b stack drain:', resolveStack(state), '| crewed:', state.objects.get('veh').crewed, '| c1 tapped:', state.objects.get('c1').tapped);
}

// H7: FS 3/1 vs 2/2 → Legionnaire bez obrażeń, bloker w grobie?
{
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  putCard(state, 'leg', 'porcelain-legionnaire', 'p1', 'battlefield');
  putCard(state, 'blk', 'tenth-district-veteran', 'p2', 'battlefield');
  sick(state, 'leg', false);
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['leg'] });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { leg: ['blk'] } });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const rc = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  console.log('H7 resolve:', rc.ok, rc.events?.[0]?.reason ?? '');
  console.log('H7 leg zone/damage (expect battlefield/0):', state.objects.get('leg')?.zone, state.objects.get('leg')?.damage ?? 0, '| blk zone (expect gone):', state.objects.get('blk')?.zone ?? '(gone)');
}
