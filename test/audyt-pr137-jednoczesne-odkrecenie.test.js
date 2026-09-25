// =============================================================================
// Audyt PR #137 (2026-09-25d) — CR 502.3: zbiór odkręceń jest USTALANY, a potem
// wykonywany jednocześnie. Nie wolno czytać źródła blokady już po tym, jak
// pętla je odkręciła.
//
// Sonda (żywy silnik, przed naprawą): ten sam stół, pusta decyzja „odkręć
// wszystko". Kolejność wstawienia do Map decydowała o wyniku.
//  * lira, potem własny stwór z `untapLockedBy` — stwór WSTAWAŁ w tym samym
//    kroku (źródło miało już `tapped: false` i podbity `untapVersion`, a
//    `isUntapStepLocked` odrzuca blokadę przy niezgodności wersji ZANIM
//    sprawdzi `tapped`);
//  * stwór, potem lira — stwór zostawał tapnięty (przypadkiem zgodnie z CR).
// Testy M431 (A1b/A5) tego nie łapią: ich cel jest pod kontrolą PRZECIWNIKA,
// więc nie wchodzi do pętli aktywnego gracza.
//
// CR 502.3 (lustro, indeks 245534): „the active player determines which
// permanents they control will untap. Then they untap them all simultaneously."
// Ruling liry (Scryfall thb/233, 2020-01-24): po odkręceniu źródła cel NIE
// wstaje od razu — dopiero w swoim następnym kroku odkręcania.
// CR 122.1d + 614.7: licznik stun schodzi tylko, gdy odkręcenie naprawdę by
// zaszło. Zdarzenie zastąpione nie zachodzi — więc w kroku, w którym blokada
// była aktywna w chwili ustalenia, stun zostaje.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, playerView, addObject, execute } from '../src/engine/game-state.js';
import { initializeResources } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { untapControlled } from '../src/engine/permanents.js';
import { addCounter } from '../src/engine/counters.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const LYRE = 'entrancing-lyre';

const setFlag = (state, id, patch) => state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));

/**
 * Stół na progu tury p1. `order` wymusza kolejność Map — to ona była błędem.
 * `stun` kładzie licznik na własnym stworze. `controllerId` pozwala ukraść
 * cel (zmiana kontrolera nie zdejmuje blokady — CR 110.2, blokada jest na
 * obiekcie, a krok liczy się u AKTUALNEGO kontrolera).
 */
function stol({ order = 'lyre-first', stun = 0, controllerId = 'p1' } = {}) {
  const state = createGameState({ players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY, seed: 41 });
  initializeResources(state);
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 8; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `lib-${pid}-${i}-i`, cardId: 'plains',
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'land', power: 0, toughness: 0,
        types: ['Land'], subtypes: ['Plains'], keywords: [], abilities: [], colors: ['W'], manaCost: 0,
      });
    }
  }
  state.turn.number = 3;
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.turn = jumpToStep(state.turn, 'end', 'p2');

  const wstawLire = () => {
    const lyre = REGISTRY.get(LYRE);
    addObject(state, {
      id: 'lyre', instanceId: 'lyre-i', cardId: LYRE, controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'artifact', types: lyre.types, manaCost: lyre.manaCost,
      colors: [], keywords: [], abilities: lyre.abilities,
    });
    setFlag(state, 'lyre', { tapped: true, untapChoice: true });
  };
  const wstawCel = () => {
    addObject(state, {
      id: 'own', instanceId: 'own-i', cardId: 'synthetic-own', controllerId, ownerId: 'p2',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, types: ['Creature'],
      keywords: [], abilities: [], colors: ['R'], manaCost: 2,
    });
    setFlag(state, 'own', {
      tapped: true, summoningSickness: false,
      untapLockedBy: ['lyre'],
      untapLockVersions: { lyre: 0 },
    });
    if (stun > 0) addCounter(state, 'own', 'stun', stun);
  };
  if (order === 'lyre-first') { wstawLire(); wstawCel(); } else { wstawCel(); wstawLire(); }
  return state;
}

function doStartuTury(state) {
  const przed = state.turn.number;
  for (let i = 0; i < 6 && state.turn.number === przed; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: pid });
    assert.equal(r.ok, true, `pass ${pid} odrzucony: ${JSON.stringify(r.events?.[0]?.reason ?? r)}`);
  }
  assert.notEqual(state.turn.number, przed, 'harness: tura musi ruszyć (L5)');
  assert.equal(state.turn.activePlayerId, 'p1');
}

function odkrecWszystko(state) {
  doStartuTury(state);
  const oferta = (playerView(state, 'p1').legalCommands ?? [])
    .find((c) => c.type === 'resolve_untap_choice' && (c.keepTappedIds ?? []).length === 0);
  assert.ok(oferta, 'pusta decyzja „odkręć wszystko" musi być w ofercie');
  const r = execute(state, { type: 'resolve_untap_choice', playerId: 'p1', keepTappedIds: [] });
  assert.equal(r.ok, true, JSON.stringify(r.events?.[0]?.reason ?? r));
}

test('B1 — ten sam kontroler, lira wstawiona PIERWSZA: cel zostaje tapnięty w tym kroku (CR 502.3)', () => {
  const state = stol({ order: 'lyre-first' });
  const klucze = [...state.objects.keys()];
  assert.ok(klucze.indexOf('lyre') < klucze.indexOf('own'),
    'harness musi wstawić lirę przed celem — inaczej test nie mierzy złej kolejności');
  odkrecWszystko(state);
  assert.equal(state.objects.get('lyre').tapped, false, 'gracz wybrał odkręcenie źródła');
  assert.equal(state.objects.get('own').tapped, true,
    'blokada była aktywna w chwili USTALENIA — jednoczesne odkręcenie źródła nie zwalnia celu w tym samym kroku');
});

