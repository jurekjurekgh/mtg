import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyDayNightAtTurnStart, setDayNight } from '../src/engine/triggers.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function game(seed = 47) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addDayboundWolf(state, id, playerId) {
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-daybound-wolf', controllerId: playerId, ownerId: playerId,
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [],
    keywords: ['daybound'], subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
    transformTo: {
      cardId: 'syn-nightbound-wolf', cardName: 'Nightbound Wolf', power: 4, toughness: 4,
      abilities: [], keywords: ['nightbound'], subtypes: ['Wolf'], types: ['Creature'], manaCost: 2,
    },
  });
}

function addReal(state, id, cardId, playerId, zone) {
  const card = REGISTRY.get(cardId);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone, ...data,
  });
}

test('CR 502.2: rzut czaru przy daybound NIE robi nocy natychmiast', () => {
  const state = mainPhase(game());
  addDayboundWolf(state, 'wolf', 'p1');
  state.dayNight = 'day';
  addReal(state, 'hs', 'high-stride', 'p1', 'hand');
  addReal(state, 't', 'goblin-piker', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['G'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'high-stride', objectId: 'hs', targets: ['t'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.equal(state.dayNight, 'day', 'noc dopiero na poczatku nastepnej tury');
  assert.equal(state.objects.get('wolf').cardId, 'syn-daybound-wolf');
});

test('CR 502.2: dzien + 0 czarow poprzedniego aktywnego -> noc przed untapem', () => {
  const state = mainPhase(game());
  addDayboundWolf(state, 'wolf', 'p1');
  setDayNight(state, 'day');
  state.lastTurnSpellsCastByPlayer = { p1: 0, p2: 0 };
  const ev = applyDayNightAtTurnStart(state, 'p1');
  assert.ok(ev.some((e) => e.type === 'day_night_changed' && e.designation === 'night'));
  assert.equal(state.dayNight, 'night');
  assert.equal(state.objects.get('wolf').cardId, 'syn-nightbound-wolf');
});

test('CR 502.2: noc + 2 czary poprzedniego aktywnego -> dzien', () => {
  const state = mainPhase(game());
  addDayboundWolf(state, 'wolf', 'p1');
  setDayNight(state, 'night');
  state.lastTurnSpellsCastByPlayer = { p1: 2 };
  applyDayNightAtTurnStart(state, 'p1');
  assert.equal(state.dayNight, 'day');
  assert.equal(state.objects.get('wolf').cardId, 'syn-daybound-wolf');
});

test('CR 502.2: noc + 1 czar poprzedniego aktywnego zostaje noca', () => {
  const state = mainPhase(game());
  setDayNight(state, 'night');
  state.lastTurnSpellsCastByPlayer = { p1: 1 };
  applyDayNightAtTurnStart(state, 'p1');
  assert.equal(state.dayNight, 'night');
});

test('Soulbright: 3. resolve dodaje {R}x8, nie bezbarwna', () => {
  const state = mainPhase(game());
  addReal(state, 'sb', 'soulbright-flamekin', 'p1', 'battlefield');
  addReal(state, 'tgt', 'goblin-piker', 'p1', 'battlefield');
  const sb = state.objects.get('sb');
  assert.ok(sb.abilities?.some((a) => a.onNthResolve?.effect?.colors?.includes('R')));
  state.objects.set('sb', Object.freeze({ ...sb, abilityResolvedThisTurn: 2 }));
  addMana(state, 'p1', 2, { colors: ['R'] });
  const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'sb');
  assert.ok(act, 'zdolnosc Soulbright oferowana');
  const r = execute(state, act);
  assert.ok(r.ok, r.events?.[0]?.reason);
  while (state.zones.stack.length > 0) {
    const holder = state.turn.priorityPlayerId;
    const pass = playerView(state, holder).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const opt = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire);
  if (opt) execute(state, opt);
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.ok((p1.manaPool?.R ?? 0) >= 8, `oczekiwano 8x R, jest ${JSON.stringify(p1.manaPool)}`);
});
