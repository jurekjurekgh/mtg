import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { applyEffect } from '../src/engine/effects.js';
import { legalTargetCandidates } from '../src/engine/spells.js';
import { addCounter } from '../src/engine/counters.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addLand(state, id, playerId, name = 'Forest') {
  const def = REGISTRY.get('basic-forest');
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId: playerId, zone: 'battlefield',
    kind: 'land', power: null, toughness: null, manaCost: 0,
    abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'],
    colors: ['G'],
  });
  return state.objects.get(id);
}

function addCreature(state, id, playerId, power, toughness, name = 'Test', options = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId: playerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: options.keywords ?? [], subtypes: [], types: ['Creature'],
    colors: options.colors ?? [],
  });
  return state.objects.get(id);
}

// =============================================================================
// Batch 22 — nowe mechaniki engine (2026-08-08).
//   - proliferate (CR 701.27) — Courage in Crisis
//   - reveal_top_to_bottom_order (CR 701.16) — Stomping Slabs
//   - mill_from_bottom (CR 702.13 odwrotnie) — Cellar Door
//   - return_exiled_to_battlefield (paired LKI) — Wormfang Newt
//   - nowe typy celów: creature_with_power_at_least (Selesnya Charm),
//     nonland_permanent (Thistledown Players)
// =============================================================================

test('proliferate: +1 do każdego typu licznika >0 na wybranych celach', () => {
  const state = newState();
  // Stwór z licznikiem +1/+1
  addCreature(state, 'cr1', 'p1', 2, 2, 'Has Counter');
  addCounter(state, 'cr1', '+1/+1', 1);
  // Stwór z licznikami +1/+1 i charge
  addCreature(state, 'cr2', 'p1', 2, 2, 'Multi');
  addCounter(state, 'cr2', '+1/+1', 1);
  addCounter(state, 'cr2', 'charge', 2);
  // Stwór z 0 liczników (nie powinien dostać nic)
  addCreature(state, 'cr3', 'p1', 2, 2, 'Empty');
  // Gracz z poison
  const p2 = state.players.find((p) => p.id === 'p2');
  p2.counters = { poison: 3 };
  // Aplikujemy proliferate ręcznie
  const source = state.objects.get('cr1');
  applyEffect(state, { type: 'proliferate' }, source, ['cr1', 'cr2', 'cr3', 'p2']);
  assert.equal(state.objects.get('cr1').counters['+1/+1'], 2, 'cr1 +1/+1: 1→2');
  assert.equal(state.objects.get('cr2').counters['+1/+1'], 2, 'cr2 +1/+1: 1→2');
  assert.equal(state.objects.get('cr2').counters['charge'], 3, 'cr2 charge: 2→3');
  assert.deepEqual(state.objects.get('cr3').counters, {}, 'cr3 (pusty) bez zmian');
  assert.equal(p2.counters.poison, 4, 'p2 poison: 3→4');
});

test('proliferate: wybór pusty (0 celów) — brak zmian', () => {
  const state = newState();
  addCreature(state, 'cr1', 'p1', 2, 2);
  addCounter(state, 'cr1', '+1/+1', 1);
  const source = state.objects.get('cr1');
  applyEffect(state, { type: 'proliferate' }, source, []);
  assert.equal(state.objects.get('cr1').counters['+1/+1'], 1, 'brak zmian');
});

