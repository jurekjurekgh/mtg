import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();
const accept = (state, cmd) => {
  assert.ok(cmd);
  const result = execute(state, cmd);
  assert.ok(result.ok, JSON.stringify(result));
};
function decision(who, poison = 9) {
  const state = createGameState({ seed: 341, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', who);
  state.turn.activePlayerId = who;
  state.players = state.players.map((p) => ({ ...p, poison }));
  for (const [id, cardId, zone] of [['own', 'wormfang-newt', 'battlefield'], ['spell', 'courage-in-crisis', 'hand']]) {
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: who, ownerId: who, zone, ...gameObjectDataOf(registry.get(cardId)) });
  }
  addMana(state, who, 3, { colors: ['G'] });
  accept(state, playerView(state, who).legalCommands.find((c) => c.type === 'cast_spell' && c.targets?.includes('own')));
  for (let i = 0; i < 2; i++) accept(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.ok(state.pendingProliferate);
  return state;
}
function score(view, cmd) {
  const bot = createHeuristicBot({ seed: 341 });
  bot.chooseCommand({ ...view, legalCommands: [cmd] });
  return bot.trace().at(-1).score;
}

for (const who of ['p1', 'p2']) {
  test(`M341/A: wspólna dziesiąta trucizna nigdy nie jest wygraną — kolejność ID (${who})`, () => {
    const values = [];
    for (const targetIds of [['p1', 'p2'], ['p2', 'p1']]) {
      const state = decision(who);
      const view = playerView(state, who);
      const cmd = { type: 'resolve_proliferate', playerId: who, targetIds };
      values.push(score(view, cmd));
      accept(state, cmd);
      assert.equal(state.status, 'finished');
      assert.equal(state.winnerId, null, 'CR 104.4b: obaj przegrywają równocześnie');
    }
    assert.deepEqual(values, [-Infinity, -Infinity], 'polityka unikania własnej dziesiątej trucizny jest niezależna od kolejności');
  });

  test(`M341/B: przy remisowej opcji na początku listy bot nadal wybiera czystą wygraną (${who})`, () => {
    const state = decision(who);
    const view = playerView(state, who);
    const enemy = who === 'p1' ? 'p2' : 'p1';
    const joint = { type: 'resolve_proliferate', playerId: who, targetIds: [enemy, who] };
    const win = view.legalCommands.find((c) => c.type === 'resolve_proliferate' && (c.targetIds ?? []).length === 1 && c.targetIds[0] === enemy);
    const empty = view.legalCommands.find((c) => c.type === 'resolve_proliferate' && (c.targetIds ?? []).length === 0);
    assert.ok(win && empty);
    const bot = createHeuristicBot({ seed: 341 });
    const chosen = bot.chooseCommand({ ...view, legalCommands: [joint, win, empty] });
    assert.deepEqual(chosen.targetIds, [enemy]);
    accept(state, chosen);
    assert.equal(state.status, 'finished');
    assert.equal(state.winnerId, who);
  });
}

test('M341/C: zwykła proliferacja poniżej progu zachowuje sumę i przemienność', () => {
  const state = decision('p1', 8);
  const view = playerView(state, 'p1');
  const values = [['p1', 'p2', 'own'], ['own', 'p2', 'p1']].map((targetIds) =>
    score(view, { type: 'resolve_proliferate', playerId: 'p1', targetIds }));
  assert.deepEqual(values, [2, 2], '−1 trucizna własna +1 wroga +2 własny buff');
});

test('M341/D: bez trucizny bot nadal bierze korzystny licznik zamiast pustki', () => {
  const state = decision('p1', 0);
  const bot = createHeuristicBot({ seed: 341 });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  assert.deepEqual(chosen.targetIds, ['own']);
  accept(state, chosen);
  assert.equal(state.objects.get('own').counters['+1/+1'], 2);
  assert.equal(state.status, 'active');
});
