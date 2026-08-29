# ADR 0018: Pełny benchmark B0 wyłącznie na wyraźną komendę właściciela

- **Status:** Zaakceptowana
- **Data:** 2026-08-16
- **Decydenci:** właściciel projektu (sesja M103)

## Kontekst

Pełna macierz B0 (`tools/benchmark.mjs` bez argumentów: 3 boty × 12 talii × 50
seedów × 2 strony = 23 400 meczów) trwa ~40–45 minut i blokuje sesję. Reguła z
AGENTS.md dotąd obowiązywała tylko AUDYTU, a nie pozostałych prac; w sesji M103
pełny przebieg odpalono trzykrotnie przy okazji zmian silnika i bota, z czego
ostatni przerwano po ~40 minutach jako marnotrawstwo czasu.

Pełny przebieg ma jednak wartość: jest baseline'em jakości bota
(`tools/b1-final-*.json`), a jego wynik trafia do opisu PR. Mniejsza,
deterministyczna próbka regresji (`REGRESSION_CONFIG`: 4 seedy, 2 pary,
1248 meczów, ~2,5 min) pokrywa wykrywanie regresji w testach
(`test/bot-benchmark.test.js`).

## Decyzja

1. **Pełny przebieg B0 uruchamia się WYŁĄCZNIE na wyraźną komendę właściciela.**
   Agent sam nigdy go nie odpala — ani w sesji audytowej, ani „żeby domknąć PR".
   Jeśli właściciel zleci przebieg, wynik trafia do `tools/b1-final-*.json|txt`
   i opisu PR w tym samym przebiegu pracy.
2. **Domyślny tryb CLI benchmarku to profil szybki** (`QUICK_CONFIG`: 4 seedy,
   pary `heuristic:random` i `heuristic:aggro`, ~2–4 minuty) — ta sama próbka,
   której używają testy regresji, więc wynik jest porównywalny z progiem.
   `node tools/benchmark.mjs` = szybki; pełna macierz wymaga jawnego `--full`.
3. Bez wyniku pełnej macierzy **nie podnosi się progów regresji** w
   `test/bot-benchmark.test.js`; dopuszczalne jest zanotowanie w PR „pełny
   przebieg do uruchomienia na komendę właściciela" wraz z wynikiem próbki.

## Konsekwencje

- `tools/benchmark.mjs`: eksport `QUICK_CONFIG`, flagi `--quick` (domyślna) i
  `--full`; HELP i komentarz nagłówkowy opisują regułę.
- `AGENTS.md`: reguła z sekcji audytu uogólniona na całą pracę agenta.
- Sesje zmieniające bota lub enumerację ofert silnika commitują wynik **próbki
  szybkiej** jako bieżący stan (`tools/b1-final-*.json` zawiera pełny `config`,
  więc próbki i macierze są rozróżnialne), a pełną macierz zaznaczają jako „do
  uruchomienia na komendę".

## Nota (2026-08-29)

Liczby z §Kontekst (3×12×50 = 23 400 meczów, ~40 min) to stan z 2026-08-16. Po
podziałach talii (ADR 0024) ten sam wzór daje 75 900 meczów — nikt nie
zauważył, bo pełna macierz nie była dogrywana do końca. **Rozmiar pełnego
przebiegu wyznacza od teraz budżet meczów — patrz
[ADR 0025](0025-benchmark-match-budget-not-all-combinations.md).** Reguła
tego ADR (tylko na wyraźną komendę) pozostaje bez zmian.
