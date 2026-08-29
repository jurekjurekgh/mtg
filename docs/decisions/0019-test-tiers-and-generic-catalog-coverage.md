# ADR 0019: Tiers testów — szybki rdzeń, wolny manifest i generyczne pokrycie katalogu

- **Status:** Zaakceptowana
- **Data:** 2026-08-16
- **Decydenci:** właściciel projektu (sesja M103)

## Kontekst

Pełny pakiet testów rósł liniowo z każdym batchem kart (216 plików, 1886
testów; każdy batch dokłada `real-cards-batchN.test.js` z 30–50 testami). Dwa
czynniki techniczne:

1. Node ≥22 uruchamia pliki testów z domyślną konkurencją
   `availableParallelism() - 1` — na maszynie z 2 vCPU pliki wykonują się
   SEKWENCYJNIE, więc najcięższe sumują się wprost.
2. Brak rozróżnienia między testami codziennej pętli a ciężkimi przebiegami
   (próbka regresji bota, klikane partie stołu, budowa artefaktu) — wszystko
   liczyło się przy każdym `npm test`.

## Decyzja

1. **Trzy warstwy uruchamiania** (runner `tools/run-tests.mjs`, manifest
   `tools/test-manifest.json`):
   - `npm test` — **szybki rdzeń** (pliki spoza manifestu); pętla
     deweloperska, cel < ~2 min;
   - `npm run test:slow` — pliki z manifestu;
   - `npm run test:all` — pełny pakiet, **wyłączna brama PR**.
2. **Konkurencja plików ≥ 4** (`--test-concurrency`): na 2 vCPU daje realne
   zrównoleglenie.
3. **Wzrost katalogu kart nie rośnie w testy ręczne**: generyczne pokrycie
   (`test/catalog-coverage.test.js`) weryfikuje KAŻDĄ kartę rejestru
   strukturalnie (dane, materializacja, typy/P-T/koszty). Testy ręczne dotyczą
   wyłącznie NOWYCH MECHANIK (ADR 0002), nie kart.
4. **Zasada dopisywania do manifestu**: plik trafia do `slow`, gdy jego
   samodzielny czas (`node --test <plik>`) przekracza ~5 s.

## Konsekwencje

- `package.json`: `test` / `test:slow` / `test:all` (plus `test:ci` jako alias
  `test:all`).
- AGENTS.md i WORKFLOW: brama PR = `npm run test:all`; `npm test` to codzienna
  pętla. Handoffy podają liczby z `test:all`.
- TAP-reporter pozwala mierzyć czasy per plik jednym przebiegiem
  (`node --test --test-reporter=tap`) — nie profilujemy plik po pliku.
