import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { performActivation } from '../src/engine/abilities.js';

// CR 118.3: koszt należy opłacić w całości; CR 601.2h przez 602.2b.
// Źródło: https://yawgatog.com/resources/magic-rules/#R1183
const registry = createCardRegistry();
function put(s, id, cardId) {
  const [e] = createCardDeck({ cardIds: [cardId], ownerId: 'p1', registry });
  const { id: _id, instanceId, cardId: _cardId, ownerId, controllerId, objectId, zone, summoningSickness, ...rest } = e;
  addObject(s, { ...rest, id, instanceId: `i-${id}`, cardId, ownerId: 'p1', controllerId: 'p1', zone: 'battlefield' });
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
}
function scene(life, mana) {
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.players[0].life = life;
  put(s, 'krumar', 'krumar-initiate');
  addMana(s, 'p1', mana, { colors: ['B'] });
  return s;
}
function cmd(xValue) { return { type: 'activate_ability', playerId: 'p1', objectId: 'krumar', abilityIndex: 0, xValue }; }
function resources(s) {
  return { life: s.players[0].life, mana: s.players[0].mana, pool: { ...s.players[0].manaPool },
    tapped: s.objects.get('krumar').tapped, stack: [...s.zones.stack] };
}
for (const [name, life, mana, x] of [
  ['brak części stałej {B}', 2, 1, 1],
  ['za mało życia', 2, 4, 3],
  ['X ujemne', 2, 4, -1],
  ['X ułamkowe', 2, 4, 1.5],
]) {
  test(`Krumar: odrzucenie ${name} nie pobiera żadnego kosztu`, () => {
    const s = scene(life, mana);
    const before = resources(s);
    const result = execute(s, cmd(x));
    assert.equal(result.ok, false);
    assert.deepEqual(resources(s), before, 'nieudana aktywacja nie tapuje ani nie wydaje many/życia');
  });
}

test('Krumar: legalny X=2 płaci {2}{B}, 2 życia i tapuje', () => {
  const s = scene(3, 3);
  const legal = playerView(s, 'p1').legalCommands.find(c => c.objectId === 'krumar' && c.xValue === 2);
  assert.ok(legal);
  assert.equal(execute(s, legal).ok, true);
  assert.equal(s.players[0].life, 1);
  assert.equal(s.players[0].mana, 0);
  assert.equal(s.objects.get('krumar').tapped, true);
  assert.equal(s.zones.stack.length, 1);
});

test('Translator zużywa życie przed Krumarem: X=2 wymaga 3 życia łącznie', () => {
  for (const life of [2, 3]) {
    const s = scene(life, 1);
    addMana(s, 'p1', 1, { colors: [] });
    put(s, 'translator', 'kozileks-translator');
    const activate = playerView(s, 'p1').legalCommands.find(c => c.objectId === 'translator' && c.type === 'activate_ability');
    assert.ok(activate);
    assert.equal(execute(s, activate).ok, true);
    const offers = playerView(s, 'p1').legalCommands.filter(c => c.objectId === 'krumar').map(c => c.xValue);
    assert.equal(offers.includes(2), life === 3, `życie początkowe ${life}, oferty ${offers}`);
    if (life === 3) {
      assert.equal(execute(s, cmd(2)).ok, true);
      assert.equal(s.players[0].life, 0, 'można zapłacić dokładnie całe pozostałe życie');
    }
  }
});

test('Koszt stały i zmienny życia są sumowane przed dowolną zapłatą', () => {
  const s = scene(2, 3);
  const obj = s.objects.get('krumar');
  // Syntetyczne połączenie istniejących descriptorów, nie zmiana Oracle karty.
  const ability = obj.abilities[0];
  s.objects.set('krumar', Object.freeze({ ...obj, abilities: [{ ...ability, cost: { ...ability.cost, life: 1 } }] }));
  const before = resources(s);
  const offered = playerView(s, 'p1').legalCommands.filter(c => c.objectId === 'krumar').map(c => c.xValue);
  assert.deepEqual(offered, [1], 'oferta rezerwuje życie na stałą część kosztu');
  assert.equal(execute(s, cmd(2)).ok, false);
  assert.deepEqual(resources(s), before);
});

// performActivation obsługuje także wznowienie po decyzji kosztu: musi
// odczytać życie na nowo, a nie polegać na dawnej walidacji.
test('Wznowiona aktywacja ponownie weryfikuje życie przed tapnięciem i maną', () => {
  const s = scene(3, 3);
  assert.ok(playerView(s, 'p1').legalCommands.some(c => c.objectId === 'krumar' && c.xValue === 2));
  s.players[0].life = 1;
  const before = resources(s);
  assert.throws(() => performActivation(s, { playerId: 'p1', objectId: 'krumar', abilityIndex: 0, xValue: 2 }));
  assert.deepEqual(resources(s), before);
});
