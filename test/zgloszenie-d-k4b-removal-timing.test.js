// =============================================================================
// Zgłoszenie D, etap 9 / klasa K4b (2026-11-05): timing instant-removalu.
// Pomiar: Shock i Consign to Dream bot rzucał już we własnym podtrzymaniu.
// Karta robi swoje, ale decyzja zapada przed dobraniem i główną fazą bez
// żadnej pilności — instant ma poczekać na główną albo odpowiedź.
//
// Reguła (ADR 0002): we własnym kroku podtrzymania/dobrania instant
// usuwający permanent przeciwnika (śmiertelne obrażenia w stwora,
// destroy, exile, bounce) dostaje karę trzymania. Tura przeciwnika,
// walka i główne fazy bez zmian.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const READY = { summoningSick: false, summoningSickness: false };

function game(active, step, priority) {
  const state = createGameState({ seed: 64, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = active;
  state.turn = jumpToStep(state.turn, step, priority);
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `ilib-${pid}-${i}`, cardId: `test-lib-${pid}-${i}`,
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'spell', manaCost: 2,
      });
    }
  }
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, kicker: def.kicker,
  });
}

function creature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...READY }));
}

function mountains(state, n = 2) {
  for (let i = 0; i < n; i += 1) put(state, `mountain-${i}`, 'basic-mountain', 'p1');
}

function scene(active, step, priority) {
  const s = game(active, step, priority);
  put(s, 'shock', 'shock', 'p1', 'hand');
  creature(s, 'wrog', 'p2', 2, 2);
  mountains(s);
  return s;
}

test('K4b/1: własne podtrzymanie — bot NIE pali Shocka w stwora 2/2 (czeka na główną)', () => {
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(scene('p1', 'upkeep', 'p1'), 'p1'));
  assert.notEqual(chosen?.type, 'cast_spell',
    `w podtrzymaniu nic nie jest pilne — bot ma pasować, wybrał: ${JSON.stringify(chosen)}`);
});

test('K4b/2: własna główna — ten sam Shock w stwora idzie normalnie', () => {
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(scene('p1', 'main1', 'p1'), 'p1'));
  assert.equal(chosen?.type, 'cast_spell',
    `w głównej usunięcie 2/2 jest normalnym zagraniem, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['wrog']);
});

test('K4b/3: podtrzymanie PRZECIWNIKA — odpowiedź instantem zostaje dozwolona', () => {
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(scene('p2', 'upkeep', 'p1'), 'p1'));
  assert.equal(chosen?.type, 'cast_spell',
    `w turze wroga instant-removal to odpowiedź — bot ma rzucić, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['wrog']);
});

test('K4b/4: własne podtrzymanie, bounce w stwora — Consign to Dream też czeka', () => {
  const s = game('p1', 'upkeep', 'p1');
  put(s, 'ctd', 'consign-to-dream', 'p1', 'hand');
  creature(s, 'wrog', 'p2', 2, 2);
  for (let i = 0; i < 2; i += 1) put(s, `island-${i}`, 'basic-island', 'p1');
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(s, 'p1'));
  assert.notEqual(chosen?.type, 'cast_spell',
    `bounce w podtrzymaniu nie ma żadnej przewagi — bot ma pasować, wybrał: ${JSON.stringify(chosen)}`);
});
