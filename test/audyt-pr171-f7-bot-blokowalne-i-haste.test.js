import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { detainUntilYourNextTurn } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: over.kind ?? data.kind, power: over.power ?? data.power,
    toughness: over.toughness ?? data.toughness, manaCost: over.manaCost ?? data.manaCost,
    spell: data.spell, abilities: over.abilities ?? data.abilities ?? [],
    keywords: over.keywords ?? def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: over.summoningSickness ?? false,
    tapped: over.tapped ?? false,
  }));
  return state.objects.get(id);
}

function pendShaman(state, candidates) {
  const shamanDef = REGISTRY.get('battle-rattle-shaman');
  const shaman = state.objects.get('shaman');
  state.pendingTriggerTargets.push({
    playerId: 'p1',
    sourceId: shaman.id,
    cardId: shaman.cardId,
    ability: shamanDef.abilities[0],
    candidates: [...candidates],
    allowNone: true,
    fixedTargetIds: [],
    extra: {},
    restorePriorityTo: 'p1',
  });
}

test('F-7/1 (CR 509.1b): blokowalne nie marnuje slotu naziemnego blokera na nieblokowalnego lotnika i nie posyła stwora 2/2 pod 2/3', () => {
  const state = createGameState({ seed: 1209, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';

  put(state, 'flyer33', 'makindi-aeronaut', 'p1', { power: 3, toughness: 3, keywords: ['flying'] });
  put(state, 'bear22', 'coralhelm-guide', 'p1', { power: 2, toughness: 2, keywords: [] });
  put(state, 'wall23', 'coralhelm-guide', 'p2', { power: 2, toughness: 3, keywords: [] });

  const chosen = createHeuristicBot({ seed: 1209 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.type, 'declare_attackers');
  assert.deepEqual(chosen.attackerIds, ['flyer33'],
    `bot musi zaatakować wyłącznie lotnikiem 3/3 zamiast samobójczo oddawać 2/2 naziemnemu blokerowi 2/3: ${JSON.stringify(chosen.attackerIds)}`);
});

test('F-7/2 (CR 702.10): zamiarAtakuWybranego uwzględnia stwora z Haste i summoningSickness=true przy wyborze celu Battle-Rattle Shamana', () => {
  const state = createGameState({ seed: 1209, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'beginning_of_combat', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';

  put(state, 'shaman', 'battle-rattle-shaman', 'p1', { power: 2, toughness: 2, tapped: true });
  put(state, 'haste-flyer', 'makindi-aeronaut', 'p1', {
    power: 2, toughness: 2, keywords: ['flying', 'haste'], summoningSickness: true,
  });
  put(state, 'stay-ground', 'coralhelm-guide', 'p1', {
    power: 3, toughness: 3, keywords: [], summoningSickness: false,
  });
  put(state, 'foe-giant', 'coralhelm-guide', 'p2', {
    power: 4, toughness: 5, keywords: [], summoningSickness: false,
  });
  pendShaman(state, ['haste-flyer', 'stay-ground']);

  const chosen = createHeuristicBot({ seed: 1209 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, 'haste-flyer',
    `bot musi dać +2/+0 atakującemu lotnikowi z Haste zamiast stojącemu 3/3 przed 4/5: wybrano ${chosen.targetId}`);
});

test('F-7/3 (CR 508.1 + CR 701.35a): stwór z cantAttackStatic/detained dostaje karę -60 w Battle-Rattle Shamanie i nie kradnie buffa atakującemu', () => {
  const state = createGameState({ seed: 1209, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'beginning_of_combat', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';

  put(state, 'shaman', 'battle-rattle-shaman', 'p1', { power: 2, toughness: 2, tapped: true });
  put(state, 'detained-giant', 'coralhelm-guide', 'p1', { power: 7, toughness: 7, keywords: [] });
  detainUntilYourNextTurn(state, 'detained-giant', 'p2');
  put(state, 'attacker-11', 'makindi-aeronaut', 'p1', { power: 1, toughness: 1, keywords: ['flying'] });
  pendShaman(state, ['detained-giant', 'attacker-11']);

  const chosen = createHeuristicBot({ seed: 1209 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, 'attacker-11',
    `bot nie może dać +2/+0 zatrzymanemu gigantowi 7/7 kosztem atakującego 1/1: wybrano ${chosen.targetId}`);
});
