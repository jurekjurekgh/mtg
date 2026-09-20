// E4 (audyt PR #130, pętla jakości ADR 0021 §4b) — czytelność transkryptu.
//
// Objaw (zmierzone w przebiegach Żywego Testera 2026-09-20, partia
// worek-dziki vs alara, seed 43):
//   [multi-target wizard] Annie Flash, the Veteran — wskaż cel (1): Gila
//   CourserInvasion of the GiantsTrained ArynxI — opcji 4, potrzeba 1, celuję w 1
// Etykiety opcji zlały się w jeden ciąg bez granic, bo intro brało
// `textContent` CAŁEGO ciała modalu, a `textContent` nie wstawia spacji między
// dziećmi blokowymi. L27: transkrypt czyta się RĘCZNIE wzdłuż osi narracji —
// tego fragmentu nie dało się czytać; L12: brak narzędzia naprawiamy
// w narzędziu (produkt rysuje intro i wiersze jako osobne elementy, więc
// zupa znaków była artefaktem pomiaru, nie stołu).
//
// Dwie nogi (wzorzec L5/L83 — strażnik mierzy regułę, nie tekst źródła):
//  1. ZACHOWANIE: `modalIntroText` skleja dzieci blokowe jawnym separatorem,
//     kontener bez dzieci zwraca zwykły tekst, `null` → pusty łańcuch;
//  2. MIEJSCE UŻYCIA: oba ciała modali w `run-game.mjs` (kreator many
//     `#mana-wizard-body` i decyzje `#choice-request-body`) biorą intro przez
//     `modalIntroText` — skan po `stripComments`, żeby zakomentowanie
//     wywołania nie zostawiło zielonego strażnika.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modalIntroText } from '../tools/table-tester/extract.mjs';

const SOURCE = readFileSync('tools/table-tester/run-game.mjs', 'utf8');

/** Usuwa komentarze (liniowe i blokowe), zachowując kod — bramka L83. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Minimalny stub elementu DOM (jsdom nie jest potrzebny do czystej funkcji). */
const el = (textContent, children = []) => ({ textContent, children });

test('E4/1: intro modalu ma granice między opcjami — transkrypt da się czytać', () => {
  const body = el(
    'Annie Flash, the Veteran — wskaż cel (1):Gila CourserInvasion of the Giants',
    [
      el('Annie Flash, the Veteran — wskaż cel (1):'),
      el('Gila Courser'),
      el('Invasion of the Giants'),
    ],
  );
  assert.equal(modalIntroText(body),
    'Annie Flash, the Veteran — wskaż cel (1): | Gila Courser | Invasion of the Giants',
    'każda opcja jest osobnym członem intro');
  // Kontrprzykład (dokładnie ten objaw): surowy textContent granic nie ma.
  assert.ok(!body.textContent.includes('|'), 'textContent nie rozdziela opcji');
  // Separator domyślny i jawny — ten sam kształt.
  assert.equal(modalIntroText(body, ' / '),
    'Annie Flash, the Veteran — wskaż cel (1): / Gila Courser / Invasion of the Giants');
});

test('E4/2: kontener bez dzieci, puste dzieci i null — bez regresji', () => {
  assert.equal(modalIntroText(el('  Wybierz   karty  ')), 'Wybierz karty',
    'tekst wprost: białe znaki zwarte (jak dotąd w `text`)');
  assert.equal(modalIntroText(null), '', 'brak elementu = pusty łańcuch');
  assert.equal(modalIntroText(el('', [el('   '), el('Mountain')])), 'Mountain',
    'puste dzieci odpadają, nie zostawiają separatorów-sierot');
});

test('E4/3: oba ciała modali biorą intro przez modalIntroText (skan źródła)', () => {
  const kod = stripComments(SOURCE);
  for (const selector of ['#mana-wizard-body', '#choice-request-body']) {
    assert.ok(kod.includes(`modalIntroText($('${selector}'))`),
      `intro ${selector} idzie przez modalIntroText, nie przez textContent`);
  }
  assert.ok(!kod.includes("text($('#choice-request-body'))"),
    'stara ścieżka textContent dla ciała decyzji zniknęła (jedno źródło intro)');
  assert.match(kod, /modalIntroText[\s\S]{0,120}from '\.\/extract\.mjs'/,
    'funkcja jest importowana z extract.mjs (nie zduplikowana w narzędziu)');
});
