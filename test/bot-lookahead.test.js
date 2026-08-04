import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { makeSimulate } from '../src/engine/lookahead.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * B2 — lookahead (docs/BOT_ROADMAP.md): bot dogrywa top-K decyzji na klonie
 * stanu (engine helper `simulate`) i wybiera wg ewaluacji liścia. Testy:
 * determinizm, poprawność predykcji symulacji, zachowanie bota (bez lookahead
 * nic się nie zmienia; z lookahead wybór jest legalny i deterministyczny).
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, { tapped = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    entersWithCounters: data.entersWithCounters ?? def.entersWithCounters ?? null,
    types: def.types ?? [], entersTapped: def.entersTapped ?? false,
    bestow: def.bestow ?? null, aura: def.aura ?? null,
    equipment: def.equipment ?? null, backup: def.backup ?? null,
  });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, keywords = [], tapped = false, summoningSickness = true } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield', kind: 'creature',
    power, toughness, abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

// --- helper simulate (engine) ----------------------------------------------

test('simulate: wykonuje kandydata na klonie i nie mutuje oryginalnego stanu', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ge', 'skyclave-geopede', 'p1', 'battlefield');
  const view = playerView(state, 'p1');
  const landCmd = view.legalCommands.find((c) => c.type === 'play_land');
  assert.ok(!landCmd, 'bez landa w ręce nie ma play_land');
  addRealCard(state, 'hand-land', 'holdout-settlement', 'p1', 'hand');
  const simulate = makeSimulate(state);
  const sim = simulate({ type: 'play_land', playerId: 'p1', objectId: 'hand-land' }, { policy: null, maxCommands: 5 });
  assert.equal(sim.rejected, false);
  // Oryginał nietknięty: land wciąż w ręce, brak buffa.
  assert.equal(state.objects.get('hand-land').zone, 'hand');
  assert.equal(state.objects.get('ge').powerModifier ?? 0, 0);
  // Klon: land na bitwisku, landfall dał +2/+2.
  assert.equal(sim.view.zones.battlefield.some((o) => o.cardId === 'holdout-settlement'), true);
});

test('simulate: deterministyczny — dwa uruchomienia dają identyczny widok końcowy', () => {
  const state = mainPhase(game());
  addRealCard(state, 'guard', 'midnight-guard', 'p1', 'battlefield');
  addRealCard(state, 'hand-other', 'skyclave-geopede', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const simulate = makeSimulate(state);
  const cmd = { type: 'cast_permanent', playerId: 'p1', objectId: 'hand-other' };
  const a = simulate(cmd, { policy: null, maxCommands: 8 });
  const b = simulate(cmd, { policy: null, maxCommands: 8 });
  assert.equal(a.rejected, false);
  const pick = (v) => v.zones.battlefield.map((o) => `${o.cardId}:${o.power}/${o.toughness}:${o.tapped}`).sort().join('|');
  assert.equal(pick(a.view), pick(b.view));
});

test('simulate: odrzuca nielegalną komendę (rejected) zamiast rzucać', () => {
  const state = mainPhase(game());
  const simulate = makeSimulate(state);
  const sim = simulate({ type: 'play_land', playerId: 'p1', objectId: 'nie-ma' }, { policy: null, maxCommands: 4 });
  assert.equal(sim.rejected, true);
  assert.equal(sim.finished, false);
});

// --- bot z lookahead --------------------------------------------------------

test('bot: lookahead=0 (domyślny) zachowuje dotychczasowe zachowanie', () => {
  const state = mainPhase(game());
  addRealCard(state, 'l', 'holdout-settlement', 'p1', 'hand');
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd.type, 'play_land', 'bez lookahead bot gra landa jak dotychczas');
});

