# ADR 0008: Czysty JavaScript (ESM) bez kroku budowania

- **Status:** Zastąpiona przez [ADR 0011](0011-modular-sources-single-file-artifact.md)
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

> **Uwaga.** Wybór języka (JavaScript + ESM), testowanie (`node --test`),
> typowanie JSDoc i struktura katalogów **pozostają aktualne** — przejmuje je
> ADR 0011. Nieaktualne jest wyłącznie założenie „bez kroku budowania": moduły
> ES nie działają z `file://`, a właściciel gra na iPadzie. Sekcja „Czego
> świadomie nie dostajemy" **nadal obowiązuje w całości**.

## Kontekst

`ARCHITECTURE.md` sugerował TypeScript i monorepo, z zastrzeżeniem potwierdzenia
po audycie. Audyt ([AUDIT_LEGACY_APP.md](../AUDIT_LEGACY_APP.md)) ustalił fakty:
obecna aplikacja to jeden plik HTML z vanilla JS, bez builda i `node_modules`;
właściciel uruchamia ją przez otwarcie pliku i kopiuje między urządzeniami (w
tym iPad); kod działa też w Node/JSDOM, więc logika nie jest przywiązana do
przeglądarki. Priorytet właściciela: **prostota obsługi i przenoszenia, bez
kompilowania** — ale z jawną listą tego, czego w ten sposób nie osiągnie.

## Decyzja

Piszemy w **czystym JavaScripcie w standardzie ES Modules**, bez transpilacji,
bundlera i kroku budowania. Kod źródłowy jest kodem uruchamianym.

1. **Jeden język, dwa środowiska.** Te same pliki `.js` działają w przeglądarce
   (`<script type="module">`) i w Node (`node --test`). Żadnych `.ts`, `.jsx`,
   żadnego bundlera.
2. **Engine bez DOM i bez sieci.** Pakiet reguł nie dotyka `document`,
   `window`, `fetch` ani `localStorage`.
3. **Testy w `node:test`** — wbudowany runner, zero zależności deweloperskich.
4. **Kontrakty opisujemy trzema warstwami zamiast typów:** JSDoc (`@typedef`,
   `@param`); funkcje fabryczne/walidujące na granicach modułów z jawnymi
   błędami; testy inwariantów jako egzekutor kontraktu.
5. **Jedno narzędzie opcjonalne:** `tsc --checkJs --noEmit` na typach z JSDoc,
   wyłącznie w CI — bez zmiany plików źródłowych, możliwe do wyłączenia.
6. **Struktura katalogów zamiast workspaces** (granice pilnują importy i
   testy):

   ```text
   src/
     engine/       # reguły, stan, walidacja — zero DOM
     protocol/     # kształty Command / Event / PlayerView / ChoiceRequest
     cards/        # definicje kart + registry statusu wsparcia
     controllers/  # boty i adapter człowieka
     table/        # standalone UI Wirtualnego Stołu
   test/
   ```

## Czego świadomie nie dostajemy

Część decyzji, nie przypis — właściciel prosił o jawną listę.

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
definicje kart, testy bez DOM, symulacje headless. Żadna decyzja z ADR
0001–0007 nie wymaga TypeScriptu.

**Realny próg bólu:** katalog > ~100 kart o złożonych interakcjach albo drugi
stały współpracownik.

## Konsekwencje

### Pozytywne

- Zero kroków między edycją a uruchomieniem — właściciel otwiera plik i gra.
- Aplikację przenosi się kopiowaniem katalogu; bez `node_modules` w ścieżce
  krytycznej; CI to `node --test`.
- Kod czytelny dla właściciela znającego dzisiejszy JS aplikacji.

### Koszty i ryzyka

- Błędy kontraktów ujawniają się w czasie działania — cena to dyscyplina
  testów; refaktory droższe, zmiany muszą być małe.
- Granice modułów są konwencją — potrzebny przegląd importów w PR.
- ESM w przeglądarce wymaga HTTP (`file://` nie zadziała).

  > **To założenie okazało się błędne i przesądziło o zastąpieniu decyzji.**
  > Na iPadzie nie da się uruchomić lokalnego serwera. ADR 0011: źródła
  > modularne, CI generuje jednoplikowy artefakt działający z `file://`.

## Rozważone alternatywy

- **TypeScript + monorepo (pnpm workspaces)** — bezpieczniejszy przy dużym
  katalogu, odrzucony przez wymagany build i złożoność obsługi.
- **TypeScript w jednym pakiecie** — wciąż wymaga kompilacji przed
  uruchomieniem.
- **JS + JSDoc sprawdzany przez `tsc` obowiązkowo** — przyjęte jako opcja CI.

## Powiązania

- [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
- [ADR 0002](0002-authoritative-card-agnostic-engine.md) · [ADR 0003](0003-player-specific-views-and-fow.md)
- [Architektura](../ARCHITECTURE.md)
