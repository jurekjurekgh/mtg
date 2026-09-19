# PLAN 2026-09-19 — audyt PR #129 + pętla jakości (ADR 0020 / ADR 0021)

Sesja startuje z promptu „kontynuujemy projekt" → ADR 0021: bez pytania o
kolejkę, pętla domyślna. Gałąź `arena/01a0b8fe-mtg`, baza `8af0c7c`
(squash PR #129). PR sesji: otwarty w E1.

## Rozpoznanie (zmierzone, nie przepisane)

- `git log --oneline -1` → `8af0c7c Sesja 2026-09-18b: audyt PR #128 + pętla
  jakości (ADR 0020) (#129)`; drzewo czyste, gałąź sesji bez zdalnego
  odpowiednika (świeży klon).
- `npm test` (szybki rdzeń) → **5829/5829, 0 fail** — zgodne z
  `docs/setup/HANDOFF_2026-09-18d.md` (stan po `8544b76`).
- `npm run build` → **64 moduły / 3844,7 kB** (zgodne z handoffem 2026-09-18d).
- `gh pr list` → ostatni scalony PR to **#129** (MERGED 2026-09-19 09:28 UTC),
  czyli punkt zaczepienia audytu wg ADR 0020 B.
- Lektura obowiązkowa (AGENTS.md §0): AGENTS.md, wszystkie ADR-y
  (0001–0030 + archiwum 0008), `docs/LESSONS.md` (2358 linii, całość),
  `docs/setup/ENVIRONMENT.md`, ostatni scalony PR, najnowszy handoff
  (`HANDOFF_2026-09-18d.md`) — wykonane przed tym commitem.

## Etapy

Stan na koniec sesji: E1–E4 domknięte, E5 domknięte poza pushem
i aktualizacją opisu PR (blokada poświadczeń GitHub — patrz handoff).

### E1 — PR na starcie (ADR 0020 A)

- [x] ten plik jako osobny commit + push (`e8f7357`);
- [x] otwarcie PR z gałęzi `arena/01a0b8fe-mtg` do `main` przed kodowaniem (PR [#130](https://github.com/jurekjurekgh/mtg/pull/130)).

### E2 — audyt PR #129 (ADR 0020 B / ADR 0016 / ADR 0027)

Zakres: 35 plików diffu `e0ad776…8af0c7c` (2445 insertions), w tym 9 plików
`src/` (`controllers/heuristic-bot.js`, `engine/abilities.js`,
`engine/combat.js`, `engine/effects.js`, `table/choice-request.js`,
`table/main.js`, `table/multi-target.js`, `table/render.js`,
`table/session.js`), 2 pliki `tools/table-tester/`, 9 nowych plików testów
i 10 dokumentów.

- [x] przegląd każdego zmienionego pliku: logika, zgodność z CR (ADR 0030 —
      twierdzenia regułowe weryfikowane u źródła), ADR 0002 (grep po
      nazwach/ID kart w nowym kodzie), FoW, determinizm;
- [x] sprawdzenie, czy testy testują to, co deklarują (RED→GREEN) —
      weryfikacja mutacyjna (L13) pinów z PR #129;
- [x] raport `docs/audits/AUDYT_PR129_2026-09-19.md` (commit `13acf1c`).

Kryterium ukończenia: raport w repo, każde znalezisko z klasyfikacją
(krytyczne/średnie/niskie) i decyzją (naprawiam w tej sesji / świadomie nie).

### E3 — naprawy znalezisk (każda: pin RED → fix → GREEN → mutacja → push)

- [x] znaleziska z E2: F-1 (`6ec5002`), F-2 (`cdb8fd5`), F-3 (`24fb1e5`) — każde z pinem i mutacją;
- [x] kontrola L107/L112: brak nowych obejść choke pointów — craft ma jedno źródło wykonania (`resolveCraftExileOutcome`), oferta bloków jedno źródło predykatu (`blockAssignmentViolation`);

### E4 — pętla jakości (ADR 0021 pkt 4a/4b)

- [x] punkt otwarty z poprzednich sesji: kierunek odwrotny oferty bloków
      (`Math.min(slots, 2)`) — pin przy blokerze o >2 slotach;
- [x] Żywy Tester (po `npm run build`) na taliach z mechaniką objętą
      audytem/zmianami; transkrypty czytane ręcznie, nie tylko detektory (L27);
- [x] polowanie na niezgodności z CR inną ścieżką niż poprzednia sesja (pełny diff katalog↔snapshot, 480 kart → literalne „\\n” w 20 wpisach + 7 snapshotach, `7746e37`).

### E5 — domknięcie sesji

- [x] `npm test` 5854/5854 + `npm run build` 64 moduły / 3853,3 kB (liczby zmierzone, L92);
- [x] `docs/setup/HANDOFF_2026-09-19.md` + wpis `docs/PROJECT_HISTORY.md`;
- [x] odświeżenie „Bieżący stan" w `README.md` NA KONIEC (L92);
- [x] opis PR kumulatywny (`gh api -X PATCH` #130, 2026-09-19 12:11 UTC) + blok przekazania w czacie (ADR 0013); push dokończony po odświeżeniu tokenu (`403b0a4..5a658de`).

## Ryzyka i pułapki

- **L76** — Żywy Tester ładuje `dist/mtg-table.html`; bez rebuilda mierzę stary kod.
- **L27/L13** — „0 zgłoszeń" to pomiar narzędzia; detektor bez mutacji nie istnieje.
- **ADR 0018** — żadnego pełnego B0; maksymalnie profil szybki.
- **ADR 0029** — katalog kart nie rośnie z mojej inicjatywy (nośnik = karta
  syntetyczna w teście).
- **ADR 0020 D** — tylko nowe commity; przed każdym pushem `HEAD` vs `FETCH_HEAD`.
- **ENVIRONMENT §2** — sandbox potrafi zresetować workspace; push po każdym
  zielonym kroku.
