// B (znalezisko właściciela z testów, 2026-09-16, REGRESJA): etykieta decyzji
// szukania z pokoju Secret Entrance lochu brzmiała „undercity — wybierz kartę
// do ręki” — nazwa własna małą literą. Root cause: wirtualna karta lochu
// (UNDERCITY_DUNGEON, cardId 'undercity') i token Day // Night NIE SĄ w
// rejestrze batchowych kart ani w deskryptorach tokenów, więc mapa nazw sesji
// (nameById) nie znała ich i nameOf spadał do surowego identyfikatora.
// Etykieta A1/A2 (Final Parting) „${źródło} — wybierz kartę ${cel}" odsłoniła
// tę lukę, gdy loch zaczął nią opisywać swoje szukanie.
//
// Naprawa: sesja zasila nameById o wirtualne karty (wzorzec M188/B — tokeny),
// przez eksportowaną listę virtualCardNames (jedno źródło dla sesji i testów).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { virtualCardNames } from '../src/table/session.js';
import { choiceGroupTitle } from '../src/table/render.js';

test('B: wirtualne karty poza rejestrem mają nazwy w mapie sesji', () => {
  const names = new Map(virtualCardNames().map(({ id, name }) => [id, name]));
  assert.equal(names.get('undercity'), 'The Undercity', 'nazwa własna lochu — wielką literą');
  assert.equal(names.get('day-night'), 'Day // Night', 'token dnia/nocy — j.w.');
});

test('B: etykieta szukania z lochu kapitalizuje źródło', () => {
  const names = new Map(virtualCardNames().map(({ id, name }) => [id, name]));
  const fakeSession = { nameOf: (cardId) => names.get(cardId) ?? cardId };
  const title = choiceGroupTitle(
    { type: 'target', options: [{ type: 'resolve_search_choice', destination: 'hand' }] },
    fakeSession,
    { pendingSearchChoice: { sourceCardId: 'undercity' } },
  );
  assert.equal(title, 'The Undercity — wybierz kartę do ręki');
  assert.ok(!title.startsWith('undercity'), 'surowy cardId małą literą nie wycieka do UI');
});
