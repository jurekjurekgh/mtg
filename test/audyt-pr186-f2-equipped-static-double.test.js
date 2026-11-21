// Audyt PR #186 — F-186/2 (CR 301.5a): `equippedStaticPumpOf` podwajał bonus
// `condition.equipped` (+1/+1 na Leonin Lightbringer), gdy stwór miał już
// przyłączony inny sprzęt. Bezwartościowy drugi sprzęt punktował dodatnio
// zamiast `nothingAdded` (−12), a zdjęcie jednego z dwóch sprzętów zaniżało
// zysk przeniesienia przez urojoną utratę `+1/+1`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { attachAuraToCreature, attachEquipmentToCreature } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { addMana } from '../src/engine/resources.js';
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

function main1State() {
  const state = createGameState({ seed: 1862, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  for (let i = 0; i < 15; i += 1) put(state, `lib-${i}`, 'leafcrown-dryad', 'p1', 'library');
  put(state, 'opp', 'leafcrown-dryad', 'p2', 'battlefield');
  return state;
}

function optionScore(bot, prefix) {
  const trace = bot.trace().at(-1);
  return trace?.options?.find((o) => o.cmd.startsWith(prefix))?.score;
}

test('F-186/2a: Leonin już wyposażony w inny sprzęt nie dostaje drugiego +1/+1 przy ocenie kolejnego (CR 301.5a)', () => {
  const state = main1State();
  put(state, 'leo', 'leonin-lightbringer', 'p1', 'battlefield');
  put(state, 'eqA', 'cloak-of-the-bat', 'p1', 'battlefield');
  attachEquipmentToCreature(state, 'eqA', 'leo'); // 4/3 flying
  put(state, 'eqB', 'thieves-tools', 'p1', 'battlefield'); // maxPower 3 → martwe na 4/3

  const bot = createHeuristicBot({ seed: 1, registry });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  const score = optionScore(bot, 'activate_ability(eqB#0->leo)');
  assert.equal(chosen?.type, 'pass_priority', `bot nie ma płacić {2} za martwy drugi sprzęt: ${JSON.stringify(chosen)}`);
  assert.ok(score < 0, `drugi sprzęt nic nie dodaje (nothingAdded, nie +18): wynik ${score}`);
});

test('F-186/2b: aura na Leoninie NIE jest sprzętem — pierwsze wyposażenie wciąż widzi +1/+1 (CR 301.5a)', () => {
  const state = main1State();
  put(state, 'leo', 'leonin-lightbringer', 'p1', 'battlefield');
  put(state, 'aura', 'messengers-speed', 'p1', 'battlefield');
  attachAuraToCreature(state, 'aura', 'leo'); // dalej 3/2 (nie equipped)
  put(state, 'eq', 'thieves-tools', 'p1', 'battlefield'); // 3/2 ≤ 3 → daje ewazję ORAZ +1/+1

  const bot = createHeuristicBot({ seed: 1, registry });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  const score = optionScore(bot, 'activate_ability(eq#0->leo)');
  assert.equal(chosen?.type, 'activate_ability', 'pierwszy sprzęt aktywuje warunek equipped nawet przy aurze');
  assert.ok(score > 10, `wyposażenie podnosi 3/2 → 4/3 i włącza +1/+1: wynik ${score}`);
});

test('F-186/2c: zdjęcie jednego z dwóch sprzętów z Leonina nie odejmuje +1/+1 (drugi zostaje)', () => {
  const state = main1State();
  put(state, 'leo', 'leonin-lightbringer', 'p1', 'battlefield');
  put(state, 'eqA', 'cloak-of-the-bat', 'p1', 'battlefield');
  attachEquipmentToCreature(state, 'eqA', 'leo');
  put(state, 'eqB', 'thieves-tools', 'p1', 'battlefield');
  attachEquipmentToCreature(state, 'eqB', 'leo');
  put(state, 'van', 'leafcrown-dryad', 'p1', 'battlefield'); // 2/2 bez sprzętu

  const bot = createHeuristicBot({ seed: 1, registry });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  const moveScore = optionScore(bot, 'activate_ability(eqB#0->van)');
  assert.equal(chosen?.type, 'activate_ability');
  assert.equal(moveScore, 12, `przeniesienie z podwójnie wyposażonego Leonina = 4 + 8 = 12 (bez fałszywego −4 za hostStatic): ${moveScore}`);
});
