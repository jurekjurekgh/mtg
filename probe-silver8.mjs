// Sonda Srebra v8: H35 buyback, H36 gift.
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

// H35: Lab Rats z buyback → ręka; bez → grób.
for (const paid of [true, false]) {
  const state = game();
  putCard(state, 'rats', 'lab-rats', 'p1', 'hand');
  addMana(state, 'p1', 12, { colors: ['B'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'rats');
  console.log(`H35 paid=${paid} offers:`, offers.map((c) => JSON.stringify({ t: c.type, bb: c.buyback ?? c.additional ?? null })).join(' | '));
  const pick = paid ? offers.find((c) => c.buyback) ?? offers[offers.length - 1] : offers.find((c) => !c.buyback) ?? offers[0];
  console.log(`H35 paid=${paid} cast:`, execute(state, pick).ok, drain(state));
  console.log(`H35 paid=${paid} zone (expect ${paid ? 'hand' : 'graveyard'}):`,
    [...state.objects.values()].filter((o) => o.cardId === 'lab-rats').map((o) => o.zone));
}

// H36: Crumb and Get It z giftem → wróg dostaje Food + indestructible; bez → brak.
for (const gift of [true, false]) {
  const state = game();
  putCard(state, 'crumb', 'crumb-and-get-it', 'p1', 'hand');
  putCard(state, 'guy', 'akroan-sergeant', 'p1', 'battlefield');
  addMana(state, 'p1', 12, { colors: ['W'] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'crumb');
  console.log(`H36 gift=${gift} offers:`, offers.length, JSON.stringify(offers[0] ?? null).slice(0, 160));
  const pick = gift
    ? offers.find((c) => c.gift || c.promiseGift || /gift/i.test(JSON.stringify(c))) ?? offers[offers.length - 1]
    : offers.find((c) => !(c.gift || c.promiseGift)) ?? offers[0];
  console.log(`H36 gift=${gift} cast:`, execute(state, pick).ok, drain(state));
  const food = [...state.objects.values()].filter((o) => o.cardId === 'token_food' && o.zone === 'battlefield');
  console.log(`H36 gift=${gift} food (expect ${gift ? '1 for p2' : '0'}):`, food.map((o) => o.controllerId));
}
