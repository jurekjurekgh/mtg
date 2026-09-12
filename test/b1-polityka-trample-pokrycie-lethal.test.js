// B1 (PLAN_2026-09-12c, zlecenie właściciela 2026-09-12) — polityka domyślna
// przydziału obrażeń: atakujący z trample nie dopłaca do lethal blokera, który
// pokrywają już obrażenia przydzielane mu w TYM SAMYM kroku przez inne stwory.
//
// Reguły się NIE zmieniają — legalność takiego przydziału zapewnia W5
// (CR 702.19b: „take into account damage already marked on the creature and
// damage from other creatures that's being assigned during the same combat
// damage step"; CR 702.2b dla deathtouch). Zmienia się WYBÓR domyślny, czyli
// ruch bota (bot nie ma wariantów: `legalCommands` oferuje jedną komendę
// `resolve_damage_assignment` z domyślną mapą) i punkt startowy wizarda.
//
// Pomiar sprzed zmiany: oferta dla x (trample 5/5) blokowanego przez w (3/3),
// którego lethal pokrywa y (3/3), brzmiała `{x: [{w: 3}]}` — 2 obrażenia
// marnowały się na blokerze, który i tak ginie. Po zmianie: `{x: [{w: 0}]}`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { defaultDamageAssignmentFor, buildDefaultDamageAssignments } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function atStep(state, step, priorityId, activeId = priorityId) {
  state.turn = { ...jumpToStep(state.turn, step, priorityId), activePlayerId: activeId };
  return state;
}

function creature(state, id, controllerId, power, toughness, { keywords = [], counters = {} } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], colors: [], abilities: [], subtypes: [], keywords,
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false, counters }));
  return state.objects.get(id);
}

