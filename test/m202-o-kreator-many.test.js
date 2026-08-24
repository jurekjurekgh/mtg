// M202/O — zgłoszenie właściciela (Horizon Spellbomb):
//
//   „dobrowolna opłata G przy poświęceniu (daje dobranie karty). Kliknąłem że
//    korzystam z tej dobrowolnej opłaty. Mam na stole tylko jeden niezatapowany
//    las, mimo to dostałem mana wizard do zapłacenia G. Mógłby to sam zapłacić
//    bez wizarda skoro nie było innych opcji zapłacenia.”
//
// Przyczyna: o otwarciu kreatora decydował wyłącznie `countPaymentVariants`,
// który liczy RÓŻNE KSZTAŁTY płatności (deduplikacja po profilu źródła
// „kolory#ilość”), więc równoważne wybory nie są osobnymi wariantami. To za
// mało: przy JEDNYM użytecznym źródle i puli, która sama nie pokrywa kosztu,
// wyboru nie ma w ogóle — kreator tylko klika się „dalej”, zamiast zapłacić.
//
// Fix: reguła otwarcia wydzielona do testowalnej `shouldOpenManaWizard`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldOpenManaWizard } from '../src/table/mana-wizard.js';

const forest = { id: 'f1', kind: 'land', colors: ['G'], tapped: false, amount: 1 };
const island = { id: 'i1', kind: 'land', colors: ['U'], tapped: false, amount: 1 };
const forest2 = { id: 'f2', kind: 'land', colors: ['G'], tapped: false, amount: 1 };

test('M202/O: jeden las i koszt {G} — kreator SIĘ NIE otwiera (brak wyboru)', () => {
  assert.equal(shouldOpenManaWizard({
    sources: [forest], poolMana: 0, totalNeeded: 1, requirements: [['G']],
  }), false, 'jedyne możliwe źródło = brak realnego wyboru');
});

test('M202/O: jeden las + mana w puli, koszt {G} — nadal brak wyboru', () => {
  assert.equal(shouldOpenManaWizard({
    sources: [forest], poolMana: 1, totalNeeded: 1, requirements: [['G']],
  }), false, 'pula bezbarwna nie pokrywa {G}, a źródło jest jedno');
});

test('M202/O (anty-over-fix): trzy źródła i koszt {2} — wybór jest (które dwa tapnąć)', () => {
  assert.equal(shouldOpenManaWizard({
    sources: [forest, island, forest2], poolMana: 0, totalNeeded: 2, requirements: [],
  }), true, 'las+wyspa albo las+las to dwa różne kształty płatności');
});

test('M202/O: dwa źródła i koszt {2} — trzeba tapnąć oba, więc wyboru nie ma', () => {
  assert.equal(shouldOpenManaWizard({
    sources: [forest, island], poolMana: 0, totalNeeded: 2, requirements: [],
  }), false, 'jedyna możliwość to tapnąć oba źródła');
});

test('M202/O: pula pokrywa kwotę i kolory sama — kreator zbędny (płacimy z puli)', () => {
  assert.equal(shouldOpenManaWizard({
    sources: [forest, island], poolMana: 2, totalNeeded: 1, requirements: [['G']],
  }), false, 'gdy pula pokrywa koszt, tapnięcie landu nie jest realną alternatywą');
});

test('M202/O (anty-over-fix): dwa identyczne lasy to jeden kształt płatności — kreator zbędny', () => {
  assert.equal(shouldOpenManaWizard({
    sources: [forest, forest2], poolMana: 0, totalNeeded: 1, requirements: [['G']],
  }), false, 'równoważne źródła nie są osobnym wyborem (deduplikacja po profilu)');
});
