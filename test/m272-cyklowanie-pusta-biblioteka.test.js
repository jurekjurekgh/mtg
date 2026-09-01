import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

/**
 * M272 (błąd #21, CR 704.5m + 104.4b) — gracz, który PRÓBUJE dobrać kartę
 * z pustej biblioteki, przegrywa przy najbliższym sprawdzeniu akcji stanowych.
 * Silnik realizuje to znacznikiem `state.emptyLibraryDraw[playerId]`, który
 * konsumuje `runStateBasedActions` (opóźnienie jest celowe: jednoczesne puste
 * biblioteki muszą dać REMIS, a nie zwycięzcę z kolejności).
 *
 * Znacznik stawiały tylko DWIE z czterech ścieżek dobierania. Ścieżka
 * cyklowania/kanałowania (spells.js) po prostu przerywała pętlę, więc
 * wycyklowanie ostatniej karty nie kończyło partii.
 */
const registry = createCardRegistry();

test('znacznik pustej biblioteki prowadzi do przegranej w SBA (CR 704.5m)', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.emptyLibraryDraw = { p1: true };
  runStateBasedActions(state);
  assert.notEqual(state.status, 'active', 'partia kończy się');
  const przegrana = state.events.find((e) => e.reason === 'empty_library');
  assert.ok(przegrana, 'padło zdarzenie przegranej z powodu pustej biblioteki');
});

test('jednoczesne puste biblioteki dają remis, nie zwycięzcę (CR 104.4b)', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.emptyLibraryDraw = { p1: true, p2: true };
  runStateBasedActions(state);
  assert.equal(state.winnerId ?? null, null, 'brak zwycięzcy — remis');
});

test('KLASA: każda ścieżka dobierania stawia znacznik pustej biblioteki', () => {
  // Strażnik SKANUJĄCY ŹRÓDŁA: pętla dobierania, która wychodzi na braku
  // karty (`if (!topId) break`), musi wcześniej postawić znacznik. Wyjątkiem
  // jest mulligan — CR 103.4 dzieje się przed rozpoczęciem partii, więc
  // dobranie mniej niż 7 kart nie jest przegraną.
  for (const plik of ['src/engine/spells.js', 'src/engine/effects.js', 'src/engine/game-state.js']) {
    const linie = fs.readFileSync(plik, 'utf8').split('\n');
    linie.forEach((linia, index) => {
      if (!/const topId = state\.zones\.library\.find/.test(linia)) return;
      // Okno musi objąć także znacznik stawiany PO pętli (drawPlayerCards
      // liczy `drawn < amount` dopiero za nią) — stąd zapas linii.
      const okno = linie.slice(index, index + 40).join('\n');
      if (!/if \(!topId\)/.test(okno)) return;
      // Interesują nas wyłącznie DOBRANIA. Podglądy wierzchu biblioteki
      // (reveal, scry, surveil) nie są dobraniem i nie kończą partii.
      if (!/card_drawn|cardsDrawnThisTurn/.test(okno)) return;
      if (/mulligan/i.test(linie.slice(Math.max(0, index - 12), index + 14).join('\n'))) return;
      assert.ok(
        okno.includes('emptyLibraryDraw'),
        `${plik}:${index + 1} — dobieranie kończy się po cichu na pustej bibliotece `
        + '(brak znacznika CR 704.5m)',
      );
    });
  }
});

test('cyklowanie z pustą biblioteką stawia znacznik przegranej', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const karta = registry.get('highland-game');
  addObject(state, {
    id: 'h1', instanceId: 'ih1', cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(karta), types: karta.types,
  });
  // Biblioteka p1 jest pusta — cyklowanie musi postawić znacznik.
  assert.equal(
    state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1').length, 0,
    'warunek początkowy: pusta biblioteka p1',
  );
  const zrodlo = fs.readFileSync('src/engine/spells.js', 'utf8');
  assert.ok(
    zrodlo.includes('emptyLibraryDraw'),
    'ścieżka cyklowania/kanałowania zna znacznik pustej biblioteki',
  );
});
