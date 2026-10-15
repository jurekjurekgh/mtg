# PLAN 2026-10-15b — audyt PR #165 i dalsza pętla jakości

Zlecenie właściciela: „Kontynuujemy projekt.” Zgodnie z ADR 0020 sesja:

1. otwiera PR z planem (ten plik) PRZED kodowaniem;
2. wykonuje pełny audyt ostatniego scalonego PR **#165** (`batch 67: kolekcja
   369–398 + audyt PR #164 i zgłoszenie F`, squash `dec63896`, 81 plików,
   +6573/−135, 45 commitów wewnętrznych);
3. naprawia każde znalezisko osobnym przyrostem (RED → GREEN, `npm test` +
   `npm run build` zielone przed każdym commitem);
4. domyka sesję raportem audytu, wpisem w `PROJECT_HISTORY.md` i handoffem.

Gałąź sesji: `arena/3a534672-mtg`; jeden PR tej sesji do `main`.

## Stan wejściowy

- `main` / `HEAD`: `dec63896` — squash PR #165 (scalony, `MERGED` 2026-10-13).
- Plan PMSSB-62 (`PLAN_2026-10-15-pmssb62-batch67.md`) jest w pełni
  zrealizowany w tym squashu: fale A–E, raport `PMSSB62_BATCH67_2026-10-15.md`,
  test `audyt-pmssb62-batch67.test.js` (12 pinów), wpis `PMSSB.md §PMSSB-62`.
- Handoff 2026-10-14 i 2026-10-13c jednoznacznie wskazują punkt 1 następnej
  sesji: „Audyt PR #165 zgodnie z ADR 0020”, punkt 2: pętla jakości (ADR 0021).

## Zakres audytu PR #165 (wg ADR 0020 — każdy zmieniony plik)

Grupy według ryzyka (przeczytane w całości przed werdyktem):

- **A. Silnik** (`src/engine/`: `abilities.js` +34/−2, `combat.js` +18,
  `effects.js` +18/−1, `game-state.js` +42/−1, `graveyard-types.js` +14,
  `mana-cost.js` +8, `spells.js` +15, `triggers.js` +22/−9) — poprawność reguł,
  FoW, determinizm, brak ścieżek po nazwie karty (ADR 0002), CR cytowane
  z tabeli `cr-numery`.
- **B. Bot** (`src/controllers/heuristic-bot.js` +439/−19,
  `heuristic-params.js` +28) — L41 (ta sama wycena na wszystkich ścieżkach),
  kontrfakty PMSSB-62 (czy mutacje naprawdę dotykają właściwego pola, L-kontrfakt
  z planu), brak regresji golden-mastera (`fixtures/bot-scoring-snapshot.json`
  −32/+29 — regeneracja zaakceptowana w PR; audyt sprawdza, że dryf to tylko
  F1).
- **C. Stół** (`src/table/render.js` +52/−5, `session.js` +33/−2) — panel,
  auto-pass i etykiety, wspólne źródło prawdy z silnikiem.
- **D. Karty** (`src/cards/card-data.js` +324, `mana-costs-data.js` +11,
  `tools/collection-art-ids.csv`, `docs/cards/scryfall-*.json` ×10) — zgodność
  z Oracle (snapshoty Scryfall), `support.limitations` tylko gdy realne (ADR 0022),
  przydział talii (`decks/*.txt` — tylko przez generator, L122).
- **E. Testy i strażnicy** (`real-cards-batch67.test.js` +978, piny zmienionych
  testów: `m257`, `pmssb10-b2`, `katalog-pole-plan`, `obiekty-wsparcia`,
  `druki-druga-strona`, `statusy-wpisow`, `table-ui`, `kafel-cena-triggera`) —
  czy RED→GREEN jest prawdziwe, a nie zielone przez fixture.
- **F. Workflow i dokumentacja** (`.github/workflows/pages.yml`,
  `docs/setup/workflows/*`, `ci-workflow-tiers.test.js`, `tools/generate-plan-decks.mjs`,
  `tools/probe-phantom-view.mjs`) — czy zmiana workflow nie łamie publikacji.

## Bramy (przed i po każdym przyroście)

- `npm test` — ciche (`> .arena/*.log 2>&1`), podsumowanie + exit code.
- `npm run build` — 74 moduły (oczekiwane po PR #165).
- `node --test test/bot-benchmark.test.js` (ADR 0016: bez pełnego B0; ADR 0018).
- `node tools/cr-numery.mjs --cr`, `node tools/event-contract-audit.mjs`.
- Pełne `npm run test:all` jako brama końcowa (ciche).

## Kolejność commitów

1. `docs(plan)`: ten plan + otwarcie PR (bez kodu).
2. `docs(audit)`: raport `docs/audits/AUDYT_PR165_2026-10-15.md` — pomiar baseline,
   inwentarz plików, werdykt i lista znalezisk (A-1…). Bez zmian kodu.
3. `fix(...)`: po jednym commicie na każde znalezisko (RED → GREEN, mutacja).
4. `docs`: odhaczenie etapów, wpis w `PROJECT_HISTORY.md`, handoff 2026-10-15b.

## Ryzyka / pułapki

- PR #165 jest squashem 45 commitów — audyt czyta **diff squasha**, nie
  historię wewnętrzną (historia wewnętrzna nie jest dostępna w klonie: lokalny
  `HEAD` ma jeden commit).
- Golden-master: `tools/bot-scoring-snapshot.mjs` — nie regenerować bez dowodu
  przed/po (lekcja PMSSB-62).
- Sandbox może zresetować workspace (ENVIRONMENT §2) — każdy commit pushować od razu.

## Postęp

- [x] 1. Plan + PR otwarte (PR #166, `1ef8bba`)
- [x] 2. Raport audytu PR #165 (`61059d5`)
- [x] 3. Znaleziska: A-1/C-1/D-1 (`486baec`), A-2 (`0754b1b`), B-1 (`1ba3d94`);
      E-1/F-1 przyjęte jako obserwacje
- [x] 4. Bramy końcowe: `npm test` 8217/8217, `run-tests all` 8484/8484,
      bot-benchmark 10/10, build 74 moduły; PROJECT_HISTORY 2026-10-15b; L185;
      handoff `HANDOFF_2026-10-15b.md`

## Podsumowanie wykonania

Audyt PR #165 zamknięty werdyktem APPROVE po naprawach. Trzy znaleziska z wagą
(A-2 defensywna, B-1 latentna, A-1 dokumentacyjna) naprawione osobnymi commitami
z testami RED→GREEN; cztery pozostałe (C-1, D-1, E-1, F-1) — porządkowe lub
obserwacje. Następny krok: pętla jakości wg ADR 0021 albo zlecenie właściciela.
