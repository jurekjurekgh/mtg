// M153 — uwagi właściciela (A1, A2, B):
//
// A1 — log aktywacji Station (Warmaker Gunship) ma nazywać TAPNIĘTEGO stwora
//      („(tapuje: <nazwa>)”), nie sztywny opis „moc zatapniętego stwora”.
// A2 — bot tapuje stwory na charge Station WYŁĄCZNIE we własnej Głównej 2
//      (po ataku); w Main 1 tapowanie marnuje atak/blok — kara poniżej passu.
// B  — bot ma blokować, by nie dostawać obrażeń, nawet kosztem utraty stworów;
//      multi-block, który ZABIJA atakującego (łączna moc blokerów >= wytrzymałość),
//      musi być liczony jako zysk, nie strata.
//
// Reguły generyczne (ADR 0002), zero nazw kart po stronie engine.

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState(step = 'main', phase = 'precombat_main', active = 'p1') {
  const state = createGameState({ seed: 153, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  state.turn.phase = phase;
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, ctrl, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
    kind: extra.kind ?? data.kind, power: extra.power ?? data.power,
    toughness: extra.toughness ?? data.toughness, manaCost: extra.manaCost ?? data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: extra.types ?? def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, station: def.station,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function resolveStack(state, limit = 12) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
  return state.zones.stack.length === 0;
}

// --- A2: Station tylko w Głównej 2 -----------------------------------------
function stationBoard(phase) {
  const state = newState('main', phase, 'p1');
  put(state, 'ram', 'wedgelight-rammer', 'p1');
  put(state, 'sold', 'token_soldier', 'p1', 'battlefield', { kind: 'creature', power: 2, toughness: 2 });
  put(state, 'robo', 'token_robot', 'p1', 'battlefield', { kind: 'creature', power: 2, toughness: 2 });
  return playerView(state, 'p1');
}

test('A2: bot NIE tapuje stwora na Station we własnej Głównej 1 (marnuje atak)', () => {
  const view = stationBoard('precombat_main');
  assert.ok(view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'ram'),
    'oferta Station jest legalna');
  const bot = createHeuristicBot({ seed: 153 });
  const chosen = bot.chooseCommand(view);
  assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'ram'),
    `bot tapował na Station w Main 1: ${JSON.stringify(chosen)}`);
});

test('A2: bot TAPUJE na Station we własnej Głównej 2 (po ataku)', () => {
  const view = stationBoard('postcombat_main');
  const bot = createHeuristicBot({ seed: 153 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.objectId, 'ram',
    `bot powinien budować Station w Main 2: ${JSON.stringify(chosen)}`);
});

// --- B: bot blokuje, by nie dostawać obrażeń; multi-block kill -------------
test('B: bot blokuje atakującego 4/4 wieloma blokerami, żeby go ZABIĆ i nie dostać obrażeń', () => {
  const state = newState('declare_blockers', 'combat', 'p2');
  // Atakujący p1: 4/4. Obrońca p2: 2/2,3/4,2/2,2/2,3/2.
  put(state, 'att', 'highland-game', 'p1', 'battlefield', { power: 4, toughness: 4 });
  const blocks = ['b1', 'b2', 'b3', 'b4', 'b5'];
  const stats = [[2, 2], [3, 4], [2, 2], [2, 2], [3, 2]];
  blocks.forEach((id, i) => put(state, id, 'highland-game', 'p2', 'battlefield',
    { power: stats[i][0], toughness: stats[i][1] }));
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['att'],
    blockers: new Map(), blockedAttackers: [], defendingPlayerId: 'p2',
  };

  const bot = createHeuristicBot({ seed: 153 });
  const chosen = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.equal(chosen.type, 'declare_blockers',
    `bot powinien blokować: ${JSON.stringify(chosen)}`);
  const assign = chosen.assignments?.['att'] ?? [];
  assert.ok(assign.length >= 2, `bot powinien zablokować wieloma stworami (by zabić 4/4): ${JSON.stringify(chosen)}`);
  // Łączna moc blokerów >= 4 → atakujący ginie.
  const totalPower = assign.reduce((sum, id) => sum + (state.objects.get(id)?.power ?? 0), 0);
  assert.ok(totalPower >= 4, `blokery muszą łącznie zabić 4/4 (moc ${totalPower})`);
});

test('B (anty-over-fix): bot NIE marnuje WARTOŚCIOWEGO blokera (3/3), gdy nie zabije atakującego i życie nie jest zagrożone', () => {
  const state = newState('declare_blockers', 'combat', 'p2');
  put(state, 'att', 'highland-game', 'p1', 'battlefield', { power: 4, toughness: 4 });
  // 3/3 bloker: atakujący 4/4 przeżywa (3<4), bloker ginie — czysta strata
  // wartościowego stwora, który przydałby się do ataku, a życie nie jest
  // zagrożone (20).
  put(state, 'b1', 'highland-game', 'p2', 'battlefield', { power: 3, toughness: 3 });
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['att'],
    blockers: new Map(), blockedAttackers: [], defendingPlayerId: 'p2',
  };
  state.players.find((p) => p.id === 'p2').life = 20;
  const bot = createHeuristicBot({ seed: 153 });
  const chosen = bot.chooseCommand(playerView(state, 'p2'), {});
  if (chosen.type === 'declare_blockers') {
    assert.equal(Object.keys(chosen.assignments ?? {}).length, 0,
      `bot marnuje 3/3 w 4/4 (atakujący przeżywa, życie bezpieczne): ${JSON.stringify(chosen)}`);
  }
});
