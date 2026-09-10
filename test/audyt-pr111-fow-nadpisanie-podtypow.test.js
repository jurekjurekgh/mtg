// F3 z audytu PR #111 (2026-09-10): widok wystawiał `subtypesBeforeOverride`
// (nowe pole z F-A) i `lostKeywordsUntilEOT` (pole starsze, ten sam kształt)
// BEZ strażnika `hiddenFromViewer`, który ma sąsiednia linia `subtypes`.
// Dla permanentu face-down pola zdradziłyby przeciwnikowi oryginalne podtypy
// i utracone keywordy zakrytej karty — naruszenie CR 708.2.
//
// CR 708.2 (dosłownie, CR 2026-08-07 via mtg.wiki/page/Face_down):
// „Face-down spells and face-down permanents have no characteristics other
// than those listed by the ability or rules that allowed the spell or
// permanent to be face down."
// CR 708.2a: „...it becomes a 2/2 face-down creature with no text, no name,
// no subtypes, and no mana cost."
//
// Ścieżka zapisu obu pól jest dziś wyłącznie samocelowa (becomes_subtype_until_
// end_of_turn — Wishful Merfolk, Krotiq Nestguard; zakryty permanent nie może
// aktywować zdolności), więc wyciek jest nieosiągalny — ale klasa L45 („FoW
// wycieka polami pobocznymi") wymaga testu NIEROZRÓŻNIALNOŚCI, który złapie
// KAŻDE przyszłe pole, nie tylko zapamiętane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function gra() {
  const state = createGameState({ seed: 111, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

function put(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

/** Widok pola bitwy gracza `viewer` jako mapa id → wpis. */
function entries(state, viewer) {
  return playerView(state, viewer).zones.battlefield;
}

test('F3: zakryty permanent z nadpisaniem podtypów — przeciwnik NIE widzi pól oryginalnych', () => {
  const state = gra();
  // Hipotetyczny stan (klasa, nie obecna karta): zakryty permanent p2, na
  // którym działa tymczasowe nadpisanie podtypów i utrata keyworda.
  put(state, 'fd', 'wishful-merfolk', 'p2', {
    faceDown: true,
    subtypes: ['Human'],
    subtypesBeforeOverride: ['Merfolk'],
    lostKeywordsUntilEOT: ['defender'],
  });
  const entryWroga = entries(state, 'p1').find((o) => o.id === 'fd');
  assert.equal(entryWroga.subtypesBeforeOverride, undefined,
    'CR 708.2a: zakryta karta nie ma podtypów — oryginał nie może wyciec do widoku przeciwnika');
  assert.equal(entryWroga.lostKeywordsUntilEOT, undefined,
    'CR 708.2: zakryta karta nie ma cech — utracone keywordy nie mogą wyciec do widoku przeciwnika');
  // Kontroler zna swoją kartę (CR 708.5).
  const entrySwoj = entries(state, 'p2').find((o) => o.id === 'fd');
  assert.deepEqual(entrySwoj.subtypesBeforeOverride, ['Merfolk'], 'kontroler widzi nadpisanie');
  assert.deepEqual(entrySwoj.lostKeywordsUntilEOT, ['defender'], 'kontroler widzi utracone keywordy');
});

test('F3 (L45): dwa zakryte permanenty różniące się TYLKO polami nadpisania są NIEROZRÓŻNIALNE dla przeciwnika', () => {
  const state = gra();
  put(state, 'fd-a', 'wishful-merfolk', 'p2', {
    faceDown: true,
    subtypes: ['Human'],
    subtypesBeforeOverride: ['Merfolk'],
    lostKeywordsUntilEOT: ['defender'],
  });
  put(state, 'fd-b', 'wishful-merfolk', 'p2', { faceDown: true });
  const [a, b] = entries(state, 'p1')
    .filter((o) => o.id === 'fd-a' || o.id === 'fd-b')
    .map((o) => ({ ...o, id: 'X' })); // id jest jawne (kolejność wejścia), reszta ma być równa
  assert.deepEqual(a, b,
    `widok przeciwnika musi być identyczny — inaczej pola nadpisania zdradzają, KTÓRY permanent jest który: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
});

test('F3 (anty-over-fix): odkryty permanent z nadpisaniem — pola jawne dla OBU graczy', () => {
  const state = gra();
  put(state, 'wm', 'wishful-merfolk', 'p2', {
    subtypes: ['Human'],
    subtypesBeforeOverride: ['Merfolk'],
    lostKeywordsUntilEOT: ['defender'],
  });
  for (const viewer of ['p1', 'p2']) {
    const entry = entries(state, viewer).find((o) => o.id === 'wm');
    assert.deepEqual(entry.subtypesBeforeOverride, ['Merfolk'], `${viewer}: nadpisanie jawne na odkrytym`);
    assert.deepEqual(entry.lostKeywordsUntilEOT, ['defender'], `${viewer}: utracone keywordy jawne na odkrytym`);
  }
});
