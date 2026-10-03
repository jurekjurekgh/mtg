# Plan 2026-10-03c — PMSSB-41 runda 2: weryfikacja zgłoszeń po merge + luka LANDWALK (Weftblade)

Wejście: **właściciel ponownie zgłasza te same cztery uwagi** (A/Q2 Weftblade, B Nanoform,
C Wedgelight, D Xu-Ifit) — po tym, jak PR #151 został **scalony** (`45fcaf6`, 2026-10-03T09:28:44Z).
Tryb: dokończenie pętli PMSSB-41 (procedura 0–7), nie nowa rodzina.

## Krok 0 — diagnostyka: czy zgłoszenie opisuje kod z main, czy build z Pages?

Ustalenia (dowody w tym turnie):

1. **Wszystkie fixy A–D SĄ w `main`** — po squash-merge #151 pliki
   `heuristic-bot.js`/`heuristic-params.js`/`effect-intent.js`/`game-state.js`/`render.js`
   są **identyczne** z gałęzią (`git diff --quiet origin/main HEAD` = brak różnic dla
   każdego z pięciu plików oraz fixture golden-mastera).
2. **Publikacja na GitHub Pages dla `main` była jeszcze `in_progress`** w chwili testu
   (`gh run list`: „Publikacja na GitHub Pages [main] … 2026-10-03T09:28:47Z in_progress”).
   Workflow publikacji uruchamia **przed** buildem pełny `node tools/run-tests.mjs all`
   (~8 min), więc strona przez kilka minut po merge serwowała build SPRZED fixów —
   czyli dokładnie ten, który opisuje zgłoszenie.
3. **Odtworzenie scenariuszy na kodzie z `main`** (sondy `/tmp/pr/probe-uwagi2.mjs`,
   `/tmp/pr/probe-c-e2e.mjs`) — wszystkie cztery punkty są nieroztwarzalne:
   - **C (e2e, dokładny scenariusz właściciela)**: charge 6 + stwory 2/2 i 4/4 → bot tapuje
     **4/4**, charge **10**, artefakt staje się stworzem (próg 9), **2/2 pozostaje nietknięty**;
     po aktywacji bot passuje (koniec, bez dobijania do 12).
   - **B**: 4 oferty triggera `resolve_trigger_target`, wybór `myCre` (14), wrogie = −25.
   - **D**: badge `["bez zdolności","typ: +Skeleton","choroba"]` przez pełny tor silnika.
   - **A**: bez gospodarza warp = −29 → `pass_priority`; przy 6 lądach rzut 71,1 > warp.

## Znaleziona luka (NOWA praca w tej rundzie)

**A — LANDWALK nie istniał w widoku gracza.** Kryterium właściciela mówi wprost:
gospodarz „wart wzmocnienia” to np. stwór z **flying, menace albo landwalkiem**, a dotąd:

- `emerald-oryx` (forestwalk) i `farbog-explorer` (swampwalk) — jedyne karty z landwalkiem
  w katalogu — były dla bota **gołym 2/3**: `PlayerView` **nie niósł** pola `landwalk`
  (klasa L1/ADR 0017 — fakt publiczny bez reprezentacji w widoku), więc premia ewazyjna
  (`counterEvasionBonus`) nigdy się dla nich nie zapalała;
- pomiar PRZED (`/tmp/pr/probe-landwalk.mjs`): `widok.landwalk=undefined`, warp **−29**
  (`pass_priority`) **zarówno** gdy obrońca ma Las (forestwalk realnie działa, CR 702.14),
  jak i gdy go nie ma — bot nie odróżnia „nie do zatrzymania” od „zwykłe 2/2”.

Drugi, węższy defekt w tej samej funkcji: gałąź `flying` kończyła się `return false`, gdy
bloker miał flying/reach — **menace na tym samym stworze nigdy nie był sprawdzany** (CR:
„nie może być blokowany” to suma niezależnych warunków, nie alternatywa pierwszego słowa).

## Naprawa

1. `src/engine/game-state.js`: widok niesie `landwalk` (deskryptor podtypu lądu, ten sam
   kształt co `landwalk: { subtype }` w `abilities.js`; ADR 0002 — bez nazwy karty,
   ADR 0017 — fakt publiczny; ukryty dla zakrytego permanentu obcego kontrolera).
2. `src/controllers/heuristic-bot.js`:
   - `untappedEnemyBlockers` + nowy `controlsLandOfSubtype(view, playerId, subtype)` —
     warunek landwalka liczony z widoku **tą samą regułą co silnik** (`combat.js`
     `controlsLandWithSubtype(state, blocker.controllerId, subtype)`);
   - `hostEvadesBlockers` rozstrzyga zdolności ewazji **niezależnie** (flying / menace /
     landwalk), zamiast kończyć na pierwszej.

## Weryfikacja

Piny dodane do `test/audyt-pmssb41-uwagi-testow.test.js` (rodzina = jeden plik):
A9 (landwalk z Lasem obrońcy = ewazja → warp wybrany), A10 (bez Lasu landwalk nie działa →
pass, CR 702.14), A11 (widok niesie `landwalk`), A12 (flying+menace: jeden bloker z flying
NIE zatrzymuje — wycena ścieżką czaru), C9 (e2e scenariusz właściciela: 6 → 10, 2/2 nietknięty).
Mutacje tej rundy: m10 (landwalk znika z ewazji), m11 (widok nie niesie landwalka),
m12 (ewazje wracają do pierwszego trafienia), m13 (station: progress bez klampu) — wszystkie RED.

Bramy: `npm test`, `node tools/run-tests.mjs all`, `node tools/build.mjs`; golden-master bez
dryfu; dokumentacja hubu (§PMSSB-41 „Runda 2” + rejestr), `PROJECT_HISTORY.md`, handoff.
