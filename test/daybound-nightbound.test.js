import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { setDayNight, processTriggers } from '../src/engine/triggers.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * M68 — daybound/nightbound (CR 708.9): globalny znacznik dnia/nocy.
 * Syntetyczne obiekty (brak realnych kart daybound w katalogu): front
 * „syn-daybound-wolf" 2/2 daybound → back „syn-nightbound-wolf" 4/4.
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}

/** Syntetyczny wilkołak daybound: front 2/2 daybound → back 4/4 nightbound. */
function addDayboundWolf(state, id, playerId, zone = 'battlefield', extra = {}) {
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-daybound-wolf', controllerId: playerId, ownerId: playerId, zone,
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [],
    keywords: ['daybound'], subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
    transformTo: {
      cardId: 'syn-nightbound-wolf', cardName: 'Nightbound Wolf', power: 4, toughness: 4,
      abilities: [], keywords: ['nightbound'], subtypes: ['Wolf'], types: ['Creature'],
      manaCost: 2,
    },
    ...extra,
  });
}

/** Symuluje wejście permanenta na bitwisko (zdarzenie jak z resolvePermanentSpell)
 * i odpala skan triggerów — addObject sam nie emituje zdarzenia wejścia. */
function enterBattlefield(state, id) {
  const object = state.objects.get(id);
  processTriggers(state, [{
    type: 'permanent_entered_battlefield', objectId: id, object,
    cardId: object.cardId, controllerId: object.controllerId, resolved: true,
  }]);
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 200) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const pick = pass ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

test('daybound: wejście przy nieustalonym designation ustawia dzień (CR 708.9c)', () => {
  const state = mainPhase(game());
  assert.equal(state.dayNight, null);
  addDayboundWolf(state, 'wolf', 'p1');
  enterBattlefield(state, 'wolf');
  assert.equal(state.dayNight, 'day', 'wejście daybounda robi dzień');
});

test('daybound: rzut czaru przy daybound na stole robi noc i transformuje (CR 708.9d)', () => {
  const state = mainPhase(game());
  addDayboundWolf(state, 'wolf', 'p1');
  enterBattlefield(state, 'wolf'); // → day
  assert.equal(state.dayNight, 'day');
  // rzut czaru (High Stride)
  addRealCard(state, 'hs', 'high-stride', 'p1', 'hand');
  addRealCard(state, 't', 'goblin-piker', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['G'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'high-stride', objectId: 'hs', targets: ['t'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.equal(state.dayNight, 'night', 'rzut czaru robi noc');
  const wolf = state.objects.get('wolf');
  assert.equal(wolf.cardId, 'syn-nightbound-wolf', 'daybound transformowany na nightbound');
  assert.equal(wolf.power, 4);
});

test('daybound: rzut czaru bez daybounda na stole nie robi nocy', () => {
  const state = mainPhase(game());
  addRealCard(state, 'hs', 'high-stride', 'p1', 'hand');
  addRealCard(state, 't', 'goblin-piker', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['G'] });
  assert.equal(state.dayNight, null);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'high-stride', objectId: 'hs', targets: ['t'] });
  assert.ok(r.ok);
  assert.equal(state.dayNight, null, 'bez daybounda brak nocy');
});

test('daybound: upkeep aktywnego w nocy bez czaru w jego poprzedniej turze robi dzień (CR 708.9f)', () => {
  const state = mainPhase(game());
  addDayboundWolf(state, 'wolf', 'p1');
  processTriggers(state, state.events); // → day
  setDayNight(state, 'night'); // symuluj noc (transform do nightbound)
  assert.equal(state.objects.get('wolf').cardId, 'syn-nightbound-wolf');
  // aktywny p1 bez czarów w poprzedniej turze
  state.lastTurnSpellsCastByPlayer = { p1: 0, p2: 3 };
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  assert.equal(state.dayNight, 'day', 'upkeep bez czarów robi dzień');
  assert.equal(state.objects.get('wolf').cardId, 'syn-daybound-wolf', 'nightbound transformowany z powrotem');
  assert.equal(state.objects.get('wolf').power, 2);
});

test('daybound: upkeep w nocy Z czarem aktywnego w poprzedniej turze zostaje nocą', () => {
  const state = mainPhase(game());
  setDayNight(state, 'night');
  state.lastTurnSpellsCastByPlayer = { p1: 2, p2: 0 };
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  assert.equal(state.dayNight, 'night', 'rzut w poprzedniej turze utrzymuje noc');
});

test('daybound: permanent wchodzący w nocy wchodzi jako nightbound', () => {
  const state = mainPhase(game());
  setDayNight(state, 'night');
  addDayboundWolf(state, 'wolf2', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', cardId: 'syn-daybound-wolf', objectId: 'wolf2' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state);
  const wolf = [...state.objects.values()].find((o) => o.cardId === 'syn-nightbound-wolf' && o.zone === 'battlefield');
  assert.ok(wolf, 'wszedł jako nightbound');
  assert.equal(wolf.power, 4);
});

test('daybound: zwykły transform DFC (Civilized Scholar) nie rusza się przy zmianie dnia/nocy', () => {
  const state = mainPhase(game());
  addRealCard(state, 'scholar', 'civilized-scholar', 'p1', 'battlefield');
  const before = state.objects.get('scholar').cardId;
  setDayNight(state, 'night');
  assert.equal(state.objects.get('scholar').cardId, before, 'Civilized Scholar bez keyworda daybound — nietknięty');
  setDayNight(state, 'day');
  assert.equal(state.objects.get('scholar').cardId, before);
});

test('daybound: dayNight jest publiczne w PlayerView i w fingerprint', () => {
  const state = mainPhase(game());
  addDayboundWolf(state, 'wolf', 'p1');
  enterBattlefield(state, 'wolf'); // → day
  for (const pid of ['p1', 'p2']) {
    assert.equal(playerView(state, pid).dayNight, 'day', `${pid} widzi designation`);
  }
  const fp = JSON.parse(stateFingerprint(state));
  assert.equal(fp.dayNight, 'day', 'fingerprint obejmuje dayNight (determinizm replay)');
  setDayNight(state, 'night');
  assert.equal(JSON.parse(stateFingerprint(state)).dayNight, 'night');
});

test('daybound: setDayNight emituje day_night_changed i transformuje globalnie', () => {
  const state = mainPhase(game());
  addDayboundWolf(state, 'w1', 'p1');
  addDayboundWolf(state, 'w2', 'p2');
  enterBattlefield(state, 'w1'); // → day
  const events = setDayNight(state, 'night');
  assert.ok(events.some((e) => e.type === 'day_night_changed' && e.designation === 'night'));
  assert.equal(state.objects.get('w1').cardId, 'syn-nightbound-wolf');
  assert.equal(state.objects.get('w2').cardId, 'syn-nightbound-wolf', 'obaj gracze — transform globalny');
});
