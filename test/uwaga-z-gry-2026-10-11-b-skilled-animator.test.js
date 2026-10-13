import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// Uwaga z gry B (2026-10-11): Skilled Animator jest kartą payoffową.
// Głównym sensem 1/3 za {2}{U} jest zamiana użytecznego własnego artefaktu
// w 5/5. Bez takiego celu bot ma zachować kartę, nawet gdy ma już trzy duże
// zwykłe kreatury. Wyjątek: awaryjny bloker, który ratuje niski poziom życia
// przed lethalnym atakiem w następnej turze. Reguła ma wynikać z deskryptora
// ETB `animate_linked`, nie z id/nazwy Skilled Animatora (ADR 0002).

const REGISTRY = createCardRegistry();

function putAnimator(state) {
  const def = REGISTRY.get('skilled-animator');
  addObject(state, {
    id: 'animator', instanceId: 'i-animator', cardId: def.id,
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def),
  });
}

function putCreature(state, id, controllerId, power, toughness, { artifact = false, keywords = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`,
    controllerId, ownerId: controllerId, zone: 'battlefield', kind: 'creature',
    power, toughness, manaCost: 2,
    types: artifact ? ['Artifact', 'Creature'] : ['Creature'],
    subtypes: [], colors: [], abilities: [], keywords,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function putArtifact(state, id) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`,
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact',
    manaCost: 2, types: ['Artifact'], subtypes: [], colors: [], abilities: [], keywords: [],
  });
}

function scene({ life = 20 } = {}) {
  const state = createGameState({ seed: 211, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main2', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  state.players.find((p) => p.id === 'p1').life = life;
  addMana(state, 'p1', 3, { colors: ['U'] });
  putAnimator(state);
  return state;
}

function decision(state, params = {}) {
  const bot = createHeuristicBot({ seed: 211, params });
  const choice = bot.chooseCommand(playerView(state, 'p1'), {});
  return { choice, options: bot.trace().at(-1)?.options ?? [] };
}

function score(options, command) {
  const found = options.find((o) => o.cmd === command);
  assert.ok(found, `brak oferty ${command}: ${JSON.stringify(options)}`);
  return found.score;
}

test('B1 RED: trzy duże własne kreatury, zero artefaktów — Skilled Animator czeka', () => {
  const state = scene();
  putCreature(state, 'mine-a', 'p1', 5, 5);
  putCreature(state, 'mine-b', 'p1', 4, 6);
  putCreature(state, 'mine-c', 'p1', 6, 4);
  const { choice, options } = decision(state);

  assert.ok(score(options, 'cast_permanent(animator)') < score(options, 'pass_priority'),
    `ciało 1/3 nie usprawiedliwia zmarnowania głównego ETB: ${JSON.stringify(options)}`);
  assert.equal(choice.type, 'pass_priority', `bot ma zachować Animatora: ${JSON.stringify(choice)}`);
});

test('B2: zero artefaktów i blokerów, niski life pod lethalnym 6/6 — awaryjne 1/3 jest uzasadnione', () => {
  const state = scene({ life: 5 });
  putCreature(state, 'foe', 'p2', 6, 6);
  const { choice, options } = decision(state);

  assert.ok(score(options, 'cast_permanent(animator)') > score(options, 'pass_priority'),
    `Animator jako chump-bloker ratuje następną rundę: ${JSON.stringify(options)}`);
  assert.equal(choice.type, 'cast_permanent', `przy lethalnym crackbacku trzeba wystawić blokera: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'animator');
});

test('B2b: nawet 12/12 uzasadnia awaryjne 1/3, jeśli chump-block faktycznie zatrzyma lethal', () => {
  const state = scene({ life: 5 });
  putCreature(state, 'foe', 'p2', 12, 12);
  const { choice } = decision(state);
  assert.equal(choice.type, 'cast_permanent');
  assert.equal(choice.objectId, 'animator');
});

test('B2c: lethalny latacz poza zasięgiem 1/3 — wyjątek blokera nie może odpalić', () => {
  const state = scene({ life: 5 });
  putCreature(state, 'foe', 'p2', 6, 6, { keywords: ['flying'] });
  const { choice } = decision(state);
  assert.equal(choice.type, 'pass_priority',
    `Animator bez flying/reach nie ratuje przed lataczem: ${JSON.stringify(choice)}`);
});

test('B3: zero artefaktów i blokerów, ale 20 życia — sama obecność dużego wroga nie wystarcza', () => {
  const state = scene({ life: 20 });
  putCreature(state, 'foe', 'p2', 6, 6);
  const { choice } = decision(state);
  assert.equal(choice.type, 'pass_priority',
    `bez niskiego życia bot ma czekać na artefakt, nie wystawiać 1/3: ${JSON.stringify(choice)}`);
});

test('B4: własny nie-stwór artefakt — główny payoff 5/5 uzasadnia rzut', () => {
  const state = scene();
  putArtifact(state, 'relic');
  const { choice, options } = decision(state);

  assert.ok(score(options, 'cast_permanent(animator)') > score(options, 'pass_priority'));
  assert.equal(choice.type, 'cast_permanent');
  assert.equal(choice.objectId, 'animator');
});

test('B5 RED: jedyny artefakt to duże 4/4 artifact creature — nie marnuj potencjału na +1/+1', () => {
  const state = scene();
  putCreature(state, 'large-artifact', 'p1', 4, 4, { artifact: true });
  const { choice, options } = decision(state);

  assert.ok(score(options, 'cast_permanent(animator)') < score(options, 'pass_priority'),
    `duże artifact creature nie jest wartościowym celem animacji 5/5: ${JSON.stringify(options)}`);
  assert.equal(choice.type, 'pass_priority');
});

test('B6: małe 3/3 artifact creature jest wartościowym celem 5/5', () => {
  const state = scene();
  putCreature(state, 'small-artifact', 'p1', 3, 3, { artifact: true });
  const { choice } = decision(state);
  assert.equal(choice.type, 'cast_permanent');
  assert.equal(choice.objectId, 'animator');
});

test('B7/M429: pokrętło ×0 dowodzi, że to kara braku payoffu odwraca decyzję', () => {
  const state = scene();
  const normal = decision(state);
  const withoutPenalty = decision(state, { linkedAnimationFutilePenalty: 0 });

  assert.equal(normal.choice.type, 'pass_priority');
  assert.equal(withoutPenalty.choice.type, 'cast_permanent',
    `bez kary wraca historyczna wycena samego 1/3: ${JSON.stringify(withoutPenalty.options)}`);
  assert.ok(score(normal.options, 'cast_permanent(animator)') < 0);
  assert.ok(score(withoutPenalty.options, 'cast_permanent(animator)') > 0);
});
