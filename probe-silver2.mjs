// Sonda Srebra E0 v2: H2/H3/H6/H7/H9.
import { createGameState, addObject, execute, playerView } from './src/engine/game-state.js';
import { createCardRegistry } from './src/cards/card-data.js';
import { gameObjectDataOf } from './src/cards/materialize.js';
import { jumpToStep } from './src/engine/turn.js';
import { addMana } from './src/engine/resources.js';
import { addCounter } from './src/engine/counters.js';
import { effectivePower, effectiveToughness } from './src/engine/permanents.js';
import { addRegenerationShield } from './src/engine/state-based.js';

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
function mainPhase(state, pid = 'p1') {
  state.turn.phase = 'precombat_main'; state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid; state.turn.step = 'precombat_main'; state.turn.passes = 0;
}
function sick(state, id, val = true) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: val }));
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
  const rc = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  console.log('H2 resolve_combat:', rc.ok, rc.events?.[0]?.reason ?? '');
  for (let i = 0; i < 10 && state.zones.stack.length > 0; i++) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const draws = state.events.filter((e) => e.type === 'card_drawn' && e.playerId === 'p1').length;
  console.log('H2 draws (expect 2):', draws);
}

// H3a: świeży (sick) Vehicle + crew → atak legalny? (oczekiwane: NIE)
{
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  putCard(state, 'veh', 'irontread-crusher', 'p1', 'battlefield');
  putCard(state, 'c1', 'tenth-district-veteran', 'p1', 'battlefield');
  putCard(state, 'c2', 'tenth-district-veteran', 'p1', 'battlefield');
  sick(state, 'c1', false); sick(state, 'c2', false);
  const crew = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewCreatureIds: ['c1', 'c2'] });
  console.log('H3a crew:', crew.ok, crew.events?.[0]?.reason ?? '');
  const atk = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['veh'] });
  console.log('H3a sick crewed attack (expect reject):', atk.ok, atk.events?.[0]?.reason ?? '');
}

// H3b: chore stwory MOGĄ załogować? (oczekiwane: TAK — crew to nie atak)
{
  const state = game(); mainPhase(state);
  putCard(state, 'veh', 'irontread-crusher', 'p1', 'battlefield');
  putCard(state, 'c1', 'tenth-district-veteran', 'p1', 'battlefield');
  putCard(state, 'c2', 'tenth-district-veteran', 'p1', 'battlefield');
  sick(state, 'veh', false); // pojazd zdrowy, załoga chora (domyślnie sick=true?)
  console.log('H3b c1 sick:', state.objects.get('c1').summoningSickness);
  const crew = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewCreatureIds: ['c1', 'c2'] });
  console.log('H3b sick crew (expect ok):', crew.ok, crew.events?.[0]?.reason ?? '');
}

// H6: warstwy — 2/2 z +1/+1, potem baza 4/4 → 5/5? i odwrotna kolejność?
{
  const state = game(); mainPhase(state);
  putCard(state, 'a', 'tenth-district-veteran', 'p1', 'battlefield');
  addCounter(state, 'a', '+1/+1', 1);
  // Efekt Voice of the Vermin przez applyEffect wprost (karta ma requiresTarget attack trigger — tu sam efekt):
  const { applyEffect } = await import('./src/engine/effects.js');
  const src = state.objects.get('a');
  applyEffect(state, { type: 'set_base_pt_until_end_of_turn', power: 4, toughness: 4 }, src, ['a']);
  console.log('H6 counter-then-base (expect 5/5):', effectivePower(state.objects.get('a'), state), '/', effectiveToughness(state.objects.get('a'), state));
  putCard(state, 'b', 'tenth-district-veteran', 'p1', 'battlefield');
  applyEffect(state, { type: 'set_base_pt_until_end_of_turn', power: 4, toughness: 4 }, state.objects.get('b'), ['b']);
  addCounter(state, 'b', '+1/+1', 1);
  console.log('H6 base-then-counter (expect 5/5):', effectivePower(state.objects.get('b'), state), '/', effectiveToughness(state.objects.get('b'), state));
}

// H7: FS 3/1 zablokowany przez 2/2 → blocker ginie w oknie FS, Legionnaire przeżywa?
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
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  console.log('H7 legionnaire zone (expect battlefield):', state.objects.get('leg')?.zone, '| damage:', state.objects.get('leg')?.damage ?? '?', '| blk zone (expect graveyard):', state.objects.get('blk')?.zone ?? '(gone)');
}

// H9: tarcza regen + toughness 0 → ginie? (oczekiwane: TAK, 704.5f)
{
  const state = game(); mainPhase(state);
  putCard(state, 'v', 'tenth-district-veteran', 'p1', 'battlefield');
  addRegenerationShield(state, 'v');
  // -0/-2 do końca tury przez untilEndOfTurnBuffs? prościej: powerModifier/toughnessModifier -2
  state.objects.set('v', Object.freeze({ ...state.objects.get('v'), toughnessModifier: -2 }));
  const r = execute(state, { type: 'pass_priority', playerId: 'p1' });
  console.log('H9 pass:', r.ok, '| v zone (expect graveyard):', state.objects.get('v')?.zone ?? '(gone)');
}
