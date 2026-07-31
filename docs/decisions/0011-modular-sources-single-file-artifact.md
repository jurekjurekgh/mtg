# ADR 0011: Modularne źródła, jednoplikowy artefakt i dwa tryby uruchomienia

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu
- **Zastępuje:** [ADR 0008](0008-plain-javascript-esm-no-build.md)

## Kontekst

ADR 0008 przyjął czysty JavaScript ESM **bez kroku budowania** i odnotował jako drobne
ryzyko, że „ESM w przeglądarce wymaga serwowania przez HTTP". Właściciel zgłosił, że to
nie jest drobne ryzyko, tylko wymaganie blokujące:

> „Na bank chcę grać z iPada, więc odpada instalowanie czegokolwiek."

Weryfikacja potwierdziła obawę. Moduły ES otwarte z `file://` są blokowane przez przeglądarkę
jako żądanie cross-origin z origin `null`; dotyczy to każdej nowoczesnej przeglądarki i nie
da się tego obejść bez serwera HTTP. Na iPadzie nie ma jak uruchomić `python3 -m http.server`.

Sprawdzono też drugą stronę: czy rezygnacja z modułów jest konieczna. Zbudowano działający
prototyp — trzy moduły ESM plus 40-linijkowy skrypt sklejający. Ten sam kod dał **identyczny
wynik** jako moduły w Node i jako pojedynczy plik HTML wykonany w przeglądarce.

Właściciel wybrał ponadto: publikację online **oraz** plik lokalny (oba tryby),
talie wersjonowane w repozytorium, a zapisy partii oparte o seed i listę ruchów.

## Decyzja

Piszemy **modularnie w czystym JavaScripcie (ESM)**, a do użycia dostarczamy
**pojedynczy plik HTML bez importów**, generowany automatycznie.

### 1. Źródła pozostają modularne

Struktura z ADR 0008 nie zmienia się (`src/engine/`, `src/protocol/`, `src/cards/`,
`src/controllers/`, `src/table/`, `test/`). Testy uruchamia `node --test` bezpośrednio
na źródłach, bez sklejania.

### 2. Krok budowania istnieje, ale nie po stronie właściciela

Skrypt `build.mjs` w repozytorium rozwiązuje graf importów, usuwa `import`/`export`
i wypisuje jeden plik HTML z całym kodem w jednym `<script>`. Ograniczenia świadome:

- bez zależności zewnętrznych — sam Node, zero `node_modules`;
- bez minifikacji i bez map źródeł — wynik ma pozostać czytelny;
- kolejność modułów wynika z grafu zależności (najgłębsze pierwsze);
- brak obsługi importów cyklicznych — jeżeli powstaną, build ma zgłosić błąd, nie milczeć.

**Właściciel nigdy nie uruchamia builda.** Robi to GitHub Actions przy każdej zmianie na `main`.

### 3. Dwa tryby uruchomienia z jednego artefaktu

| Tryb | Gdzie | Grafiki | Zastosowanie |
|---|---|---|---|
| **Online** | GitHub Pages | Scryfall | iPad, granie bez przygotowań |
| **Lokalny** | pobrany plik HTML | `./img/` właściciela, fallback Scryfall | komputer, własne arty FOT/KON |

Aplikacja wykrywa dostępność katalogu `./img/` i przełącza źródło grafik; przełącznik jest też
dostępny ręcznie. **Reguły gry, talie i przebieg partii są w obu trybach identyczne** —
różni je wyłącznie warstwa obrazów.

Uzasadnienie: właściciel ma około 10 GB ilustracji w kilku wariantach, czego nie da się
sensownie hostować za darmo (GitHub Pages rekomenduje do 1 GB). Grafiki pozostają poza
repozytorium, zgodnie z SECURITY.md.

### 4. Talie w repozytorium

Talie są plikami wersjonowanymi w repozytorium, obok definicji kart. Konsekwencja przyjęta
świadomie: **nowej talii nie zbuduje się z iPada w trakcie grania** — zmiana talii wymaga
commita. W zamian talie są zawsze dostępne w obu trybach, przeglądane w PR i nie giną.

Rozwiązuje to problem zgłoszony przez właściciela: obecna aplikacja trzyma talie w Apps Script,
a linków do niego nie chcemy w repozytorium.

