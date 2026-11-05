// =============================================================================
// Zgłoszenie D, etap 8 / klasa K4a (2026-11-05): obrażenia z instantu w twarz
// przeciwnika poza walką. Pomiar sondy: Shock w twarz przy 20 życia wroga
// we własnym podtrzymaniu — bot rzucał, choć 2 obrażenia nic nie zmieniają,
// a karta powinna czekać na moment śmiertelny albo na odpowiedź w walce.
//
// Reguła (ADR 0002): instant z efektem `damage` wycelowanym w gracza
// przeciwnika traci poza walką karę trzymania, chyba że obrażenia domykają
// grę. Obrażenia w stwora (usunięcie) i rzuty w trwającej walce bez zmian.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const READY = { summoningSick: false, summoningSickness: false };

function game(active, step, priority, foeLife = 20) {
  const state = createGameState({ seed: 63, players: [{ id: 'p1' }, { id: 'p2' }] });
  if (foeLife !== 20) {
    state.players = state.players.map((p) => (p.id === 'p2' ? { ...p, life: foeLife } : p));
  }
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

function passTo(state, pid, maxSteps = 8) {
  for (let i = 0; i < maxSteps && state.turn.priorityPlayerId !== pid; i += 1) {
    execute(state, playerView(state, state.turn.priorityPlayerId)
      .legalCommands.find((c) => c.type === 'pass_priority'));
  }
}

test('K4/1: podtrzymanie, wróg 20 życia — bot NIE pali Shocka w twarz', () => {
  const s = game('p1', 'upkeep', 'p1', 20);
  put(s, 'shock', 'shock', 'p1', 'hand');
  mountains(s);
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(s, 'p1'));
  assert.notEqual(chosen?.type, 'cast_spell',
    `2 obrażenia przy 20 życia nic nie zmieniają — bot ma trzymać kartę, wybrał: ${JSON.stringify(chosen)}`);
});

test('K4/2: główna, wróg 2 życia — Shock w twarz domyka grę, bot rzuca', () => {
  const s = game('p1', 'main1', 'p1', 2);
  put(s, 'shock', 'shock', 'p1', 'hand');
  mountains(s);
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(s, 'p1'));
  assert.equal(chosen?.type, 'cast_spell',
    `obrażenia śmiertelne mają pójść od razu, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['p2']);
});

test('K4/3: główna — Shock w stwora wroga (usunięcie) bez zmian po bramce twarzy, bot rzuca', () => {
  // Etap 9 (K4b) celowo zmienił podtrzymanie (removal czeka na główną);
  // tu pilnujemy, że bramka K4a nie dotyka obrażeń w stwora.
  const s = game('p1', 'main1', 'p1', 20);
  put(s, 'shock', 'shock', 'p1', 'hand');
  creature(s, 'wrog', 'p2', 2, 2);
  mountains(s);
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(s, 'p1'));
  assert.equal(chosen?.type, 'cast_spell',
    `śmiertelne usunięcie 2/2 nie jest trikiem w twarz — zachowanie bez zmian, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['wrog']);
});

test('K4/4: trwająca walka — burn w twarz po deklaracjach zostaje dozwolony', () => {
  const s = game('p1', 'declare_attackers', 'p1', 10);
  put(s, 'shock', 'shock', 'p1', 'hand');
  creature(s, 'moj', 'p1', 2, 2);
  mountains(s);
  execute(s, playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && c.attackerIds.includes('moj')));
  passTo(s, 'p2');
  execute(s, playerView(s, 'p2').legalCommands
    .find((c) => c.type === 'declare_blockers'));
  passTo(s, 'p1');
  const view = playerView(s, 'p1');
  assert.ok(view.combat, 'walka trwa');
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(view);
  assert.equal(chosen?.type, 'cast_spell',
    `w walce burn w twarz to legalna odpowiedź (presja po blokach) — bot ma rzucić, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['p2']);
});
