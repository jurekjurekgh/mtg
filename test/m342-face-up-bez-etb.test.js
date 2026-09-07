import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect, manifestCardFaceDown } from '../src/engine/effects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();
function cover(def, mechanism) {
  const state = createGameState({ seed: 342, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  addObject(state, { id: 'lib', instanceId: 'i-lib', cardId: def.id, controllerId: 'p2', ownerId: 'p2', zone: 'library', ...gameObjectDataOf(def) });
  if (mechanism === 'manifest') manifestCardFaceDown(state, 'lib', 'p2');
  else applyEffect(state, { type: 'cloak' }, { id: 'source', controllerId: 'p2' });
  addMana(state, 'p2', 10);
  const bot = createHeuristicBot({ seed: 342, registry: { get: (id) => id === def.id ? def : registry.get(id) } });
  const id = state.zones.battlefield[0];
  return { state, bot, id, view: playerView(state, 'p2') };
}

for (const mechanism of ['manifest', 'cloak']) {
  test(`M342/A: ${mechanism} — dodanie samego ETB do karty nie podnosi wyceny odsłonięcia`, () => {
    const scores = [];
    for (const withEtb of [false, true]) {
      // Lokalny nośnik reguły, NIE nowa karta kolekcji (ADR 0029).
      const def = {
        id: 'probe-face-up', name: 'Probe', types: ['Creature'], subtypes: [],
        colors: [], keywords: [], power: 5, toughness: 5, manaCost: 3,
        abilities: withEtb ? [{ type: 'triggered', trigger: { event: 'enter_battlefield' }, effect: [{ type: 'gain_life', amount: 7 }] }] : [],
      };
      const { state, bot, id, view } = cover(def, mechanism);
      const cmd = view.legalCommands.find((c) => c.type === `turn_${mechanism}_face_up`);
      assert.ok(cmd);
      bot.chooseCommand({ ...view, legalCommands: [cmd] });
      scores.push(bot.trace().at(-1).score);
      const result = execute(state, cmd);
      assert.ok(result.ok, JSON.stringify(result));
      assert.equal(state.objects.get(id).faceDown, false);
      assert.equal(state.players[1].life, 20, 'obrót NIE wywołał gain life z ETB');
      assert.ok(result.events.some((e) => e.type === 'turned_face_up'));
      assert.equal(result.events.some((e) => e.type === 'permanent_entered_battlefield'), false);
      assert.equal(state.zones.stack.length, 0);
    }
    assert.ok(scores[0] > 0, 'wartościowy stwór nadal wart odsłonięcia');
    assert.equal(scores[1], scores[0], 'brak zdarzenia ETB = brak premii za ETB');
  });
}

test('M342/B: manifest Wormfang Newt 2/2 — bot nie płaci za nieistniejące ETB', () => {
  const { state, bot, view, id } = cover(registry.get('wormfang-newt'), 'manifest');
  assert.ok(view.legalCommands.some((c) => c.type === 'turn_manifest_face_up'));
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'pass_priority');
  assert.ok(execute(state, chosen).ok);
  assert.equal(state.objects.get(id).faceDown, true);
  assert.equal(state.players[1].mana, 10, 'nie spalono {1}{U}');
});
