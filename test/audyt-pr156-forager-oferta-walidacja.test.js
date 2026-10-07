// Audyt PR #156, znalezisko O1 (2026-10-07, klasa L48): oferta i walidacja
// darmowego rzutu z grobu (Halo Forager, etap 'x') były DWIEMA kopiami tego
// samego filtra eligibilnych X — przed refactor'em sesji 2026-10-07 widok
// enumerował X własną pętlą (z fallbackiem po kartach o tym samym MV),
// a execute() walidował lokalnym helperem. Rozjazd oferta↔walidacja przy
// pierwszej zmianie był kwestią czasu (L41/L48).
//
// Refaktor: jeden eksportowany odczyt `graveFreeCastEligibleXValues(state,
// playerId)` wołany przez obie strony. Ten plik spina równoważność:
// (a) oferowane X = wynik helpera, (b) każdy oferowany X przechodzi
// walidację (dźwięczność), (c) każdy NIEoferowany X jest odrzucany
// (kompletność walidacji). Mutacje pomocnika (np. poluzowanie budżetu)
// muszą czerwienić te piny.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute, playerView, graveFreeCastEligibleXValues } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** Stan decyzji STAGED (jak po resolve w effects.js: stage 'x'). */
function foragerStaged({ grave = [], mana = 0, board = [] } = {}) {
  const state = createGameState({ seed: 156, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  grave.forEach((cardId, i) => put(state, `g${i}`, cardId, 'p2', 'graveyard'));
  // Audyt PR #157 (O1-pin): opcjonalne ciała na polu bitwy — legalny cel dla
  // spin-out, żeby filtr OFERTY przestał wykluczać MV 3 „po cichu".
  board.forEach((cardId, i) => put(state, `b${i}`, cardId, 'p2', 'battlefield'));
  if (mana > 0) addMana(state, 'p1', mana, { colors: [] });
  state.pendingGraveFreeCast = {
    playerId: 'p1', sourceCardId: 'halo-forager', restorePriorityTo: 'p1',
    stage: 'x', xValue: null, objectId: null, cardId: null,
  };
  return state;
}

// Grobowiec: MV 1 (caravan-vigil), MV 2 (raise-the-alarm), MV 3 (spin-out).
const GRAVE = ['caravan-vigil', 'raise-the-alarm', 'spin-out'];

const offeredXs = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline && c.objectId == null && c.xValue != null)
  .map((c) => c.xValue)
  .sort((a, b) => a - b);

test('O1/1: oferowane X to dokładnie wynik wspólnego helpera (bez duplikatów)', () => {
  const state = foragerStaged({ grave: GRAVE, mana: 2 });
  const helper = graveFreeCastEligibleXValues(state, 'p1');
  assert.deepEqual(offeredXs(state), helper, 'oferta = wspólny odczyt (L48)');
  assert.deepEqual(helper, [1, 2], 'przy budżecie 2 eligibilne są MV 1 i 2, nie 3');
});

test('O1/2 (dźwięczność): każdy oferowany X przechodzi walidację execute', () => {
  const base = foragerStaged({ grave: GRAVE, mana: 2 });
  for (const xValue of offeredXs(base)) {
    const clone = structuredClone(base);
    const res = execute(clone, { type: 'resolve_grave_free_cast', playerId: 'p1', xValue });
    assert.equal(res.ok, true, `X=${xValue} z oferty musi być przyjęte`);
    assert.equal(clone.pendingGraveFreeCast?.stage, 'card', `X=${xValue} otwiera etap karty`);
  }
});

test('O1/3 (kompletność walidacji): NIEoferowany X jest odrzucany maszynowo', () => {
  const base = foragerStaged({ grave: GRAVE, mana: 2 });
  const oferowane = new Set(offeredXs(base));
  for (const xValue of [0, 3, 4, 99]) {
    if (oferowane.has(xValue)) continue;
    const clone = structuredClone(base);
    const res = execute(clone, { type: 'resolve_grave_free_cast', playerId: 'p1', xValue });
    assert.equal(res.ok, false, `X=${xValue} spoza oferty musi być odrzucone`);
    const reason = res.events?.find((e) => e.type === 'command_rejected')?.reason;
    assert.equal(reason, 'illegal_grave_free_cast_x', `X=${xValue}: maszynowy powód`);
  }
});

test('O1/4: zmiana budżetu zmienia ofertę i walidację SPÓJNIE (helper jest jeden)', () => {
  // Budżet 3: dochodzi MV 3 (spin-out — niszczy cel, więc cel musi istnieć
  // na polu bitwy, CR 601.2c/115.1); obie strony muszą to widzieć naraz.
  const state = foragerStaged({ grave: GRAVE, mana: 3 });
  put(state, 'cel', 'segmented-krotiq', 'p2', 'battlefield');
  assert.deepEqual(offeredXs(state), [1, 2, 3], 'oferta rośnie z budżetem');
  assert.deepEqual(graveFreeCastEligibleXValues(state, 'p1'), [1, 2, 3], 'walidacja też');
  const res = execute(structuredClone(state), { type: 'resolve_grave_free_cast', playerId: 'p1', xValue: 3 });
  assert.equal(res.ok, true, 'X=3 przy budżecie 3 przechodzi walidację');
});

// Audyt PR #157 (znalezisko O1-pin): w stanie O1/1 MV 3 (spin-out) wykluczały
// DWA filtry NARAZ — budżet (2 < 3) ORAZ brak legalnego celu (puste pole
// bitwy). Mutacja filtra ISTNIENIA OFERTY (wymuszenie hasOffer) zostawiała
// wynik [1,2], czyli oryginalny pin był na ten filtr głuchy. O1/6 to naprawia.
// Uwaga metrologiczna: dwa wewnętrzne filtry budżetowe (`budget < mv` oraz
// `om <= budget` w pętli ofert) są dla kart BEZ dopłat wzajemnie redundantne
// (om == mv), więc żadna pojedyncza mutacja któregoś z nich nie jest
// obserwowalna — to własność kodu (fast-path), nie luka testu. O1/5 więc
// przypina ich SKUTAK ŁĄCZNY: karta z legalnym celem, której nie stać na manę.
test('O1/5: MV 3 z LEGALNYM celem i budżetem 2 — nadal nieeligibilne (budżet)', () => {
  const state = foragerStaged({ grave: GRAVE, mana: 2, board: ['giant-spider'] });
  assert.deepEqual(graveFreeCastEligibleXValues(state, 'p1'), [1, 2],
    'MV 3 wyklucza BUDŻET (cel legalny, mana 2 < 3)');
  assert.deepEqual(offeredXs(state), [1, 2], 'oferta = helper (ten sam filtr)');
});

test('O1/6 (filtr ISTNIENIA OFERTY nośny): MV 3 w budżecie 3, ale BEZ legalnego celu', () => {
  const state = foragerStaged({ grave: GRAVE, mana: 3 });
  assert.deepEqual(graveFreeCastEligibleXValues(state, 'p1'), [1, 2],
    'MV 3 wyklucza WYŁĄCZNIE brak oferty (budżet 3 >= 3, brak celu na planszy)');
  assert.deepEqual(offeredXs(state), [1, 2], 'oferta = helper (ten sam filtr)');
});
