// Batch 59 (2026-09-24) — karty właściciela: 126 MID (dwustronna: przód i tył),
// 129 DMU, 130 THB, 131 ISD, 134 ALA, 135 BOK, 138 MID, 139 TMT, 141 RIX,
// 142 ALA — razem 10 kart / 11 wpisów arkusza.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-24,
// ADR 0010 §2a, ADR 0028 — rulingi „przy kartce", także puste listy).
// Katalog: `src/cards/card-data.js`; artId/plan: `tools/collection-art-ids.csv`
// (plan przepisany DOSŁOWNIE z arkusza właściciela — to etykieta organizacyjna
// kolekcji, nie nazwa krainy setu). Plan batcha:
// `docs/plans/PLAN_2026-09-24c-batch59-kolekcja-126-142.md`.
//
// Podział na sekcje = etapy batcha (G1.1 … G1.10). Każda sekcja ma scenariusz
// legalny, nielegalny i interakcje z istniejącym katalogiem (ADR 0010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 59, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
  return r;
}

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);

// ---- G1.1: Charismatic Vanguard (129 DMU, plan Dominaria) -------------------

test('B59/G1.1: Charismatic Vanguard — dane Oracle, koszt i druk', () => {
  const def = registry.get('charismatic-vanguard');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Dwarf', 'Soldier']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'DMU');
  assert.equal(def.plan, 'Dominaria');
  assert.equal(def.artId, 129);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('a51764fe'), 'imageUri z druku DMU (dmu/10)');
  assert.equal(MANA_COSTS['charismatic-vanguard'], '{2}{W}');
});

test('B59/G1.1: Charismatic Vanguard — {4}{W} daje całej drużynie +1/+1 do końca tury', () => {
  const state = game();
  put(state, 'vanguard', 'charismatic-vanguard', 'p1', 'battlefield');
  put(state, 'mine', 'razorfoot-griffin', 'p1', 'battlefield');
  put(state, 'theirs', 'razorfoot-griffin', 'p2', 'battlefield');
  addMana(state, 'p1', 5);
  const activate = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'vanguard');
  assert.ok(activate, 'aktywacja {4}{W} jest oferowana');
  run(state, activate);
  resolve(state);
  assert.equal(effectivePower(state.objects.get('mine'), state), 3, 'mój 2/2 dostaje +1/+1 (razem 3/3)');
  assert.equal(effectiveToughness(state.objects.get('mine'), state), 3, 'toughness też +1');
  assert.equal(effectivePower(state.objects.get('theirs'), state), 2,
    'stwór przeciwnika NIE dostaje hymnu („you control")');
  assert.equal(effectivePower(state.objects.get('vanguard'), state), 4,
    'sam Vanguard też jest stworem pod własnym hymnem (3/2 + 1/+1)');
});

test('B59/G1.1: Charismatic Vanguard — stwór wchodzący PO rozstrzygnięciu nie łapie hymnu (CR 611.2c)', () => {
  const state = game();
  put(state, 'vanguard', 'charismatic-vanguard', 'p1', 'battlefield');
  addMana(state, 'p1', 5);
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'vanguard'));
  resolve(state);
  put(state, 'late', 'razorfoot-griffin', 'p1', 'battlefield');
  assert.equal(effectivePower(state.objects.get('late'), state), 2,
    'zbiór objętych ustala się przy rozstrzygnięciu — późniejszy stwór zostaje 2/2');
});

test('B59/G1.1: Charismatic Vanguard — aktywacja niemożliwa bez 5 many', () => {
  const state = game();
  put(state, 'vanguard', 'charismatic-vanguard', 'p1', 'battlefield');
  put(state, 'mine', 'razorfoot-griffin', 'p1', 'battlefield');
  addMana(state, 'p1', 4);
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'vanguard'),
    'przy 4 manie oferta aktywacji nie istnieje');
});

// ---- G1.2: Sun-Collared Raptor (141 RIX, plan Ixalan) ----------------------

test('B59/G1.2: Sun-Collared Raptor — dane Oracle, trample i koszt', () => {
  const def = registry.get('sun-collared-raptor');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Dinosaur']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 2);
  assert.deepEqual(def.keywords, ['trample']);
  assert.equal(def.set, 'RIX');
  assert.equal(def.plan, 'Ixalan');
  assert.equal(def.artId, 141);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('62fbd1bc'), 'imageUri z druku RIX (rix/118)');
  assert.equal(MANA_COSTS['sun-collared-raptor'], '{1}{R}');
});

test('B59/G1.2: Sun-Collared Raptor — {2}{R}: +3/+0 do końca tury, wielokrotnie', () => {
  const state = game();
  put(state, 'raptor', 'sun-collared-raptor', 'p1', 'battlefield');
  addMana(state, 'p1', 6);
  const activate = () => commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'raptor');
  assert.ok(activate(), 'pierwsza aktywacja oferowana');
  run(state, activate());
  resolve(state);
  assert.equal(effectivePower(state.objects.get('raptor'), state), 4, '1+3 = 4');
  assert.ok(activate(), 'Oracle nie ma limitu — druga aktywacja też jest oferowana');
  run(state, activate());
  resolve(state);
  assert.equal(effectivePower(state.objects.get('raptor'), state), 7,
    'dwie aktywacje kumulują się (7/2)');
  assert.equal(effectiveToughness(state.objects.get('raptor'), state), 2,
    'toughness bez zmian (+3/+0)');
});

test('B59/G1.2: Sun-Collared Raptor — bez many nie ma aktywacji', () => {
  const state = game();
  put(state, 'raptor', 'sun-collared-raptor', 'p1', 'battlefield');
  addMana(state, 'p1', 2);
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'raptor'),
    'przy 2 manie oferty brak (koszt {2}{R} = 3)');
});
