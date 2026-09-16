// Sonda Srebra v6: H24 intimidate (warunkowy), H25 persist, H26 storm, H27 landwalk.
import { createGameState, addObject, execute, playerView } from './src/engine/game-state.js';
import { jumpToStep } from './src/engine/turn.js';
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
  const o = state.objects.get(id);
  if (zone === 'battlefield') state.objects.set(id, Object.freeze({ ...o, summoningSickness: false }));
  return state.objects.get(id);
}
function mainPhase(state, pid = 'p1') {
  state.turn.phase = 'precombat_main'; state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid; state.turn.step = 'precombat_main'; state.turn.passes = 0;
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

// H24: samotny atakujący + Gambit → intimidate ON; blokować może tylko czerwony i artefakt.
{
  const state = game(); mainPhase(state);
  putCard(state, 'atk', 'akroan-sergeant', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'gambit', 'predators-gambit', 'p1', 'hand');
  putCard(state, 'bred', 'skinbrand-goblin', 'p2', 'battlefield', { summoningSickness: false });
  putCard(state, 'bblue', 'steelfin-whale', 'p2', 'battlefield', { summoningSickness: false });
  putCard(state, 'bart', 'esper-stormblade', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 10, { colors: ['B'] });
  console.log('H24 cast:', execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gambit', targets: ['atk'] }).ok);
  console.log('H24 drain:', drain(state));
  const kws = state.objects.get('atk')?.keywords;
  console.log('H24 attacker keywords (expect intimidate via aura):', JSON.stringify(kws));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1'); state.turn.activePlayerId = 'p1';
  console.log('H24 declare:', JSON.stringify(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).events?.slice(0, 1)));
for (let i = 0; i < 4 && state.turn.step !== 'declare_blockers'; i++) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  console.log('H24 step:', state.turn.step);
  const view = playerView(state, 'p2');
  const opts = view.legalCommands.filter((c) => c.type === 'declare_blockers');
  const allBlockers = new Set();
  for (const o of opts) for (const ids of Object.values(o.assignments ?? {})) for (const id of ids) allBlockers.add(id);
  console.log('H24 block options:', opts.length, '| blockers seen (expect bred+bart, NOT bblue):', JSON.stringify([...allBlockers]));
}

// H25: persist — śmierć bez licznika wraca; śmierć z licznikiem zostaje.
{
  const state = game(); mainPhase(state);
  putCard(state, 'clique', 'puppeteer-clique', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'victim', 'akroan-sergeant', 'p2', 'graveyard');
  addMana(state, 'p1', 10);
  // Ręczne zabicie przez damage? Użyjmy destroy via... najprościej: obrażenia > toughness.
  putCard(state, 'shock1', 'shock', 'p1', 'hand');
  console.log('H25 shock1:', execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock1', targets: ['clique'] }).ok);
  console.log('H25 drain1:', drain(state));
  console.log('H25 after 1st death (expect battlefield w/ -1/-1):', [...state.objects.values()].filter((o) => o.cardId === 'puppeteer-clique').map((o) => `${o.zone}:${JSON.stringify(o.counters ?? {})}`));
  putCard(state, 'shock2', 'shock', 'p1', 'hand');
  const cliqueNow = [...state.objects.values()].find((o) => o.cardId === 'puppeteer-clique' && o.zone === 'battlefield')?.id ?? 'clique';
  console.log('H25 shock2:', execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock2', targets: [cliqueNow] }).ok);
  console.log('H25 drain2:', drain(state));
  console.log('H25 after 2nd death (expect graveyard):', [...state.objects.values()].filter((o) => o.cardId === 'puppeteer-clique').map((o) => o.zone));
}

// H26: storm — Shock + Insurrection przy 2 stworach wroga → kradnie oba?
{
  const state = game(); mainPhase(state);
  putCard(state, 'shock', 'shock', 'p1', 'hand');
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  putCard(state, 'e1', 'akroan-sergeant', 'p2', 'battlefield');
  putCard(state, 'e2', 'skinbrand-goblin', 'p2', 'battlefield');
  addMana(state, 'p1', 20, { colors: ['R', 'R'] });
  console.log('H26 shock:', execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['p2'] }).ok);
  console.log('H26 drain1:', drain(state));
  console.log('H26 ins:', execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ins', targets: ['e1'] }).ok);
  let r26 = drain(state);
  if (String(r26).startsWith('blocked')) {
let guard = 0;
    while (state.pendingCopyTargets && guard++ < 4) {
      const q0 = state.pendingCopyTargets.queue[0];
      console.log('H26 copy needs target for:', q0.copyId);
      console.log('H26 copy-targets:', execute(state, { type: 'resolve_copy_targets', playerId: 'p1', targetId: 'e2' }).ok);
    }
    r26 = drain(state);
  }
  console.log('H26 drain2:', r26);
  console.log('H26 controllers (expect p1,p1):', state.objects.get('e1')?.controllerId, state.objects.get('e2')?.controllerId);
}

// H27: forestwalk — obrońca z Lasem nie blokuje; bez Lasu blokuje.
{
  const state = game(); mainPhase(state);
  putCard(state, 'oryx', 'emerald-oryx', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'blk', 'akroan-sergeant', 'p2', 'battlefield', { summoningSickness: false });
  putCard(state, 'forest', 'basic-forest', 'p2', 'battlefield');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1'); state.turn.activePlayerId = 'p1';
  console.log('H27 declare:', execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['oryx'] }).ok);
for (let i = 0; i < 4 && state.turn.step !== 'declare_blockers'; i++) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const opts = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'declare_blockers');
  console.log('H27 block options with Forest (expect 0 blocking / only empty):', opts.map((o) => JSON.stringify(o.assignments)));
}
