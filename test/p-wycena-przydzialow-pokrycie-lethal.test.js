// P — wycena bota przy przydziałach obrażeń: pokrycie lethal po OBU stronach.
//
// Zlecenie właściciela (2026-09-12e): „wycena bota przy przydziałach (lethal-first
// nie wykorzystuje pokrycia lethal przez inne stwory — po W5/B1 legalne, ale bot
// z tego nie korzysta)".
//
// Pomiar przed zmianą (sondy na tym samym harnessie co B1 — Cenn's Tactician daje
// stworowi z licznikiem +1/+1 drugi slot bloku):
//
//  * atakujący BEZ trample: `a` 4/4 blokowana przez `b1` 3/3 i `b2` 3/3, lethal
//    `b1` pokryty przez `z` 3/3 → plan `[{b1:3},{b2:1}]`: JEDEN zabity, `b2`
//    przeżywał z 1 obrażeniem. Po zmianie `[{b1:0},{b2:4}]` → DWA zabite.
//  * strona BLOKERA: `w` (moc 4) blokuje `a1` 2/2 i `a2` 3/3, lethal `a1` pokryty
//    przez `v` 2/2 → plan `[{a1:2},{a2:2}]`: `a2` przeżywał z 2 obrażeniami.
//    Po zmianie `[{a1:0},{a2:4}]` → obaj atakujący giną.
//
// Pokrycie lethal istniało dotąd TYLKO w gałęzi trample (`defaultDamageAssignment`
// liczył `need` z kontekstem wyłącznie `if (trample && context)` — zakres B1), a
// strona blokera nie miała kontekstu wcale (`defaultBlockerDamageAssignment` bez
// parametru, `buildDefaultDamageAssignments` bez mapy sekwencyjnej dla
// `role === 'blocker'`).
//
// To WYCENA, nie reguły: suma przydziału się nie zmienia (cała moc rozdzielona,
// CR 510.1a), podział między cele jest swobodny (CR 510.1c/d), a walidatory
// (`validateDamageAssignment`, `validateBlockerDamageAssignment`) nie są tknięte —
// P/7 sprawdza legalność każdego planu domyślnego w jego walidatorze. Liczba ofert
// też się nie zmienia: M66/R nadal daje DOKŁADNIE JEDEN wariant
// (`resolve_damage_assignment`), który bot bierze w całości
// (`heuristic-bot.js`: `return finish(0)`), a człowiek ma wizard z tym samym
// punktem startowym. Zmienia się JAKOŚĆ tego jednego planu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import {
  buildDefaultDamageAssignments, defaultDamageAssignmentFor, defaultBlockerDamageAssignmentFor,
  validateDamageAssignment, validateBlockerDamageAssignment,
  damageAssignedToAttackerThisPass, lethalAssignedByOtherBlockersThisPass,
} from '../src/engine/combat.js';

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

/** Cenn's Tactician: stwór z licznikiem +1/+1 może blokować dodatkowego atakującego. */
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

const alive = (state, id) => state.objects.has(id) && state.objects.get(id).zone === 'battlefield';
const damage = (state, id) => (state.objects.has(id) ? state.objects.get(id).damage ?? 0 : null);
const life = (state, id) => state.players.find((p) => p.id === id).life;
const suma = (lista) => lista.reduce((acc, e) => acc + e.amount, 0);

/**
 * Doprowadza walkę do pierwszej decyzji przydziału i zwraca stan.
 * `bloki`: mapa atakujący → blokerzy. `atak`: lista atakujących.
 */
function walka({ stwory, atak, bloki, seed = 21 }) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  tactician(state, 'p1');
  for (const [id, params] of Object.entries(stwory)) {
    creature(state, id, params[0], params[1], params[2], params[3] ?? {});
  }
  const attackers = execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: atak });
  assert.ok(attackers.ok, `atak legalny: ${JSON.stringify(attackers.events?.[0] ?? attackers)}`);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  const blocks = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: bloki });
  assert.ok(blocks.ok, `bloki legalne: ${JSON.stringify(blocks.events?.[0] ?? blocks)}`);
  atStep(state, 'combat_damage', 'p2');
  const combat = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.ok(combat.ok, `przebieg wystartował: ${JSON.stringify(combat.events?.[0] ?? combat)}`);
  return state;
}

