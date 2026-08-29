# ADR 0011: Modularne źródła, jednoplikowy artefakt i dwa tryby uruchomienia

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu
- **Zastępuje:** [ADR 0008](0008-plain-javascript-esm-no-build.md)

## Kontekst

ADR 0008 przyjął czysty JS ESM **bez kroku budowania**, odnotowując jako drobne
ryzyko, że „ESM w przeglądarce wymaga serwowania przez HTTP". Właściciel
zgłosił, że to wymaganie blokujące: *„Na bank chcę grać z iPada, więc odpada
instalowanie czegokolwiek."* Moduły ES z `file://` są blokowane jako żądanie
cross-origin z origin `null` w każdej nowoczesnej przeglądarce — nie da się tego
obejść bez serwera HTTP, a na iPadzie nie ma jak uruchomić
`python3 -m http.server`.

Prototyp (trzy moduły ESM + 40-linijkowy skrypt sklejający) dał **identyczny
wynik** jako moduły w Node i jako pojedynczy plik HTML w przeglądarce.
Właściciel wybrał ponadto: publikację online **oraz** plik lokalny, talie
wersjonowane w repozytorium, zapisy partii oparte o seed i listę ruchów.

## Decyzja

Piszemy **modularnie w czystym JS (ESM)**, a do użycia dostarczamy **pojedynczy
plik HTML bez importów**, generowany automatycznie.

**1. Źródła pozostają modularne** (`src/engine/`, `src/protocol/`, `src/cards/`,
`src/controllers/`, `src/table/`, `test/`). Testy uruchamia `node --test`
bezpośrednio na źródłach, bez sklejania.

**2. Krok budowania istnieje, ale nie po stronie właściciela.** `build.mjs`
rozwiązuje graf importów, usuwa `import`/`export` i wypisuje jeden plik HTML z
całym kodem w jednym `<script>`. Ograniczenia świadome: bez zależności
zewnętrznych (sam Node); bez minifikacji i map źródeł (wynik ma być czytelny);
kolejność z grafu zależności; brak obsługi importów cyklicznych — build
zgłasza błąd. **Właściciel nigdy nie uruchamia builda** — robi to GitHub
Actions przy każdej zmianie na `main`.

**3. Dwa tryby uruchomienia z jednego artefaktu**

| Tryb | Gdzie | Grafiki | Zastosowanie |
|---|---|---|---|
| **Online** | GitHub Pages | Scryfall | iPad, granie bez przygotowań |
| **Lokalny** | pobrany plik HTML | `./img/` właściciela, fallback Scryfall | komputer, własne arty FOT/KON |

Aplikacja wykrywa `./img/` i przełącza źródło grafik (przełącznik też ręcznie).
**Reguły, talie i przebieg partii są identyczne** — różni je wyłącznie warstwa
obrazów. Uzasadnienie: ~10 GB ilustracji właściciela nie da się hostować za
darmo (GitHub Pages rekomenduje do 1 GB); grafiki zostają poza repozytorium
(SECURITY.md).

**4. Talie w repozytorium.** Pliki wersjonowane obok definicji kart.
Konsekwencja przyjęta świadomie: **nowej talii nie zbuduje się z iPada** —
zmiana wymaga commita. W zamian talie są dostępne w obu trybach, przeglądane w
PR i nie giną; znika też potrzeba linków do Apps Script. Talia odwołuje się
**wyłącznie do kart o statusie `supported`**; naruszenie wykrywa test.

**5. Zapis partii przez seed i listę ruchów** — nie zrzut stanu: plik jest mały,
partię da się odtworzyć od zera (właściciel przysyła plik, agent odtwarza tę
samą sytuację), a zapis wymusza determinizm z ADR 0005. Autosave do
`localStorage` zostaje jako wygoda, ale **nie jest trwałym zapisem**: Safari na
iOS kasuje magazyny skryptowe po siedmiu dniach bez interakcji (ITP).

## Co się zmienia względem ADR 0008

| Zagadnienie | ADR 0008 | ADR 0011 |
|---|---|---|
| Język i moduły, testy, typowanie | JS + ESM, `node --test`, JSDoc + opcjonalny `tsc --checkJs`, `src/…` | **bez zmian** |
| Krok budowania | brak | **jest** — `build.mjs` w CI |
| Uruchomienie u właściciela | serwer HTTP | **dwuklik na pliku lub adres URL** |
| Wsparcie iPada | brak | **jest** |

Sekcja „Czego świadomie nie dostajemy" z ADR 0008 **pozostaje w mocy w całości**.

## Konsekwencje

### Pozytywne

- Gra na iPadzie bez instalowania czegokolwiek (wymaganie blokujące).
- Kod źródłowy modularny i testowalny; jednoplikowość dotyczy artefaktu, nie
  powrót do pliku 9 000 linii z audytu.
- Grafiki poza repozytorium i hostingiem; zapis oparty o seed daje odtwarzalne
  zgłoszenia błędów.

### Koszty i ryzyka

- **Powstaje krok budowania** → build to 40-linijkowy skrypt bez zależności,
  wyłącznie w CI.
- **Rozjazd między źródłami a artefaktem** → CI po zbudowaniu uruchamia smoke
  test na wygenerowanym pliku.
- **Sklejony plik gubi granice modułów** → granice egzekwują testy i przegląd
  importów; konflikt nazw przerywa build błędem.
- **Talii nie da się edytować z iPada** — świadomy koszt, do rewizji.
- **Dwa tryby grafik = dwie ścieżki testowe** → różnica odizolowana w jednym
  module adresu obrazu.

## Rozważone alternatywy

- **Utrzymanie ADR 0008 bez zmian** — uniemożliwia grę na iPadzie.
- **Powrót do jednego pliku źródłowego** — struktura, którą audyt wskazał jako
  przyczynę problemów z utrzymaniem.
- **Tylko hosting online** — utrata własnych ilustracji w grze.
- **Hostowanie 10 GB grafik** — brak darmowej opcji (limit Pages ~1 GB).
- **Bundler (esbuild, Rollup, Vite)** — `node_modules` i złożoność
  nieproporcjonalna do 40 linii własnego skryptu.

## Powiązania

- [ADR 0008](0008-plain-javascript-esm-no-build.md) (zastąpiona) · [ADR 0005](0005-deterministic-replayable-execution.md)
- [ADR 0009](0009-standalone-game-table-instead-of-extraction.md) · [ADR 0010](0010-card-rules-data-in-repository.md)
- [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
