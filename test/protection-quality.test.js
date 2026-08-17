// M110 — ochrona przed JAKOŚCIĄ w pełnym wymiarze CR 702.16 (DEBT).
// Spare from Evil dostał w M109 tylko dwie litery: D (prewencja obrażeń)
// i B (bloki). Oracle nie zna połówek — dokładamy T (celowanie, CR 702.16b)
// i E (odłączanie i zakaz załączania, CR 702.16c).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 110, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, equipment: def.equipment,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: extra.abilities ?? [], keywords: [], subtypes: extra.subtypes ?? [],
    types: ['Creature'], colors: extra.colors ?? [], cardName: extra.cardName ?? 'Testowy stwór',
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Stan po rozstrzygnięciu Spare from Evil (ochrona stworów p1 przed nie-Ludźmi). */
function withProtection(state) {
  putCard(state, 'spare', 'spare-from-evil', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'spare');
  execute(state, cast);
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    execute(state, view.legalCommands.find((c) => c.type === 'pass_priority'));
  }
  return state;
}

// Zdolność „{T}: 1 obrażenie dowolnemu celowi\" na stwórze testowym.
const PING = [Object.freeze({
  type: 'activated', timing: 'instant', keyword: null,
  cost: Object.freeze({ tap: true }),
  effect: Object.freeze({ type: 'damage', amount: 1 }),
  targets: Object.freeze([Object.freeze({ type: 'creature' })]),
  trigger: null, cycling: null, condition: null, pump: null,
  keywords: null, oncePerTurn: false, mustAttack: false,
})];

test('CR 702.16b: zdolność stwora NIE-Człowieka nie może celować w chronionego', () => {
  const state = newState();
  putBlank(state, 'moj', 'p1');
  putBlank(state, 'zombie', 'p2', { subtypes: ['Zombie'], abilities: PING });
  withProtection(state);
  state.turn.priorityPlayerId = 'p2';
  const offers = playerView(state, 'p2').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'zombie');
  assert.ok(!offers.some((c) => (c.targets ?? []).includes('moj')),
    'chroniony stwór nie może być OFEROWANY jako cel zdolności nie-Człowieka');
  const forced = execute(state, {
    type: 'activate_ability', playerId: 'p2', objectId: 'zombie', abilityIndex: 0, targets: ['moj'],
  });
  assert.equal(forced.ok, false, 'engine odrzuca też wymuszoną komendę (oferta = walidacja)');
});

test('CR 702.16b: zdolność stwora-CZŁOWIEKA celuje normalnie (anty-over-fix)', () => {
  const state = newState();
  putBlank(state, 'moj', 'p1');
  putBlank(state, 'czlowiek', 'p2', { subtypes: ['Human'], abilities: PING });
  withProtection(state);
  state.turn.priorityPlayerId = 'p2';
  const offers = playerView(state, 'p2').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'czlowiek');
  assert.ok(offers.some((c) => (c.targets ?? []).includes('moj')),
    'ochrona dotyczy wyłącznie nie-Ludzi');
});

test('CR 702.16b: CZAR nie jest stworem — chroniony stwór dalej jest jego celem', () => {
  const state = newState();
  putBlank(state, 'moj', 'p1');
  withProtection(state);
  putCard(state, 'chill', 'chill-of-the-grave', 'p2', 'hand');
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 3, { colors: ['U'] });
  const casts = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'chill');
  assert.ok(casts.some((c) => (c.targets ?? []).includes('moj')),
    'ochrona przed STWORAMI nie chroni przed czarami (CR 702.16b — jakość źródła)');
});

test('CR 702.16c: załącznik o chronionej jakości odpada od permanentu', () => {
  const state = newState();
  putBlank(state, 'nosiciel', 'p1');
  putCard(state, 'sprzet', 'greatsword-of-tyr', 'p1');
  state.objects.set('sprzet', Object.freeze({ ...state.objects.get('sprzet'), attachedTo: 'nosiciel' }));
  // Ochrona przed JAKOŚCIĄ „Equipment\" (deskryptor generyczny — nie nazwa karty).
  state.untilEndOfTurnProtections = [Object.freeze({
    controllerId: 'p1', objectIds: Object.freeze(['nosiciel']),
    quality: Object.freeze({ subtype: 'Equipment' }),
  })];
  runStateBasedActions(state);
  assert.equal(state.objects.get('sprzet').attachedTo, null,
    'sprzęt o chronionej jakości odpada (CR 702.16c)');
});

test('Spare from Evil: karta bez ograniczeń — pełne DEBT (CR 702.16)', () => {
  const def = REGISTRY.get('spare-from-evil');
  assert.deepEqual(def.support.limitations, [],
    'po M110 ochrona jakościowa obejmuje D (obrażenia), E (załączniki), B (bloki) i T (celowanie)');
});