/** Kolejne decyzje domknięte planem domyślnym (to, co robi bot). Zwraca ich listę. */
function domknijDecyzje(state) {
  const decyzje = [];
  let guard = 0;
  while (state.pendingDamageAssignment && guard < 6) {
    const pending = state.pendingDamageAssignment;
    const mapa = buildDefaultDamageAssignments(state);
    const result = execute(state, {
      type: 'resolve_damage_assignment', playerId: pending.playerId, assignments: mapa,
    });
    assert.ok(result.ok, `plan domyślny jest legalny (${pending.role ?? 'attacker'}): ${JSON.stringify(result.events?.[0] ?? result)}`);
    decyzje.push({ rola: pending.role ?? 'attacker', gracz: pending.playerId, mapa });
    guard += 1;
  }
  assert.ok(!state.pendingDamageAssignment, 'walka domknięta (CR 510.2/510.3)');
  return decyzje;
}

// ---- P/1, P/2: atakujący BEZ trample -----------------------------------------

const stworyAtaku = (extra = {}) => ({
  b1: ['p1', 2, 2, { counters: { '+1/+1': 1 } }],   // 3/3 + drugi slot bloku
  b2: ['p1', 3, 3],
  a: ['p2', 4, 4],
  ...extra,
});

test('P/1: atakujący bez trample — lethal blokera pokryty przez innego atakującego → 0 i cała moc w drugiego', () => {
  const state = walka({
    stwory: stworyAtaku({ z: ['p2', 3, 3] }),
    atak: ['a', 'z'],
    bloki: { a: ['b1', 'b2'], z: ['b1'] },
  });
  const oferta = playerView(state, 'p2').legalCommands
    .find((cmd) => cmd.type === 'resolve_damage_assignment').assignments;
  assert.deepEqual(oferta.a, [{ blockerId: 'b1', amount: 0 }, { blockerId: 'b2', amount: 4 }],
    'przed zmianą plan brzmiał [{b1:3},{b2:1}] — 3 obrażenia marnowały się na blokerze, który i tak ginie od z');
  assert.equal(suma(oferta.a), 4, 'cała moc rozdzielona (CR 510.1a) — bez trample suma MUSI być równa mocy');

  const decyzje = domknijDecyzje(state);
  assert.ok(!alive(state, 'b1') && !alive(state, 'b2'), 'DWA zabite: b1 od z (3 = lethal), b2 od a (4 >= 3)');
  assert.equal(life(state, 'p1'), 20, 'bez trample nic nie idzie na obrońcę (CR 510.1a/c)');
  // b1 blokuje dwóch, więc ma własną decyzję — i ona też korzysta z pokrycia:
  // a2... (tu: `a` dostał 3 od b2, lethal 4 → dopłata 1; `z` jeszcze nie pokryty → 2).
  const b1 = decyzje.find((d) => d.rola === 'blocker');
  assert.ok(b1, 'b1 (dwa cele) ma decyzję po stronie blokera');
  assert.deepEqual(b1.mapa.b1, [{ attackerId: 'a', amount: 1 }, { attackerId: 'z', amount: 2 }],
    'pokrycie działa też w drugą stronę: b2 przydziela `a` 3, więc b1 dopłaca tylko 1');
  assert.ok(!alive(state, 'a'), 'a ginie (1 od b1 + 3 od b2 = 4 = lethal)');
  assert.equal(damage(state, 'z'), 2, 'z przeżywa z 2 obrażeniami (dostał 2 od b1)');
});