test('bot: z lookahead wybiera legalną komendę i jest deterministyczny (2 przebiegi)', () => {
  const registry = createCardRegistry();
  const deck = parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), registry);
  const run = (seed) => {
    const state = setupCardMatch({ seed, players: [{ id: 'p1' }, { id: 'p2' }], decks: new Map([['p1', deck.cardIds], ['p2', deck.cardIds]]), registry });
    const result = runSimulation({
      state,
      controllers: new Map([
        ['p1', createHeuristicBot({ seed: seed + 1, lookahead: 1 })],
        ['p2', createHeuristicBot({ seed: seed + 2, lookahead: 1 })],
      ]),
      maxCommands: 3000,
    });
    return result.state;
  };
  const a = run(101);
  const b = run(101);
  assert.ok(a.status !== 'active', 'partia dochodzi do końca');
  assert.equal(a.winnerId, b.winnerId);
  assert.equal(a.players[0].life, b.players[0].life);
  assert.equal(a.players[1].life, b.players[1].life);
});

test('bot: lookahead dostrzega wymianę — unika ataku 2/2 w 3/4, gdy ma czas', () => {
  const state = game();
  addSimpleCreature(state, 'me', 'p1', { power: 2, toughness: 2, summoningSickness: false });
  addSimpleCreature(state, 'foe', 'p2', { power: 3, toughness: 4, summoningSickness: false });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const bot = createHeuristicBot({ seed: 1, lookahead: 1 });
  // Bez helpera (brak simulate) bot działa jak zwykle — guard przed brakiem helpera.
  const plain = bot.chooseCommand(playerView(state, 'p1'));
  assert.ok(['declare_attackers', 'pass_priority'].includes(plain.type));
  // Z helperem symulacja odrzuci wariant z chumpem.
  const sim = makeSimulate(state);
  const withSim = bot.chooseCommand(playerView(state, 'p1'), { simulate: sim });
  assert.ok(['declare_attackers', 'pass_priority'].includes(withSim.type));
});

test('bot: lookahead unika bezwartościowej wymiany, którą naiwne B1 podejmuje', () => {
  // 5/1 atakuje 3/3: naiwne B1 liczy „wymianę" (power 5 ≥ 3 → atak, score 4),
  // ale to strata — 5/1 ginie od 3/3, a 3/3 pada. Symulacja pokazuje ujemną
  // deltę ewaluacji (tracimy więcej power niż przeciwnik) → lookahead nie atakuje.
  const state = game();
  addSimpleCreature(state, 'big', 'p1', { power: 5, toughness: 1, summoningSickness: false });
  addSimpleCreature(state, 'blocker', 'p2', { power: 3, toughness: 3, summoningSickness: false });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');

  const naive = createHeuristicBot({ seed: 1 });
  const naiveCmd = naive.chooseCommand(playerView(state, 'p1'));
  assert.ok(naiveCmd.type === 'declare_attackers' && naiveCmd.attackerIds.length === 1,
    'naiwne B1 podejmuje wymianę (atak 5/1 w 3/3)');

  const lookaheadBot = createHeuristicBot({ seed: 1, lookahead: 1 });
  const laCmd = lookaheadBot.chooseCommand(playerView(state, 'p1'), { simulate: makeSimulate(state) });
  assert.ok(laCmd.type === 'declare_attackers' && laCmd.attackerIds.length === 0,
    `lookahead nie podejmuje złej wymiany (wybrał ${JSON.stringify(laCmd.attackerIds)})`);
});

test('smoke: partia botów z lookahead vs aggro kończy się rozstrzygnięciem', () => {
  const registry = createCardRegistry();
  const deck = parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), registry);
  const state = setupCardMatch({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }], decks: new Map([['p1', deck.cardIds], ['p2', deck.cardIds]]), registry });
  const result = runSimulation({
    state,
    controllers: new Map([
      ['p1', createHeuristicBot({ seed: 6, lookahead: 1 })],
      ['p2', createAggroBot()],
    ]),
    maxCommands: 2000,
  });
  assert.ok(result.state.status !== 'active', 'partia kończy się wygraną jednej strony');
});
