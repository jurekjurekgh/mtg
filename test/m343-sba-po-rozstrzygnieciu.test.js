import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { effectiveToughness } from '../src/engine/permanents.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const registry = createCardRegistry();
function put(state, id, def, zone) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: def.id, controllerId: 'p1', ownerId: 'p1', zone, ...gameObjectDataOf(def) });
}
const accept = (state, cmd) => {
  assert.ok(cmd, 'oferta istnieje');
  const result = execute(state, cmd);
  assert.ok(result.ok, JSON.stringify(result));
  return result;
};
function game() {
  const state = createGameState({ seed: 343, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  put(state, 'lib', registry.get('basic-forest'), 'library');
  return state;
}
function cast(state, id, target = null) {
  accept(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === id && (!target || c.targets?.includes(target))));
  for (const playerId of ['p1', 'p2']) accept(state, { type: 'pass_priority', playerId });
}
const scry = (state) => accept(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_scry'));
function probeSpell(state, effects, target = false) {
  // Lokalne deskryptory do badania przerwanego rozstrzygania, bez kart w katalogu.
  const base = registry.get('courage-in-crisis');
  put(state, 'probe', { ...base, id: 'probe-sba', name: 'Probe', manaCost: 0,
    spell: { ...base.spell, cost: 0, targets: target ? base.spell.targets : [], effects },
  }, 'hand');
}

test('M343/A: proliferate widzi oba rodzaje liczników; SBA znosi je dopiero po zakończeniu czaru', () => {
  const state = game();
  put(state, 'own', registry.get('wormfang-newt'), 'battlefield');
  addCounter(state, 'own', '-1/-1', 1);
  put(state, 'spell', registry.get('courage-in-crisis'), 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  cast(state, 'spell', 'own');
  assert.deepEqual(state.pendingSpell?.effects, [], 'pusty ogon nadal oznacza przerwane rozstrzyganie');
  assert.deepEqual(state.objects.get('own').counters, { '-1/-1': 1, '+1/+1': 1 });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_proliferate' && c.targetIds?.includes('own'));
  const result = accept(state, cmd);
  assert.deepEqual(state.objects.get('own').counters, {});
  const added = result.events.filter((e) => e.type === 'counter_added' && e.objectId === 'own');
  assert.equal(added.length, 2, 'proliferacja zwiększyła oba rodzaje, nie zrobiła no-opu');
  assert.equal(state.pendingSpell, null);
  assert.equal(state.zones.stack.length, 0);
});

test('M343/B: chwilowe 0 życia podczas dwóch decyzji nie kończy partii przed odzyskaniem życia', () => {
  const state = game();
  state.players[0] = { ...state.players[0], life: 1 };
  probeSpell(state, [
    { type: 'lose_life', scope: 'controller', amount: 1 },
    { type: 'scry', amount: 1 }, { type: 'scry', amount: 1 },
    { type: 'gain_life', amount: 2 },
  ]);
  cast(state, 'probe');
  assert.equal(state.players[0].life, 0);
  assert.equal(state.status, 'active', 'CR 704.4: decyzja wewnątrz czaru to nie oddanie priorytetu');
  scry(state);
  assert.ok(state.pendingSpell && state.pendingScry, 'rozstrzygnięcie zatrzymane po raz drugi');
  assert.equal(state.status, 'active');
  scry(state);
  assert.equal(state.pendingSpell, null);
  assert.equal(state.players[0].life, 2);
  assert.equal(state.status, 'active');
  assert.equal(state.zones.stack.length, 0);
});

for (const recover of [false, true]) {
  test(`M343/C: stwór z chwilową wytrzymałością 0 — ocena po końcu czaru (odzyskanie: ${recover})`, () => {
    const state = game();
    put(state, 'own', registry.get('goblin-piker'), 'battlefield');
    probeSpell(state, [
      { type: 'pump', power: 0, toughness: -1 }, { type: 'scry', amount: 1 },
      ...(recover ? [{ type: 'pump', power: 0, toughness: 1 }] : []),
    ], true);
    cast(state, 'probe', 'own');
    assert.ok(state.objects.has('own'), 'SBA nie usuwa celu w środku rozstrzygania');
    assert.equal(effectiveToughness(state.objects.get('own'), state), 0);
    scry(state);
    assert.equal(state.pendingSpell, null);
    assert.equal(state.zones.battlefield.includes('own'), recover);
    if (recover) assert.equal(effectiveToughness(state.objects.get('own'), state), 1);
    else assert.ok(state.zones.graveyard.some((id) => state.objects.get(id).cardId === 'goblin-piker'));
  });
}

test('M343/D: token w wygnaniu czeka na SBA do końca czaru, potem znika', () => {
  const state = game();
  const token = createBattlefieldToken(state, 'p1', { cardId: 'token_probe_sba', name: 'Probe', power: 1, toughness: 1 });
  probeSpell(state, [{ type: 'exile_permanent' }, { type: 'scry', amount: 1 }], true);
  cast(state, 'probe', token.id);
  const exiledId = state.zones.exile.find((id) => state.objects.get(id).isToken);
  assert.ok(exiledId, 'także drugi tor SBA w accepted nie czyści w środku czaru');
  scry(state);
  assert.equal(state.pendingSpell, null);
  assert.equal(state.objects.has(exiledId), false);
  assert.equal(state.zones.exile.length, 0);
});