test('P/2: atakujący bez trample, BEZ pokrycia — plan się NIE zmienia (regresja M66/E8-B3)', () => {
  const state = walka({ stwory: stworyAtaku(), atak: ['a'], bloki: { a: ['b1', 'b2'] } });
  const oferta = playerView(state, 'p2').legalCommands
    .find((cmd) => cmd.type === 'resolve_damage_assignment').assignments;
  assert.deepEqual(oferta.a, [{ blockerId: 'b1', amount: 3 }, { blockerId: 'b2', amount: 1 }],
    'lethal-first w kolejności deklaracji bez pokrycia — dokładnie jak przed zmianą');
  domknijDecyzje(state);
  assert.ok(!alive(state, 'b1'), 'b1 ginie (3 = lethal)');
  assert.equal(damage(state, 'b2'), 1, 'b2 przeżywa z 1 obrażeniem — bez pokrycia nie ma skąd dołożyć');
});

// ---- P/3, P/4, P/5: strona BLOKERA -------------------------------------------

function stworyBlokera({ v = [2, 2, {}] } = {}) {
  return {
    a1: ['p2', 2, 2],
    a2: ['p2', 3, 3],
    w: ['p1', 3, 3, { counters: { '+1/+1': 1 } }],   // moc 4 + drugi slot bloku
    v: ['p1', v[0], v[1], v[2]],
  };
}

test('P/3: bloker — lethal atakującego pokryty przez innego blokera → 0 i cała moc w drugiego', () => {
  const state = walka({
    stwory: stworyBlokera(),
    atak: ['a1', 'a2'],
    bloki: { a1: ['w', 'v'], a2: ['w'] },
  });
  const decyzje = domknijDecyzje(state);
  const w = decyzje.find((d) => d.rola === 'blocker' && d.mapa.w);
  assert.ok(w, 'w (dwa cele) ma decyzję po stronie blokera');
  assert.deepEqual(w.mapa.w, [{ attackerId: 'a1', amount: 0 }, { attackerId: 'a2', amount: 4 }],
    'przed zmianą plan brzmiał [{a1:2},{a2:2}] — a2 przeżywał z 2 obrażeniami, choć lethal a1 pokrywał v');
  assert.equal(suma(w.mapa.w), 4, 'cała moc blokera rozdzielona (CR 510.1a/510.1d)');
  assert.ok(!alive(state, 'a1') && !alive(state, 'a2'), 'DWA zabite: a1 od v, a2 od w');
  assert.equal(damage(state, 'v'), 1, 'v dostaje 1 (atakujący a1 przydziela 1 na w i 1 na v — też z pokryciem)');
});

test('P/4: bloker BEZ pokrycia — plan się NIE zmienia (regresja W3/M66)', () => {
  const state = walka({ stwory: { a1: ['p2', 2, 2], a2: ['p2', 3, 3], w: ['p1', 3, 3, { counters: { '+1/+1': 1 } }] },
    atak: ['a1', 'a2'], bloki: { a1: ['w'], a2: ['w'] } });
  const decyzje = domknijDecyzje(state);
  assert.deepEqual(decyzje[0].mapa.w, [{ attackerId: 'a1', amount: 2 }, { attackerId: 'a2', amount: 2 }],
    'lethal-first w kolejności deklaracji ataków — bez pokrycia nic się nie przesuwa');
  assert.ok(!alive(state, 'a1'), 'a1 ginie');
  assert.equal(damage(state, 'a2'), 2, 'a2 przeżywa z 2 obrażeniami');
});

test('P/5: pokrycie przez źródło z deathtouch po stronie blokera (CR 702.2b)', () => {
  const state = walka({
    stwory: stworyBlokera({ v: [1, 1, { keywords: ['deathtouch'] }] }),
    atak: ['a1', 'a2'],
    bloki: { a1: ['w', 'v'], a2: ['w'] },
  });
  const decyzje = domknijDecyzje(state);
  const w = decyzje.find((d) => d.rola === 'blocker' && d.mapa.w);
  assert.deepEqual(w.mapa.w, [{ attackerId: 'a1', amount: 0 }, { attackerId: 'a2', amount: 4 }],
    '1 obrażenie z deathtouch = lethal, więc dopłata do a1 byłaby stratą');
  assert.ok(!alive(state, 'a1') && !alive(state, 'a2'), 'obaj atakujący giną');
});

