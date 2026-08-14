// M89: Curate (Surveil 2 + Draw 1) — modal ruchu bota MUSI pokazać, że
// przeciwnik dobrał kartę. Root cause: `card_drawn` w `BOT_MOVE_NOISE`
// obejmowało zarówno krok draw_step, jak i efekt draw_cards z czaru.
// Właściciel: „Curate dalej nie pokazuje w modalu Ruch przeciwnika, że
// przeciwnik dobrał kartę" (2026-08-13).
//
// Fix: zdarzenie `card_drawn` dostaje pole `source: 'draw_step' | 'effect'`.
// `noteBotMove` przepuszcza `effect` (Curate/Phyrexian Rager/Evangel itd.),
// nadal pomija `draw_step` jako szum.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { setupCardMatch, gameObjectDataOf } from '../src/cards/materialize.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { drawPlayerCards } from '../src/engine/effects.js';

function setup({ deck1 = [], deck2 = [] } = {}) {
  const registry = createCardRegistry();
  const state = setupCardMatch({
    seed: 2026,
    players: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }],
    decks: new Map([['p1', deck1], ['p2', deck2]]),
    registry,
  });
  // Rozstrzygnij mulligan (keep) — inaczej cast zwróci mulligan_unresolved.
  execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: true });
  execute(state, { type: 'resolve_mulligan_choice', playerId: 'p2', keep: true });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return { state, registry };
}

let _seq = 0;
function putInHand(state, registry, playerId, cardId) {
  const def = registry.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    ...data,
    id: `hand-${cardId}-${++_seq}`,
    instanceId: `inst-${cardId}-${++_seq}`,
    cardId: def.id,
    controllerId: playerId,
    zone: 'hand',
  });
}

function putOnBattlefield(state, registry, playerId, cardId) {
  const def = registry.get(cardId);
  const data = gameObjectDataOf(def);
  const playerObj = state.players.find((p) => p.id === playerId);
  if (!playerObj) throw new Error(`Brak gracza ${playerId} w stanie`);
  const id = `bf-${cardId}-${++_seq}`;
  addObject(state, {
    ...data,
    id,
    instanceId: `inst-bf-${cardId}-${++_seq}`,
    cardId: def.id,
    controllerId: playerObj.id,
    zone: 'battlefield',
  });
}

test('curate: draw_cards z czaru generuje card_drawn z source="effect"', () => {
  const { state, registry } = setup({
    deck1: Array(40).fill('basic-island'),
    deck2: Array(40).fill('basic-island'),
  });
  putInHand(state, registry, 'p1', 'curate');
  putOnBattlefield(state, registry, 'p1', 'basic-island');
  putOnBattlefield(state, registry, 'p1', 'basic-island');
  state.players[0].mana = 1;
  state.players[0].manaPool = { '': 1 };

  const curateInHand = state.zones.hand.find((id) => {
    const obj = state.objects.get(id);
    return obj?.controllerId === 'p1' && obj?.cardId === 'curate';
  });
  assert.ok(curateInHand, 'Curate powinno być w ręce p1');

  // Rzuć Curate
  const result = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: curateInHand });
  assert.ok(result.ok, `Rzut Curate powinien się udać: ${result.events?.[0]?.reason}`);

  // Po rzucie instant trafia na stos — pass priority żeby engine szedł dalej.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  // Curate ma Surveil 2 — czeka na decyzję resolve_surveil. Rozstrzygnij ją.
  assert.ok(state.pendingSurveil, 'pendingSurveil powinno czekać po rzuceniu Curate');
  const pendingSurveil = state.pendingSurveil;
  const allKept = pendingSurveil.objectIds.slice();
  const resolveResult = execute(state, {
    type: 'resolve_surveil',
    playerId: 'p1',
    millIds: [],
    topOrder: allKept,
  });
  assert.ok(resolveResult.ok, `resolve_surveil: ${resolveResult.events?.[0]?.reason}`);

  // Zbierz zdarzenia — Curate ma 1 card_drawn z draw_cards
  const drawnEvents = state.events.filter((e) => e.type === 'card_drawn');
  assert.equal(drawnEvents.length, 1, 'Curate powinno wygenerować 1 card_drawn z draw_cards');
  assert.equal(drawnEvents[0].source, 'effect',
    'card_drawn z draw_cards musi mieć source="effect" (nie "draw_step")');
});

test('draw_step: card_drawn z kroku tury ma source="draw_step"', () => {
  const { state } = setup({
    deck1: Array(40).fill('basic-island'),
    deck2: Array(40).fill('basic-island'),
  });

  // Symulujemy dobranie z kroku draw bezpośrednio przez drawPlayerCards
  // z source='draw_step' (jak w engine/game-state.js draw_card).
  drawPlayerCards(state, 'p1', 1, 'draw_step');
  const drawnEvents = state.events.filter((e) => e.type === 'card_drawn');
  assert.equal(drawnEvents.length, 1);
  assert.equal(drawnEvents[0].source, 'draw_step',
    'card_drawn z draw_step MUSI mieć source="draw_step"');
});

test('draw_cards: różne wywołania drawPlayerCards mają właściwe source', () => {
  // Weryfikacja kontraktu drawPlayerCards: source jest przekazywane
  // do eventu card_drawn, a wartość domyślna to 'effect'.
  const { state } = setup({
    deck1: Array(40).fill('basic-island'),
    deck2: Array(40).fill('basic-island'),
  });

  // draw_step
  drawPlayerCards(state, 'p1', 1, 'draw_step');
  let drawn = state.events.filter((e) => e.type === 'card_drawn');
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].source, 'draw_step');

  // effect (Curate, Phyrexian Rager, Evangel, Curiosity itd.)
  drawPlayerCards(state, 'p1', 1, 'effect');
  drawn = state.events.filter((e) => e.type === 'card_drawn');
  assert.equal(drawn.length, 2);
  assert.equal(drawn[1].source, 'effect');
});
