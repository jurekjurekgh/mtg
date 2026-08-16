# ADR 0019: Tiers testów — szybki rdzeń, wolny manifest i generyczne pokrycie katalogu

- **Status:** Zaakceptowana
- **Data:** 2026-08-16
- **Decydenci:** właściciel projektu (sesja M103)

## Kontekst

Pełny pakiet testów rósł liniowo z każdym batchem kart (216 plików,
1886 testów; każdy batch dokłada plik `real-cards-batchN.test.js`
z 30–50 testami) i liczył się coraz dłużej. Dwa czynniki techniczne:

1. Node ≥22 uruchamia pliki testów z domyślną konkurencją
   `availableParallelism() - 1` — na maszynie z 2 vCPU pliki wykonują się
   SEKWENCYJNIE, więc najcięższe z nich sumują się wprost.
2. Brak rozróżnienia między testami codziennej pętli (unit) a ciężkimi
   przebiegami (próbka regresji bota, klikane partie stołu, budowa
   artefaktu) — wszystko liczyło się przy każdym `npm test`.

## Decyzja

1. **Trzy warstwy uruchamiania** (runner `tools/run-tests.mjs`, manifest
   `tools/test-manifest.json`):
   - `npm test` — **szybki rdzeń** (wszystkie pliki spoza manifestu);
     pętla deweloperska, cel < ~2 min;
   - `npm run test:slow` — pliki z manifestu (próbka regresji bota,
     symulacje partii itd.);
   - `npm run test:all` — pełny pakiet, **wyłączna brama PR** (odpowiednik
     dotychczasowego `npm test`).
2. **Konkurencja plików ≥ 4** (`--test-concurrency`): na 2 vCPU daje realne
   zrównoleglenie (lekkie pliki kończą się w tle, gdy ciężki liczy).
3. **Wzrost katalogu kart nie rośnie w testy ręczne**: generyczne pokrycie
   katalogu (`test/catalog-coverage.test.js`) weryfikuje KAŻDĄ kartę
   rejestru strukturalnie (dane, materializacja, typy/P-T/koszty) — nowa
   karta jest pokryta automatycznie, bez nowego pliku. Testy pisane ręcznie
   dotyczą wyłącznie NOWYCH MECHANIK (zgodnie z ADR 0002), nie kart.
4. **Zasada dopisywania do manifestu**: plik trafia do `slow`, gdy jego
   samodzielny czas (`node --test <plik>`) przekracza ~5 s. Lista jest
   jawna i aktualizowana przy każdej zmianie, która przesuwa plik między
   tierami.

## Konsekwencje

- `package.json`: `test` / `test:slow` / `test:all` (plus `test:ci` jako
  alias `test:all` dla zewnętrznych narzędzi).
- AGENTS.md i WORKFLOW: brama PR = `npm run test:all`; `npm test` to
  codzienna pętla. Handoffy podają liczby z `test:all`.
- TAP-reporter pozwala mierzyć czasy per plik jednym przebiegiem
  (`node --test --test-reporter=tap`) — nie profilujemy już plik po pliku.
