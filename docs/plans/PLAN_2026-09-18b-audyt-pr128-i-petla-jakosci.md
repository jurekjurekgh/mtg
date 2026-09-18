# PLAN 2026-09-18b — audyt PR #128 + pętla jakości (ADR 0020 / ADR 0021)

Sesja startuje z promptu „Kontynuujemy projekt." → ADR 0021: bez pytania o
kolejkę, pętla domyślna. Gałąź `arena/01a0b60e-mtg`, baza `e0ad776`
(squash PR #128). PR sesji: (uzupełnić numer po otwarciu).

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
- [x] otwarcie PR z gałęzi `arena/01a0b60e-mtg` do `main` przed kodowaniem.

### E2 — audyt PR #128 (ADR 0020 B / ADR 0016 / ADR 0027)

Zakres: 9 plików diffu `b7ee3d5…e0ad776` (`src/engine/combat.js`,
`src/table/main.js`, `src/table/render.js`, 2 nowe piny, 4 dokumenty).

- [ ] przegląd każdego zmienionego pliku: logika, zgodność z CR, ADR 0002
      (brak przypadków po nazwie/ID karty w core), determinizm, FoW;
- [ ] weryfikacja mutacyjna pinów M386 (13) i M387 (5) — L13: pin, którego nie
      widziałem czerwonym, niczego nie dowodzi; mutacja = `git show` wersji
      sprzed naprawy, nie lokalna kopia (L34);
- [ ] sprawdzenie, czy naprawy M386/M387 nie zostawiły trzeciej kopii reguły
      (L41/L48) ani martwej gałęzi;
- [ ] raport `docs/audits/AUDYT_PR128_2026-09-18.md` + wynik w opisie PR.

Kryterium ukończenia: raport w repo, każde znalezisko z klasyfikacją
(krytyczne/średnie/niskie) i decyzją (naprawiam w tej sesji / świadomie nie).

### E3 — naprawy znalezisk (każda: pin RED → fix → GREEN → mutacja → push)

Kandydaci z przeglądu wstępnego (do potwierdzenia w E2, nie zakładam wyniku):

- [ ] `src/engine/combat.js:1677` — gałąź fallback (przekroczony `cap`) nadal
      ma RĘCZNĄ kopię reguł zbioru (menace + `cantBlockAlone`) zamiast
      `blockAssignmentViolation`; M387 zunifikował dwie kopie z trzech;
- [ ] `src/table/render.js` (okolice `buildStateOverlay`) — dwie instrukcje
      sklejone w jedną linię przy patchu M386 (utrata formatowania, ADR 0016 B);
- [ ] brak strażnika źródłowego przeciw kolejnej kopii reguły zbioru
      (L107: klasę tępi narzędzie/skan, nie oko).

### E4 — pętla jakości (ADR 0021 pkt 4a/4b)

- [ ] Żywy Tester na taliach, gdzie energia jest realna (wskazanie handoffu:
      Ixalan vs Ravnica — Shipwreck Moray wchodzi wcześnie), profil gracza;
      `npm run build` PRZED każdym pomiarem (L76: tester mierzy `dist/`);
- [ ] każda klasa znaleziona ręcznie → nowy detektor + weryfikacja
      dwustronna (L27);
- [ ] polowanie na niezgodności z CR inną ścieżką niż sesja #128 (ADR 0030:
      dosłowny tekst CR pobrany z sieci PRZED claimem).

### E5 — domknięcie sesji

- [ ] `npm test` + `npm run build` (liczby zmierzone, L92);
- [ ] `docs/setup/HANDOFF_2026-09-18b.md` + wpis `docs/PROJECT_HISTORY.md`;
- [ ] odświeżenie „Bieżący stan" w `README.md`/`docs/ENGINE_MILESTONES.md`
      NA KONIEC (L92);
- [ ] opis PR kumulatywny; blok przekazania w czacie (ADR 0013).

## Ryzyka i pułapki

- **L76** — Żywy Tester ładuje `dist/mtg-table.html`; bez rebuilda mierzę stary kod.
- **L27/L13** — „0 zgłoszeń" to pomiar narzędzia; detektor bez mutacji nie istnieje.
- **ADR 0018** — żadnego pełnego B0; maksymalnie profil szybki.
- **ADR 0029** — katalog kart nie rośnie z mojej inicjatywy; nośnik mechaniki =
  karta syntetyczna w teście.
- **ADR 0020 D** — tylko nowe commity, przed pushem `HEAD` vs `FETCH_HEAD`.
