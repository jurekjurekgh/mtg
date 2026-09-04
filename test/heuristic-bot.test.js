import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { initializeResources, addMana } from '../src/engine/resources.js';
import { runSimulation } from '../src/engine/simulation.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const SHOCK = { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] };

function baseState() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  return state;
}

test('bot gra land drop, gdy ma landa na ręce', () => {
  const state = baseState();
  addObject(state, { id: 'l', instanceId: 'il', cardId: 'L', controllerId: 'p1', zone: 'hand', kind: 'land' });
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd.type, 'play_land');
  // Ślad nazywa WARIANT (karta w id), nie tylko typ decyzji — bez tego audyt
  // remisorów (tools/bot-tie-audit.mjs) nie odróżnia dwóch lasów od lasu i góry.
  assert.equal(bot.trace().at(-1).chosen, 'play_land(l:L)');
});

test('bot wybiera atak, gdy jest śmiertelny', () => {
  const state = baseState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.players[1].life = 2;
  addObject(state, { id: 'c', instanceId: 'ic', cardId: 'C', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  const cmd = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd.type, 'declare_attackers');
  assert.deepEqual(cmd.attackerIds, ['c']);
});

test('bot nie atakuje wymownie pod śmiertelną wymianę i blokuje pod presją', () => {
  const state = baseState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.players[0].life = 5;
  addObject(state, { id: 'me', instanceId: 'im', cardId: 'M', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  addObject(state, { id: 'foe', instanceId: 'if', cardId: 'F', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 4, toughness: 4 });
  const attack = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p1'));
  assert.ok(attack.attackerIds === undefined || attack.attackerIds.length === 0, 'bot nie powinien atakować 1/1 w 4/4 bez korzyści');

  // Okno bloków: p2 atakuje 5/5, p1 broni 3/2 przy 5 życiach.
  const defend = baseState();
  defend.players[1].life = 20; defend.players[0].life = 5;
  addObject(defend, { id: 'big', instanceId: 'ib', cardId: 'B', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 5, toughness: 5 });
  addObject(defend, { id: 'guard', instanceId: 'ig', cardId: 'G', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 3, toughness: 2 });
  defend.turn = { ...defend.turn, activePlayerId: 'p2' };
  defend.turn = jumpToStep(defend.turn, 'declare_attackers', 'p2');
  execute(defend, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['big'] });
  const block = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(defend, 'p1'));
  assert.equal(block.type, 'declare_blockers');
  assert.ok(Object.keys(block.assignments).length > 0, 'bot powinien ponieść blok przeciw śmiertelnemu atakowi');
});

test('bot nie marnuje removalu na własnego stwora', () => {
  const state = baseState();
  addMana(state, 'p1', 1);
  addObject(state, { id: 'mine', instanceId: 'im', cardId: 'M', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  addObject(state, { id: 'shock', instanceId: 'is', cardId: 'S', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1, spell: SHOCK });
  const cmd = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p1'));
  assert.notEqual(cmd.type, 'cast_spell');
});

test('bot dobija removal śmiertelnym, gdy zabija wartościowy cel', () => {
  const state = baseState();
  addMana(state, 'p1', 1);
  addObject(state, { id: 'foe', instanceId: 'if', cardId: 'F', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 3, toughness: 2 });
  addObject(state, { id: 'shock', instanceId: 'is', cardId: 'S', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1, spell: SHOCK });
  const cmd = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd.type, 'cast_spell');
  assert.deepEqual(cmd.targets, ['foe']);
});

const registry = createCardRegistry();
const deckLists = new Map([
  ['p1', parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
  ['p2', parseDeckText(fs.readFileSync('decks/warhammer-ubr.txt', 'utf8'), registry).cardIds],
]);

function playHeuristicMatch(seed, secondFactory = (s) => createHeuristicBot({ seed: s })) {
  const state = setupCardMatch({ seed, players: [{ id: 'p1' }, { id: 'p2' }], decks: deckLists, registry });
  return {
    state,
    ...runSimulation({
      state,
      controllers: new Map([['p1', createHeuristicBot({ seed: seed + 1 })], ['p2', secondFactory(seed + 2)]]),
      maxCommands: 3000,
    }),
  };
}

test('mecz heurystyczny jest deterministyczny i kończy się rozstrzygnięciem', () => {
  const a = playHeuristicMatch(101);
  const b = playHeuristicMatch(101);
  assert.equal(a.state.status, 'finished');
  const verification = verifyReplay(replayFromState(a.state), (seed) => setupCardMatch({ seed, players: [{ id: 'p1' }, { id: 'p2' }], decks: deckLists, registry }), execute);
  assert.equal(verification.deterministic, true);
  assert.deepEqual(a.results, b.results);
});

test('bot z losowością zachowuje się powtarzalnie dla seeda', () => {
  const mk = (s) => createHeuristicBot({ seed: s, randomness: 0.5 });
  const a = playHeuristicMatch(202, mk);
  const b = playHeuristicMatch(202, mk);
  assert.deepEqual(a.results, b.results);
});

test('heurystyka wygrywa większość meczów z RandomBotem', () => {
  const seeds = [301, 302, 303, 304, 305, 306];
  let wins = 0;
  for (const seed of seeds) {
    const { state } = playHeuristicMatch(seed, (s) => createRandomBot({ seed: s }));
    assert.equal(state.status, 'finished');
    if (state.winnerId === 'p1') wins += 1;
  }
  assert.ok(wins >= 4, `heurystyka wygrała tylko ${wins}/6`);
});
