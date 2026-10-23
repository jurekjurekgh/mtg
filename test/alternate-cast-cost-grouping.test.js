import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import {
  buildActionEntries, choiceGroupLabel, choiceGroupTitle,
} from '../src/table/render.js';
import { costSymbols, manaCostHtml } from '../src/table/mana-icons.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 1023, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'hand') {
  const card = registry.get(cardId);
  assert.ok(card, `${cardId} is registered`);
  addObject(state, {
    ...gameObjectDataOf(card),
    id,
    instanceId: `i-${id}`,
    cardId,
    controllerId,
    ownerId: controllerId,
    zone,
    types: card.types ?? [],
    subtypes: card.subtypes ?? [],
    keywords: card.keywords ?? [],
  });
}

function session(state) {
  return {
    nameOf: (cardId) => registry.get(cardId)?.name ?? String(cardId),
    nameOfObject: (objectId) => state.objects.get(objectId)?.cardName ?? String(objectId),
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
    state,
  };
}

function requestFor(state, predicate) {
  const view = playerView(state, 'p1');
  const actionSession = session(state);
  const entries = buildActionEntries(view.legalCommands, actionSession, view);
  const entry = entries.find((candidate) => candidate.request?.options?.some(predicate));
  assert.ok(entry, 'a grouped cast offer is present in the action list');
  return { request: entry.request, view, session: actionSession, entries };
}

function boulderState(mana) {
  const state = game();
  state.spellsCastThisTurnByPlayer = { p1: 1, p2: 0 };
  addMana(state, 'p1', mana, { colors: ['R'] });
  put(state, 'salvo', 'boulder-salvo');
  put(state, 'target-a', 'razorfoot-griffin', 'p2', 'battlefield');
  put(state, 'target-b', 'razorfoot-griffin', 'p1', 'battlefield');
  return state;
}

test('Surge spell offers are grouped separately and each title shows its own cost', () => {
  const state = boulderState(5); // both {4}{R} and Surge {1}{R} are payable
  const view = playerView(state, 'p1');
  const actionSession = session(state);
  const entries = buildActionEntries(view.legalCommands, actionSession, view)
    .filter((entry) => entry.request?.options?.some((cmd) => cmd.objectId === 'salvo'));

  assert.equal(entries.length, 2, 'regular and Surge casts have distinct target groups');
  const surgeEntry = entries.find((entry) => entry.request.options.some((cmd) => cmd.surgeCast));
  const regularEntry = entries.find((entry) => entry.request.options.every((cmd) => !cmd.surgeCast));
  assert.ok(surgeEntry, 'a separate Surge target group exists');
  assert.ok(regularEntry, 'a separate regular target group exists');
  assert.ok(surgeEntry.request.options.every((cmd) => cmd.surgeCast), 'Surge group has no regular-cast options');
  assert.ok(regularEntry.request.options.every((cmd) => !cmd.surgeCast), 'regular group has no Surge options');

  const surgeText = choiceGroupTitle(surgeEntry.request, actionSession, view);
  const regularText = choiceGroupTitle(regularEntry.request, actionSession, view);
  assert.match(surgeText, /Boulder Salvo \(surge\)/);
  assert.ok(surgeText.includes(`(koszt ${costSymbols(2, ['R'])})`), surgeText);
  assert.ok(!surgeText.includes(`(koszt ${MANA_COSTS['boulder-salvo']})`), surgeText);
  assert.ok(regularText.includes(`(koszt ${MANA_COSTS['boulder-salvo']})`), regularText);

  const surgePanel = choiceGroupLabel(surgeEntry.request, actionSession, view);
  const regularPanel = choiceGroupLabel(regularEntry.request, actionSession, view);
  assert.ok(surgePanel.includes(manaCostHtml(costSymbols(2, ['R']))), surgePanel);
  assert.ok(!surgePanel.includes(manaCostHtml(MANA_COSTS['boulder-salvo'])), surgePanel);
  assert.ok(regularPanel.includes(manaCostHtml(MANA_COSTS['boulder-salvo'])), regularPanel);

  const surgeOnlyState = boulderState(2);
  const surgeOnly = requestFor(surgeOnlyState, (cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'salvo');
  assert.ok(surgeOnly.request.options.every((cmd) => cmd.surgeCast), 'at two mana only Surge is offered');
  assert.ok(choiceGroupTitle(surgeOnly.request, surgeOnly.session, surgeOnly.view).includes('{1}{R}'));
});

test('Cleave target-group title uses the cleave cost, not the printed cost', () => {
  const state = game();
  addMana(state, 'p1', 4, { colors: ['U'] });
  put(state, 'rejection', 'lunar-rejection');
  put(state, 'target-a', 'razorfoot-griffin', 'p2', 'battlefield');
  put(state, 'target-b', 'razorfoot-griffin', 'p1', 'battlefield');
  const { request, view, session: actionSession } = requestFor(
    state,
    (cmd) => cmd.type === 'cast_cleave' && cmd.objectId === 'rejection',
  );
  assert.ok(request.options.every((cmd) => cmd.type === 'cast_cleave'));

  const cleaveCost = costSymbols(4, ['U']);
  const title = choiceGroupTitle(request, actionSession, view);
  assert.ok(title.includes(`(koszt ${cleaveCost})`), title);
  assert.ok(!title.includes(`(koszt ${MANA_COSTS['lunar-rejection']})`), title);
  assert.ok(choiceGroupLabel(request, actionSession, view).includes(manaCostHtml(cleaveCost)));
});

test('Bestow target-group title includes the Bestow alternative cost', () => {
  const state = game();
  addMana(state, 'p1', 4, { colors: ['G'] });
  put(state, 'dryad', 'leafcrown-dryad');
  put(state, 'target-a', 'razorfoot-griffin', 'p2', 'battlefield');
  put(state, 'target-b', 'razorfoot-griffin', 'p1', 'battlefield');
  const { request, view, session: actionSession } = requestFor(
    state,
    (cmd) => cmd.type === 'cast_permanent' && cmd.objectId === 'dryad' && cmd.bestow,
  );
  assert.ok(request.options.every((cmd) => cmd.bestow), 'all options in the group cast for Bestow');

  const bestowCost = costSymbols(4, ['G']);
  const title = choiceGroupTitle(request, actionSession, view);
  assert.match(title, /Bestow: Leafcrown Dryad/);
  assert.ok(title.includes(`(koszt ${bestowCost})`), title);
  assert.ok(!title.includes(`(koszt ${MANA_COSTS['leafcrown-dryad']})`), title);
  assert.ok(choiceGroupLabel(request, actionSession, view).includes(manaCostHtml(bestowCost)));
});

test('Escape target-group title names the card and its Escape mana cost', () => {
  const state = game();
  addMana(state, 'p1', 4, { colors: ['U'] });
  put(state, 'sweet', 'sweet-oblivion', 'p1', 'graveyard');
  for (let i = 0; i < 4; i += 1) put(state, `exile-${i}`, 'goblin-piker', 'p1', 'graveyard');
  const { request, view, session: actionSession } = requestFor(
    state,
    (cmd) => cmd.type === 'cast_escape' && cmd.objectId === 'sweet',
  );
  assert.ok(request.options.length > 1, 'Escape target/cost choices are grouped');

  const escapeCost = costSymbols(4, ['U']);
  const title = choiceGroupTitle(request, actionSession, view);
  assert.match(title, /Sweet Oblivion.*Escape/s);
  assert.ok(title.includes(`(koszt ${escapeCost})`), title);
  assert.ok(choiceGroupLabel(request, actionSession, view).includes(manaCostHtml(escapeCost)));
});
