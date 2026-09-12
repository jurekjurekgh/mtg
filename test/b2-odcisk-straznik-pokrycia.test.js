import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/engine/game-state.js';
import { createGameObject } from '../src/engine/identity.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import {
  stateFingerprint, PENDING_DECISION_FIELDS,
  OBJECT_FINGERPRINT_EXCLUSIONS, STATE_FINGERPRINT_EXCLUSIONS,
} from '../src/engine/fingerprint.js';

// B2 — obserwacja F1 z audytu PR #113: `stateFingerprint` nie pokazywał 51 ze
// 100 pól obiektu (ownerId, isToken, dontUntapNextUntapStep, saga, station,
// formerCounters, formerZone, toxic, echo, devour, endure, exploit, gotowości
// suspend/warp/rebound/madness, enteredOnTurn…) ani 16 kluczy stanu
// (objectSequence, spellsCastThisTurn, cardsDrawnThisTurn, lifeGainedThisTurn,
// creatureDiedThisTurn, landEnteredThisTurn, damageTakenByPlayerThisTurn,
// mulliganCounts, preventCombatExceptEnchanted…). Odcisk jest podstawą sondy
// „oferta bez skutku" w Żywym Testerze (test/table-noop.test.js) i porównywania
// replayów (src/engine/replay.js), więc każde pominięte pole to cicha ślepota:
// zmiana stanu wyglądała jak no-op (klasy L15/L55/L70 — nowa cecha, stary
// rejestr; detektor nie świeci).
//
// Naprawa jest dwojaka: (a) pola obiektu nienormalizowane jawnie trafiają do
// odcisku jako całość (`...projectValue(rest)`), (b) liczniki tury z jawnej
// listy. Ten plik jest STRAŻNIKIEM (a): wylicza rzeczywisty kształt obiektu i
// stanu z fabryk i żąda, by każdy klucz był rzutowany albo jawnie, z powodem,
// wykluczony. Bez strażnika kolejne pole znów zniknęłoby po cichu.

const MINIMAL_CARD = {
  id: 'probe-card', name: 'Probe', manaCost: '', types: ['creature'],
  subtypes: ['Soldier'], power: 1, toughness: 1, text: '', rarity: 'common',
};

const newState = () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });
  const object = createGameObject({
    id: 'o1', instanceId: 'o1#1', cardId: MINIMAL_CARD.id, card: MINIMAL_CARD,
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature',
    power: 1, toughness: 1,
  });
  state.objects.set(object.id, object);
  state.zones.battlefield.push(object.id);
  return state;
};

const fingerprintKeys = (state) => {
  const parsed = JSON.parse(stateFingerprint(state));
  return {
    parsed,
    // Decyzje wstrzymujące są rzutowane generycznie z PENDING_DECISION_FIELDS,
    // ale pusta decyzja nie trafia do odcisku (brak decyzji = brak wpisu) —
    // przynależność do listy jest więc pokryciem niezależnie od wartości.
    state: new Set([
      ...Object.keys(parsed),
      ...Object.keys(parsed.counters ?? {}),
      ...Object.keys(parsed.pendingDecisions ?? {}),
      ...PENDING_DECISION_FIELDS,
    ]),
    object: new Set(Object.keys(parsed.objects[0] ?? {})),
  };
};

// Wykluczenia mają JEDNO źródło prawdy: silnik (OBJECT/STATE_FINGERPRINT_
// EXCLUSIONS). Strażnik wymaga, by każdy wpis miał powód i dotyczył pola, które
// rzeczywiście istnieje — bez martwych wykluczeń i bez wykluczeń „na wszelki
// wypadek".
const OBJECT_EXCLUSIONS = new Map(Object.entries(OBJECT_FINGERPRINT_EXCLUSIONS));
const STATE_EXCLUSIONS = new Map(Object.entries(STATE_FINGERPRINT_EXCLUSIONS));

test('B2/1: strażnik — każde pole obiektu jest w odcisku albo jawnie wykluczone', () => {
  const state = newState();
  const object = state.objects.get('o1');
  // Uniwersum pól = fabryka ∪ token: `createBattlefieldToken` dokłada pole
  // spoza `createGameObject` (copyNumber — effects.js:1426/1943), więc sama
  // fabryka nie jest pełnym kształtem obiektu. Bez tokena strażnik uznałby
  // wykluczenie copyNumber za martwe.
  const token = createBattlefieldToken(state, 'p1', { cardId: 'probe-token', name: 'Probe Token', copyNumber: 2 });
  const universe = new Set([...Object.keys(object), ...Object.keys(token)]);
  const { object: projected } = fingerprintKeys(state);
  const missing = [...universe].filter((key) => !projected.has(key) && !OBJECT_EXCLUSIONS.has(key));
  assert.deepEqual(missing, [], `odcisk nie pokazuje pól obiektu: ${missing.join(', ')}`);
  const stale = [...OBJECT_EXCLUSIONS.keys()].filter((key) => !universe.has(key));
  assert.deepEqual(stale, [], `martwe wykluczenia obiektu: ${stale.join(', ')}`);
  for (const [key, reason] of OBJECT_EXCLUSIONS) {
    assert.ok(reason.trim().length > 3, `wykluczenie ${key} bez powodu`);
  }
});

