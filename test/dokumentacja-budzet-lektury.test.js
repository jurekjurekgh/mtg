// Budżet lektury startowej sesji (AGENTS.md §0).
//
// Powód (decyzja właściciela, M208): obowiązkowa lektura na starcie sesji
// rosła bez żadnego sygnału ostrzegawczego. Pomiar pokazał ~605 kB (~194-258
// tys. tokenów), z czego 384 kB to był `PROJECT_STATE.md` — dziennik 125 sesji,
// czyli historia „kto co kiedy zrobił". Dla agenta, który ma KONTYNUOWAĆ
// projekt, ta wiedza jest bezużyteczna: zasady mieszkają w AGENTS/ADR/LESSONS/
// ENVIRONMENT, a punkt zaczepienia daje ostatni PR i najnowszy handoff.
//
// Plik został przemianowany na `docs/PROJECT_HISTORY.md` i USUNIĘTY z lektur
// obowiązkowych. Ten test pilnuje dwóch rzeczy naraz:
//  1. lektura startowa (pozycje 1-4 z §0) mieści się w budżecie tokenów,
//  2. dziennik historii nie wraca na listę lektur obowiązkowych.
//
// Gdy próg zostanie przekroczony: przepisanie/rozdzielenie dokumentów jest
// obowiązkowym zadaniem sesji. Komunikat asercji podaje rozkład per plik,
// żeby było widać, co urosło — bez tego strażnik mówiłby tylko „za dużo".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Próg z AGENTS.md §0. Zmiana tej stałej to zmiana umowy z właścicielem —
// nie podnosimy jej, żeby uciszyć czerwony test (to byłoby maskowanie objawu).
const BUDZET_TOKENOW = 100_000;

// Konserwatywny przelicznik znaki→tokeny. Polski z diakrytykami i typografią
// („—", „…", cudzysłowy) tokenizuje się gorzej niż angielski: realnie ~2,4-3,2
// znaku na token. Bierzemy 2,8 — środek zakresu, bliżej pesymizmu, bo lepiej
// zapalić światło za wcześnie niż za późno.
const ZNAKOW_NA_TOKEN = 2.8;

/** Pozycje 1-4 z AGENTS.md §0 — to i tylko to jest lekturą obowiązkową. */
function plikiLekturyStartowej() {
  const adr = fs.readdirSync('docs/decisions')
    .filter((n) => n.endsWith('.md'))
    .map((n) => path.join('docs/decisions', n));
  return ['AGENTS.md', ...adr.sort(), 'docs/LESSONS.md', 'docs/setup/ENVIRONMENT.md'];
}

function tokenyPliku(plik) {
  return Math.round(fs.statSync(plik).size / ZNAKOW_NA_TOKEN);
}

test('lektura startowa (AGENTS.md §0 poz. 1-4) mieści się w budżecie tokenów', () => {
  const pliki = plikiLekturyStartowej();
  const pomiar = pliki.map((plik) => ({ plik, tokeny: tokenyPliku(plik) }));
  const suma = pomiar.reduce((acc, x) => acc + x.tokeny, 0);

  // ADR-y raportujemy zbiorczo — pojedynczy ADR to szum, rośnie ich liczba.
  const adrSuma = pomiar.filter((x) => x.plik.startsWith('docs/decisions/'))
    .reduce((acc, x) => acc + x.tokeny, 0);
  const rozklad = [
    ...pomiar.filter((x) => !x.plik.startsWith('docs/decisions/'))
      .map((x) => `    ${x.plik}: ~${(x.tokeny / 1000).toFixed(1)}k`),
    `    docs/decisions/ (${pomiar.filter((x) => x.plik.startsWith('docs/decisions/')).length} ADR): ~${(adrSuma / 1000).toFixed(1)}k`,
  ].join('\n');

  assert.ok(suma <= BUDZET_TOKENOW,
    `Lektura startowa przekroczyła budżet ${(BUDZET_TOKENOW / 1000)}k tokenów: ~${(suma / 1000).toFixed(1)}k.\n`
    + `Rozkład:\n${rozklad}\n`
    + '  Co zrobić (AGENTS.md §0): przepisz/rozdziel dokumenty — to zadanie\n'
    + '  OBOWIĄZKOWE dla tej sesji, nie opcja. Nie podnoś progu, żeby uciszyć test.\n'
    + '  Uwaga: numery lekcji (L1-L65) są cytowane w kodzie ~1150 razy w 242\n'
    + '  plikach — kondensując LESSONS.md ZACHOWAJ nagłówki „## L<nr>".');
});

test('dziennik historii nie jest lekturą obowiązkową na starcie sesji', () => {
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  const sekcja0 = agents.slice(0, agents.indexOf('\n## 1.'));

  assert.ok(fs.existsSync('docs/PROJECT_HISTORY.md'),
    'docs/PROJECT_HISTORY.md ma istnieć (dziennik sesji, ADR 0013)');

  // Historia może być w §0 wymieniona WYŁĄCZNIE jako to, czego się NIE czyta.
  const wzmianki = [...sekcja0.matchAll(/PROJECT_HISTORY/g)];
  if (wzmianki.length > 0) {
    assert.match(sekcja0, /Czego NIE czytasz na start[\s\S]*PROJECT_HISTORY/,
      'PROJECT_HISTORY w §0 dozwolone tylko w bloku „Czego NIE czytasz na start"');
  }

  // Stara nazwa nie może wrócić na listę lektur — to była główna pozycja
  // kosztowa (384 kB) i to ona zostaje z listy usunięta.
  assert.doesNotMatch(sekcja0, /^\s*\d+\.\s+\*\*`?docs\/PROJECT_STATE/m,
    'docs/PROJECT_STATE.md nie może wrócić jako numerowana pozycja lektury startowej');
});
