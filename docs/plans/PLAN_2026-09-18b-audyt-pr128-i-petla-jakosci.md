# PLAN 2026-09-18b — audyt PR #128 + pętla jakości (ADR 0020 / ADR 0021)

Sesja startuje z promptu „Kontynuujemy projekt." → ADR 0021: bez pytania o
kolejkę, pętla domyślna. Gałąź `arena/01a0b60e-mtg`, baza `e0ad776`
(squash PR #128). PR sesji: **#129** (otwarty w E1).

## Rozpoznanie (zmierzone, nie przepisane)

- `git log --oneline -1` → `e0ad776 Sesja 2026-09-18: naprawa A1/A2/B (panel
  energii, seed 596891) + audyt PR #126 (#128)`; drzewo czyste.
- `npm test` (szybki rdzeń) → **5787/5787, 0 fail** — zgodne z handoffem
  2026-09-18 (`docs/setup/HANDOFF_2026-09-18.md` → „Bramy finalne").
- `gh pr list` → ostatni scalony PR to **#128** (MERGED 2026-09-18 19:46 UTC),
  czyli punkt zaczepienia audytu wg ADR 0020 B.
- Klona jest płytka (1 commit) — audyt wymaga `git fetch --depth=20 origin main`
  (bez tego `git diff b7ee3d5 e0ad776` = `bad revision`). Pułapka warta wpisu
  w `docs/setup/ENVIRONMENT.md` §3.

## Etapy

### E1 — PR na starcie (ADR 0020 A) ✅

- [x] ten plik jako osobny commit + push;
- [x] otwarcie PR **#129** z gałęzi `arena/01a0b60e-mtg` do `main` przed kodowaniem.

### E2 — audyt PR #128 (ADR 0020 B / ADR 0016 / ADR 0027)

Zakres: 9 plików diffu `b7ee3d5…e0ad776` (`src/engine/combat.js`,
`src/table/main.js`, `src/table/render.js`, 2 nowe piny, 4 dokumenty).

- [x] przegląd każdego zmienionego pliku: logika, zgodność z CR, ADR 0002
      (0 porównań po `cardId`/nazwie w nowym kodzie — grep), determinizm, FoW;
- [x] weryfikacja mutacyjna pinów M386 (13) i M387 (5) — 10 mutacji, każda
      czerwieni ≥1 pin (tabela w raporcie §4);
- [x] weryfikacja danych u źródła (ADR 0030): ruling WotC 2024-06-07 i marker
      „Energy Reserve" tdrc/17 potwierdzone dosłownie na api.scryfall.com;
- [x] raport `docs/audits/AUDYT_PR128_2026-09-18.md` (commit `531468d`).

Kryterium ukończenia: raport w repo, każde znalezisko z klasyfikacją
(krytyczne/średnie/niskie) i decyzją (naprawiam w tej sesji / świadomie nie).

### E3 — naprawy znalezisk (każda: pin RED → fix → GREEN → mutacja → push)

Kandydaci z przeglądu wstępnego (do potwierdzenia w E2, nie zakładam wyniku):

- [x] **F-1** `combat.js` fallback → `blockAssignmentViolation` + strażnik
      (commit `429f564`, pin `test/audyt-pr129-kopia-zbioru-bloku.test.js`);
- [x] **F-2** deduplikacja wpisu siatki bezpieczeństwa `rerender` (commit
      `69b3947`, pin `test/audyt-pr129-log-spam.test.js`, okno M386/H 400→700);
- [x] **F-3** rozdzielone dwie instrukcje w `buildStateOverlay` (commit `3ae56b9`);
- [x] **F-4** sprostowanie liczby mutacji M386 w handoffie 5/13→8/13 (commit `b845fcf`).

### E4 — pętla jakości (ADR 0021 pkt 4a/4b)

- [x] Żywy Tester: 6 partii ixalan vs ravnica/ixalan (greedy/impatient/explorer/
      hoarder), wszystkie kończą się naturalnie, 0 zgłoszeń detektorów;
- [x] znalezisko: snapshot testera NIE widział paneli liczników specjalnych
      (#poison/#speed/#energy) → naprawione w `run-game.mjs` (commit `849bf80`);
      panel energii pojawił się na żywo z TREŚCIĄ („Gracz: 4 {E}") — ścieżka
      naprawy PR #128 potwierdzona w realnym renderze;
- [x] 158 testów testera przechodzi po zmianie narzędzia.

### E5 — domknięcie sesji

- [x] `npm test` + `npm run build` (liczby zmierzone, L92);
- [x] `docs/setup/HANDOFF_2026-09-18b.md` + wpis `docs/PROJECT_HISTORY.md`;
- [x] odświeżenie „Bieżący stan" w `README.md` NA KONIEC (L92);
- [x] opis PR kumulatywny; blok przekazania w czacie (ADR 0013).

## Podsumowanie wykonania

Audyt PR #128 zakończony werdyktem „merytorycznie poprawny" (10 mutacji pinów
M386/M387 — wszystkie czerwienieją; dane karty i ruling WotC potwierdzone u
źródła). Cztery znaleziska zamknięte osobnymi, samodzielnie zielonymi commitami:
F-1 (trzecia kopia reguł zbioru bloku → jedno źródło), F-2 (deduplikacja wpisu
siatki bezpieczeństwa), F-3 (podział sklejonej linii), F-4 (sprostowanie liczby
w handoffie). Pętla jakości: Żywy Tester na taliach z energią + naprawa luki
pokrycia narzędzia (panele liczników specjalnych), energia potwierdzona na żywo.
Bramy: npm test 5790/5790, build 64 moduły / 3832,5 kB.

## Ryzyka i pułapki

- **L76** — Żywy Tester ładuje `dist/mtg-table.html`; bez rebuilda mierzę stary kod.
- **L27/L13** — „0 zgłoszeń" to pomiar narzędzia; detektor bez mutacji nie istnieje.
- **ADR 0018** — żadnego pełnego B0; maksymalnie profil szybki.
- **ADR 0029** — katalog kart nie rośnie z mojej inicjatywy; nośnik mechaniki =
  karta syntetyczna w teście.
- **ADR 0020 D** — tylko nowe commity, przed pushem `HEAD` vs `FETCH_HEAD`.
