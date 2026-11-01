// Korekta 2026-11-01: minimalne X dotyczy wszystkich czarów, nie maksimum.
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
    ...d,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function scenario({ card = 'consume-spirit', mana = 4, life = 20, foeLife = 20, power = 2, toughness = 2, step = 'main1', foe = true } = {}) {
  const state = createGameState({ seed: 111, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.players.find(p => p.id === 'p1').life = life;
  state.players.find(p => p.id === 'p2').life = foeLife;
  addMana(state, 'p1', mana);
  put(state, 'x-card', card, 'p1', 'hand');
  if (foe) {
    put(state, 'foe', 'dread-warlock', 'p2', 'battlefield');
    state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), power, toughness, manaCost: 3 }));
  }
  for (let i = 0; i < 12; i++) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  return state;
}
function choose(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 111 });
  const cmd = bot.chooseCommand(view);
  return { cmd, view, options: bot.trace().at(-1)?.options ?? [] };
}
function cast(c) { return ['cast_spell', 'cast_permanent'].includes(c.type) && c.objectId === 'x-card'; }

for (const [card, base] of [['consume-spirit', 2], ['fireball', 1], ['magma-pummeler', 2], ['epic-experiment', 2]]) {
  for (const x of [0, 1, 2]) test(`min X: ${card}, X=${x}, brak presji — bot czeka, człowiek ma legalny wariant`, () => {
    const s = scenario({ card, mana: base + x, toughness: Math.max(1, x), step: card === 'epic-experiment' ? 'main2' : 'main1' });
    const { cmd, view } = choose(s);
    if (card !== 'fireball' || x > 0) assert.ok(view.legalCommands.some(c => cast(c) && c.xValue === x), 'legalny wariant pozostaje dla człowieka');
    assert.equal(cast(cmd), false, `wybrano ${JSON.stringify(cmd)}`);
  });
}
for (const [card, mana] of [['consume-spirit', 5], ['fireball', 4], ['magma-pummeler', 5], ['epic-experiment', 5]]) {
  test(`min X: ${card}, X=3 jest dostępne botowi`, () => {
    const s = scenario({ card, mana, toughness: 3, step: card === 'epic-experiment' ? 'main2' : 'main1' });
    const { cmd } = choose(s);
    assert.ok(cast(cmd), JSON.stringify(cmd)); assert.equal(cmd.xValue, 3);
  });
}
for (const [card, mana] of [['consume-spirit', 4], ['fireball', 3]]) {
  test(`min X: ${card}, X=2 usuwa stwora grożącego lethal`, () => {
    const { cmd } = choose(scenario({ card, mana, life: 2 }));
    assert.ok(cast(cmd), JSON.stringify(cmd)); assert.equal(cmd.xValue, 2); assert.deepEqual(cmd.targets, ['foe']);
  });
  test(`min X: ${card}, niskie życie bez zagrożenia nie jest presją przegranej`, () => {
    const { cmd } = choose(scenario({ card, mana, life: 4, power: 1 }));
    assert.equal(cast(cmd), false, JSON.stringify(cmd));
  });
}
for (const [card, mana] of [['consume-spirit', 4], ['fireball', 3]]) {
  test(`min X: ${card}, samo lethal w przeciwnika bez presji nie jest wyjątkiem`, () => {
    const { cmd } = choose(scenario({ card, mana, foeLife: 2, foe: false }));
    assert.equal(cast(cmd), false, JSON.stringify(cmd));
  });
}

test('min X: Epic Experiment X=2 może szukać ratunku pod presją lethal', () => {
  const { cmd } = choose(scenario({ card: 'epic-experiment', mana: 4, life: 2, step: 'main2' }));
  assert.ok(cast(cmd), JSON.stringify(cmd)); assert.equal(cmd.xValue, 2);
});

test('min X: Discover nie rzuca Magma Pummeler za darmo jako 0/0', () => {
  const s = scenario({ card: 'magma-pummeler' });
  put(s, 'discovered', 'magma-pummeler', 'p1', 'exile');
  s.pendingDiscover = { playerId: 'p1', foundExileId: 'discovered', foundCardId: 'magma-pummeler', restExileIds: [], restorePriorityTo: 'p1', amount: 5 };
  const { cmd, view } = choose(s);
  assert.ok(view.legalCommands.some(c => c.type === 'resolve_discover_choice' && c.castFree));
  assert.equal(cmd.type, 'resolve_discover_choice'); assert.equal(cmd.castFree, false);
});
for (const [mana, shouldCast] of [[4, false], [5, true]]) {
  test(`min X: okno Vaana z Consume Spirit i ${mana} many`, () => {
    const s = scenario({ mana, card: 'consume-spirit', toughness: mana - 2 });
    put(s, 'stolen', 'consume-spirit', 'p2', 'exile');
    s.pendingExileCast = { playerId: 'p1', objectId: 'stolen', cardId: 'consume-spirit', sourceId: 'vaan', restorePriorityTo: 'p1' };
    const { cmd, view } = choose(s);
    assert.ok(view.legalCommands.some(c => c.type === 'resolve_exile_cast' && c.cast && c.xValue === mana - 2));
    assert.equal(cmd.type, 'resolve_exile_cast'); assert.equal(cmd.cast, shouldCast, JSON.stringify(cmd));
  });
}

test('min X: przy lethal wroga Fireball X=2 nie marnuje się na nieletalny cel', () => {
  const { cmd } = choose(scenario({ card: 'fireball', mana: 3, life: 2, power: 3, toughness: 4 }));
  assert.equal(cast(cmd), false, JSON.stringify(cmd));
});
test('min X: Magma X=2 może stać się ostatnim blokerem przed lethal', () => {
  const { cmd } = choose(scenario({ card: 'magma-pummeler', mana: 4, life: 2, power: 2 }));
  assert.ok(cast(cmd), JSON.stringify(cmd)); assert.equal(cmd.xValue, 2);
});
test('min X: ustawienie progu na zero przywraca wcześniejszą wycenę Consume Spirit', () => {
  const s = scenario({ card: 'consume-spirit', mana: 4 });
  const bot = createHeuristicBot({ seed: 111, params: { xMinimumValue: 0 } });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  assert.ok(cast(cmd), JSON.stringify(cmd)); assert.equal(cmd.xValue, 2);
});