Talia może odwoływać się **wyłącznie do kart o statusie `supported`**; naruszenie jest
błędem wykrywanym testem, nie dopiero w czasie gry.

### 5. Zapis partii przez seed i listę ruchów

Partia zapisuje się jako seed RNG plus sekwencja komend, nie jako zrzut stanu. Skutki:

- plik zapisu jest mały i czytelny;
- każdą partię da się odtworzyć od zera, co czyni z zapisu narzędzie zgłaszania błędów —
  właściciel przysyła plik, agent odtwarza dokładnie tę samą sytuację;
- zapis wymusza determinizm z ADR 0005, zamiast tylko go deklarować.

Autosave do `localStorage` pozostaje jako wygoda. **Nie jest traktowany jako trwały zapis:**
Safari na iOS kasuje `localStorage`, IndexedDB i pozostałe magazyny skryptowe po siedmiu dniach
bez interakcji ze stroną (polityka ITP firmy Apple). Dlatego trwałość zapewnia plik,
a nie przeglądarka.

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

Sekcja „Czego świadomie nie dostajemy" z ADR 0008 (brak kontroli typów, brak wyczerpujących
`switch`, brak rozróżnienia `PlayerView` od `GameState` na poziomie języka) **pozostaje
w mocy w całości** — wybór JavaScriptu się nie zmienia.

## Konsekwencje

### Pozytywne

- Właściciel gra na iPadzie bez instalowania czegokolwiek — to było wymaganie blokujące.
- Kod źródłowy pozostaje modularny i testowalny; jednoplikowość dotyczy tylko artefaktu.
- Nie wracamy do jednego pliku 9 000 linii, który audyt wskazał jako główny problem starej aplikacji.
- Grafiki nie trafiają do repozytorium ani na hosting.
- Zapis oparty o seed daje odtwarzalne zgłoszenia błędów za darmo.
- Talie w repozytorium eliminują potrzebę linków do Apps Script.

### Koszty i ryzyka

- **Powstaje krok budowania**, którego ADR 0008 chciał uniknąć. Łagodzenie: build jest
  40-linijkowym skryptem bez zależności, uruchamianym wyłącznie w CI.
- **Ryzyko rozjazdu** między zachowaniem źródeł a artefaktu. Łagodzenie: CI po zbudowaniu
  uruchamia smoke test na wygenerowanym pliku, nie tylko na źródłach.
- **Sklejony plik gubi granice modułów** — całość ląduje w jednym zasięgu. Łagodzenie:
  granice egzekwują testy i przegląd importów w PR, a nie mechanizm języka.
  Konflikt nazw wykrywa build, przerywając z błędem.
- **Talii nie da się edytować z iPada.** Świadomy koszt wyboru właściciela; do rewizji,
  gdyby okazał się uciążliwy.
- **Dwa tryby grafik to dwie ścieżki do przetestowania.** Łagodzenie: różnica jest
  odizolowana w jednym module rozwiązującym adres obrazu.

## Rozważone alternatywy

- **Utrzymanie ADR 0008 bez zmian** — odrzucone: uniemożliwia grę na iPadzie.
- **Powrót do jednego pliku źródłowego** (jak stara aplikacja) — odrzucone: to dokładnie
  ta struktura, którą audyt wskazał jako przyczynę problemów z utrzymaniem.
- **Tylko hosting online, bez pliku lokalnego** — odrzucone przez właściciela: oznaczałoby
  utratę własnych ilustracji w grze.
- **Hostowanie 10 GB grafik** — odrzucone: brak darmowej opcji, limit GitHub Pages to ~1 GB.
- **Bundler (esbuild, Rollup, Vite)** — odrzucone: wprowadza `node_modules` i złożoność
  nieproporcjonalną do 40 linii własnego skryptu.

## Powiązania

- [ADR 0008 — czysty JavaScript ESM bez kroku budowania](0008-plain-javascript-esm-no-build.md) (zastąpiona)
- [ADR 0005 — deterministyczne i odtwarzalne wykonanie](0005-deterministic-replayable-execution.md)
- [ADR 0009 — standalone Game Table](0009-standalone-game-table-instead-of-extraction.md)
- [ADR 0010 — dane reguł kart w repozytorium](0010-card-rules-data-in-repository.md)
- [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
