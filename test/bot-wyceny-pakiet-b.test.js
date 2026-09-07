// E2/B planu 2026-09-07 (wyceny bota): retarget, kopiowanie i darmowe rzuty —
// decyzje wielowariantowe bez case (default: finish(0) → wybór z kolejności
// ofert, klasa M131/M336):
//  1. resolve_redirect_choice (Willbender) — przekierowanie czaru wroga:
//     dotąd cel z kolejności (mógł trafić we WŁASNEGO stwora).
//  2. resolve_copy_targets (Storm) — kopia trzymałaby cel oryginału z
//     kolejności, nawet gdy na stole jest lepszy cel wrogi.
//  3. resolve_enter_as_copy — kopiowanie Ally wg KOLEJNOŚCI, nie ciała.
//  4. resolve_amass_choice — liczniki Amass dla PIERWSZEJ armii.
//  5. resolve_epic_choice — Epic Experiment: pierwsza oferta done:true →
//     bot nigdy nie rzucał darmowych czarów z wygnania.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function newState() {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function putCreature(state, id, controllerId, power, toughness, zone = 'battlefield', extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId, zone,
    kind: 'creature', power, toughness, manaCost: 3,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    cardName: id, ...(extra.spell ? { spell: extra.spell } : {}),
  });
  return state.objects.get(id);
}

function botChoice(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  return bot.chooseCommand(view);
}

test('E2/B1: Willbender — czar wroga (3 obrażenia) przekierowany we wroga, nie we własnego stwora', () => {
  const state = newState();
  putCreature(state, 'moj', 'p1', 2, 2);
  putCreature(state, 'wrogi', 'p2', 3, 3);
  // Czar wroga na stosie (publiczny): 3 obrażenia, aktualny cel = mój 1/1.
  putCreature(state, 'cel', 'p1', 1, 1);
  addObject(state, {
    id: 'spell-e', instanceId: 'i-spell-e', cardId: 'x-bolt', controllerId: 'p2', zone: 'stack',
    kind: 'spell', manaCost: 2,
    spell: { timing: 'instant', targets: [{ type: 'any_target' }], effects: [{ type: 'damage', amount: 3 }] },
    chosenTargets: ['cel'], cardName: 'x-bolt',
  });
  state.zones.stack = ['spell-e'];
  state.pendingRedirectChoice = {
    playerId: 'p1', stackId: 'spell-e', spec: { type: 'creature' },
    currentTargetId: 'cel', spellControllerId: 'p2', restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_redirect_choice');
  assert.equal(chosen.targetId, 'wrogi',
    `obrażenia wroga mają iść we wroga, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/B2: Storm — kopia 2 obrażeń: zabija DEATHTOUCH zamiast zwykłego 2/2 (wartość celu, nie kolejność)', () => {
  const state = newState();
  putCreature(state, 'moj', 'p1', 2, 2);
  putCreature(state, 'chump', 'p2', 2, 2);   // cel oryginału (zwykły 2/2)
  putCreature(state, 'threat', 'p2', 2, 2, 'battlefield', { cardId: 'x-threat' });
  state.objects.set('threat', Object.freeze({ ...state.objects.get('threat'), keywords: ['deathtouch'] }));
  addObject(state, {
    id: 'copy1', instanceId: 'i-copy1', cardId: 'x-bolt', controllerId: 'p1', zone: 'stack',
    kind: 'spell', manaCost: 2, isSpellCopy: true,
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] },
    chosenTargets: ['chump'], cardName: 'x-bolt',
  });
  state.zones.stack = ['copy1'];
  state.pendingCopyTargets = {
    playerId: 'p1',
    queue: [{ copyId: 'copy1', targetIndex: 0 }],
    specs: [{ type: 'creature' }],
    restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_copy_targets');
  assert.equal(chosen.targetId, 'threat',
    `kopia ma ubić deathtouch (wartość usuwanego), wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/B3: enter as copy — bot kopiuje najmocniejszego Ally (nie pierwszego z listy)', () => {
  const state = newState();
  putCreature(state, 'slaby', 'p1', 1, 1);
  putCreature(state, 'mocny', 'p1', 6, 6);
  state.pendingEnterAsCopy = { playerId: 'p1', candidateIds: ['slaby', 'mocny'], restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_enter_as_copy');
  assert.equal(chosen.targetId, 'mocny', `kopiujemy 6/6, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/B4: Amass — liczniki dla mocniejszej armii (nie pierwszej z listy)', () => {
  const state = newState();
  putCreature(state, 'slaby', 'p1', 1, 1);
  putCreature(state, 'mocny', 'p1', 5, 5);
  state.pendingAmass = { playerId: 'p1', armyIds: ['slaby', 'mocny'], amount: 2, restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_amass_choice');
  assert.equal(chosen.armyId, 'mocny', `amass na 5/5, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/B5: Epic Experiment — bot rzuca darmowy czar z wygnania (nie done z początku oferty)', () => {
  const state = newState();
  putCreature(state, 'wrogi', 'p2', 2, 2);
  addObject(state, {
    id: 'ex-bolt', instanceId: 'i-ex-bolt', cardId: 'x-bolt2', controllerId: 'p1', zone: 'exile',
    kind: 'spell', manaCost: 2,
    spell: { timing: 'instant', targets: [{ type: 'any_target' }], effects: [{ type: 'damage', amount: 3 }] },
    cardName: 'x-bolt2',
  });
  state.zones.exile = ['ex-bolt'];
  state.pendingEpicExperiment = { playerId: 'p1', exileIds: ['ex-bolt'], maxMV: 5, restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_epic_choice');
  assert.ok(!chosen.done, `bot ma rzucić darmowy czar, wybrał: ${JSON.stringify(chosen)}`);
});
