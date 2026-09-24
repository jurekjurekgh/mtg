// Etap F/3 (PR #135, polecenie właściciela: „żadnych uproszczeń wpływających
// na grę\") — zejście czaru ze stosu BEZ rozstrzygnięcia.
// CR 608.2b: czar, którego wszystkie cele stały się nielegalne, NIE
// rozstrzyga się — schodzi ze stosu do grobu właściciela. Skutki „as it
// resolves\" nie zachodzą:
// - rebound (CR 702.88a: „exile it as it resolves\") — dawniej fizzle
//   wyganiał kartę z reboundReady (darmowy rzut w następnym upkeepie),
// - przygoda (CR 715.3d) — dawniej fizzle wyganiał kartę „on an adventure\"
//   (stwór do rzucenia z wygnania).
// CR 702.34a (flashback): „exile this card instead of putting it anywhere
// else any time it would leave the stack\" — także po KONTRZE (strażnik:
// przekierowanie robi objects.moveObjectDirectly, niezależnie od ścieżki
// zejścia ze stosu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 6034, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId}`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

const pass = (state) => execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
const zoneOf = (state, cardId) => [...state.objects.values()].filter((o) => o.cardId === cardId).map((o) => o.zone);

test("Rebound + fizzle (CR 608.2b, 702.88a): Ojutai's Breath bez legalnego celu idzie do grobu, nie do exile", () => {
  const state = game();
  put(state, 'breath', 'ojutais-breath', 'p1', 'hand');
  put(state, 'target', 'highland-game', 'p2', 'battlefield');
  addMana(state, 'p1', 3);
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'breath');
  assert.ok(execute(state, { ...cast, targets: ['target'] }).ok);
  moveObjectDirectly(state, 'target', 'graveyard', 'target-gone'); // cel znika w odpowiedzi
  pass(state); pass(state);
  assert.equal(state.zones.stack.length, 0);
  assert.deepEqual(zoneOf(state, 'ojutais-breath'), ['graveyard'], 'fizzle → grób (brak rebound)');
  assert.ok(![...state.objects.values()].some((o) => o.reboundReady), 'żadnej karty gotowej do rebound');
});

test('Przygoda + fizzle (CR 608.2b, 715.3d): Ettercap bez legalnego celu idzie do grobu, nie „on an adventure\"', () => {
  const state = game();
  put(state, 'flyer', 'quicksilver-fisher', 'p2', 'battlefield');
  put(state, 'spell', 'ettercap', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_adventure' && c.objectId === 'spell');
  assert.ok(cast, 'oferta rzutu przygody');
  assert.ok(execute(state, { ...cast, targets: ['flyer'] }).ok);
  moveObjectDirectly(state, 'flyer', 'graveyard', 'flyer-gone');
  pass(state); pass(state);
  assert.equal(state.zones.stack.length, 0);
  assert.deepEqual(zoneOf(state, 'ettercap'), ['graveyard'], 'fizzle → grób');
  addMana(state, 'p1', 5);
  assert.ok(!playerView(state, 'p1').legalCommands.some((c) => c.type === 'cast_adventure_creature'),
    'brak rzutu stwora z wygnania');
});

test('Flashback + kontra (CR 702.34a): skontrowany Dream Twist z flashbacku zostaje wygnany', () => {
  const state = game();
  put(state, 'dt', 'dream-twist', 'p1', 'graveyard');
  put(state, 'neg', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 2, { colors: ['U'] });
  addMana(state, 'p2', 2, { colors: ['U'] });
  const fb = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_flashback' && c.objectId === 'dt');
  assert.ok(fb, 'flashback w ofercie');
  assert.ok(execute(state, fb).ok);
  pass(state); // p1 → p2
  const stackId = state.zones.stack[0];
  const counter = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'neg');
  assert.ok(counter, 'Negate w ofercie');
  assert.ok(execute(state, { ...counter, targets: [stackId] }).ok);
  while (state.zones.stack.length > 0) pass(state);
  assert.deepEqual(zoneOf(state, 'dream-twist'), ['exile'], 'po kontrze wygnany, nie w grobie');
});
