import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceGroupLabel, choiceGroupTitle } from '../src/table/render.js';

/**
 * Zgłoszenie właściciela C2 (2026-09-10): „w panelu «Twoje działania» proszę
 * o usunięcie liczby opcji w nawiasie (N opcji) dla czarów, ataku, bloku itp.
 * To jest przestarzała miara, teraz gdy jest elastyczny wybór modalny.”
 *
 * Objaw: „Cel czaru: Fireball (145 opcji)” — licznik to enumeracja wariantów
 * (podzbiory celów × X), którą kreator i tak rozkłada na czytelne wybory
 * (ptaszki celów + licznik X). Wpis panelu ma opisywać CZYNNOŚĆ, nie liczbę
 * wygenerowanych wariantów.
 */

const SESSION = {
  nameOf: (id) => `karta-${id}`,
  cardDetails: () => null,
};

function commandRequest(n) {
  return {
    type: 'command',
    options: Array.from({ length: n }, (_, i) => Object.freeze({
      type: 'resolve_mulligan_choice', playerId: 'p1', keep: i % 2 === 0,
    })),
  };
}

test('C2/1: etykieta grupy w «Twoje działania» nie nosi licznika „(N opcji)”', () => {
  const view = { zones: {} };
  for (const n of [1, 2, 5, 12, 14, 22, 145]) {
    const label = choiceGroupLabel(commandRequest(n), SESSION, view);
    assert.doesNotMatch(label, /\(\d+ opcj/,
      `licznik opcji ma zniknąć z etykiety panelu (N=${n}, jest: ${label})`);
  }
});

test('C2/2: etykieta grupy wciąż nazwa czynność (tytuł bez zmian)', () => {
  const view = { zones: {} };
  const label = choiceGroupLabel(commandRequest(145), SESSION, view);
  const title = choiceGroupTitle(commandRequest(145), SESSION, view);
  assert.equal(label, title, 'etykieta panelu = sam tytuł grupy, bez ozdobników');
  assert.ok(label.length > 0, 'tytuł nie może być pusty');
});
