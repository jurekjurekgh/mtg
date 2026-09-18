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
  assert.match(block, /!==\s*lastRenderLogMessage|lastRenderLogMessage\s*!==/,
    'F-2: brak porównania z poprzednim komunikatem — trwały błąd renderu zalewałby log');
});