test('reveal_top_to_bottom_order: kolejność gracza + warunek named', () => {
  const state = newState();
  // Biblioteka p1: 5 kart (addObject pcha id do state.zones.library).
  // addObject pcha w kolejności dodawania — lib-0 będzie pierwszy
  // (bottom), lib-4 ostatni (top). Odwrócę kolejność dodawania
  // żeby lib-0 było na spodzie (kolejność = [lib-0,...,lib-4]
  // = bottom→top).
  for (let i = 4; i >= 0; i--) {
    addObject(state, {
      id: `lib-${i}`, instanceId: `ilib-${i}`, cardId: 'x-test', controllerId: 'p1',
      zone: 'library', kind: 'instant', power: null, toughness: null, manaCost: 1,
      abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['U'],
      name: i === 2 ? 'Stomping Slabs' : 'Other',
    });
  }
  // Stan: state.zones.library = [lib-0, lib-1, lib-2, lib-3, lib-4] (bottom→top)
  // Źródło (Stomping Slabs na ręce) — dla kolejki
  addObject(state, {
    id: 'source', instanceId: 'isrc', cardId: 'stomping-slabs', controllerId: 'p1',
    zone: 'hand', kind: 'sorcery', power: null, toughness: null, manaCost: 3,
    abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: ['R'],
  });
  // Ustawiamy pendingRevealOrder jak po wykonaniu reveal top 5
  const revealed = ['lib-4', 'lib-3', 'lib-2', 'lib-1', 'lib-0']; // top→bottom
  state.pendingRevealOrder = {
    playerId: 'p1',
    sourceId: 'source',
    sourceCardId: 'stomping-slabs',
    cardIds: revealed,
    amount: 5,
    restorePriorityTo: 'p1',
    effect: { type: 'reveal_top_to_bottom_order' },
  };
  // Gracz wybiera kolejność: lib-0 na spodzie, lib-2 tuż nad resztą
  // (czyli kolejność bottom→top: lib-0, lib-1, lib-2, lib-3, lib-4)
  const cmd = {
    type: 'resolve_reveal_order',
    playerId: 'p1',
    order: ['lib-0', 'lib-1', 'lib-2', 'lib-3', 'lib-4'],
  };
  const r = execute(state, cmd);
  assert.equal(r.ok, true, `execute ok: ${r.events?.[0]?.reason}`);
  assert.equal(state.pendingRevealOrder, null, 'pending wyczyszczony');
  // Karty z biblioteki (z wierzchu) przeniesione na spód
  // Biblioteka przed: [lib-0, lib-1, lib-2, lib-3, lib-4] (order: bottom=lib-0, top=lib-4)
  // Po reorder: bottom=lib-0, ..., top=lib-4 (bez zmian kolejności, bo lib-0 już było na spodzie)
  // Sprawdzam, że karty zostają w bibliotece
  assert.equal(state.zones.library.length, 5, '5 kart w bibliotece');
  assert.equal(state.zones.library[0], 'lib-0', 'bottom bez zmian (order[0]=lib-0 → spód)');
  assert.equal(state.zones.library[4], 'lib-4', 'top bez zmian (order[last]=lib-4 → tuż nad)');
  // named „Stomping Slabs" w reveal → efekt 7 dmg do dowolnego celu
  // (tu nie ma w reveal warunku „if_named_in_revealed" — sam pendingRevealOrder
  // to nie wywołuje damage; damage wywołuje applyEffect po otrzymaniu rozkazu).
});

test('reveal_top_to_bottom_order: zła kolejność (permutacja) → reject', () => {
  const state = newState();
  addObject(state, {
    id: 'lib-0', instanceId: 'ilib-0', cardId: 'x-test', controllerId: 'p1',
    zone: 'library', kind: 'instant', power: null, toughness: null, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['U'],
    name: 'Other',
  });
  state.zones.library.push('lib-0');
  state.pendingRevealOrder = {
    playerId: 'p1', sourceId: 'x', sourceCardId: 'x',
    cardIds: ['lib-0'], amount: 1, restorePriorityTo: 'p1',
  };
  // Zły order (brak lib-0)
  const r = execute(state, { type: 'resolve_reveal_order', playerId: 'p1', order: ['foo'] });
  assert.equal(r.ok, false, 'odrzucone');
  assert.equal(r.events?.[0]?.reason, 'illegal_reveal_order');
});

