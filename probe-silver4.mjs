// Sonda Srebra v4: H17a Negate vs bestow-aura; H17b kontrola bestow-stwór; H17c czysta aura.
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
    subtypes: def.subtypes ?? [], spell: def.spell, aura: def.aura ?? null, bestow: def.bestow ?? null, ...over,
  });
  return state.objects.get(id);
}
function mainPhase(state, pid = 'p1') {
  state.turn.phase = 'precombat_main'; state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid; state.turn.step = 'precombat_main'; state.turn.passes = 0;
}

// H17a: Dryad za bestow → Negate powinien móc celować (czar AURY, CR 702.103a).
{
  const state = game(); mainPhase(state);
  putCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  putCard(state, 'host', 'tenth-district-veteran', 'p1', 'battlefield');
  putCard(state, 'neg', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 6, { colors: ['G'] });
  addMana(state, 'p2', 4, { colors: ['U', 'U'] });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', targets: ['host'], bestow: true });
  console.log('H17a bestow cast:', cast.ok, cast.events?.[0]?.reason ?? '');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const stackId = state.zones.stack[0];
  console.log('H17a stack kind:', state.objects.get(stackId)?.kind, '| spell.aura:', state.objects.get(stackId)?.spell?.aura);
  const offers = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'neg');
  console.log('H17a negate offers on aura spell (expect ≥1):', offers.length);
  const neg = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stackId] });
  console.log('H17a negate cast (expect ok):', neg.ok, neg.events?.[0]?.reason ?? '');
}

// H17b kontrola: Dryad jako STWÓR → Negate NIE może (czar stwora).
{
  const state = game(); mainPhase(state);
  putCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  putCard(state, 'neg', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 4);
  addMana(state, 'p2', 4, { colors: ['U', 'U'] });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad' });
  console.log('H17b creature cast:', cast.ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const stackId = state.zones.stack[0];
  const neg = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stackId] });
  console.log('H17b negate on creature spell (expect reject):', neg.ok, neg.events?.[0]?.reason ?? '');
}

// H17c kontrola: czysta aura (Hobble) → Negate może.
{
  const state = game(); mainPhase(state);
  putCard(state, 'hob', 'hobble', 'p1', 'hand');
  putCard(state, 'host', 'tenth-district-veteran', 'p1', 'battlefield');
  putCard(state, 'neg', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 6, { colors: ['W'] });
  addMana(state, 'p2', 4, { colors: ['U', 'U'] });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hob', targets: ['host'] });
  console.log('H17c aura cast:', cast.ok, cast.events?.[0]?.reason ?? '');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const stackId = state.zones.stack[0];
  console.log('H17c stack kind:', state.objects.get(stackId)?.kind);
  const neg = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stackId] });
  console.log('H17c negate on pure aura (expect ok):', neg.ok, neg.events?.[0]?.reason ?? '');
}
