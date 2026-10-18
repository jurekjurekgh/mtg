// Audyt PR #93 (2026-09-03), znalezisko H: „up to N targets” enumeruje WSZYSTKIE
// kombinacje (8 stworów → 93 warianty). PR #93 wprowadził wtedy przycinanie
// oferty do 32. Zlecenie właściciela (2026-10-17, O-2): NIE limitujemy celów —
// oferta jest KOMPLETNA; przy szerokim stole liczy się dłużej, ale bez błędu.
// Panel nie puchnie, bo grupa celów to jeden kreator wielocelowy (checkboxy
// celów, a nie lista kombinacji). Walidacja w `execute` pozostaje pełna.
//
// Reguła: CR 601.2c — „up to three target creatures” pozwala wybrać dowolną
// liczbę celów od 0 do 3; oferta obejmuje każdy taki wybór (L48: oferta =
// walidacja, obie liczą z tej samej listy kombinacji).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

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
  assert.equal(offers.length, 8, '3 stwory: 1 (zero celów) + 3 + 3 + 1 = 8 kombinacji');
  assert.ok(offers.some((o) => (o.targets ?? []).length === 3), 'wariant na pełne 3 cele jest w ofercie');
});

test('A93/H: szeroki stół — oferta KOMPLETNA (O-2, zlecenie 2026-10-17): 8 stworów → 93 warianty', () => {
  const state = graveState(8);
  const offers = graveCasts(state);
  // C(8,0)+C(8,1)+C(8,2)+C(8,3) = 1+8+28+56 = 93 — każda kombinacja, bez limitu.
  assert.equal(offers.length, 93, `oferta ma wszystkie kombinacje do trzech celów (jest ${offers.length})`);
  assert.ok(offers.some((o) => (o.targets ?? []).length === 3), 'wariant na 3 cele zostaje');
  assert.ok(offers.some((o) => (o.targets ?? []).length === 1), 'wariant na jeden cel zostaje');
});

test('A93/H: L48 — każda legalna para jest w ofercie i wykonuje się (oferta = walidacja)', () => {
  const state = graveState(8);
  const offers = graveCasts(state);
  const offered = new Set(offers.map((o) => [...(o.targets ?? [])].sort().join('|')));
  const key = ['f1', 'f6'].sort().join('|');
  assert.ok(offered.has(key), 'para spoza dawnego przycięcia jest w ofercie');
  const r = execute(state, {
    type: 'resolve_grave_free_cast', playerId: 'p1', objectId: 'grave',
    cardId: VARIABLE_TARGETS, xValue: 4, modeIndex: 0, targets: ['f1', 'f6'],
  });
  assert.ok(r.ok, `legalny wariant wykonuje się (${r.events[0]?.reason ?? ''})`);
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
  assert.equal(casts.length, 93, `rzut z ręki: ${casts.length} wariantów (wszystkie kombinacje)`);
});
