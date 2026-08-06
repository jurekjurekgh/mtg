# PLAN zadania 2026-08-06: naprawa ograniczeń silnika + poprawki UX A–E

Zadanie właściciela z 2026-08-06 (sesja `arena/019fd37d-mtg`, PR #29).
Zgodnie z zasadą z AGENTS.md („Start zadania: rozpoznanie, plan, mini-roadmapa
PRZED kodowaniem") ten dokument jest mapą pracy — etapy odhaczamy kolejnymi
commitami, a po awarii sesji nowy agent odczytuje plan i stan PR i kontynuuje
od pierwszego nieodhaczonego etapu.

## Rozpoznanie (stan wejścia)

- Suíta: 792 testy zielone, build 47 modułów (~830 kB).
- Ograniczenia udokumentowane w HANDOFF_2026-08-06: prawo legend (CR 704.5j)
  dokumentowane jako brak; triggery jednoprzebiegowe (zdarzenia z triggerów
  nie były reskanowane); uszkodzony `docs/cards/scryfall-dunland-crebain.json`.
- Poprawki z testowania artefaktu (zgłoszenie właściciela):
  A. Double-tap (iOS/iPhone): „mrugnięcie" — modal albo pełny ekran otwiera
     się na ułamek sekundy i zamyka. Diagnoza: pierwsze tapnięcie powolnego
     double-tapa (po 420 ms) otwiera modal menu / pełny ekran POD palcem;
     drugie tapnięcie trafia w tło świeżej warstwy i ją zamyka. Brak ochrony
     „odprysku" w warstwach modali i w ścieżce touchend pełnego ekranu.
  B. Modal „Ruch przeciwnika" nie pokazuje ilustracji przy `land_played`
     (brak typu w `BOT_MOVE_CARD_EVENTS` w `src/table/session.js`).
  C. Karty na stosie nie są klikalne — chcemy podglądu tekstu karty
     (pełny ekran) po tapnięciu nazwy.
  D. Tap karty w cmentarzu otwiera pełny ekran POD modalem cmentarza:
     `.fullscreen` ma z-index 60, `.modal` 1500 (src/table/index.html).
  E. Flow rzucania z wyborem gracza (przykład: Curate / Surveil 2):
     1–3 działa (oferta w menu, rzut, auto-tap przy jednoznacznym wyborze
     many — M34); do zrobienia:
     3a. przy kilku sposobach pozyskania many — opcje PO JEDNEJ
         („tapnij x/y/z") z doliczaniem do sumy, zamiast wszystkich
         kombinacji naraz;
     4.  Surveil N: najpierw INFO jakie karty przeglądnięto, potem wybory
         PO KOLEI dla każdej karty osobno (grób/wierzch), nie lista
         wszystkich kombinacji. Analogicznie scry.

## Roadmapa i stan

### Część 1 — naprawa ograniczeń silnika (UKOŃCZONA)

- [x] Naprawa uszkodzonego JSON Scryfall (commit `e26d6c9`).
- [x] Prawo legend (CR 704.5j) jako blokująca decyzja gracza
      `resolve_legend_choice` z priorytetem u właściciela; `cardName`
      przez passthrough definicji; boty + UI + fingerprint + testy (10)
      (commit `e283b5f`).
- [x] Triggery wieloprzebiegowe (CR 603.2): kolejka FIFO zdarzeń
      wygenerowanych przez triggery, deterministyczny hamulec 512; zdarzenia
      agregatu „permanents you leave" też reskanowane (commit `1582686`).
- [x] Kolejka backup przejmuje priorytet decydenta (`restorePriorityTo`) —
      crash benchmarku seed 2027 (commit `1582686`).
- [x] Centralne planowanie blokujących decyzji w `accepted()`: priorytet
      zawsze u decydenta PIERWSZEJ decyzji w porządku bramek execute
      (`firstPendingDecisionPlayerId`), wspólny `pruneDeadPendingDecisions`,
      oferty `playerView` zgodne z kolejnością bramek także MIĘDZY graczami —
      crash benchmarku seed 1020 (scry pokoju lochu + cel delirium)
      (commit `4a0ee28`, test regresji w batch18).
- [x] Pełny benchmark B0: 87.5% / 67.7% / 93.0%, 0 niedokończonych; próg
      regresji vs aggro 0.56 → 0.57 (commit `82e0c9e`).

### Część 2 — zasada procesowa (UKOŃCZONA)

- [x] AGENTS.md: obowiązek mini-roadmapy zadania jako pierwszego commita PR
      + obowiązek sprawdzenia ostatniego PR i podjęcia niedokończonego
      zadania (ten commit).

### Część 3 — poprawki UX A–E (W TOKU)

- [x] **A. Double-tap (iOS/iPhone)** — `src/table/gestures.js` + `src/table/main.js`:
  1. `dblclick`/odprysk: handler `dblclick` respektuje `ignoreClick` (pełny
     ekran nie zamyka się własnym gestem otwarcia);
  2. touchend warstwy pełnego ekranu: `ignoreTouch` obejmuje też okno
     „odprysku" po otwarciu (350 ms) — powolny double-tap na karcie bez akcji
     nie zamyka świeżo otwartego pełnego ekranu;
  3. modale z tłem: klik w tło w oknie ~450 ms od otwarcia modala jest
     ignorowany (powolny double-tap na karcie z akcją nie zamyka świeżego
     menu kontekstowego).
  Kryterium: nowe testy w `test/table-touch-gestures.test.js`; istniejące
  kontrakty dotyku bez zmian; test(i) e2e w `test/table-ui.test.js` dla ścieżek
  „powolny double-tap".
- [x] **B. Ilustracja w modalu ruchu przeciwnika** — `land_played` w
  `BOT_MOVE_CARD_EVENTS` + test (basic land ma `imageUri`).
- [x] **C. Klikalne karty na stosie** — tap nazwy karty na stosie otwiera
  pełny ekran z tekstem (podwójny tap również); test.
- [x] **D. Z-index pełnego ekranu** — `.fullscreen`/`.fullscreen-close` nad
  warstwą `.modal` (2600/2601); bez zamykania modala cmentarza; test CSS/grep
  + test UI „fullscreen nad modalem strefy".
- [x] **E.4. Sekwencyjny wizard scry/surveil** — UI (`src/table/main.js`,
  `src/table/render.js`): przy offercie `resolve_scry`/`resolve_surveil` modal
  pokazuje NAJPIERW przeglądnięte karty, potem JEDNĄ kartę naraz z opcjami
  (grób/wierzch; surveil dodatkowo kolejność reszty na wierzchu); FINALNA
  komenda budowana po krokach — bez zmiany protokołu silnika; testy.
- [ ] **E.3a. Sekwencyjny wybór many** — UI (bez zmiany protokołu; komenda
  `tap_for_mana` nadal legalna): jeśli koszt ma jednoznaczne pokrycie —
  zostaje auto-tap (M34); jeśli kilka wariantów — kreator „Tapnij źródło
  (pozostało: koszt)" po jednym źródle (`tap_for_mana` / aktywacja many),
  po pokryciu automatyczny rzut/aktywacja; Anuluj przerywa. Solver
  jednoznaczności deterministyczny. Testy.
- [ ] Opisy zdarzeń Batchu 18 w `session.describeEvent` (devour/endure/
  delirium/graveyard-top) — brakujące etykiety logu.
- [ ] Docs: `docs/PROJECT_STATE.md` + `docs/ENGINE_MILESTONES.md` (M37) +
  `docs/setup/HANDOFF_2026-08-06.md` (sekcja ograniczeń — legend/triggery
  naprawione), opis PR #29 kumulatywnie; ta roadmapa odhaczona.
- [ ] Finał: pełne `npm test` + `npm run build` + raport właścicielowi.

## Ryzyka i pułapki

- Zmiany gestów dotyku łatwo regresują na iOS (okna czasowe) — aktualizować
  `test/table-touch-gestures.test.js` przy każdej zmianie okna.
- Wizard E NIE może zmieniać protokołu resolve_* (boty/testy/benchmark
  zależą od pełnej enumeracji komend w `legalCommands`).
- Po każdej zmianie silnika/komend: pełny `node tools/benchmark.mjs`.
- Token GH umiera epizodycznie — pushować natychmiast po commicie.
- Polskie znaki: edycje przez `python3` z `io.open(..., encoding='utf-8')`.
