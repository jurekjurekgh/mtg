# ADR 0011: Modularne źródła, jednoplikowy artefakt i dwa tryby uruchomienia

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu
- **Zastępuje:** [ADR 0008](0008-plain-javascript-esm-no-build.md)

## Kontekst

ADR 0008 przyjął czysty JS ESM **bez kroku budowania**, odnotowując jako drobne
ryzyko, że „ESM w przeglądarce wymaga serwowania przez HTTP". Właściciel zgłosił,
że to wymaganie blokujące:

> „Na bank chcę grać z iPada, więc odpada instalowanie czegokolwiek."

Moduły ES otwarte z `file://` są blokowane jako żądanie cross-origin z origin
`null` w każdej nowoczesnej przeglądarce — nie da się tego obejść bez serwera
HTTP, a na iPadzie nie ma jak uruchomić `python3 -m http.server`.

Sprawdzono drugą stronę: prototyp (trzy moduły ESM + 40-linijkowy skrypt
sklejający) dał **identyczny wynik** jako moduły w Node i jako pojedynczy plik
HTML w przeglądarce. Właściciel wybrał ponadto: publikację online **oraz** plik
lokalny, talie wersjonowane w repozytorium, zapisy partii oparte o seed i listę
ruchów.

## Decyzja

Piszemy **modularnie w czystym JS (ESM)**, a do użycia dostarczamy **pojedynczy
plik HTML bez importów**, generowany automatycznie.

### 1. Źródła pozostają modularne

Struktura z ADR 0008 bez zmian (`src/engine/`, `src/protocol/`, `src/cards/`,
`src/controllers/`, `src/table/`, `test/`). Testy uruchamia `node --test`
bezpośrednio na źródłach, bez sklejania.

### 2. Krok budowania istnieje, ale nie po stronie właściciela

Skrypt `build.mjs` rozwiązuje graf importów, usuwa `import`/`export` i wypisuje
jeden plik HTML z całym kodem w jednym `<script>`. Ograniczenia świadome: bez
zależności zewnętrznych (sam Node, zero `node_modules`); bez minifikacji i map
źródeł (wynik ma być czytelny); kolejność modułów z grafu zależności (najgłębsze
pierwsze); brak obsługi importów cyklicznych — build zgłasza błąd, nie milczy.

**Właściciel nigdy nie uruchamia builda** — robi to GitHub Actions przy każdej
zmianie na `main`.

### 3. Dwa tryby uruchomienia z jednego artefaktu

| Tryb | Gdzie | Grafiki | Zastosowanie |
|---|---|---|---|
| **Online** | GitHub Pages | Scryfall | iPad, granie bez przygotowań |
| **Lokalny** | pobrany plik HTML | `./img/` właściciela, fallback Scryfall | komputer, własne arty FOT/KON |

Aplikacja wykrywa dostępność `./img/` i przełącza źródło grafik (przełącznik
dostępny też ręcznie). **Reguły, talie i przebieg partii są w obu trybach
identyczne** — różni je wyłącznie warstwa obrazów. Uzasadnienie: ~10 GB
ilustracji właściciela nie da się sensownie hostować za darmo (GitHub Pages
rekomenduje do 1 GB); grafiki pozostają poza repozytorium, zgodnie z SECURITY.md.

### 4. Talie w repozytorium

Talie są plikami wersjonowanymi obok definicji kart. Konsekwencja przyjęta
świadomie: **nowej talii nie zbuduje się z iPada w trakcie grania** — zmiana
talii wymaga commita. W zamian talie są dostępne w obu trybach, przeglądane w PR
i nie giną. To rozwiązuje zgłoszony problem: obecna aplikacja trzyma talie w
Apps Script, a linków do niego nie chcemy w repo. Talia może odwoływać się
**wyłącznie do kart o statusie `supported`**; naruszenie wykrywa test, nie gra.

### 5. Zapis partii przez seed i listę ruchów

Partia zapisuje się jako seed RNG plus sekwencja komend, nie jako zrzut stanu:
plik jest mały i czytelny; każdą partię da się odtworzyć od zera, co czyni z
zapisu narzędzie zgłaszania błędów (właściciel przysyła plik, agent odtwarza tę
samą sytuację); zapis wymusza determinizm z ADR 0005, zamiast go deklarować.

Autosave do `localStorage` zostaje jako wygoda, ale **nie jest trwałym
zapisem**: Safari na iOS kasuje magazyny skryptowe po siedmiu dniach bez
interakcji (polityka ITP). Trwałość zapewnia plik, nie przeglądarka.

## Co się zmienia względem ADR 0008

| Zagadnienie | ADR 0008 | ADR 0011 |
|---|---|---|
| Język i moduły | JS + ESM | **bez zmian** |
| Testy | `node --test` na źródłach | **bez zmian** |
| Typowanie | JSDoc + opcjonalny `tsc --checkJs` | **bez zmian** |
| Struktura katalogów | `src/…`, `test/` | **bez zmian** |
| Krok budowania | brak | **jest** — `build.mjs` w CI |
| Uruchomienie u właściciela | serwer HTTP | **dwuklik na pliku lub adres URL** |
| Wsparcie iPada | brak | **jest** |

Sekcja „Czego świadomie nie dostajemy" z ADR 0008 **pozostaje w mocy w całości**
— wybór JavaScriptu się nie zmienia.

## Konsekwencje

### Pozytywne

- Gra na iPadzie bez instalowania czegokolwiek (wymaganie blokujące).
- Kod źródłowy modularny i testowalny; jednoplikowość dotyczy tylko artefaktu.
- Nie wracamy do jednego pliku 9 000 linii wskazanego przez audyt.
- Grafiki poza repozytorium i hostingiem; talie w repo eliminują linki do Apps
  Script; zapis oparty o seed daje odtwarzalne zgłoszenia błędów.

### Koszty i ryzyka

- **Powstaje krok budowania**, którego ADR 0008 chciał uniknąć → build to
  40-linijkowy skrypt bez zależności, wyłącznie w CI.
- **Rozjazd między źródłami a artefaktem** → CI po zbudowaniu uruchamia smoke
  test na wygenerowanym pliku.
- **Sklejony plik gubi granice modułów** (jeden zasięg) → granice egzekwują
  testy i przegląd importów; konflikt nazw wykrywa build, przerywając z błędem.
- **Talii nie da się edytować z iPada** — świadomy koszt, do rewizji gdyby był
  uciążliwy.
- **Dwa tryby grafik to dwie ścieżki testowe** → różnica odizolowana w jednym
  module rozwiązującym adres obrazu.

## Rozważone alternatywy

- **Utrzymanie ADR 0008 bez zmian** — uniemożliwia grę na iPadzie.
- **Powrót do jednego pliku źródłowego** — dokładnie ta struktura, którą audyt
  wskazał jako przyczynę problemów z utrzymaniem.
- **Tylko hosting online** — oznaczałoby utratę własnych ilustracji w grze.
- **Hostowanie 10 GB grafik** — brak darmowej opcji (limit GitHub Pages ~1 GB).
- **Bundler (esbuild, Rollup, Vite)** — wprowadza `node_modules` i złożoność
  nieproporcjonalną do 40 linii własnego skryptu.

## Powiązania

- [ADR 0008](0008-plain-javascript-esm-no-build.md) (zastąpiona) · [ADR 0005](0005-deterministic-replayable-execution.md)
- [ADR 0009](0009-standalone-game-table-instead-of-extraction.md) · [ADR 0010](0010-card-rules-data-in-repository.md)
- [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
