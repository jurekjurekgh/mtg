// Audyt PR #93 (2026-09-03), znalezisko H — cena naprawy F: „up to N targets”
// enumeruje WSZYSTKIE kombinacje, więc przy szerokim stole panel akcji puchnie
// wykładniczo (zmierzone: 8 stworów wroga → 93 warianty rzutu Wrap in Flames;
// 2^n rośnie dalej). Właściciel gra na telefonie, a projekt ma już ten sam
// kompromis w walkie (`COMBAT_OPTION_CAP`, M245): oferta jest OGRANICZONA,
// a walidacja w `execute` pozostaje PEŁNA — bot i tak może zagrać dowolny
// legalny wariant, którego nie ma w panelu.
//
// Reguła: CR 601.2c — „up to three target creatures” pozwala wybrać dowolną
// liczbę celów od 0 do 3; oferta nie może być jedynym źródłem prawdy o tym,
// co legalne (L48 w wersji projektu: oferta = wycinek, walidacja = pełna).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { VARIABLE_TARGET_OPTION_CAP } from '../src/engine/spells.js';

// Limit wpisany LITERĄ (nie importowaną stałą): inaczej test porównywałby
// ofertę z tą samą liczbą, którą mutacja właśnie zmieniła (tautologia —
// wykryte mutacją H1 przy audycie PR #93).
const MAX_WARIANTOW_W_PANELU = 32;

const REGISTRY = createCardRegistry();
const VARIABLE_TARGETS = 'wrap-in-flames'; // „up to three target creatures”, MV 4

function game(playerId = 'p1') {
  const state = createGameState({ seed: 93, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function addCreatures(state, n, controllerId = 'p2') {
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    const id = `f${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
      kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
    ids.push(id);
  }
  return ids;
}

/** Halo Forager: karta w grobie przeciwnika, {X} = MV. */
function graveState(n, { mana = 8 } = {}) {
  const state = game('p1');
  addMana(state, 'p1', mana, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCreatures(state, n);
  put(state, 'grave', VARIABLE_TARGETS, 'p2', 'graveyard');
  state.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager' };
  return state;
}

const graveCasts = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline);

test('A93/H: mały stół — oferta jest KOMPLETNA (żadnego przycinania)', () => {
  const state = graveState(3);
  const offers = graveCasts(state);
  assert.equal(VARIABLE_TARGET_OPTION_CAP, MAX_WARIANTOW_W_PANELU, 'limit w silniku bez zmian');
  assert.ok(offers.length <= MAX_WARIANTOW_W_PANELU, 'mały stół mieści się w limicie');
  assert.equal(offers.length, 8, '3 stwory: 1 (zero celów) + 3 + 3 + 1 = 8 kombinacji');
  assert.ok(offers.some((o) => (o.targets ?? []).length === 3), 'wariant na pełne 3 cele jest w ofercie');
});

test('A93/H: szeroki stół — liczba wariantów jest OGRANICZONA (panel na telefonie)', () => {
  const state = graveState(8);
  const offers = graveCasts(state);
  assert.ok(offers.length <= MAX_WARIANTOW_W_PANELU,
    `8 stworów dawało 93 warianty; po limicie ≤ ${MAX_WARIANTOW_W_PANELU} (jest ${offers.length})`);
  assert.ok(offers.length >= 8, 'limit nie może ogołocić oferty');
  assert.ok(offers.some((o) => (o.targets ?? []).length === 3),
    'najsilniejszy wariant (tylu celów, ilu pozwala czar) zostaje w ofercie');
  assert.ok(offers.some((o) => (o.targets ?? []).length === 1), 'wariant na jeden cel zostaje w ofercie');
});

test('A93/H: L48 — walidacja jest PEŁNA: legalny wariant spoza oferty wykonuje się', () => {
  const state = graveState(8);
  const offers = graveCasts(state);
  const offered = new Set(offers.map((o) => [...(o.targets ?? [])].sort().join('|')));
  // Szukamy legalnej pary, której nie ma w przyciętej ofercie (CR 601.2c:
  // „up to three” obejmuje także dwa cele).
  let pair = null;
  for (let i = 0; i < 8 && !pair; i += 1) {
    for (let j = i + 1; j < 8 && !pair; j += 1) {
      const key = [`f${i}`, `f${j}`].sort().join('|');
      if (!offered.has(key)) pair = [`f${i}`, `f${j}`];
    }
  }
  assert.ok(pair, 'przycięta oferta pomija jakąś parę (założenie testu)');
  const r = execute(state, {
    type: 'resolve_grave_free_cast', playerId: 'p1', objectId: 'grave',
    cardId: VARIABLE_TARGETS, xValue: 4, modeIndex: 0, targets: pair,
  });
  assert.ok(r.ok, `wariant legalny per CR przechodzi, choć nie ma go w panelu (${r.events[0]?.reason ?? ''})`);
});

test('A93/H: walidacja wciąż odrzuca to, co nielegalne (liczba celów i cel)', () => {
  const state = graveState(4);
  const zaDuzo = execute(state, {
    type: 'resolve_grave_free_cast', playerId: 'p1', objectId: 'grave',
    cardId: VARIABLE_TARGETS, xValue: 4, modeIndex: 0, targets: ['f0', 'f1', 'f2', 'f3'],
  });
  assert.equal(zaDuzo.ok, false, 'cztery cele przy „up to three” są odrzucone');
  const powtorzony = execute(state, {
    type: 'resolve_grave_free_cast', playerId: 'p1', objectId: 'grave',
    cardId: VARIABLE_TARGETS, xValue: 4, modeIndex: 0, targets: ['f0', 'f0'],
  });
  assert.equal(powtorzony.ok, false, 'ten sam stwór dwa razy to nie są dwa cele');
  addObject(state, {
    id: 'art', instanceId: 'i-art', cardId: 'test-art', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Artifact'], colors: [],
  });
  const zlyCel = execute(state, {
    type: 'resolve_grave_free_cast', playerId: 'p1', objectId: 'grave',
    cardId: VARIABLE_TARGETS, xValue: 4, modeIndex: 0, targets: ['art'],
  });
  assert.equal(zlyCel.ok, false, 'artefakt nie jest stworem — cel nielegalny');
});

test('A93/H: ręka — ten sam limit obowiązuje rzut z ręki (jeden generator)', () => {
  const state = game('p1');
  addMana(state, 'p1', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCreatures(state, 8);
  put(state, 'w', VARIABLE_TARGETS, 'p1', 'hand');
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'w');
  assert.ok(casts.length > 0, 'czar z ręki jest rzucalny');
  assert.ok(casts.length <= MAX_WARIANTOW_W_PANELU,
    `rzut z ręki: ${casts.length} wariantów (limit ${MAX_WARIANTOW_W_PANELU})`);
});
