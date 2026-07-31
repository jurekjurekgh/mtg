# ADR 0008: Czysty JavaScript (ESM) bez kroku budowania

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

`ARCHITECTURE.md` sugerował TypeScript i monorepo, ale zastrzegał, że wybór wymaga potwierdzenia
po audycie. Audyt ([AUDIT_LEGACY_APP.md](../AUDIT_LEGACY_APP.md)) ustalił fakty:

- obecna aplikacja to jeden plik HTML z vanilla JS, bez builda, bez `node_modules`;
- właściciel uruchamia ją przez otwarcie pliku i kopiuje między urządzeniami (w tym iPad);
- kod wykonuje się poprawnie także w Node/JSDOM, więc logika nie jest przywiązana do przeglądarki.

Właściciel określił priorytet wprost: **prostota obsługi i przenoszenia, bez kompilowania**,
z zastrzeżeniem, że chce wiedzieć, czego w ten sposób nie osiągnie.

## Decyzja

Piszemy w **czystym JavaScripcie w standardzie ES Modules**, bez transpilacji, bundlera
i kroku budowania. Kod źródłowy jest kodem uruchamianym.

Zasady:

1. **Jeden język, dwa środowiska.** Te same pliki `.js` działają w przeglądarce
   (`<script type="module">`) i w Node (`node --test`). Żadnych `.ts`, `.jsx`, żadnego bundlera.
2. **Engine bez DOM i bez sieci.** Pakiet reguł nie dotyka `document`, `window`, `fetch`
   ani `localStorage`. To warunek testowalności i przenośności.
3. **Testy w `node:test`** — wbudowany runner Node, zero zależności deweloperskich.
4. **Kontrakty opisujemy trzema warstwami zamiast typów:**
   - JSDoc z `@typedef` i `@param` — czytelne dla człowieka i dla podpowiedzi w edytorze;
   - funkcje fabryczne/walidujące na granicach modułów, zwracające jawne błędy;
   - testy inwariantów jako egzekutor kontraktu.
5. **Dopuszczamy jedno narzędzie opcjonalne:** `tsc --checkJs --noEmit` na typach z JSDoc,
   uruchamiane wyłącznie w CI. Nie wymaga zmiany ani jednego pliku źródłowego i nie blokuje
   uruchomienia aplikacji. Jeżeli okaże się uciążliwe — wyłączamy je bez konsekwencji dla kodu.
6. **Struktura katalogów zamiast workspaces:**

   ```text
   src/
     engine/       # reguły, stan, walidacja — zero DOM
     protocol/     # kształty Command / Event / PlayerView / ChoiceRequest
     cards/        # definicje kart + registry statusu wsparcia
     controllers/  # boty i adapter człowieka
     table/        # standalone UI Wirtualnego Stołu
   test/
   ```

   Granice pilnują importy i testy, nie konfiguracja pakietów.

## Czego świadomie nie dostajemy

Ta sekcja jest częścią decyzji, nie przypisem — właściciel prosił o jawną listę.

| Czego brakuje | Realny skutek | Jak to łagodzimy |
|---|---|---|
| Sprawdzania typów przy kompilacji | Literówka w nazwie pola (`cardId` vs `cardID`) wyjdzie dopiero w czasie działania | JSDoc + `tsc --checkJs` w CI + testy inwariantów |
| Typów sumarycznych i wyczerpujących `switch` | Dodanie nowego rodzaju `Command` nie zgłosi pominiętych miejsc obsługi | Rejestr komend w jednym pliku + test „każda komenda ma handler" |
| Kontroli, że kontroler nie sięgnie po ukryte pole | JS nie odróżni `PlayerView` od `GameState` — oba to zwykłe obiekty | `PlayerView` budowany jako **nowy obiekt kopiujący tylko dozwolone pola**, nigdy referencja do stanu; test wycieku FoW |
| Bezpiecznego masowego refaktoru | Zmiana nazwy pola w 50 miejscach bez wsparcia narzędzi | małe moduły, wysokie pokrycie testami, świadome ograniczanie zasięgu zmian |
| `readonly` i niemutowalności z języka | Ktoś może zmutować stan w obejściu API | jedna ścieżka mutacji w engine + `Object.freeze` na `PlayerView` |
| Autouzupełniania z pełną wiernością | Wolniejsze pisanie kodu | JSDoc daje 80% tego efektu w VS Code |

**Czego JS nie uniemożliwia — wbrew obawom:** determinizm i seedowane RNG, zdarzenia i replay,
projekcja `PlayerView`, walidacja komend, deklaratywne definicje kart, testy bez DOM,
symulacje headless. Żadna decyzja z ADR 0001–0007 nie wymaga TypeScriptu.

**Realny próg bólu** to moment, w którym katalog przekroczy około 100 kart o złożonych
interakcjach albo gdy pojawi się drugi stały współpracownik. Wtedy warto wrócić do tematu.

## Konsekwencje

### Pozytywne

- Zero kroków między edycją pliku a uruchomieniem — właściciel może otworzyć plik i grać.
- Aplikację przenosi się kopiowaniem katalogu; działa też z dysku, jeśli poda się serwer statyczny.
- Brak `node_modules` w ścieżce krytycznej; testy uruchamia sam Node.
- Kod pozostaje czytelny dla właściciela, który zna dzisiejszy JS aplikacji.
- CI jest trywialny: `node --test`.

### Koszty i ryzyka

- Błędy kontraktów ujawniają się w czasie działania — cena to wyższa dyscyplina testów.
- Refaktory są droższe; zmiany trzeba trzymać małe (co i tak nakazuje AGENTS.md).
- Granice modułów są konwencją, nie mechanizmem — potrzebny przegląd importów w PR.
- ESM w przeglądarce wymaga serwowania przez HTTP; otwarcie `file://` nie zadziała.
  Rozwiązanie: krótka instrukcja `python3 -m http.server` w README stołu.

## Rozważone alternatywy

- **TypeScript + monorepo (pnpm workspaces)** — najbezpieczniejszy przy dużym katalogu kart,
  odrzucony ze względu na wymagany build i złożoność obsługi.
- **TypeScript w jednym pakiecie** — mniej złożony, ale nadal wymaga kompilacji przed uruchomieniem.
- **JS + JSDoc sprawdzany przez `tsc` obowiązkowo** — przyjęte jako opcja w CI, nie jako wymóg.

## Powiązania

- [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
- [ADR 0002 — autorytatywny engine niezależny od kart](0002-authoritative-card-agnostic-engine.md)
- [ADR 0003 — widoki graczy i FoW](0003-player-specific-views-and-fow.md)
- [Architektura](../ARCHITECTURE.md)
