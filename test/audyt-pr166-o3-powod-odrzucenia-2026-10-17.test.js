// Audyt PR #166, O-3 (2026-10-17): powód odrzucenia komendy jest na poziomie
// WYNIKU `execute` (`result.reason`), a nie tylko w zdarzeniu `command_rejected`.
// Wcześniej każdy wywołujący, który czytał `result.reason`, dostawał `undefined`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

function stol(liczba = 3) {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const def = REGISTRY.get('wrap-in-flames');
  addObject(state, {
    id: 'wrap', instanceId: 'i-wrap', cardId: 'wrap-in-flames', controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, keywords: [], subtypes: [], spell: def.spell,
  });
  for (let i = 1; i <= liczba; i += 1) {
    const id = `c${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId: i % 2 ? 'p2' : 'p1', ownerId: i % 2 ? 'p2' : 'p1', zone: 'battlefield',
      kind: 'creature', power: 3, toughness: 3, manaCost: 2, abilities: [], keywords: [], subtypes: [],
      types: ['Creature'], colors: ['R'],
    });
  }
  addMana(state, 'p1', 4, { colors: ['R', 'R', 'R', 'R'] });
  return state;
}

test('O-3/1: odrzucenie komendy niesie powód na wyniku execute (nie tylko w zdarzeniu)', () => {
  const state = stol(3);
  const tpl = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'wrap');
  // Cztery cele przy „up to three” — silnik odrzuca (liczba celów trybu).
  const res = execute(state, { ...tpl, targets: ['c1', 'c2', 'c3', 'c4'] });
  assert.equal(res.ok, false);
  assert.equal(typeof res.reason, 'string', 'res.reason na wyniku');
  assert.ok(res.reason.startsWith('illegal_spell:'), `powód: ${res.reason}`);
  const zdarzenie = res.events.find((e) => e.type === 'command_rejected');
  assert.equal(res.reason, zdarzenie.reason, 'ten sam powód na wyniku i w zdarzeniu');
});

test('O-3/2: ogólne odrzucenie (zła kolejność/nieznana komenda) też niesie powód na wyniku', () => {
  const state = stol(3);
  const res = execute(state, { type: 'nie_ma_takiej_komendy', playerId: 'p1' });
  assert.equal(res.ok, false);
  assert.equal(typeof res.reason, 'string');
  assert.equal(res.reason, res.events.find((e) => e.type === 'command_rejected').reason);
});
