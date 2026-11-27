import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

// CR 113.7a (wydanie 2026-11-06): „Once activated or triggered, an ability
// exists on the stack independently of its source. ... if the source is no
// longer in the zone it’s expected to be in at that time, its last known
// information is used.” https://yawgatog.com/resources/magic-rules/#R1137a
// Oracle: „When this creature dies, create X Junk tokens, where X is the number
// of +1/+1 counters on it.” https://api.scryfall.com/cards/pip/136
// Rulingi: https://api.scryfall.com/cards/pip/136/rulings (brak o LKI).
const registry = createCardRegistry();
function put(s, id, cardId, where = 'battlefield') {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: 'p1', registry });
  const { id: _id, instanceId, cardId: _cardId, ownerId, controllerId, objectId, zone, ...rest } = entry;
  addObject(s, { ...rest, id, instanceId: `i-${id}`, cardId, ownerId: 'p1', controllerId: 'p1', zone: where });
}
function pass(s) {
  const cmd = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
  assert.ok(cmd, 'pass oferowany');
  const result = execute(s, cmd);
  assert.equal(result.ok, true, result.reason);
}

test('Mister Gutsy: po śmierci X liczników zachowane, nawet gdy karta opuści grób przed resolvem', () => {
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const player of ['p1', 'p2']) for (let i = 0; i < 10; i++)
    addObject(s, { id: `${player}-lib-${i}`, instanceId: `${player}-lib-i${i}`, cardId: 'basic-forest', ownerId: player, controllerId: player, zone: 'library', kind: 'land', types: ['Land'] });
  put(s, 'gutsy', 'mister-gutsy');
  put(s, 'spear', 'lightning-spear');
  addCounter(s, 'gutsy', '+1/+1', 2);
  addMana(s, 'p1', 3, { colors: ['R'] });
  const act = playerView(s, 'p1').legalCommands.find(c => c.type === 'activate_ability'
    && c.objectId === 'spear' && c.abilityIndex === 1 && c.targets?.includes('gutsy'));
  assert.ok(act); assert.equal(execute(s, act).ok, true);
  for (let i = 0; i < 8 && ![...s.objects.values()].some(o => o.cardId === 'mister-gutsy' && o.zone === 'graveyard'); i++) pass(s);
  const dead = [...s.objects.values()].find(o => o.cardId === 'mister-gutsy' && o.zone === 'graveyard');
  assert.ok(dead, 'Gutsy umiera od trzech obrażeń'); assert.equal(dead.formerCounters['+1/+1'], 2);
  assert.ok(s.zones.stack.some(id => s.objects.get(id)?.kind === 'trigger'));
  // Memory's Journey przenosi kartę z grobu przed rozstrzygnięciem: nowy obiekt,
  // źródło na stosie nadal ma znać liczniki z chwili śmierci.
  put(s, 'mem', 'memory-s-journey', 'hand');
  addMana(s, 'p1', 2, { colors: ['U'] });
  for (let i = 0; i < 4 && s.turn.priorityPlayerId !== 'p1'; i++) pass(s);
  const options = playerView(s, 'p1').legalCommands.filter(c => c.objectId === 'mem');
  const cast = options.find(c => c.targets?.includes(dead.id));
  assert.ok(cast); assert.equal(execute(s, cast).ok, true);
  for (let i = 0; i < 12 && s.zones.stack.length > 1; i++) pass(s);
  assert.ok([...s.objects.values()].some(o => o.cardId === 'mister-gutsy' && o.zone === 'library'));
  assert.equal(s.zones.stack.length, 1, 'trigger śmierci wciąż oczekuje');

  for (let i = 0; i < 8 && s.zones.stack.length; i++) pass(s);
  assert.equal(s.zones.stack.length, 0);
  assert.equal([...s.objects.values()].filter(o => o.cardId === 'token_junk' && o.zone === 'battlefield').length, 2);
});