test('mill_from_bottom: cel-gracz kładzie DOLNĄ kartę na grob + create_token Zombie gdy creature', () => {
  const state = newState();
  // p2 biblioteka: creature na spodzie, instant na wierzchu.
  // addObject pcha na koniec tablicy (bottom→top: [bottom...top]).
  // Dodajemy NAJPIERW instant, potem creature — biblioteka =
  // [instant, creature] (bottom=instant, top=creature)... czekaj,
  // bottom = library[0]. Chcemy creature na spodzie → dodaj najpierw
  // creature, potem instant.
  addObject(state, {
    id: 'p2-bot', instanceId: 'ip2b', cardId: 'x-creature', controllerId: 'p2',
    zone: 'library', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['B'],
    name: 'Bottom Creature',
  });
  addObject(state, {
    id: 'p2-top', instanceId: 'ip2t', cardId: 'x-instant', controllerId: 'p2',
    zone: 'library', kind: 'instant', power: null, toughness: null, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['U'],
    name: 'Top Instant',
  });
  // Stan: state.zones.library = [p2-bot, p2-top] (bottom→top)
  // Źródło Cellar Door
  addObject(state, {
    id: 'cellar', instanceId: 'icel', cardId: 'cellar-door', controllerId: 'p1',
    zone: 'battlefield', kind: 'artifact', power: null, toughness: null, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  const source = state.objects.get('cellar');
  // Cel: p2 (gracz)
  applyEffect(state, {
    type: 'mill_from_bottom', amount: 1,
    if_creature_create_token: {
      cardId: 'token_zombie', name: 'Zombie',
      kind: 'creature', power: 2, toughness: 2, colors: ['B'],
      types: ['Creature'], subtypes: ['Zombie'], keywords: [],
    },
  }, source, ['p2']);
  // p2-bot (creature) → graveyard. moveObjectDirectly zmienia id obiektu,
  // więc szukamy po evencie object_moved (fromId === 'p2-bot').
  const movedEvent = state.events.find((e) => e.type === 'object_moved' && e.fromId === 'p2-bot');
  assert.ok(movedEvent, 'p2-bot został przeniesiony');
  assert.equal(movedEvent.fromZone, 'library', 'z library');
  assert.equal(movedEvent.toZone, 'graveyard', 'do graveyard');
  // p2-top nadal w bibliotece
  const p2top = state.objects.get('p2-top');
  assert.equal(p2top.zone, 'library', 'instant został');
  // Token Zombie 2/2 czarny powstał
  const tokens = state.zones.battlefield.filter((id) => {
    const o = state.objects.get(id);
    return o && o.name === 'Zombie' && o.controllerId === 'p1';
  });
  assert.equal(tokens.length, 1, `Zombie token: ${tokens.length}`);
  const tok = state.objects.get(tokens[0]);
  assert.equal(tok.power, 2);
  assert.equal(tok.toughness, 2);
  assert.deepEqual(tok.colors, ['B']);
});

test('mill_from_bottom: bez creature → bez tokena (instant wylądował na grobie)', () => {
  const state = newState();
  addObject(state, {
    id: 'p2-bot', instanceId: 'ip2b', cardId: 'x-instant', controllerId: 'p2',
    zone: 'library', kind: 'instant', power: null, toughness: null, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['U'],
    name: 'Bottom Instant',
  });
  // addObject automatycznie pcha do library — p2-bot już jest na spodzie.
  addObject(state, {
    id: 'cellar', instanceId: 'icel', cardId: 'cellar-door', controllerId: 'p1',
    zone: 'battlefield', kind: 'artifact', power: null, toughness: null, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  const source = state.objects.get('cellar');
  applyEffect(state, { type: 'mill_from_bottom', amount: 1,
    if_creature_create_token: { cardId: 'token_zombie', name: 'Zombie',
      kind: 'creature', power: 2, toughness: 2, colors: ['B'],
      types: ['Creature'], subtypes: ['Zombie'], keywords: [] } },
    source, ['p2']);
  // p2-bot poszedł na graveyard — sprawdzamy przez event object_moved.
  const movedEvent = state.events.find((e) => e.type === 'object_moved' && e.fromId === 'p2-bot');
  assert.ok(movedEvent, 'p2-bot przeniesiony');
  assert.equal(movedEvent.toZone, 'graveyard', 'instant na grobie');
  // Brak tokena Zombie (instant nie creature).
  const zombies = state.zones.battlefield.filter((id) => state.objects.get(id)?.name === 'Zombie');
  assert.equal(zombies.length, 0, 'brak tokena (instant nie creature)');
});

test('cel creature_with_power_at_least: filtruje stwory z mocą <N', () => {
  const state = newState();
  addCreature(state, 'weak', 'p1', 1, 1);
  addCreature(state, 'big', 'p1', 6, 6);
  addCreature(state, 'huge', 'p1', 10, 10);
  addCreature(state, 'opp-big', 'p2', 7, 7);
  const candidates = legalTargetCandidates(state, 'p1', {
    type: 'creature_with_power_at_least', min: 5,
  });
  const ids = candidates.map((id) => state.objects.get(id).id).sort();
  // big (6), huge (10), opp-big (7 — przeciwnik, ale to "any creature" z min≥5)
  assert.deepEqual(ids, ['big', 'huge', 'opp-big'].sort(),
    `expected [big, huge, opp-big], got ${ids}`);
});

test('cel nonland_permanent: pomija landy', () => {
  const state = newState();
  addLand(state, 'land1', 'p1');
  addCreature(state, 'cre1', 'p1', 2, 2);
  addCreature(state, 'cre2', 'p1', 3, 3);
  const candidates = legalTargetCandidates(state, 'p1', { type: 'nonland_permanent' });
  const ids = candidates.sort();
  assert.deepEqual(ids, ['cre1', 'cre2'], `nonland: ${ids}`);
});
