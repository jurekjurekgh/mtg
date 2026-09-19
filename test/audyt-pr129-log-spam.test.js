// Audyt PR #129 — domknięcie znaleziska F-2 audytu PR #128
// (`docs/audits/AUDYT_PR128_2026-09-18.md`).
//
// F-2 (niskie): siatka bezpieczeństwa `rerender()` logowała KAŻDY wyjątek
//   przy KAŻDYM renderze; log partii nie jest przycinany
//   (`sessionLog` → `log.push`, session.js — grep `log.splice|MAX_LOG` = 0),
//   więc trwały błąd renderu zalewałby log identycznymi wpisami. Naprawa:
//   wpis do logu tylko, gdy komunikat się ZMIENIŁ (pamiętany w
//   `lastRenderLogMessage`). Strażnik jest źródłowy (wzorzec M386/H) — main.js
//   jest bootstrapem bez eksportów, więc pin czyta strukturę `rerender`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('PR129/F-2: siatka bezpieczeństwa rerender nie zalewa logu tym samym wpisem', () => {
  const src = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const rr = src.indexOf('function rerender()');
  assert.ok(rr > 0, 'nie znaleziono rerender w main.js');
  const catchIdx = src.indexOf('catch (error)', rr);
  assert.ok(catchIdx > rr, 'brak catch siatki bezpieczeństwa w rerender');
  const block = src.slice(catchIdx, catchIdx + 700);
  assert.match(block, /logSystem\(/, 'błąd renderu bez śladu w logu partii');
  assert.match(block, /lastRenderLogMessage/,
    'F-2: siatka bezpieczeństwa nie pamięta ostatnio zalogowanego komunikatu');
  // F-3 audytu PR #129 (2026-09-19): sam `!==` był za luźny — wariant
  // `if (lastRenderLogMessage === null && message !== lastRenderLogMessage)`
  // (log tylko raz w życiu sesji, kolejne INNE błędy przepadają) przechodził
  // zielono (mutacja M16: 0 RED). Pin wymaga DOKŁADNEJ postaci bramki
  // deduplikacji: porównanie bieżącego komunikatu z poprzednim i przypisanie
  // w tym samym bloku, bez dodatkowego warunku na „null”.
  assert.match(block, /if\s*\(\s*message\s*!==\s*lastRenderLogMessage\s*\)\s*\{/,
    'F-2: bramka ma porównywać BIEŻĄCY komunikat z poprzednim — nie dowolny warunek z `!==`');
  assert.match(block, /lastRenderLogMessage\s*=\s*message;/,
    'F-2: brak przypisania ostatniego komunikatu w bloku deduplikacji');
  assert.doesNotMatch(block, /lastRenderLogMessage\s*===\s*null/,
    'F-2: warunek „null” loguje błąd tylko raz w całej sesji — kolejne inne błędy przepadają');
});
