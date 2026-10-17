// Batch 68 (G6, uzupełnienie) — zachowanie bota dla pozostałych kart batcha
// (zlecenie właściciela 2026-10-17: strojenie wyceny ręcznie dla wszystkich
// mechanik). Testy ZACHOWANIA: bot rzuca czar, który ma sens w danej sytuacji.
// Wagi: src/controllers/heuristic-bot.js (ETB_EFFECT_BONUS, `exile_top_playable_until_next_turn`
// = 3) oraz heuristic-params.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Tura bota (p2) w fazie main; p1 = przeciwnik. */
function botTurn() {
  const state = createGameState({ seed: 68, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

const choose = (state) => createHeuristicBot({ seed: 68 }).chooseCommand(playerView(state, 'p2'), {});

test('B68/G6 Kulrath Zealot: bot rzuca 6-drop z ręki, gdy ma {5}{R} i pustą planszę', () => {
  const state = botTurn();
  addMana(state, 'p2', 6, { colors: ['R'] });
  putCard(state, 'kz', 'kulrath-zealot', 'p2', 'hand');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_permanent', `bot rzuca Kulratha: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'kz');
});

test('B68/G6 Bloodfire Expert: bot rzuca 3-drop prowess z ręki przy pustej planszy', () => {
  const state = botTurn();
  addMana(state, 'p2', 3, { colors: ['R'] });
  putCard(state, 'bf', 'bloodfire-expert', 'p2', 'hand');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_permanent', `bot rzuca Bloodfire: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'bf');
});

test('B68/G6 Meteorite: bot rzuca Meteorite, gdy jego ETB zabija stwór wroga 2/1', () => {
  const state = botTurn();
  addMana(state, 'p2', 5, { colors: ['W'] });
  putCard(state, 'met', 'meteorite', 'p2', 'hand');
  putCard(state, 'coN', 'child-of-night', 'p1', 'battlefield');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_permanent', `bot rzuca Meteorite: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'met');
});

test('B68/G6 Child of Night: bot rzuca lifelink 2-drop z ręki przy pustej planszy', () => {
  const state = botTurn();
  addMana(state, 'p2', 2, { colors: ['B'] });
  putCard(state, 'con', 'child-of-night', 'p2', 'hand');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_permanent', `bot rzuca Child of Night: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'con');
});

test('B68/G6 Neurok Invisimancer: bot rzuca 3-drop z ręki, gdy ETB może odblokować atak', () => {
  const state = botTurn();
  addMana(state, 'p2', 3, { colors: ['U'] });
  putCard(state, 'neu', 'neurok-invisimancer', 'p2', 'hand');
  putCard(state, 'wall', 'child-of-night', 'p1', 'battlefield');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_permanent', `bot rzuca Neuroka: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'neu');
});

test('B68/G6 Halo Scarab: bot rzuca 2-drop artefakt-stwór z ręki przy pustej planszy', () => {
  const state = botTurn();
  addMana(state, 'p2', 2);
  putCard(state, 'halo', 'halo-scarab', 'p2', 'hand');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_permanent', `bot rzuca Halo Scarab: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'halo');
});

test('B68/G6 Halo Scarab: bank many za koszt z cmentarza NIE wygrywa z passem — jak Heap Gate (M243/C, zgłoszenie właściciela)', () => {
  // Reguła właściciela (M243/C, test audyt-pmssb2-tokeny „Heap Gate … M243/C stoi”):
  // Skarb zrobiony za manę, gdy nie ma czego rzucić, to przeniesienie many na przyszłość
  // i bot go nie robi. Scarab ma ten sam kształt (koszt many → Treasure), więc zachowanie
  // jest spójne z tą regułą. Zmiana wymaga decyzji właściciela, nie cichej poprawki pod jedną kartę.
  const state = botTurn();
  addMana(state, 'p2', 2);
  putCard(state, 'halo', 'halo-scarab', 'p2', 'graveyard');
  const choice = choose(state);
  assert.equal(choice.type, 'pass_priority', `bank za koszt poniżej passa: ${JSON.stringify(choice)}`);
});
