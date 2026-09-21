// Zgłoszenie właściciela C (2026-09-19): „Dawntreader Elk — bot poświęca go
// (traci stwora), żeby wyciągnąć ląd, gdy w bibliotece zostały 4 karty
// (→ 3), będąc o krok od przegranej. To bezsensowne; wycena musi się zmienić.”
//
// Root cause: bot karał ubytek biblioteki tylko przez `paymentLibraryLoss`
// (mielące TAPNIĘCIA płatności) i `LIBRARY_DRAIN_EFFECTS` (mill/draw).
// TUTOR — „search your library for a card…” — zabiera kartę z biblioteki
// bezpowrotnie, ale nie był nigdzie wyceniany: aktywacja Elk ({G}, poświęć:
// ląd wchodzi tapnięty) miała wycenę samego efektu (~2 pkt) i wygrywała
// z passem nawet przy 4 kartach w bibliotece.
//
// Naprawa (rodzina domknięta, L41/L102): `searchLibraryLoss` liczy karty
// zabrane z WŁASNEJ biblioteki przez wariant (typy efektów z deskryptora:
// search_library_to_hand / _to_battlefield / _to_battlefield_tapped /
// search_basic_land_morbid — ADR 0002), a wynik wchodzi do tej samej drabiny
// `libraryLossPenalty` co dobrania (margines `librarySafeMargin` = 20 kart).
// Obejmuje aktywacje ORAZ rzuty (bliźniacze gałęzie), w tym ETB-tutory
// permanentów (Pilgrim's Eye).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], ...patch,
  });
}

/** Faza main p1 z biblioteką `ksiazka` kart. */
function baza(ksiazka) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (let i = 0; i < ksiazka; i += 1) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

const decyzja = (state) => createHeuristicBot({ seed: 42 }).chooseCommand(playerView(state, 'p1'), {});
const aktywuje = (cmd, objectId) => cmd?.type === 'activate_ability' && cmd.objectId === objectId;

/** Elk + Las + mana {G} — dokładnie scena ze zgłoszenia. */
function scenaElk(ksiazka) {
  const state = baza(ksiazka);
  put(state, 'elk', 'dawntreader-elk', 'p1', 'battlefield');
  put(state, 'las', 'basic-forest', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['G'] });
  return state;
}

test('C/1 (zgłoszenie): 4 karty w bibliotece — bot NIE poświęca Elka po ląd', () => {
  const state = scenaElk(4);
  const cmd = decyzja(state);
  assert.ok(!aktywuje(cmd, 'elk'),
    `przy 4 kartach w bibliotece tutor+poświęcenie stwora to krok do przegranej: ${JSON.stringify(cmd)}`);
  assert.equal(state.objects.get('elk')?.zone, 'battlefield', 'Elk zostaje na polu bitwy');
});

test('C/2 (anty-over-fix): zdrowa biblioteka — bot nadal używa Elka do rampy', () => {
  const state = scenaElk(25);
  const cmd = decyzja(state);
  assert.ok(aktywuje(cmd, 'elk'),
    `przy 25 kartach aktywacja jest wartościowa (ląd wchodzi tapnięty): ${JSON.stringify(cmd)}`);
});

test('C/3: granica marginesu — 21 kart (zapas 20) jeszcze aktywuje, 20 już nie', () => {
  const powyzej = decyzja(scenaElk(21));
  assert.ok(aktywuje(powyzej, 'elk'), `zapas 20 kart = brak kary: ${JSON.stringify(powyzej)}`);
  const naGranicy = decyzja(scenaElk(20));
  assert.ok(!aktywuje(naGranicy, 'elk'),
    `zapas 19 kart wchodzi w margines cienkiej biblioteki: ${JSON.stringify(naGranicy)}`);
});

test('C/4 (ta sama rodzina, L41): poświęcenie artefaktu za ląd — Horizon Spellbomb', () => {
  const cienka = baza(4);
  put(cienka, 'bomb', 'horizon-spellbomb', 'p1', 'battlefield');
  addMana(cienka, 'p1', 2, {});
  assert.ok(!aktywuje(decyzja(cienka), 'bomb'),
    'poświęcenie artefaktu po ląd przy 4 kartach w bibliotece też jest nieopłacalne');

  const zdrowa = baza(25);
  put(zdrowa, 'bomb', 'horizon-spellbomb', 'p1', 'battlefield');
  addMana(zdrowa, 'p1', 2, {});
  assert.ok(aktywuje(decyzja(zdrowa), 'bomb'),
    'przy zdrowej bibliotece zdolność zostaje w użyciu');
});

test('C/5 (bliźniacza gałąź rzutów): ETB-tutor Pilgrim\'s Eye przy cienkiej bibliotece', () => {
  const cienka = baza(4);
  put(cienka, 'oko', 'pilgrims-eye', 'p1', 'hand', { kind: 'creature' });
  addMana(cienka, 'p1', 3, {});
  const cmdCienka = decyzja(cienka);
  assert.ok(!(cmdCienka?.type === 'cast_permanent' && cmdCienka.objectId === 'oko'),
    `rzut stwora z tutorem też uszczupla bibliotekę: ${JSON.stringify(cmdCienka)}`);

  const zdrowa = baza(25);
  put(zdrowa, 'oko', 'pilgrims-eye', 'p1', 'hand', { kind: 'creature' });
  addMana(zdrowa, 'p1', 3, {});
  const cmdZdrowa = decyzja(zdrowa);
  assert.ok(cmdZdrowa?.type === 'cast_permanent' && cmdZdrowa.objectId === 'oko',
    `przy zdrowej bibliotece rzut zostaje: ${JSON.stringify(cmdZdrowa)}`);
});
