// Zgłoszenie P — próg X Fireballa, bez zmiany legalnych ofert człowieka.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}


function scene({ mana = 3, life = 20, foeLife = 20, enemyCount = 1, toughness = 2 } = {}) {
  const state = createGameState({ seed: 78, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.players.find(p => p.id === 'p1').life = life;
  state.players.find(p => p.id === 'p2').life = foeLife;
  addMana(state, 'p1', mana);
  put(state, 'fb', 'fireball', 'p1', 'hand');
  for (let i = 0; i < enemyCount; i++) {
    put(state, `enemy${i}`, 'dread-warlock', 'p2', 'battlefield');
    state.objects.set(`enemy${i}`, Object.freeze({ ...state.objects.get(`enemy${i}`), toughness, manaCost: 3 }));
  }
  return state;
}
function choose(state, maxX = Infinity) {
  const view = playerView(state, 'p1');
  const legalCommands = view.legalCommands.filter(c => c.type !== 'cast_spell' || c.objectId !== 'fb' || c.xValue <= maxX);
  const bot = createHeuristicBot({ seed: 78 });
  return { cmd: bot.chooseCommand({ ...view, legalCommands }), legalCommands };
}

test('P/1: X=2 zabija 2/2, ale bez presji zachowaj Fireball', () => {
  const { cmd, legalCommands } = choose(scene());
  assert.ok(legalCommands.some(c => c.type === 'cast_spell' && c.xValue === 2 && c.targets?.includes('enemy0')));
  assert.notEqual(cmd.type === 'cast_spell' && cmd.objectId === 'fb', true);
});

test('P/2: X=1 zabija 1/1, ale bez presji zachowaj Fireball', () => {
  const { cmd } = choose(scene({ mana: 2, toughness: 1 }));
  assert.notEqual(cmd.type === 'cast_spell' && cmd.objectId === 'fb', true);
});

test('P/3: X=3 zabija cennego stwora', () => {
  const { cmd } = choose(scene({ mana: 4, toughness: 3 }));
  assert.equal(cmd.type, 'cast_spell'); assert.equal(cmd.objectId, 'fb');
  assert.equal(cmd.xValue, 3); assert.deepEqual(cmd.targets, ['enemy0']);
});

test('P/4: lethal w przeciwnika wygrywa pomimo X=2', () => {
  const { cmd } = choose(scene({ mana: 3, foeLife: 2, enemyCount: 0 }));
  assert.equal(cmd.type, 'cast_spell'); assert.equal(cmd.xValue, 2); assert.deepEqual(cmd.targets, ['p2']);
});

test('P/5: pod presją lethal własnego życia X=2 usuwa zagrożenie', () => {
  const { cmd } = choose(scene({ mana: 3, life: 2 }));
  assert.equal(cmd.type, 'cast_spell'); assert.equal(cmd.xValue, 2); assert.deepEqual(cmd.targets, ['enemy0']);
});

test('P/6: dwa cele i łączne X=2 nie omijają progu bez presji', () => {
  const { cmd, legalCommands } = choose(scene({ mana: 4, enemyCount: 2, toughness: 1 }), 2);
  assert.ok(legalCommands.some(c => c.type === 'cast_spell' && c.xValue === 2 && c.targets?.length === 2));
  assert.notEqual(cmd.type === 'cast_spell' && cmd.objectId === 'fb', true);
});
