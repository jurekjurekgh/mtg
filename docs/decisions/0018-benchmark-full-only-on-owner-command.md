# ADR 0018: Pełny benchmark B0 wyłącznie na wyraźną komendę właściciela

- **Status:** Zaakceptowana
- **Data:** 2026-08-16
- **Decydenci:** właściciel projektu (sesja M103)

## Kontekst

Pełna macierz B0 (`tools/benchmark.mjs` bez argumentów: 3 boty × 12 talii ×
50 seedów × 2 strony = 23 400 meczów) trwa ~40–45 minut i blokuje sesję —
agent nie powinien czekać na nią ani uruchamiać jej „przy okazji". Reguła
z AGENTS.md dotąd obowiązywała tylko AUDYTU („audyt wykonuje się bez
pełnego B0"), a nie pozostałych prac; w sesji M103 pełny przebieg został
odpalony trzykrotnie przy okazji zmian silnika i bota, z czego ostatni
został przerwany po ~40 minutach jako marnotrawstwo czasu.

Jednocześnie pełny przebieg MA wartość: jest baseline'em jakości bota
(`tools/b1-final-*.json`), a jego wynik trafia do opisu PR. Mniejsza,
deterministyczna próbka regresji (`REGRESSION_CONFIG`: 4 seedy, 2 pary,
1248 meczów, ~2,5 min) pokrywa wykrywanie regresji jakości w testach
(`test/bot-benchmark.test.js`).

## Decyzja

1. **Pełny przebieg B0 (pełna macierz: wszystkie pary botów, wszystkie
   talie, 50 seedów) uruchamia się WYŁĄCZNIE na wyraźną komendę
   właściciela.** Agent sam nigdy go nie odpala — ani w sesji audytowej,
   ani „żeby domknąć PR". Jeśli właściciel zleci przebieg, wynik trafia
   do `tools/b1-final-*.json|txt` i opisu PR w tym samym przebiegu pracy.
2. **Domyślny tryb CLI benchmarku to profil szybki** (`QUICK_CONFIG`:
   4 seedy, pary `heuristic:random` i `heuristic:aggro`, ~2–4 minuty) —
   ta sama próbka, której używają testy regresji, więc wynik jest
   porównywalny z progiem testowym. `node tools/benchmark.mjs` = szybki;
   pełna macierz wymaga jawnego `--full` (to jest forma „wyraźnej
   komendy").
3. Bez wyniku pełnej macierzy **nie podnosi się progów regresji** w
   `test/bot-benchmark.test.js`; dopuszczalne jest zanotowanie w PR
   „pełny przebieg do uruchomienia na komendę właściciela" razem
   z wynikiem próbki szybkiej.

## Konsekwencje

- `tools/benchmark.mjs`: nowy eksport `QUICK_CONFIG`, flagi `--quick`
  (domyślna) i `--full`; HELP i komentarz nagłówkowy opisują regułę.
- `AGENTS.md`: reguła z sekcji audytu uogólniona na całą pracę agenta.
- Sesje, które zmieniają bota lub enumerację ofert silnika: commitują
  wynik PRÓBKI SZYBKIEJ jako bieżący stan (`tools/b1-final-*.json`
  zawiera pełny `config`, więc próbki i macierze są rozróżnialne),
  a pełną macierz zaznaczają jako „do uruchomienia na komendę".
