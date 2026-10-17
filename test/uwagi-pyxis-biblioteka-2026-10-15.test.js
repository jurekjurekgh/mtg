// Uwagi właściciela z testów (2026-10-15), punkt G — Pyxis of Pandemonium:
//
// Bot wygnawał co turę po 1 karcie u KAŻDEGO gracza, mimo że:
//   a. miał mniej kart w bibliotece niż przeciwnik,
//   b. miał poniżej 10 kart.
// Oba warunki prowadzą wprost do śmierci z braku kart (CR 121.4 / 704.5b),
// więc każdy z nich MA BLOKOWAĆ użycie tej karty i jej podobnych — czyli
// zdolności symetrycznie zabierających karty z bibliotek OBU graczy:
// `each_player_exiles_top_face_down` (Pyxis) i `mill_both_players`
// (Ghoulcaller's Bell, „each player mills”).
//
// Stara wycena (M162/B, bliźniacze gałęzie) była tylko WYŚCIGIEM: przy 9 kartach
// wobec 5 przeciwnika dzwonek wyglądał na zysk (+10), a Pyxis nie miał żadnej
// kary za cienką bibliotekę. Tu każda przesłanka to twarde weto (NEVER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** Stół: artefakt `source` bota (p1) i biblioteki o zadanych rozmiarach. */
function stol(source, myLib, foeLib) {
  const state = game('p1');
  putCard(state, 'src', source, 'p1', 'battlefield');
  for (let i = 0; i < myLib; i += 1) putCard(state, `mylib${i}`, 'highland-game', 'p1', 'library');
  for (let i = 0; i < foeLib; i += 1) putCard(state, `foelib${i}`, 'highland-game', 'p2', 'library');
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'src'),
    'aktywacja artefaktu (zdolność {T}) jest w ofercie — ruch legalny');
  return view;
}

const wybraloZdolnosc = (view) => {
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  return chosen.type === 'activate_ability' && chosen.objectId === 'src';
};

// ---- a. mniej kart niż przeciwnik (przy zdrowej bibliotece ≥ 10) -----------

test('G/a1: Pyxis — bot z MNIEJSZĄ biblioteką (25 vs 30) NIE wygnaje', () => {
  assert.equal(wybraloZdolnosc(stol('pyxis-of-pandemonium', 25, 30)), false,
    'mniej kart niż przeciwnik = zakaz użycia Pyxis');
});

test('G/a2: Ghoulcaller\'s Bell — bot z MNIEJSZĄ biblioteką (25 vs 30) NIE mieli', () => {
  assert.equal(wybraloZdolnosc(stol('ghoulcallers-bell', 25, 30)), false,
    'mniej kart niż przeciwnik = zakaz użycia podobnej zdolności (mill_both_players)');
});

// ---- b. poniżej 10 kart -----------------------------------------------------

test('G/b1: Pyxis — remis 9:9 (poniżej 10) NIE wygnaje', () => {
  assert.equal(wybraloZdolnosc(stol('pyxis-of-pandemonium', 9, 9)), false,
    'poniżej 10 kart = zakaz, nawet przy remisie (tu przesłanka b, nie a)');
});

test('G/b2: Pyxis — PROWADZI 9:5, ale poniżej 10 kart — NIE wygnaje', () => {
  assert.equal(wybraloZdolnosc(stol('pyxis-of-pandemonium', 9, 5)), false,
    'prowadzenie nie znosi progu 10 — tu obowiązuje wyłącznie przesłanka b');
});

test('G/b3: Ghoulcaller\'s Bell — PROWADZI 9:5, ale poniżej 10 kart — NIE mieli', () => {
  // Przed poprawką wycena wyścigu dawała tu +10 (prowadzę), więc bot dzwonił.
  assert.equal(wybraloZdolnosc(stol('ghoulcallers-bell', 9, 5)), false,
    'mielenie podobnej zdolności przy <10 kartach jest zakazane, mimo prowadzenia');
});

// ---- kontrola: wolno tam, gdzie żadna przesłanka nie zachodzi ----------------

test('G/k1: Pyxis — bot z WIĘKSZĄ biblioteką (30 vs 10) MOŻE wygnać (brak fałszywego weta)', () => {
  assert.equal(wybraloZdolnosc(stol('pyxis-of-pandemonium', 30, 10)), true,
    'ani mniej kart niż przeciwnik, ani poniżej 10 — zakaz nie może tu działać');
});
