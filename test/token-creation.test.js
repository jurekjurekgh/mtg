import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * Tworzenie tokenów (Etap 5): efekt czaru create_token tworzy token na polu bitwy
 * kontrolera, token dostaje cardId 'token_*' (render klasyfikuje go przez tokenChip)
 * i własne statystyki oraz summoning sickness.
 */

const SWARM = {
  timing: 'sorcery', targets: [],
  effects: [{ type: 'create_token', name: 'Goblin', cardId: 'token_goblin', power: 1, toughness: 1, colors: ['R'] }],
};

function setup() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addMana(state, 'p1', 2);
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, { id: 'swarm', instanceId: 'isw', cardId: 'syn-swarmsummon', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 2, spell: SWARM });
  return state;
}

function passRoundResolving(state) {
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
}

test('czar create_token tworzy token na polu bitwy kontrolera', () => {
  const state = setup();
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'swarm', targets: [] });
  passRoundResolving(state);
  const tokens = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_goblin');
  assert.equal(tokens.length, 1);
  const token = tokens[0];
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
  assert.equal(token.controllerId, 'p1');
  assert.equal(token.summoningSickness, true);
  assert.ok(token.id.startsWith('token-'));
});

test('rozstrzygnięcie tworzenia tokenu emituje zdarzenie token_created', () => {
  const state = setup();
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'swarm', targets: [] });
  passRoundResolving(state);
  assert.ok(state.events.some((e) => e.type === 'token_created'), 'brak zdarzenia token_created');
});

test('token jest widoczny w polu bitwy jako stwór (render klasy token)', () => {
  const state = setup();
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'swarm', targets: [] });
  passRoundResolving(state);
  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'token_goblin');
  assert.ok(token.cardId.startsWith('token_'));
});
