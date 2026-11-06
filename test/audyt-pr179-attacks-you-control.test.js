// Audyt scalonego PR #179 (A-1, CR 508.3d): „Whenever [a player] attacks"
// odpala się RAZ na deklarację ataku, gdy jedna lub więcej stworów
// kontrolowanych przez gracza atakują — nie raz na atakującego.
// Living History (SOS) jest kartą-kotwicą (Oracle z
// docs/cards/scryfall-living-history.json):
// "Whenever you attack, if a card left your graveyard this turn, target
// attacking creature gets +2/+0 until end of turn."
// Źródło reguły: kopia oficjalnych zasad (chaoticgoodcomputing/mtg-rules,
// auto-pull z magic.wizards.com), 508.3d:
// "An ability that reads 'Whenever [a player] attacks, . . .' triggers if one
// or more creatures that player controls are declared as attackers."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { processTriggers } from '../src/engine/triggers.js';

const registry = createCardRegistry();
const definition = (id) => registry.get(id);

function game(seed = 179) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  return state;
}

function addCard(state, id, cardId, zone, controllerId = 'p1') {
  const def = definition(cardId);
  addObject(state, {
    id, instanceId: `instance-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    colors: def.colors ?? [], keywords: def.keywords ?? [],
  });
  return state.objects.get(id);
}

function livingHistoryEvents(state, attackerIds, { withFact = { p1: true } } = {}) {
  // Fakt per-tury ustawiamy wprost — jego zapisywanie przez moveObjectDirectly
  // jest przypięte w test/real-cards-batch72.test.js.
  state.cardsLeftGraveyardThisTurn = withFact;
  state.combat = {
    attackers: [...attackerIds], blockers: new Map(), blockedAttackers: [], attackingPlayerId: 'p1',
  };
  const events = processTriggers(state, [{
    type: 'attackers_declared', playerId: 'p1', attackerIds: [...attackerIds],
  }]);
  return events.filter((event) => event.type === 'ability_triggered' && event.trigger === 'attacks_you_control');
}

test('A-1: dwóch atakujących — Living History odpala DOKŁADNIE JEDEN raz (CR 508.3d)', () => {
  const state = game();
  addCard(state, 'history', 'living-history', 'battlefield');
  addCard(state, 'attacker-1', 'kraken-hatchling', 'battlefield');
  addCard(state, 'attacker-2', 'kraken-hatchling', 'battlefield');
  const fired = livingHistoryEvents(state, ['attacker-1', 'attacker-2']);
  assert.equal(fired.length, 1, `oczekiwano 1 trigger attacks_you_control, dostałem ${fired.length}`);
});

test('A-1: jeden atakujący — jeden trigger (kontrola zachowania)', () => {
  const state = game();
  addCard(state, 'history', 'living-history', 'battlefield');
  addCard(state, 'attacker', 'kraken-hatchling', 'battlefield');
  const fired = livingHistoryEvents(state, ['attacker']);
  assert.equal(fired.length, 1);
});

test('A-1: zero atakujących — brak triggera (508.3d: nic nie zostało zadeklarowane)', () => {
  const state = game();
  addCard(state, 'history', 'living-history', 'battlefield');
  const fired = livingHistoryEvents(state, []);
  assert.equal(fired.length, 0);
});

test('A-1: Living History przeciwnika nie odpala przy naszym ataku (nawet z jego własnym faktem)', () => {
  const state = game();
  addCard(state, 'history', 'living-history', 'battlefield', 'p2');
  addCard(state, 'attacker-1', 'kraken-hatchling', 'battlefield');
  addCard(state, 'attacker-2', 'kraken-hatchling', 'battlefield');
  // Oba fakty ustawione: trigger p2 istnieje u źródła i jego warunek
  // spełniony — jedynym hamulcem pozostaje kontrola (508.3d: trigger
  // należy do ATACUJĄCEGO gracza).
  const fired = livingHistoryEvents(state, ['attacker-1', 'attacker-2'], { withFact: { p1: true, p2: true } });
  assert.equal(fired.length, 0);
});

test('A-1: intervening-if bez odejścia karty z grobu — brak triggera mimo wielu atakujących', () => {
  const state = game();
  addCard(state, 'history', 'living-history', 'battlefield');
  addCard(state, 'attacker-1', 'kraken-hatchling', 'battlefield');
  addCard(state, 'attacker-2', 'kraken-hatchling', 'battlefield');
  const fired = livingHistoryEvents(state, ['attacker-1', 'attacker-2'], { withFact: {} });
  assert.equal(fired.length, 0);
});
