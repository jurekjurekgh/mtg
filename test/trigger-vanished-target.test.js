import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { effectivePower } from '../src/engine/permanents.js';
import { applyEffect } from '../src/engine/effects.js';

/**
 * T6 + CR 608.2b — cel/źródło triggera, które zniknęło z pola bitwy w oknie
 * odpowiedzi (trigger czeka na stosie, przeciwnik reaguje instanitem), sprawia
 * że EFEKT nic nie robi zamiast crashować. To był crash pełnego benchmarku B0
 * po T6: „Modyfikować można tylko stwora na battlefield" (pump z prowessa na
 * źródle, które odeszło) oraz pokrewne ścieżki (damage, goad, granty,
 * sacrifice, untap, cant_block).
 */

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, zone = 'battlefield' } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone, kind: 'creature',
    power, toughness, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  return state.objects.get(id);
}

/** Rozstrzyga stos pełnymi rundami passów; przy decyzji blokującej się zatrzymuje. */
function resolveStack(state) {
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break;
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}

test('Prowess (pump): źródło zniknęło z pola bitwy w oknie odpowiedzi — trigger nic nie robi, bez crasha (B0)', () => {
  const state = game();
  addRealCard(state, 'wind', 'jeskai-windscout', 'p1', 'battlefield');
  addRealCard(state, 'sorc', 'gather-the-townsfolk', 'p1', 'hand');
  addMana(state, 'p1', 2);

  // Rzut sorcery odpala prowess (trigger pump na stosie).
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'sorc', targets: [] });
  assert.ok(cast.ok, cast.events[0]?.reason);
  const triggerIds = state.zones.stack.filter((id) => state.objects.get(id)?.kind === 'trigger');
  assert.equal(triggerIds.length, 1, 'prowess czeka na stosie');

  // W oknie odpowiedzi źródło opuszcza pole bitwy (przeniesione do grobu).
  const move = execute(state, { type: 'move_object', playerId: 'p1', objectId: 'wind', toZone: 'graveyard', newObjectId: 'wind-grave' });
  assert.ok(move.ok, move.events[0]?.reason);

  // Rozstrzygnięcie stosu NIE może crashować (regresja: „Modyfikować można
  // tylko stwora na battlefield") — pump na znikniętym źródle = no-op.
  const events = resolveStack(state);
  assert.equal(state.zones.stack.length, 0, 'stos pusty po rozstrzygnięciu');
  assert.ok(!events.some((e) => e.type === 'stats_modified' && e.objectId === 'wind'), 'brak pumpa na znikniętym źródle');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'jeskai-windscout' && o.zone === 'graveyard'));
  // Sorcery wciąż się rozstrzygnęło (tokeny powstały) — tylko pump wygasł.
  assert.equal(state.zones.battlefield.filter((id) => state.objects.get(id).cardId === 'token_human').length, 2);
});

test('Prowess (pump): źródło żywe — trigger normalnie pumpuje +1/+1 (kontrola)', () => {
  const state = game();
  addRealCard(state, 'wind', 'jeskai-windscout', 'p1', 'battlefield');
  addRealCard(state, 'sorc', 'gather-the-townsfolk', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'sorc', targets: [] }).ok);
  const events = resolveStack(state);
  assert.equal(state.zones.stack.length, 0);
  assert.ok(events.some((e) => e.type === 'stats_modified' && e.objectId === 'wind'), 'pump zadziałał');
  const updated = state.objects.get('wind');
  assert.equal(effectivePower(updated, state), 3, '2/1 + prowess = 3/2 do końca tury');
});

test('Forge Devil: cel triggera zniknął z pola bitwy — obrażenia na niego nie przechodzą, reszta efektów tak', () => {
  const state = game();
  addSimpleCreature(state, 'c1', 'p1', { power: 1, toughness: 1 });
  addRealCard(state, 'devil', 'forge-devil', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });

  // ETB: trigger z obowiązkowym celem — kontroler wybiera c1.
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'devil' }).ok);
  resolveStack(state); // rozstrzyga rzut; staje na decyzji celu
  assert.equal(state.pendingTriggerTargets.length, 1);
  const r = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'c1' });
  assert.ok(r.ok, r.events[0]?.reason);
  assert.equal(state.zones.stack.length, 1, 'trigger obrażeń czeka na stosie');

  // W oknie odpowiedzi cel ginie (kontroler przenosi swojego stwora do grobu).
  const move = execute(state, { type: 'move_object', playerId: 'p1', objectId: 'c1', toZone: 'graveyard', newObjectId: 'c1-grave' });
  assert.ok(move.ok, move.events[0]?.reason);

  // Rozstrzygnięcie: bez crasha — cel nielegalny (CR 608.2b) => brak obrażeń
  // na c1; efekt bezcelowy (1 dmg do kontrolera) wciąż działa.
  const events = resolveStack(state);
  assert.equal(state.zones.stack.length, 0);
  assert.ok(!events.some((e) => e.type === 'damage_dealt' && e.target === 'c1'), 'brak obrażeń na znikniętym celu');
  assert.equal(state.players[0].life, 19, '1 obrażeń do kontrolera wciąż przeszło');
  assert.equal(state.pendingTriggerTargets.length, 0);
});

test('Efekty triggerów z nielegalnym celem = no-op zamiast throw (CR 608.2b)', () => {
  const state = game();
  // Źródło, które odeszło z pola bitwy — LKI stub jak w resolveTriggerEntry.
  const stub = Object.freeze({
    id: 'gone-source', controllerId: 'p1', cardId: 'highland-game', zone: 'none', kind: null,
    power: 1, toughness: 1, powerModifier: 0, toughnessModifier: 0, faceDown: false,
    counters: {}, formerCounters: {}, keywords: [], abilities: [], types: [],
  });
  const cases = [
    { effect: { type: 'pump', power: 5, toughness: 5 }, targets: ['gone-target'], label: 'pump' },
    { effect: { type: 'goad' }, targets: ['gone-target'], label: 'goad' },
    { effect: { type: 'grant_abilities', abilities: [] }, targets: ['gone-target'], label: 'grant_abilities' },
    { effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['flying'] }, targets: ['gone-target'], label: 'grant_keywords' },
    { effect: { type: 'sacrifice_permanent' }, targets: ['gone-target'], label: 'sacrifice_permanent' },
    { effect: { type: 'untap_permanent' }, targets: ['gone-target'], label: 'untap_permanent' },
    { effect: { type: 'cant_block' }, targets: ['gone-target'], label: 'cant_block' },
    { effect: { type: 'cant_be_blocked' }, targets: ['gone-target'], label: 'cant_be_blocked' },
    { effect: { type: 'damage', amount: 2 }, targets: ['gone-target'], label: 'damage' },
    { effect: { type: 'pump_food_result' }, targets: ['gone-target'], label: 'pump_food_result' },
    { effect: { type: 'turn_face_up' }, targets: [], label: 'turn_face_up (źródło zniknęło)' },
  ];
  for (const { effect, targets, label } of cases) {
    assert.doesNotThrow(() => applyEffect(state, effect, stub, targets), `${label}: no-op zamiast throw`);
  }
  // Stub-źródło dla turn_face_up też nie crashuje.
  assert.doesNotThrow(() => applyEffect(state, { type: 'turn_face_up' }, stub, []));
});
