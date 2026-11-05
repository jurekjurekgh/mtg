// =============================================================================
// Zgłoszenie D, etap 11 / klasa K6 (2026-11-05): instanty tworzące tokeny
// rzucane we własnym podtrzymaniu (pomiar: Raise the Alarm, Carrion Call).
// Tokeny przed główną fazą nic nie zyskują — nie blokują (nie ma walki),
// nie zaatakują (choroba przyzwania) — a instant traci wartość zaskoczenia
// w turze przeciwnika.
//
// Reguła (ADR 0002): instant z efektem `create_token` we własnym kroku
// podtrzymania/dobrania dostaje karę trzymania. Tura przeciwnika (tokeny
// jako niespodziewani blokujący) i walka bez zmian.
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
  const state = createGameState({ seed: 67, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function plains(state, n = 3) {
  for (let i = 0; i < n; i += 1) put(state, `plains-${i}`, 'basic-plains', 'p1');
}

function scene(active, step, priority) {
  const s = game(active, step, priority);
  put(s, 'rta', 'raise-the-alarm', 'p1', 'hand');
  creature(s, 'moj', 'p1', 2, 2);
  plains(s);
  return s;
}

test('K6/1: własne podtrzymanie — bot NIE rzuca Raise the Alarm (tokeny czekają)', () => {
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(scene('p1', 'upkeep', 'p1'), 'p1'));
  assert.notEqual(chosen?.type, 'cast_spell',
    `tokeny w podtrzymaniu nic nie zyskują — bot ma pasować, wybrał: ${JSON.stringify(chosen)}`);
});

test('K6/2: własna główna — tokeny z instantu idą normalnie', () => {
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(scene('p1', 'main1', 'p1'), 'p1'));
  assert.equal(chosen?.type, 'cast_spell',
    `w głównej tokeny to normalny rozwój stołu, wybrał: ${JSON.stringify(chosen)}`);
});

test('K6/3: podtrzymanie PRZECIWNIKA — tokeny-niespodzianka zostają dozwolone', () => {
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(scene('p2', 'upkeep', 'p1'), 'p1'));
  assert.equal(chosen?.type, 'cast_spell',
    `w turze wroga tokeny mogą blokować z zaskoczenia — bot ma rzucić, wybrał: ${JSON.stringify(chosen)}`);
});