test('P/6: dwa blokery z decyzją — przydziały liczone SEKWENCYJNIE (kolejny widzi pokrycie)', () => {
  const state = walka({
    stwory: {
      a1: ['p2', 2, 2], a2: ['p2', 2, 2],
      w: ['p1', 2, 2, { counters: { '+1/+1': 1 } }],   // 3/3, drugi slot
      v: ['p1', 2, 2, { counters: { '+1/+1': 1 } }],   // 3/3, drugi slot
    },
    atak: ['a1', 'a2'],
    bloki: { a1: ['w', 'v'], a2: ['w', 'v'] },
    seed: 33,
  });
  const decyzje = domknijDecyzje(state);
  const atakujacy = decyzje.find((d) => d.rola === 'attacker');
  assert.deepEqual(atakujacy.mapa.a1, [{ blockerId: 'w', amount: 2 }, { blockerId: 'v', amount: 0 }],
    'pierwszy atakujący: lethal jeszcze nie pokryty');
  assert.deepEqual(atakujacy.mapa.a2, [{ blockerId: 'w', amount: 1 }, { blockerId: 'v', amount: 1 }],
    'drugi atakujący widzi 2 obrażenia przydzielone w przez a1 (lethal 3) — dopłaca 1 i dokłada 1 do v');
  const bloker = decyzje.find((d) => d.rola === 'blocker');
  assert.deepEqual(bloker.mapa.w, [{ attackerId: 'a1', amount: 2 }, { attackerId: 'a2', amount: 1 }],
    'pierwszy bloker: lethal-first');
  assert.deepEqual(bloker.mapa.v, [{ attackerId: 'a1', amount: 0 }, { attackerId: 'a2', amount: 3 }],
    'drugi bloker widzi, że lethal a1 pokrywa w (2 = lethal) — całość idzie w a2, bez overkillu');
  assert.ok(!alive(state, 'a1') && !alive(state, 'a2'), 'obaj atakujący giną');
  assert.ok(!alive(state, 'w'), 'w ginie (2 od a1 + 1 od a2 = 3 = lethal)');
  assert.equal(damage(state, 'v'), 1, 'v przeżywa z 1 obrażeniem (a2 przydzielił mu 1)');
});

// ---- P/7: legalność i pełna suma ----------------------------------------------

test('P/7: każdy plan domyślny przechodzi swój walidator i ma pełną sumę (reguły nietknięte)', () => {
  // Atakujący bez trample z pokryciem (scenariusz P/1).
  const a = walka({ stwory: stworyAtaku({ z: ['p2', 3, 3] }), atak: ['a', 'z'], bloki: { a: ['b1', 'b2'], z: ['b1'] } });
  const pendingA = a.pendingDamageAssignment;
  const mapaA = buildDefaultDamageAssignments(a);
  assert.equal(validateDamageAssignment(a, 'a', mapaA.a, { assignments: pendingA.assignmentsSoFar, pass: pendingA.pass }), null,
    'walidator atakującego przyjmuje plan z pokryciem (CR 510.1c: podział dowolny, suma pełna)');
  assert.equal(suma(mapaA.a), 4);

  // Bloker z pokryciem (scenariusz P/3).
  const b = walka({ stwory: stworyBlokera(), atak: ['a1', 'a2'], bloki: { a1: ['w', 'v'], a2: ['w'] } });
  domknijDecyzje(b);
  const b2 = walka({ stwory: stworyBlokera(), atak: ['a1', 'a2'], bloki: { a1: ['w', 'v'], a2: ['w'] } });
  const first = execute(b2, { type: 'resolve_damage_assignment', playerId: b2.pendingDamageAssignment.playerId, assignments: buildDefaultDamageAssignments(b2) });
  assert.ok(first.ok, 'decyzja atakujących domknięta');
  assert.equal(b2.pendingDamageAssignment.role, 'blocker', 'teraz decyzja blokera');
  const mapaB = buildDefaultDamageAssignments(b2);
  assert.equal(validateBlockerDamageAssignment(b2, 'w', mapaB.w), null,
    'walidator blokera przyjmuje plan z pokryciem (wymaga tylko permutacji, sufitu i pełnej sumy)');
  assert.equal(suma(mapaB.w), 4);
});

