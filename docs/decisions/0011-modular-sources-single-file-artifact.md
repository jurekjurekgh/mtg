# ADR 0011: Modularne źródła, jednoplikowy artefakt i dwa tryby uruchomienia

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu
- **Zastępuje:** ADR 0008 (zarchiwizowana — jej żywe zasady są tutaj: pkt 6
  i sekcja „Czego świadomie nie dostajemy")

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

**6. Język, testy i kontrakty** (przejęte z ADR 0008, obowiązują bez zmian):

- **Czysty JavaScript w ES Modules**, bez transpilacji. Te same pliki `.js`
  działają w przeglądarce i w Node. Żadnych `.ts`, `.jsx`.
- **Engine bez DOM i bez sieci** — pakiet reguł nie dotyka `document`,
  `window`, `fetch` ani `localStorage`.
- **Testy w `node:test`** — wbudowany runner, zero zależności deweloperskich.
- **Kontrakty zamiast typów, trzy warstwy:** JSDoc (`@typedef`, `@param`);
  funkcje fabryczne/walidujące na granicach modułów z jawnymi błędami; testy
  inwariantów jako egzekutor kontraktu.
- **Jedno narzędzie opcjonalne:** `tsc --checkJs --noEmit` na typach z JSDoc,
  wyłącznie w CI.
- **Struktura katalogów zamiast workspaces** (granice pilnują importy i testy):
  `src/engine/` (reguły, stan, walidacja — zero DOM), `src/protocol/`
  (kształty Command / Event / PlayerView / ChoiceRequest), `src/cards/`
  (definicje + registry statusu wsparcia), `src/controllers/` (boty i adapter
  człowieka), `src/table/` (UI Wirtualnego Stołu), `test/`.

## Czego świadomie nie dostajemy

Część decyzji, nie przypis — właściciel prosił o jawną listę. Przejęte z ADR
0008 i nadal w mocy w całości.

| Czego brakuje | Realny skutek | Jak to łagodzimy |
|---|---|---|
| Sprawdzania typów przy kompilacji | Literówka w polu (`cardId` vs `cardID`) wyjdzie w czasie działania | JSDoc + `tsc --checkJs` w CI + testy inwariantów |
| Typów sumarycznych i wyczerpujących `switch` | Nowy rodzaj `Command` nie zgłosi pominiętych miejsc obsługi | Rejestr komend w jednym pliku + test „każda komenda ma handler" |
| Kontroli, że kontroler nie sięgnie po ukryte pole | JS nie odróżni `PlayerView` od `GameState` | `PlayerView` jako nowy obiekt kopiujący tylko dozwolone pola (nigdy referencja do stanu) + test wycieku FoW |
| Bezpiecznego masowego refaktoru | Zmiana nazwy pola w 50 miejscach bez wsparcia narzędzi | małe moduły, wysokie pokrycie testami, ograniczanie zasięgu zmian |
| `readonly` i niemutowalności z języka | Ktoś może zmutować stan w obejściu API | jedna ścieżka mutacji w engine + `Object.freeze` na `PlayerView` |
| Autouzupełniania z pełną wiernością | Wolniejsze pisanie kodu | JSDoc daje ~80% efektu w VS Code |

**Czego JS nie uniemożliwia — wbrew obawom:** determinizm i seedowane RNG,
zdarzenia i replay, projekcja `PlayerView`, walidacja komend, deklaratywne
definicje kart, testy bez DOM, symulacje headless.

**Realny próg bólu:** katalog > ~100 kart o złożonych interakcjach albo drugi
stały współpracownik.

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

- **Utrzymanie decyzji „bez kroku budowania" (ADR 0008)** — uniemożliwia grę
  na iPadzie: moduły ES są blokowane z `file://`.
- **Powrót do jednego pliku źródłowego** — struktura, którą audyt wskazał jako
  przyczynę problemów z utrzymaniem.
- **Tylko hosting online** — utrata własnych ilustracji w grze.
- **Hostowanie 10 GB grafik** — brak darmowej opcji (limit Pages ~1 GB).
- **Bundler (esbuild, Rollup, Vite)** — `node_modules` i złożoność
  nieproporcjonalna do 40 linii własnego skryptu.

## Powiązania

- [ADR 0005](0005-deterministic-replayable-execution.md) · historia decyzji
  o kroku budowania: [archiwum ADR 0008](archive/0008-plain-javascript-esm-no-build.md)
- [ADR 0009](0009-standalone-game-table-instead-of-extraction.md) · [ADR 0010](0010-card-rules-data-in-repository.md)
- [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
