// Audyt/pętla jakości — F-90/12 (Bladewheel Chariot): `pendingTwin` porównywał
// wyłącznie `abilityIndex`, więc dwie różne zdolności tego samego obiektu
// o tym samym idempotentnym efekcie EOT (`#0` Tap 2 artefakty vs `#1` Crew 1)
// nie hamowały się na stosie. Od tej naprawy porównanie czyta `entry.abilityEffects`
// z widoku stosu (ADR 0017), zachowując zgodność różnych efektów tej samej rodziny
// (np. grant `lifelink` vs `flying`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();

function payload(cardId, ownerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry });
  const { id, instanceId, cardId: _cardId, ownerId: _ownerId, controllerId, zone, objectId, ...rest } = entry;
  return rest;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  addObject(state, {
    id, instanceId: `inst-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...payload(cardId, controllerId), ...patch,
  });
  return state.objects.get(id);
}

function chariotBoard() {
  const state = createGameState({ seed: 9012, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'beginning_of_combat', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const back = registry.get('bladewheel-chariot');
  addObject(state, {
    id: 'chariot', instanceId: 'inst-chariot', cardId: 'bladewheel-chariot', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', power: back.power, toughness: back.toughness,
    types: back.types, subtypes: back.subtypes ?? [], abilities: back.abilities ?? [], keywords: [],
  });
  state.objects.set('chariot', Object.freeze({ ...state.objects.get('chariot'), summoningSickness: false }));
  put(state, 'crew-1', 'leafcrown-dryad', 'p1', 'battlefield');
  put(state, 'art-1', 'cloak-of-the-bat', 'p1', 'battlefield');
  put(state, 'art-2', 'thieves-tools', 'p1', 'battlefield');
  put(state, 'opp', 'leafcrown-dryad', 'p2', 'battlefield', { keywords: [] });
  return state;
}

test('F-90/12a: Crew (#1) na stosie blokuje Tap 2 artefaktów (#0) na Bladewheel Chariot', () => {
  const state = chariotBoard();
  const crewCmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'chariot' && c.abilityIndex === 1);
  assert.ok(crewCmd, 'zdolność Crew (#1) dostępna przed aktywacją');
  assert.equal(execute(state, crewCmd).ok, true);

  const viewAfter = playerView(state, 'p1');
  assert.equal(viewAfter.zones.stack.length, 1, 'Crew wisi na stosie');
  const tapOffer = viewAfter.legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'chariot' && c.abilityIndex === 0);
  assert.ok(tapOffer, 'silnik nadal legalnie oferuje #0 (nie jest zablokowane na poziomie reguł)');

  const bot = createHeuristicBot({ seed: 1, registry });
  const chosen = bot.chooseCommand(viewAfter);
  const tapScore = bot.trace().at(-1)?.options
    ?.find((o) => o.cmd.includes('chariot#0'))?.score;
  assert.equal(chosen?.type, 'pass_priority', `bot powinien przepuścić Crew ze stosu, zamiast odpalać #0: ${JSON.stringify(chosen)}`);
  assert.equal(tapScore, -10, `bliźniak na stosie po efekcie musi dać −10 (jest ${tapScore})`);
});

test('F-90/12b: Tap 2 artefaktów (#0) na stosie blokuje Crew (#1) na Bladewheel Chariot', () => {
  const state = chariotBoard();
  const tapCmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'chariot' && c.abilityIndex === 0);
  assert.ok(tapCmd, 'zdolność Tap 2 artefaktów (#0) dostępna przed aktywacją');
  assert.equal(execute(state, tapCmd).ok, true);

  const bot = createHeuristicBot({ seed: 1, registry });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  const crewScore = bot.trace().at(-1)?.options
    ?.find((o) => o.cmd.includes('chariot#1'))?.score;
  assert.equal(chosen?.type, 'pass_priority', `bot powinien przepuścić #0 ze stosu, zamiast odpalać Crew #1: ${JSON.stringify(chosen)}`);
  assert.equal(crewScore, -10, `Crew #1 przy #0 na stosie musi dać −10 (jest ${crewScore})`);
});

test('F-90/12c: ANTY-OVER-FIX — dwie zdolności o RÓŻNYCH grantach (lifelink vs flying) nie blokują się wzajemnie', () => {
  const state = createGameState({ seed: 9012, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'beginning_of_combat', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const abilities = [
    { type: 'activated', timing: 'instant', cost: {}, effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['lifelink'] } },
    { type: 'activated', timing: 'instant', cost: {}, effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['flying'] } },
  ];
  put(state, 'dual', 'leafcrown-dryad', 'p1', 'battlefield', { power: 3, toughness: 3, keywords: [], abilities });
  state.objects.set('dual', Object.freeze({ ...state.objects.get('dual'), summoningSickness: false }));
  put(state, 'opp', 'leafcrown-dryad', 'p2', 'battlefield', { keywords: [] });
  const firstCmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'dual' && c.abilityIndex === 0);
  assert.ok(firstCmd);
  assert.equal(execute(state, firstCmd).ok, true);

  const bot = createHeuristicBot({ seed: 1, registry });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'activate_ability', 'druga zdolność daje inny keyword (flying) — nie jest bliźniakiem');
  assert.equal(chosen?.abilityIndex, 1);
});