// ---- P/8, P/9: trample i przypadek „wszystkie cele pokryte" --------------------

test('P/8: trample z pokryciem — zachowanie B1 bez zmian (nadmiar na obrońcę)', () => {
  const state = walka({
    stwory: { b1: ['p1', 2, 2, { counters: { '+1/+1': 1 } }], b2: ['p1', 3, 3], a: ['p2', 4, 4, { keywords: ['trample'] }], z: ['p2', 3, 3] },
    atak: ['a', 'z'],
    bloki: { a: ['b1', 'b2'], z: ['b1'] },
  });
  const oferta = playerView(state, 'p2').legalCommands
    .find((cmd) => cmd.type === 'resolve_damage_assignment').assignments;
  assert.deepEqual(oferta.a, [{ blockerId: 'b1', amount: 0 }, { blockerId: 'b2', amount: 3 }],
    'b1 pokryty przez z → 0; b2 dostaje lethal 3; nadmiar 1 legalnie idzie na obrońcę (CR 702.19b)');
  assert.equal(suma(oferta.a), 3, 'przy trample suma może być mniejsza niż moc — nadmiar dla gracza');
  domknijDecyzje(state);
  assert.equal(life(state, 'p1'), 19, '1 obrażenie przeszło przez blokerów');
  assert.ok(!alive(state, 'b1') && !alive(state, 'b2'), 'obaj blokerzy giną');
});

test('P/9: wszystkie cele pokryte — reszta do ostatniego, pełna suma, plan legalny', () => {
  const state = walka({
    stwory: {
      b1: ['p1', 2, 2, { counters: { '+1/+1': 1 } }],   // 3/3, drugi slot
      b2: ['p1', 2, 2, { counters: { '+1/+1': 1 } }],   // 3/3, drugi slot
      a: ['p2', 4, 4], z: ['p2', 3, 3], y: ['p2', 3, 3],
    },
    atak: ['a', 'z', 'y'],
    bloki: { a: ['b1', 'b2'], z: ['b1'], y: ['b2'] },
    seed: 44,
  });
  const oferta = playerView(state, 'p2').legalCommands
    .find((cmd) => cmd.type === 'resolve_damage_assignment').assignments;
  assert.deepEqual(oferta.a, [{ blockerId: 'b1', amount: 0 }, { blockerId: 'b2', amount: 4 }],
    'obu blokerów mają lethal od z i y — cała moc idzie do ostatniego (konwencja E8/B3)');
  assert.equal(suma(oferta.a), 4, 'bez trample suma MUSI być równa mocy (CR 510.1a) — reszta nie ginie');
  domknijDecyzje(state);
  assert.ok(!alive(state, 'b1') && !alive(state, 'b2'), 'obaj blokerzy giną');
  assert.equal(life(state, 'p1'), 20, 'bez trample nic nie przechodzi na obrońcę');
});

// ---- P/10: helpery strony blokera (jednostkowo) --------------------------------