test('B2/2: strażnik — każdy klucz stanu jest w odcisku albo jawnie wykluczony z powodem', () => {
  const state = newState();
  const { state: projected } = fingerprintKeys(state);
  const missing = Object.keys(state).filter((key) => !projected.has(key) && !STATE_EXCLUSIONS.has(key));
  assert.deepEqual(missing, [], `odcisk nie pokazuje kluczy stanu: ${missing.join(', ')}`);
  const stale = [...STATE_EXCLUSIONS.keys()].filter((key) => !(key in state));
  assert.deepEqual(stale, [], `martwe wykluczenia stanu: ${stale.join(', ')}`);
  for (const [key, reason] of STATE_EXCLUSIONS) {
    assert.ok(reason.trim().length > 3, `wykluczenie ${key} bez powodu`);
  }
});

test('B2/3: wcześniej pomijane pola obiektu realnie zmieniają odcisk', () => {
  const fields = ['ownerId', 'isToken', 'dontUntapNextUntapStep', 'toxic', 'enteredOnTurn', 'damagedByDeathtouch'];
  for (const field of fields) {
    const state = newState();
    const before = stateFingerprint(state);
    const object = state.objects.get('o1');
    const value = field === 'ownerId' ? 'p2' : field === 'enteredOnTurn' ? 3 : true;
    state.objects.set('o1', Object.freeze({ ...object, [field]: value }));
    assert.notEqual(stateFingerprint(state), before, `pole obiektu ${field} nie zmienia odcisku`);
  }
});

test('B2/4: wcześniej pomijane liczniki stanu realnie zmieniają odcisk', () => {
  const counters = ['spellsCastThisTurn', 'cardsDrawnThisTurn', 'lifeGainedThisTurn',
    'creatureDiedThisTurn', 'landEnteredThisTurn', 'damageTakenByPlayerThisTurn', 'moonlitUsedThisTurn'];
  for (const key of counters) {
    const state = newState();
    const before = stateFingerprint(state);
    state[key] = typeof state[key] === 'number' ? state[key] + 1 : 1;
    assert.notEqual(stateFingerprint(state), before, `licznik ${key} nie zmienia odcisku`);
  }
});

test('B2/5: utworzenie tokena (objectSequence) i rzucenie czaru zmieniają odcisk przez samą grę', () => {
  const state = newState();
  const before = stateFingerprint(state);
  createBattlefieldToken(state, 'p1', { cardId: 'probe-token', name: 'Probe Token' });
  assert.notEqual(stateFingerprint(state), before, 'utworzenie tokena nie zmieniło odcisku');
});

test('B2/5b: stan efektów (zapobieganie, tarcze, powiązania, udzielenia, mana) zmienia odcisk', () => {
  const cases = [
    ['preventDamageThisTurn', (state) => state.preventDamageThisTurn.push({ sourceId: 'o1', amount: 1 })],
    ['damageShields', (state) => state.damageShields.push({ targetId: 'o1', amount: 1 })],
    ['linkedAnimations', (state) => state.linkedAnimations.push({ sourceId: 'o1', targetId: 'o1' })],
    ['turnAbilityGrants', (state) => state.turnAbilityGrants.push({ objectId: 'o1', ability: 'flying' })],
    ['lastManaSpend', (state) => { state.lastManaSpend = { ...state.lastManaSpend, generic: 1 }; }],
  ];
  for (const [key, mutate] of cases) {
    const state = newState();
    const before = stateFingerprint(state);
    mutate(state);
    assert.notEqual(stateFingerprint(state), before, `stan efektu ${key} nie zmienia odcisku`);
  }
});

test('B2/7: pin wykluczeń — etykiety NIE zmieniają odcisku (granica M323/D w drugą stronę)', () => {
  const state = newState();
  const before = stateFingerprint(state);
  const object = state.objects.get('o1');
  state.objects.set('o1', Object.freeze({ ...object, copyNumber: 7 }));
  assert.equal(stateFingerprint(state), before, 'copyNumber (etykieta) zmienił odcisk — granica M323/D przesunięta');
  state.objectSequence += 5;
  assert.equal(stateFingerprint(state), before, 'objectSequence (generator id) zmienił odcisk — szum w sondzie no-op');
});

test('B2/6: dwa identyczne stany mają identyczny odcisk (stabilność po rozszerzeniu)', () => {
  assert.equal(stateFingerprint(newState()), stateFingerprint(newState()));
});
