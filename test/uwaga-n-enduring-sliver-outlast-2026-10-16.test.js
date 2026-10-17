// Uwaga N (testy właściciela, 2026-10-16): Enduring Sliver (outlast {2}, {T}).
// Bot co turę wykonywał Outlast w głównej fazie 1, mimo że był już 9/9 i mógł
// atakować. Outlast wymaga {T}, więc zabiera stwora z ataku. Właściciel:
// zdolność ma być użyta dopiero w głównej fazie 2, gdy kreatura jest odtapowana
// i bot ma wolną manę.
//
// Kontrakt: zdolność z kosztem {T} na SAMYM źródle i timingiem sorcery nie może
// być wybrana w głównej fazie 1, dopóki kreatura mogłaby jeszcze atakować.
// Po walce, gdy kreatura nie atakowała, zostaje ona nietapnięta i outlast jest
// nadal dostępny w głównej fazie 2 (bez over-fixu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

function stol(step, { summoningSickness = false, tapped = false } = {}) {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const def = REGISTRY.get('enduring-sliver');
  addObject(state, {
    id: 'sl', instanceId: 'i-sl', cardId: 'enduring-sliver', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    power: 9, toughness: 9,
  });
  // addObject ignoruje summoningSickness (choroba przywołania — ustawiamy jak
  // reszta testów: przez state.objects.set).
  if (summoningSickness || tapped) {
    state.objects.set('sl', Object.freeze({ ...state.objects.get('sl'), summoningSickness, tapped }));
  }
  addMana(state, 'p1', 2, { colors: ['W', 'W'] });
  return state;
}

const outlastChosen = (cmd) => cmd?.type === 'activate_ability' && cmd.objectId === 'sl';

test('N/1: główna 1 — 9/9 mogący atakować NIE dostaje Outlast (bot atakuje albo czeka na główną 2)', () => {
  const state = stol('main1');
  const bot = createHeuristicBot({ seed: 3 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(outlastChosen(cmd), false,
    `w głównej 1 Outlast zabiera stwora z ataku; wybrano ${JSON.stringify(cmd)}`);
});

test('N/2: główna 2 — kreatura odtapowana (nie atakowała) dostaje Outlast z wolną maną', () => {
  const state = stol('main2');
  const bot = createHeuristicBot({ seed: 3 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(outlastChosen(cmd), true, `w głównej 2 Outlast jest właściwym oknem; wybrano ${JSON.stringify(cmd)}`);
});

test('N/3: główna 1 — stwór z chorobą przywołania nie dostaje Outlast (silnik: CR 302.6)', () => {
  // Kontrola: gdy atak i tak jest niemożliwy, reguła N nie wpływa na wynik, a
  // silnik nie wystawia {T}-aktywacji stworowi z chorobą przywołania.
  const state = stol('main1', { summoningSickness: true });
  const bot = createHeuristicBot({ seed: 3 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(outlastChosen(cmd), false, 'stwór z chorobą przywołania nie aktywuje {T}');
});

test('N/4: deklaracja ataków — 9/9 bez blokerów po stronie przeciwnika atakuje (zamiast Outlast)', () => {
  const state = stol('declare_attackers');
  const bot = createHeuristicBot({ seed: 3 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd?.type, 'declare_attackers', `bot ogłasza atak; wybrano ${JSON.stringify(cmd)}`);
  assert.deepEqual(cmd.attackerIds, ['sl'], 'atakuje właśnie Enduring Slivera');
});
