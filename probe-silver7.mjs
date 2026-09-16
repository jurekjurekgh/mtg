// Sonda Srebra v7: H30 blessing-detach, H31 legenda-kopia, H33 adamant, H34 jwari.
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
  const blocked = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  while (state.zones.stack.length > 0 && guard++ < 16) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (blocked(r)) return 'blocked:' + r.events[0]?.reason;
    if (!r.ok) return 'fail:' + r.events[0]?.reason;
  }
  return 'resolved';
}

// H30: mój stwór + MOJA Hobble + WROGA Hobble; Blessing (wybór: biała) → moja zostaje, wroga spada.
{
  const state = game();
  putCard(state, 'guy', 'akroan-sergeant', 'p1', 'battlefield');
  putCard(state, 'mine', 'hobble', 'p1', 'hand');
  putCard(state, 'theirs', 'hobble', 'p2', 'hand');
  putCard(state, 'bless', 'benevolent-blessing', 'p1', 'hand');
  addMana(state, 'p1', 12, { colors: ['W', 'W'] });
  addMana(state, 'p2', 12, { colors: ['W'] });
  console.log('H30 mine:', execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'mine', targets: ['guy'] }).ok, drain(state));
  state.turn.priorityPlayerId = 'p2'; state.turn.activePlayerId = 'p2';
  console.log('H30 theirs:', execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'theirs', targets: ['guy'] }).ok, drain(state));
  state.turn.priorityPlayerId = 'p1'; state.turn.activePlayerId = 'p1';
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'bless', targets: ['guy'] });
  console.log('H30 bless:', r.ok, drain(state));
  // wybór koloru?
  const pend = playerView(state, 'p1').legalCommands.filter((c) => /color/i.test(c.type));
  console.log('H30 color-choice offers:', pend.map((c) => c.type).join(',') || '(none — auto?)');
  for (const c of pend) { if (String(JSON.stringify(c)).includes('W')) { console.log('H30 choose:', execute(state, c).ok); break; } }
  drain(state);
  const attached = [...state.objects.values()].filter((o) => o.attachedTo === 'guy').map((o) => `${o.cardId}(${o.controllerId})`);
  const gy = [...state.objects.values()].filter((o) => o.cardId === 'hobble' && o.zone === 'graveyard').length;
  console.log('H30 attached (expect mine+hobble p1 + blessing):', JSON.stringify(attached), '| hobble in gy (expect 1):', gy);
}

// H31: Cogwork kopiuje legendę-artefakt → legend rule?
{
  const state = game();
  putCard(state, 'cog', 'cogwork-assembler', 'p1', 'battlefield');
  putCard(state, 'ship', 'balamb-garden-airborne', 'p1', 'battlefield');
  addMana(state, 'p1', 12);
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'cog');
  console.log('H31 cog offers:', offers.length);
  if (offers.length > 0) {
    const withTarget = offers.find((c) => (c.targets ?? []).includes('ship')) ?? offers[0];
    console.log('H31 activate:', execute(state, withTarget).ok, drain(state));
    console.log('H31 pendingLegend:', JSON.stringify(state.pendingLegendChoice ?? null).slice(0, 200));
    const ships = [...state.objects.values()].filter((o) => o.cardId === 'balamb-garden-airborne').map((o) => `${o.zone}${o.isToken ? '(token)' : ''}`);
    console.log('H31 ships (expect 1 battlefield — legend rule):', JSON.stringify(ships));
  }
}

// H33: adamant — 3 czarne → licznik; 1 czarna + generyk → brak.
for (const [label, colors] of [['3xB', ['B', 'B', 'B']], ['1xB', ['B']]]) {
  const state = game();
  putCard(state, 'pal', 'locthwain-paladin', 'p1', 'hand');
  addMana(state, 'p1', 10, { colors });
  console.log(`H33 ${label} cast:`, execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'pal' }).ok, drain(state));
  const pal = [...state.objects.values()].find((o) => o.cardId === 'locthwain-paladin' && o.zone === 'battlefield');
  console.log(`H33 ${label} counters (expect ${label === '3xB' ? '+1/+1' : 'none'}):`, JSON.stringify(pal?.counters ?? null));
}

// H34: jwari bez sojusznika → 0/0 ginie; z sojusznikiem → kopia.
{
  const state = game();
  putCard(state, 'jw', 'jwari-shapeshifter', 'p1', 'hand');
  addMana(state, 'p1', 10, { colors: ['U'] });
  console.log('H34 cast:', execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jw' }).ok, drain(state));
  console.log('H34 zone (expect graveyard):', [...state.objects.values()].filter((o) => o.cardId === 'jwari-shapeshifter').map((o) => o.zone));
}
{
  const state = game();
  putCard(state, 'jw', 'jwari-shapeshifter', 'p1', 'hand');
  putCard(state, 'ally', 'coralhelm-guide', 'p1', 'battlefield');
  addMana(state, 'p1', 10, { colors: ['U'] });
  console.log('H34b cast:', execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jw' }).ok);
  const d = drain(state);
  console.log('H34b drain:', d, '| copy-choice:', JSON.stringify(state.pendingEnterAsCopy ?? state.pendingCopyChoice ?? null).slice(0, 160));
}