test('B2 — odwrotna kolejność wstawienia daje TEN SAM wynik (niezależność od Map)', () => {
  const state = stol({ order: 'own-first' });
  const klucze = [...state.objects.keys()];
  assert.ok(klucze.indexOf('own') < klucze.indexOf('lyre'),
    'harness musi wstawić cel przed lirą');
  odkrecWszystko(state);
  assert.equal(state.objects.get('lyre').tapped, false);
  assert.equal(state.objects.get('own').tapped, true,
    'kolejność obiektów nie jest regułą — CR 502.3 nie zna kolejności Map');
});

test('B3 — kradzież celu do kontrolera źródła nie zdejmuje blokady w tym samym kroku (CR 110.2)', () => {
  const state = stol({ order: 'lyre-first', controllerId: 'p1' });
  assert.equal(state.objects.get('own').controllerId, 'p1');
  assert.notEqual(state.objects.get('own').ownerId, 'p1', 'właściciel zostaje — zmienia się tylko kontroler');
  odkrecWszystko(state);
  assert.equal(state.objects.get('own').tapped, true,
    'blokada jedzie z obiektem; krok liczy się u aktualnego kontrolera, ale zbiór jest ustalany przed odkręceniem');
});

test('B4 — stun nie schodzi, gdy blokada była aktywna w chwili ustalenia (CR 122.1d + 614.7)', () => {
  const state = stol({ order: 'lyre-first', stun: 1 });
  assert.equal(state.objects.get('own').counters.stun, 1);
  odkrecWszystko(state);
  assert.equal(state.objects.get('own').tapped, true, 'cel nie wstaje w tym kroku');
  assert.equal(state.objects.get('own').counters?.stun, 1,
    'zdarzenie odkręcenia nie zachodzi, więc efekt zastępczy stunu nic nie robi');
});

test('B5 — następny krok odkręcania celu: blokada już wygasła, stun zastępuje odkręcenie', () => {
  const state = stol({ order: 'lyre-first', stun: 1 });
  odkrecWszystko(state);
  assert.equal(state.objects.get('lyre').untapVersion, 1, 'odkręcenie źródła podbija wersję — czas trwania się skończył');
  assert.equal(state.objects.get('own').untapLockVersions.lyre, 0);
  // Drugi krok odkręcania TEGO SAMEGO kontrolera. Źródło jest już odkręcone,
  // więc nie jest kandydatem wyboru — wołamy akcję turową wprost (to ona
  // realizuje CR 502.3 po decyzji; pierwsza noga szła przez `execute`).
  untapControlled(state, 'p1', []);
  assert.equal(state.objects.get('own').tapped, true, 'stun zastępuje odkręcenie (CR 122.1d) — cel zostaje tapnięty');
  assert.equal(state.objects.get('own').counters?.stun ?? 0, 0, 'jeden licznik stun schodzi, bo tym razem odkręcenie by zaszło');
});

test('B7 — wybór „zostaw źródło" nie zjada stunu i trzyma własny cel (CR 122.1d + 614.7)', () => {
  const state = stol({ order: 'lyre-first' });
  addCounter(state, 'lyre', 'stun', 1);
  doStartuTury(state);
  const r = execute(state, { type: 'resolve_untap_choice', playerId: 'p1', keepTappedIds: ['lyre'] });
  assert.equal(r.ok, true, JSON.stringify(r.events?.[0]?.reason ?? r));
  assert.equal(state.objects.get('lyre').tapped, true, 'gracz zostawił źródło tapnięte');
  assert.equal(state.objects.get('lyre').counters?.stun, 1,
    'wybór „nie odkręcaj" nie jest zdarzeniem odkręcenia — zastępstwo stunu nic nie robi');
  assert.equal(state.objects.get('own').tapped, true,
    'źródło tapnięte w chwili ustalenia trzyma cel tego samego kontrolera');
});

test('B6 — powyżej capu oferta nadal zawiera oba ekstrema: odkręć wszystko ORAZ zostaw wszystkie (L19/L48)', () => {
  const state = stol({ order: 'lyre-first' });
  for (let i = 0; i < 5; i += 1) {
    addObject(state, {
      id: `extra-${i}`, instanceId: `extra-${i}-i`, cardId: 'synthetic-choice',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact',
      types: ['Artifact'], keywords: [], abilities: [], colors: [], manaCost: 0,
    });
    setFlag(state, `extra-${i}`, { tapped: true, untapChoice: true });
  }
  doStartuTury(state);
  const oferty = (playerView(state, 'p1').legalCommands ?? [])
    .filter((c) => c.type === 'resolve_untap_choice');
  assert.ok(oferty.length >= 2, 'cap nie może zjeść samej decyzji');
  assert.ok(oferty.some((c) => (c.keepTappedIds ?? []).length === 0), '„odkręć wszystko" jest legalnym wyborem');
  assert.ok(oferty.some((c) => (c.keepTappedIds ?? []).length === 6),
    '„zostaw wszystkie" jest legalnym wyborem i nie może wypaść przez cap — walidacja i tak by je przyjęła (L48)');
});
