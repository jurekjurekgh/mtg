// Batch 68 (G6) — ręczne strojenie wyceny bota dla nowych mechanik (zlecenie
// właściciela 2026-10-17). Testy ZACHOWANIA (nie tylko klasyfikacji — to robi
// strażnik M157): bot wybiera najlepszą parę trybów Austere Command, nie rzuca
// Secure the Scene w swoje permanenty, nie kontruje czaru „can't be countered\",
// a kontruje zwykły ciężki czar (kontrola dodatnia).
//
// Wagi: src/controllers/heuristic-params.js (massDestroy* — PMSSB-63, model stołu).
// Kolejność par Austere: 0 art+ench, 1 art+MV≤3, 2 art+MV≥4, 3 ench+MV≤3,
// 4 ench+MV≥4, 5 MV≤3+MV≥4 (chooseTwoModes, pary i<j).
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

test('B68/G6 Austere: bot wybiera parę o największej wartości netto wg modelu stołu (PMSSB-63: dwa stwory 6/5 + lifelink 2/1 = 54 > artefakt MV5 + 6/5 = 46)', () => {
  // PMSSB-63 ZMIANA OCZEKIWANIA (świadoma): stara wycena (płaskie 75/90 na sztukę) dawała parę 2
  // (artefakt + MV≥4). Model stołu: para 5 (MV≤3 + MV≥4) zabija 6/5 ORAZ lifelinka 2/1 (ewazja +4,
  // zagrożenie −8 życia), a artefakt-kamień many (MV5, wartość 11) jest mniej wart niż ten
  // lifelink (wartość 17 + zagrożenie). Liczby: test/audyt-pmssb63-batch68.test.js.
  const state = botTurn();
  addMana(state, 'p2', 6, { colors: ['W'] });
  putCard(state, 'aus', 'austere-command', 'p2', 'hand');
  putCard(state, 'met', 'meteorite', 'p1', 'battlefield');
  putCard(state, 'big', 'kulrath-zealot', 'p1', 'battlefield');
  putCard(state, 'small', 'child-of-night', 'p1', 'battlefield');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `bot rzuca Austere: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'aus');
  assert.equal(choice.modeIndex, 5, 'para (MV≤3 + MV≥4) — dwa stwory wroga, wyższa wartość netto niż artefakt + 6/5');
});

test('B68/G6 Austere: nie rzuca, gdy zniszczyłby tylko WŁASNE permanenty', () => {
  const state = botTurn();
  addMana(state, 'p2', 6, { colors: ['W'] });
  putCard(state, 'aus', 'austere-command', 'p2', 'hand');
  putCard(state, 'mine', 'kulrath-zealot', 'p2', 'battlefield');
  putCard(state, 'mine2', 'meteorite', 'p2', 'battlefield');
  const choice = choose(state);
  assert.ok(!(choice.type === 'cast_spell' && choice.objectId === 'aus'),
    `bot nie niszczy własnej planszy: ${JSON.stringify(choice)}`);
});

test('B68/G6 Austere: pusta plansza przeciwnika = czar pusty, bot nie rzuca', () => {
  const state = botTurn();
  addMana(state, 'p2', 6, { colors: ['W'] });
  putCard(state, 'aus', 'austere-command', 'p2', 'hand');
  const choice = choose(state);
  assert.ok(!(choice.type === 'cast_spell' && choice.objectId === 'aus'),
    `bez celów Austere nie ma sensu: ${JSON.stringify(choice)}`);
});

test('B68/G6 Secure the Scene: cel = permanent WROGA (wygnanie +, token dla wroga −)', () => {
  const state = botTurn();
  addMana(state, 'p2', 5, { colors: ['W'] });
  putCard(state, 'sec', 'secure-the-scene', 'p2', 'hand');
  putCard(state, 'foe', 'kulrath-zealot', 'p1', 'battlefield');
  putCard(state, 'mine', 'child-of-night', 'p2', 'battlefield');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `bot rzuca Secure: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'sec');
  assert.deepEqual(choice.targets, ['foe'], 'cel: stwór wroga, nie własny');
});

test('B68/G6 Raze: bot niszczy artefakt wroga', () => {
  const state = botTurn();
  addMana(state, 'p2', 3, { colors: ['R'] });
  putCard(state, 'raze', 'raze-to-the-ground', 'p2', 'hand');
  putCard(state, 'met', 'meteorite', 'p1', 'battlefield');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `bot rzuca Raze: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'raze');
  assert.deepEqual(choice.targets, ['met']);
});

test('B68/G6 Stymied Hopes: bot NIE kontruje Raze („can\'t be countered\")', () => {
  const state = botTurn();
  addMana(state, 'p2', 2, { colors: ['U'] });
  putCard(state, 'stym', 'stymied-hopes', 'p2', 'hand');
  putCard(state, 'raze', 'raze-to-the-ground', 'p1', 'stack');
  state.zones.stack.push('raze');
  const choice = choose(state);
  assert.ok(!(choice.type === 'cast_spell' && choice.objectId === 'stym'),
    `kontra bez skutku nie jest wydawana: ${JSON.stringify(choice)}`);
});

test('B68/G6 Stymied Hopes (kontrola dodatnia): bot kontruje zwykły ciężki czar wroga', () => {
  const state = botTurn();
  addMana(state, 'p2', 2, { colors: ['U'] });
  putCard(state, 'stym', 'stymied-hopes', 'p2', 'hand');
  putCard(state, 'big', 'kulrath-zealot', 'p1', 'stack');
  state.zones.stack.push('big');
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `bot kontruje: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'stym');
  assert.deepEqual(choice.targets, ['big']);
});