function tactician(state, controllerId = 'p1') {
  const def = REGISTRY.get('cenns-tactician');
  addObject(state, {
    id: 'tact', instanceId: 'i-tact', cardId: 'cenns-tactician', controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  const object = state.objects.get('tact');
  state.objects.set('tact', Object.freeze({ ...object, summoningSickness: false }));
}

/**
 * p2 atakuje `x` (trample 5/5) i — domyślnie — `y`; p1 blokuje OBA jednym `w`
 * (2/2 z licznikiem +1/+1 = 3/3, drugi slot ze statyki Cenn's Tactician).
 */
function combat({ yPower = 3, yToughness = 3, yKeywords = [], twoAttackers = true } = {}) {
  const state = createGameState({ seed: 122, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  tactician(state, 'p1');
  creature(state, 'w', 'p1', 2, 2, { counters: { '+1/+1': 1 } });
  creature(state, 'x', 'p2', 5, 5, { keywords: ['trample'] });
  const attackerIds = ['x'];
  if (twoAttackers) {
    creature(state, 'y', 'p2', yPower, yToughness, { keywords: yKeywords });
    attackerIds.push('y');
  }
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  const blocks = execute(state, {
    type: 'declare_blockers', playerId: 'p1',
    assignments: twoAttackers ? { x: ['w'], y: ['w'] } : { x: ['w'] },
  });
  assert.ok(blocks.ok, `podwójny blok legalny (statyka): ${blocks.events?.[0]?.reason}`);
  atStep(state, 'combat_damage', 'p2');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  return state;
}

const life = (state, id) => state.players.find((player) => player.id === id).life;
const offered = (state) => playerView(state, 'p2').legalCommands
  .find((cmd) => cmd.type === 'resolve_damage_assignment').assignments;
const alive = (state, id) => state.objects.get(id)?.zone === 'battlefield';

/** Domknij przebieg: przyjmij ofertę atakującego i (jeśli jest) decyzję blokera. */
function resolveWithOffer(state) {
  const first = execute(state, { type: 'resolve_damage_assignment', playerId: 'p2', assignments: offered(state) });
  assert.ok(first.ok, `oferta jest legalna: ${JSON.stringify(first.events?.[0] ?? first)}`);
  if (state.pendingDamageAssignment) {
    const second = execute(state, {
      type: 'resolve_damage_assignment', playerId: state.pendingDamageAssignment.playerId,
      assignments: buildDefaultDamageAssignments(state),
    });
    assert.ok(second.ok, `druga decyzja domknięta: ${JSON.stringify(second.events?.[0] ?? second)}`);
    return [...(first.events ?? []), ...(second.events ?? [])];
  }
  return first.events ?? [];
}

test('B1/1: lethal pokryty przez drugiego atakującego → oferta 0 na blokera i całość na gracza', () => {
  const state = combat();
  assert.deepEqual(offered(state), { x: [{ blockerId: 'w', amount: 0 }] },
    'przed B1 oferta brzmiała {x:[{w:3}]} — 2 obrażenia marnowały się na blokerze, który i tak ginie');
  resolveWithOffer(state);
  assert.equal(life(state, 'p1'), 15, 'całe 5 obrażeń x trafiło obrońcę');
  assert.ok(!alive(state, 'w'), 'w ginie od 3 obrażeń y (lethal)');
  assert.equal(state.objects.get('x').damage, 3, 'w odpowiedział 3 (moc z początku kroku)');
});

test('B1/2: pokrycie CZĘŚCIOWE → oferta dopłaca tylko różnicę do lethal', () => {
  const state = combat({ yPower: 1, yToughness: 1 });
  assert.deepEqual(offered(state), { x: [{ blockerId: 'w', amount: 2 }] },
    'y przydziela 1, lethal 3 — brakuje 2, reszta (3) idzie na gracza');
  resolveWithOffer(state);
  assert.equal(life(state, 'p1'), 17, 'nadmiar 3 trafił obrońcę');
  assert.ok(!alive(state, 'w'), 'w dostał łącznie 3 = lethal');
});

test('B1/3: bez pokrycia oferta się NIE zmienia (lethal-first, regresja M66/E8-B3)', () => {
  const state = combat({ twoAttackers: false });
  assert.deepEqual(offered(state), { x: [{ blockerId: 'w', amount: 3 }] }, 'jedyny atakujący: 3 + 2 na gracza');
  resolveWithOffer(state);
  assert.equal(life(state, 'p1'), 18);
});

test('B1/4: pokrycie przez źródło z deathtouch (CR 702.2b) → oferta 0 na blokera', () => {
  const state = combat({ yPower: 1, yToughness: 1, yKeywords: ['deathtouch'] });
  assert.deepEqual(offered(state), { x: [{ blockerId: 'w', amount: 0 }] },
    '1 obrażenie z deathtouch = lethal, więc dopłata byłaby stratą');
  resolveWithOffer(state);
  assert.equal(life(state, 'p1'), 15);
  assert.ok(!alive(state, 'w'), 'w ginie od deathtouch (CR 702.4)');
});

test('B1/5: bez trample pokrycie NIC nie zmienia — pełna moc w blokerów (CR 510.1a/c)', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  tactician(state, 'p1');
  creature(state, 'b1', 'p1', 2, 2);
  creature(state, 'b2', 'p1', 3, 3);
  creature(state, 'a', 'p2', 6, 6);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { a: ['b1', 'b2'] } }).ok);
  // Bez kontekstu i z kontekstem — ten sam wynik (E8/B3: 2 + 4, reszta do
  // ostatniego blokera, bo bez trample cała moc MUSI trafić w blokerów).
  assert.deepEqual(defaultDamageAssignmentFor(state, 'a', ['b1', 'b2'], 6),
    [{ blockerId: 'b1', amount: 2 }, { blockerId: 'b2', amount: 4 }]);
  assert.deepEqual(defaultDamageAssignmentFor(state, 'a', ['b1', 'b2'], 6, { assignments: {}, pass: false }),
    [{ blockerId: 'b1', amount: 2 }, { blockerId: 'b2', amount: 4 }],
    'pokrycie lethal nie zwalnia z przydziału, gdy stwór nie ma trample');
  // Osobny stan: a (6/6, BEZ trample) i z (3/3) atakują; b1 (2/2) blokuje obu
  // (drugi slot ze statyki Cenn's Tactician), b2 (3/3) blokuje a. Lethal b1
  // pokrywa z (3 >= 2). Bez trample dopłata i tak jest obowiązkowa w tym
  // znaczeniu, że cała moc MUSI trafić w blokerów (CR 510.1a/c) — a
  // przesunięcie obrażeń na b2 zostawiłoby b1 przy życiu (overkill na b2),
  // więc pokrycie lethal NIE zmienia przydziału atakującego bez trample.
  const s2 = createGameState({ seed: 6, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(s2, 'declare_attackers', 'p2');
  tactician(s2, 'p1');
  // b1 dostaje licznik +1/+1 — statyka Cenn's Tactician daje drugi slot bloku
  // tylko stworowi z takim licznikiem (3/3, lethal 3 — dokładnie tyle, ile
  // przydziela mu z).
  creature(s2, 'b1', 'p1', 2, 2, { counters: { '+1/+1': 1 } });
  creature(s2, 'b2', 'p1', 3, 3);
  creature(s2, 'a', 'p2', 6, 6);
  creature(s2, 'z', 'p2', 3, 3);
  assert.ok(execute(s2, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a', 'z'] }).ok);
  atStep(s2, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(s2, {
    type: 'declare_blockers', playerId: 'p1', assignments: { a: ['b1', 'b2'], z: ['b1'],
  } }).ok, 'b1 blokuje dwóch dzięki statyce');
  assert.deepEqual(defaultDamageAssignmentFor(s2, 'a', ['b1', 'b2'], 6, {
    assignments: { z: [{ blockerId: 'b1', amount: 3 }] }, pass: false,
  }), [{ blockerId: 'b1', amount: 3 }, { blockerId: 'b2', amount: 3 }],
  'pokrycie lethal przez z NIE zmienia przydziału atakującego bez trample');
});

test('B1/6: dwóch atakujących z trample — przydziały liczone SEKWENCYJNIE (kolejność deklaracji)', () => {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  tactician(state, 'p1');
  creature(state, 'w', 'p1', 2, 2, { counters: { '+1/+1': 1 } }); // 3/3, blokuje dwóch
  creature(state, 'x1', 'p2', 5, 5, { keywords: ['trample'] });
  creature(state, 'x2', 'p2', 5, 5, { keywords: ['trample'] });
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['x1', 'x2'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { x1: ['w'], x2: ['w'] } }).ok);
  atStep(state, 'combat_damage', 'p2');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  assert.deepEqual(buildDefaultDamageAssignments(state), {
    x1: [{ blockerId: 'w', amount: 3 }], // pierwszy: lethal jeszcze nie pokryty
    x2: [{ blockerId: 'w', amount: 0 }], // drugi: pokryty przez x1 → całość na gracza
  }, 'bez sekwencyjnej mapy obaj dopłacaliby po 3');
  assert.ok(execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: buildDefaultDamageAssignments(state),
  }).ok, 'oferta jest legalna jako całość (CR 510.1e)');
  if (state.pendingDamageAssignment) {
    assert.ok(execute(state, {
      type: 'resolve_damage_assignment', playerId: state.pendingDamageAssignment.playerId,
      assignments: buildDefaultDamageAssignments(state),
    }).ok);
  }
  assert.equal(life(state, 'p1'), 13, 'obrońca dostał 2 (x1) + 5 (x2) = 7');
});
