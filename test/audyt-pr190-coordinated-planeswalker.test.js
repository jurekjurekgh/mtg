import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

// Oracle: "Coordinated Maneuver deals damage equal to the number of creatures
// you control to target creature or planeswalker." https://api.scryfall.com/cards/tdm/6
const registry = createCardRegistry();
function put(s, id, cardId, zone = 'battlefield', player = 'p1') {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: player, registry });
  const { id: _id, instanceId, cardId: _cardId, ownerId, controllerId, objectId, zone: _zone, ...rest } = entry;
  addObject(s, { ...rest, id, instanceId: `i-${id}`, cardId, ownerId: player, controllerId: player, zone });
}
function commands(s, p = 'p1') { return playerView(s, p).legalCommands; }
function resolve(s) {
  for (let i = 0; i < 15 && s.zones.stack.length; i++) {
    const p = s.turn.priorityPlayerId;
    const cmd = commands(s, p).find(c => c.type.startsWith('resolve_'))
      ?? commands(s, p).find(c => c.type === 'pass_priority');
    assert.ok(cmd);
    const result = execute(s, cmd);
    assert.equal(result.ok, true, result.reason);
  }
  assert.equal(s.zones.stack.length, 0);
}

test('Coordinated Maneuver: cel planeswalker legalny, gracz nie, obrażenia zdejmują loyalty', () => {
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'cm', 'coordinated-maneuver', 'hand');
  put(s, 'own-creature', 'grollub');
  addObject(s, { id: 'pw', instanceId: 'i-pw', cardId: 'synthetic-pw', name: 'Synthetic PW',
    ownerId: 'p2', controllerId: 'p2', zone: 'battlefield', kind: 'planeswalker', types: ['Planeswalker'] });
  addCounter(s, 'pw', 'loyalty', 5);
  addMana(s, 'p1', 2, { colors: ['W'] });
  const casts = commands(s).filter(c => c.type === 'cast_spell' && c.objectId === 'cm' && c.modeIndex === 0);
  const cast = casts.find(c => c.targets?.includes('pw'));
  assert.ok(cast, 'oferta powinna zawierać planeswalkera');
  assert.ok(!casts.some(c => c.targets?.includes('p2')), 'gracz nie jest celem trybu obrażeń');
  const result = execute(s, cast);
  assert.equal(result.ok, true, result.reason);
  resolve(s);
  assert.equal(s.objects.get('pw').counters.loyalty, 4, 'jedna kontrolowana kreatura = jedna obrażenia');
  assert.equal(s.players.find(p => p.id === 'p2').life, 20);
});

test('Coordinated Maneuver: liczy własne stwory przy rozstrzygnięciu, nie przy rzucie', async () => {
  const { moveObjectDirectly } = await import('../src/engine/objects.js');
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'cm', 'coordinated-maneuver', 'hand');
  put(s, 'own-a', 'grollub');
  put(s, 'own-b', 'soulmender');
  put(s, 'target', 'mnemonic-wall', 'battlefield', 'p2');
  addMana(s, 'p1', 2, { colors: ['W'] });
  const cast = commands(s).find(c => c.type === 'cast_spell' && c.objectId === 'cm' && c.modeIndex === 0 && c.targets?.includes('target'));
  assert.ok(cast); assert.equal(execute(s, cast).ok, true);
  // Stan między rzutem i rozstrzygnięciem jest przygotowany syntetycznie.
  moveObjectDirectly(s, 'own-a', 'exile', 'exiled-own-a');
  put(s, 'new-a', 'highland-game');
  put(s, 'new-b', 'mister-gutsy');
  resolve(s);
  assert.equal(s.objects.get('target').damage, 3, 'trzy własne stwory, bez celu przeciwnika');
});