test('P/10: helpery pokrycia po stronie blokera — suma, deathtouch, onlyAssigned, brak kontekstu', () => {
  const state = walka({ stwory: stworyBlokera(), atak: ['a1', 'a2'], bloki: { a1: ['w', 'v'], a2: ['w'] } });
  const pending = state.pendingDamageAssignment;
  const pass = pending.pass;
  const mapa = { v: [{ attackerId: 'a1', amount: 2 }] };

  assert.equal(damageAssignedToAttackerThisPass(state, pass, 'a1', 'w', mapa), 2, 'jawny przydział v liczony w sumie');
  assert.equal(lethalAssignedByOtherBlockersThisPass(state, pass, 'a1', 'w', mapa), true, 'lethal a1 (2) pokryty przez v');
  assert.equal(lethalAssignedByOtherBlockersThisPass(state, pass, 'a2', 'w', mapa), false, 'a2 nie ma innych blokerów');

  // Deathtouch: każde niezerowe obrażenie jest lethal (CR 702.2b).
  const deathtouch = walka({
    stwory: stworyBlokera({ v: [1, 1, { keywords: ['deathtouch'] }] }),
    atak: ['a1', 'a2'], bloki: { a1: ['w', 'v'], a2: ['w'] },
  });
  const mapaDt = { v: [{ attackerId: 'a1', amount: 1 }] };
  assert.equal(lethalAssignedByOtherBlockersThisPass(deathtouch, deathtouch.pendingDamageAssignment.pass, 'a1', 'w', mapaDt), true,
    '1 obrażenie z deathtouch = lethal niezależnie od wytrzymałości');

  // Bloker bez decyzji (jeden cel = pełna moc, CR 510.1d) jest PEWNY i liczy się
  // zawsze — także bez jawnej mapy (symetria helpera po stronie atakujących).
  assert.equal(lethalAssignedByOtherBlockersThisPass(state, pass, 'a1', 'w', null, true), true,
    'v blokuje tylko a1, więc jego 2 obrażenia są pewne i pokrywają lethal a1');

  // onlyAssigned: bloker z decyzją, której NIE ogłoszono, nie jest brany pod uwagę
  // (polityka sekwencyjna B1 — inaczej każdy zakładałby, że pokrycie zapewni ktoś
  // inny, i dopłatę dostawałby ostatni w kolejności zamiast pierwszego).
  const dwoch = walka({
    stwory: {
      a1: ['p2', 2, 2], a2: ['p2', 2, 2],
      w: ['p1', 2, 2, { counters: { '+1/+1': 1 } }],
      v: ['p1', 2, 2, { counters: { '+1/+1': 1 } }],
    },
    atak: ['a1', 'a2'], bloki: { a1: ['w', 'v'], a2: ['w', 'v'] }, seed: 33,
  });
  const passDwoch = dwoch.pendingDamageAssignment.pass;
  assert.equal(lethalAssignedByOtherBlockersThisPass(dwoch, passDwoch, 'a1', 'w', null, true), false,
    'v ma decyzję (dwa cele) i jeszcze jej nie ogłosił — pokrycia NIE wolno zakładać');
  assert.equal(lethalAssignedByOtherBlockersThisPass(dwoch, passDwoch, 'a1', 'w', null, false), true,
    'bez flagi onlyAssigned liczymy podział domyślny v (ścieżka walidatora: stan, który faktycznie zajdzie)');

  // Bez kontekstu plan jest dokładnie taki jak przed zmianą (wołania jednostkowe).
  assert.deepEqual(defaultBlockerDamageAssignmentFor(state, 'w', ['a1', 'a2'], 4),
    [{ attackerId: 'a1', amount: 2 }, { attackerId: 'a2', amount: 2 }]);
  assert.deepEqual(defaultBlockerDamageAssignmentFor(state, 'w', ['a1', 'a2'], 4, { assignments: mapa, pass }),
    [{ attackerId: 'a1', amount: 0 }, { attackerId: 'a2', amount: 4 }],
    'z kontekstem: pokryty cel dostaje 0, reszta idzie na ostatni (konwencja E8/B3)');
  assert.deepEqual(defaultDamageAssignmentFor(state, 'a2', ['w'], 3),
    [{ blockerId: 'w', amount: 3 }], 'jeden bloker = pełna moc (CR 510.1c, M66 D)');
});
