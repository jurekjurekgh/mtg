import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { setDayNight, processTriggers } from '../src/engine/triggers.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Audyt PR #49 (ADR 0016 A): luki day/night poza resolvePermanentSpell.
 * CR 702.145d/g — przy „ani dzień, ani noc": daybound → dzień; nightbound →
 * noc tylko, gdy brak daybound na polu (poprawka E5, 2026-09-10).
 * CR 702.145c — daybound wchodzący w nocy (reanimacja / search) transformuje.
 */

const REGISTRY = createCardRegistry();

function game(seed = 49) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addDayboundWolf(state, id, playerId, zone = 'battlefield') {
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-daybound-wolf', controllerId: playerId, ownerId: playerId,
    zone, kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [],
    keywords: ['daybound'], subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
    transformTo: {
      cardId: 'syn-nightbound-wolf', cardName: 'Nightbound Wolf', power: 4, toughness: 4,
      abilities: [], keywords: ['nightbound'], subtypes: ['Wolf'], types: ['Creature'], manaCost: 2,
    },
  });
}

function addNightboundWolf(state, id, playerId, zone = 'battlefield') {
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-nightbound-wolf', controllerId: playerId, ownerId: playerId,
    zone, kind: 'creature', power: 4, toughness: 4, manaCost: 2, abilities: [],
    keywords: ['nightbound'], subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
    transformTo: {
      cardId: 'syn-daybound-wolf', cardName: 'Daybound Wolf', power: 2, toughness: 2,
      abilities: [], keywords: ['daybound'], subtypes: ['Wolf'], types: ['Creature'], manaCost: 2,
    },
  });
}

function enterBattlefield(state, id) {
  const object = state.objects.get(id);
  processTriggers(state, [{
    type: 'permanent_entered_battlefield', objectId: id, object,
    cardId: object.cardId, controllerId: object.controllerId, resolved: true,
  }]);
}

function addReal(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  // Jak createCardDeck: string transformTo → dane drugiej strony (DFC).
  if (typeof card.transformTo === 'string') {
    const back = REGISTRY.get(card.transformTo);
    data.transformTo = {
      cardId: back.id, cardName: back.name, power: back.power, toughness: back.toughness,
      abilities: back.abilities ?? [], keywords: back.keywords ?? [],
      subtypes: back.subtypes ?? [], types: back.types ?? [], manaCost: back.manaCost ?? 0,
    };
  }
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone, ...data, ...extra,
  });
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 200) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pick) return false;
    if (!execute(state, pick).ok) return false;
  }
  return state.zones.stack.length === 0;
}

test('CR 702.145g: nightbound przy null BEZ daybound na polu — robi noc (bez transformu)', () => {
  // Dosłowne brzmienie (CR 2026-08-07 „The Hobbit", za mtg.wiki — ADR 0030):
  // „Any time a player controls a permanent with nightbound, if it's neither
  // day nor night and there are no permanents with daybound on the
  // battlefield, it becomes night." (Poprzedni pin zakładał dzień — wbrew
  // 702.145g; poprawione w audycie E5, 2026-09-10.)
  const state = mainPhase(game());
  assert.equal(state.dayNight, null);
  addNightboundWolf(state, 'wolf', 'p1');
  enterBattlefield(state, 'wolf');
  assert.equal(state.dayNight, 'night', 'nightbound bez daybound → noc (702.145g)');
  assert.equal(state.objects.get('wolf').cardId, 'syn-nightbound-wolf',
    'nightbound w nocy zostaje na stronie nightbound');
});

test('CR 702.145d/g: nightbound przy null, ale daybound JUŻ na polu — dzień i transform', () => {
  // Release notes Innistrad: Midnight Hunt: „If it's neither day nor night,
  // and a creature with daybound and a creature with nightbound somehow appear
  // on the battlefield at the same time, it becomes day." — dzień ma
  // pierwszeństwo; wchodzący nightbound transformuje (702.145e → day face).
  const state = mainPhase(game());
  assert.equal(state.dayNight, null);
  addDayboundWolf(state, 'wolfA', 'p1'); // już na polu bitwy (daybound)
  addNightboundWolf(state, 'wolfB', 'p2');
  enterBattlefield(state, 'wolfB');
  assert.equal(state.dayNight, 'day', 'daybound na polu → dzień');
  assert.equal(state.objects.get('wolfB').cardId, 'syn-daybound-wolf',
    'nightbound wszedł za dnia → transformuje na daybound');
});

test('CR 702.145c: daybound wchodzacy w nocy poza rzutem (reanimacja) jest nightbound', () => {
  const state = mainPhase(game());
  setDayNight(state, 'night');
  addDayboundWolf(state, 'wolf', 'p1');
  assert.equal(state.objects.get('wolf').cardId, 'syn-daybound-wolf', 'addObject nie transformuje');
  enterBattlefield(state, 'wolf');
  assert.equal(state.objects.get('wolf').cardId, 'syn-nightbound-wolf', 'wejscie w nocy = nightbound');
  assert.equal(state.objects.get('wolf').power, 4);
});

test('CR 702.145: nightbound wchodzacy za dnia jest daybound', () => {
  const state = mainPhase(game());
  setDayNight(state, 'day');
  addNightboundWolf(state, 'wolf', 'p1');
  enterBattlefield(state, 'wolf');
  assert.equal(state.objects.get('wolf').cardId, 'syn-daybound-wolf');
  assert.equal(state.objects.get('wolf').power, 2);
});

test('CR 702.145c: Ballista Watcher z grobu w nocy wchodzi jako Wielder', () => {
  const state = mainPhase(game());
  setDayNight(state, 'night');
  addReal(state, 'bw', 'ballista-watcher', 'p1', 'graveyard');
  addReal(state, 'bond', 'unbreakable-bond', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'bond');
  assert.ok(cast, 'Unbreakable Bond');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const onBf = [...state.objects.values()].filter((o) => o.zone === 'battlefield');
  const wielder = onBf.find((o) => o.cardId === 'ballista-wielder');
  const watcher = onBf.find((o) => o.cardId === 'ballista-watcher');
  assert.ok(wielder, `oczekiwano Ballista Wielder, jest: ${onBf.map((o) => o.cardId).join(',')}`);
  assert.equal(watcher, undefined, 'Watcher nie zostaje na stole w nocy');
  assert.equal(wielder.power, 5);
});
