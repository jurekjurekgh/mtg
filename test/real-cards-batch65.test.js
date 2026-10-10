// Batch 65 (2026-10-10) — karty właściciela: 329 OGW, 332 IKO, 333 RNA,
// 334 ONE, 336 APC, 338 THB, 340 ONE, 341 DTK, 348 DMU, 350 BLC — razem
// 10 kart. Plan: docs/plans/PLAN_2026-10-10-batch65-kolekcja-329-350.md.
//
// L184: poprzedni agent stracił cały niezacommitowany batch w resetcie
// sandboxa — ten batch dochodzi KARTA PO KARCIE, commit + push natychmiast.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-10-10,
// `set=` obowiązkowe — ADR 0010 §2a; rulingi przy kartce, także puste listy —
// ADR 0028). artId z wiersza arkusza właściciela (`<nr><SET>` w
// `tools/collection-art-ids.csv`).
//
// Każda karta ma sanity danych Oracle/druku/planu, scenariusz legalny
// (efekt działa) oraz nielegalny (brak oferty — maszynowo rozpoznawalny).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 65, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 6; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
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

/** Rozstrzyga stos do końca (wzorzec real-cards-batch64). */
function settle(s, max = 60) {
  for (let i = 0; i < max; i++) {
    const idle = s.zones.stack.length === 0 && s.pendingTriggerTargets.length === 0;
    const choices = commands(s);
    if (idle && !choices.some((c) => c.type.startsWith('resolve_'))) return;
    const pick = choices.find((c) => c.type === 'pass_priority' && s.zones.stack.length)
      ?? choices.find((c) => c.type.startsWith('resolve_'))
      ?? choices.find((c) => c.type === 'pass_priority');
    assert.ok(pick, 'rozstrzyganie ma dostępną komendę');
    run(s, pick);
  }
  assert.fail('przekroczono limit rozstrzygania stosu');
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));

function sanity(id, { set, plan, artId, snapshot = id }) {
  const def = registry.get(id);
  const snap = snapshotOf(snapshot);
  assert.equal(def.oracleText, snap.oracle_text, 'Oracle 1:1 ze snapshotem Scryfalla');
  assert.equal(def.set, set);
  assert.equal(def.plan, plan, 'Plan z listy właściciela wiążący');
  assert.equal(def.artId, artId);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.equal(MANA_COSTS[id], snap.mana_cost, 'koszt many w tabeli = Scryfall');
  assert.equal(snap.print, set.toLowerCase(), 'druk właściciela (set=)');
  assert.ok(Array.isArray(snap.rulings), 'rulingi pobrane (także pusta lista, ADR 0028)');
  assert.ok(def.imageUri.includes(snap.image_uris.large.split('/').pop().split('.')[0]), 'imageUri z druku właściciela');
  return def;
}

// ---- B65/329: Blinding Drone (OGW #41, plan Zendikar) -----------------------

test('B65/329: Blinding Drone — dane Oracle: devoid 1/3 za {1}{U}, zdolność {C},{T}: tap celu', () => {
  const def = sanity('blinding-drone', { set: 'OGW', plan: 'Zendikar', artId: 329 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Eldrazi', 'Drone']);
  assert.deepEqual(def.colors, [], 'Devoid — karta bez koloru (CR 702.114)');
  assert.deepEqual(def.keywords, ['devoid']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 3);
  assert.equal(def.abilities.length, 1);
  const ab = def.abilities[0];
  assert.equal(ab.type, 'activated');
  // {C}, {T}: Tap target creature. — pip bezbarwny w koszcie zdolności
  // (CR 107.4c: {C} opłaca WYŁĄCZNIE mana bezbarwna; cost.colors: ['C']).
  assert.deepEqual(ab.cost, { mana: 1, colors: ['C'], tap: true });
  assert.deepEqual(ab.targets, [{ type: 'creature' }], 'cel to DOWOLNY stwór');
  assert.deepEqual(ab.effect, { type: 'tap_permanent' });
});

test('B65/329: Blinding Drone — aktywacja za {C} tapuje celowego stwora (i sam się tapuje)', () => {
  const state = game();
  put(state, 'drone', 'blinding-drone', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { tapped: false });
  put(state, 'wlasny', 'rustvine-cultivator', 'p1', 'battlefield', { tapped: false });
  addMana(state, 'p1', 1, { colors: [] }); // {C} — tylko mana bezbarwna (CR 107.4c)
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'drone'
    && c.targets?.[0] === 'cel');
  assert.ok(act, 'aktywacja z celem na stwora przeciwnika jest oferowana');
  run(state, act);
  settle(state);
  const po = state.objects.get('cel');
  assert.equal(po.tapped, true, 'celowy stwór tapnięty');
  assert.equal(state.objects.get('drone').tapped, true, 'źródło opłaciło {T}');
  assert.equal(state.objects.get('wlasny').tapped, false, 'własny stwór nietknięty');
});

test('B65/329: Blinding Drone — {C} nie opłaca się maną kolorową (CR 107.4c)', () => {
  const state = game();
  put(state, 'drone', 'blinding-drone', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { tapped: false });
  addMana(state, 'p1', 1, { colors: ['U'] }); // {U} w puli — NIE opłaca pipa {C}
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'drone'),
    'brak oferty: pip bezbarwny wymaga many bezbarwnej');
});

test('B65/329: Blinding Drone — bez many / bez stworów na stole NIE MA oferty', () => {
  const state = game();
  put(state, 'drone', 'blinding-drone', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { tapped: false });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'drone'),
    'brak many = brak oferty (L48: oferta = walidacja)');
  addMana(state, 'p1', 1, { colors: [] });
  // Zdejmijmy cel — brak legalnego celu = brak okazji (CR 601.2c w ofercie).
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'cel');
  state.objects.delete('cel');
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'drone'),
    'brak legalnego celu = brak oferty');
  // Stan tapnięty też zamyka ofertę ({T} w koszcie).
  const st = game();
  put(st, 'drone2', 'blinding-drone', 'p1', 'battlefield', { tapped: true });
  put(st, 'cel2', 'rustvine-cultivator', 'p2', 'battlefield');
  addMana(st, 'p1', 1, { colors: [] });
  assert.ok(!commands(st).some((c) => c.type === 'activate_ability' && c.objectId === 'drone2'),
    'tapnięte źródło nie aktywuje zdolności z kosztem {T}');
});
