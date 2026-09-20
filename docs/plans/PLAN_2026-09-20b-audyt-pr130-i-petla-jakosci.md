# PLAN 2026-09-20b — audyt PR #130 + pętla jakości (ADR 0020 / ADR 0021)

Sesja startuje z promptu „Kontynuujemy projekt" → ADR 0021: bez pytania
o kolejkę, pętla domyślna (PR → audyt poprzedniego scalonego PR → naprawy →
pętla jakości). Gałąź `arena/01a0bf64-mtg`, baza `0b49b12` (squash PR #130).

## Rozpoznanie (zmierzone, nie przepisane — L7/L92)

- `git log --oneline -1` → `0b49b12 Sesja 2026-09-19: audyt PR #129 + pętla
  jakości (ADR 0020) (#130)`; drzewo czyste; klon płytki (`git rev-parse HEAD^`
  wymagało `git fetch --depth=2 origin main`).
- `node tools/run-tests.mjs all` → **6027/6027, 0 fail** (~377 s) — zgodne
  z `docs/setup/HANDOFF_2026-09-20.md` (stan po korekcie `b3dd389`).
- `npm run build` → **59 modułów / 3950,9 kB** — zgodne z handoffem.
- `gh pr list` → ostatni scalony PR to **#130** (MERGED, merge commit
  `0b49b12`); 134 pliki, **+11 855 / −717**, 61 commitów sesyjnych.
- Lektura obowiązkowa (AGENTS.md §0) wykonana PRZED tym commitem:
  `AGENTS.md` (367 linii), rejestr + **wszystkie ADR-y 0001–0030** i archiwalny
  0008, `docs/LESSONS.md` (2358 linii, L1–L157 w całości),
  `docs/setup/ENVIRONMENT.md` (195 linii), opis i diff PR #130,
  `docs/setup/HANDOFF_2026-09-20.md`.

## Zakres audytu (134 pliki PR #130)

Zmiana `8af0c7c…0b49b12` zawiera CZTERY niezależne tematy, które audytuję
osobno (każdy ma własne piny i własne ryzyka):

| Temat | Pliki `src/` | Ryzyko |
|---|---|---|
| T1. Audyt PR #129 + paka uwag 2026-09-19b (P1–P9) + uwagi A/B/C + pętla jakości | `spells.js` (castFireball), `render.js`, `main.js`, `session.js`, `effects.js` (craft/look_top), `game-state.js` (pendingOpponentTarget), `heuristic-bot.js` (treasureRefundLead, libraryLossPenalty), `combat.js` (blockAssignmentViolation) | wyceny bota, oferta = walidacja (L48) |
| T2. **Batch 57** — 10 kart właściciela (artId 64–125), mechaniki M388–M393 | `card-data.js`, `spells.js` + `resources.js` (Delve), `triggers.js` + `combat.js` (tapObject/L153), `effects.js` (Annie Flash, incubate, delve), `game-state.js` (pendingDelveExile, licznik instant/sorcery), `tokens.js`, `mana-sources.js` (pipy hybrydowe), `impulse-window.js` | zgodność z CR 702.66 / 303.4f / 603.x, dane vs Oracle |
| T3. Uwagi z gry A–E (2026-09-20) | `tools/collection-art-ids.csv` + `generate-plan-decks.mjs` (A), `heuristic-bot.js` (B, E), `session.js`/`index.html`/`main.js` (C), `split-deck-colors.mjs` (D), `heuristic-params.js` (E) | proweniencja (ADR 0029), wycena ataku (L155) |
| T4. Uwagi z gry F–J (2026-09-20) | `index.html`+`main.js` (F — kreator talii uśpiony), `mana-wizard.js` (G), `session.js`+`choice-request.js` (H, I), `session.js` (J — `manaSourceLogText`) | prowadzenie płatności (CR 601.2h), trzy warstwy narracji (L156) |

## Etapy

### E1 — PR na starcie (ADR 0020 A)

- [x] ten plik jako osobny commit + push;
- [x] otwarcie PR z gałęzi `arena/01a0bf64-mtg` do `main` PRZED kodowaniem.

### E2 — audyt silnika i kart PR #130 (ADR 0020 B / 0016 / 0030)

Przegląd KAŻDEGO zmienionego pliku `src/` (28) i `tools/` (6) pod kątem:
logiki, zgodności z CR (twierdzenia regułowe weryfikowane u źródła — ADR 0030),
generyczności (ADR 0002 — grep po nazwach/ID kart w nowym kodzie), kompletności
widoku (ADR 0017), determinizmu (ADR 0005), kontraktów zdarzeń (L112/L153).

- [x] E2.1 **Delve (CR 702.66)**: `delveExileLimit`/`declareDelveCast`/
      `resolveDelveExile` (`spells.js`), walidacja i kolejność „wygnanie przed
      zapłatą" (`resources.js`), oferta podzbiorów z capem (`game-state.js`),
      wycena bota. Pytania: czy wygnanie jest KOSZTEM (zostaje po kontrze),
      czy oferta = walidacja (L48), czy limit jest generyczny, czy MV i koszt
      pozostają bez zmian (ruling KTK).
- [x] E2.2 **L153 (zdarzenia z wnętrza komendy)**: `tapObject(events)` i
      `declareAttackers` — czy wszystkie ścieżki tapnięcia (atak, koszt,
      efekt, crew) wracają ze zdarzeniami do skanu triggerów.
- [x] E2.3 **Annie Flash (M392)**: ETB „if you cast it" → powrót permanentu
      MV≤3 TAPNIĘTY (`allowLands`), aura wybiera gospodarza PRZED wejściem
      (CR 303.4f) + brak gospodarza → zostaje w grobie ze zdarzeniem,
      tapnięcie wygania DWIE wierzchnie karty z oknem `this_turn`.
- [x] E2.4 **Baral and Kari Zev (M393)**: licznik „pierwszy instant/sorcery
      w turze", darmowy rzut z ręki bez kosztu many/pipów/phyrexian (koszty
      dodatkowe płacone), ścieżka „If you don't" → `elseEffect` (L154) i token
      First Mate Ragavan 2/1 z haste do końca tury.
- [x] E2.5 **Paczka B (landcycling bez celu)**: `ownDeck` w widoku bota —
      czy dolna granica „kopie w talii − kopie widoczne poza biblioteką" jest
      poprawna i czy FoW nie wycieka (ADR 0003/0017: własna talia jest wiedzą
      legalną, cudza nie).
- [x] E2.6 **Paczka E (`crackbackPenalty`/`forcedBlockLoss`)**: czy wycena ataku
      na stanie PO ataku nie łamie wyjątków (atak wygrywający teraz, atak
      letalny) i czy kara przebija premię (L3).
- [x] E2.7 **Paczki C/F/G/H/I/J (warstwa stołu)**: chronologia i zakresy logu,
      uśpienie kreatora talii (odwracalność, brak martwych importów w bundlu),
      `guideManaSources` (tapnięć ≤ koszt), `pendingExplore.sourceCardId`
      w widoku decydenta, trzy warstwy discover (`revealedCardIds`/
      `bottomCount`/`libraryExhausted`), `manaSourceLogText` i jego granice
      (brak wpisu w „Rozgrywce" i w zapisie tur dla AI).
- [x] E2.8 **Narzędzia**: `split-deck-colors.mjs` (`abilityCostColorsOf`),
      `generate-plan-decks.mjs`, `collection-art-ids.csv` (proweniencja —
      ADR 0029, strażnik `proweniencja-katalogu.test.js`), `benchmark.mjs`,
      `table-tester/*`.
- [x] E2.9 **Dane 10 kart batcha 57** vs snapshoty Scryfall (`docs/cards/*.json`):
      koszt, typy, P/T, Oracle text dosłownie, `limitations` (ADR 0022 — tylko
      trzy dozwolone powody), rulingi w snapshotach (ADR 0028).
- [x] E2.10 raport `docs/audits/AUDYT_PR130_2026-09-20.md` z klasyfikacją
      znalezisk (krytyczne/średnie/niskie) i decyzją per znalezisko.

Kryterium ukończenia: raport w repo, każde znalezisko nazwane, ze ścieżką
naprawy albo z jawnym powodem „świadomie nie naprawiam".

### E3 — naprawy znalezisk

Każda naprawa: pin RED → fix u root cause → GREEN → **mutacja** dowodząca, że
pin czerwienieje (L13/L34) → `npm test` + `npm run build` → commit → push
(ADR 0020 C). Bez pełnego B0 (ADR 0018).

### E4 — pętla jakości (ADR 0021 pkt 4a/4b)

- [ ] Żywy Tester (`tools/table-tester`, po `npm run build` — L76) na taliach
      z mechanikami batcha 57 (delve: `tarkir-bg`; Annie Flash: `worek-dziki`;
      Baral: talia z Izzet) — transkrypty czytane RĘCZNIE wzdłuż trzech osi
      (L27), nie tylko detektory; braki narzędzia naprawiane w narzędziu (L12).
- [ ] polowanie na niezgodności z CR **inną ścieżką** niż poprzednia sesja
      (poprzednia: pełny diff katalog↔snapshot po 480 kartach). Kandydat:
      skan rodziny `pending*`/decyzji blokujących pod kątem odcisku stanu
      (L16) i kompletności łańcucha oferta → walidacja → log → etykieta (L129).
- [ ] NIE wymyślam nowego batcha kart (ADR 0021 pkt 4c, ADR 0029).

### E5 — domknięcie sesji

- [ ] bramy zmierzone NA KONIEC (L92): `npm test`, `npm run build`,
      `node --test test/bot-benchmark.test.js`, benchmark `--quick`;
- [ ] `docs/setup/HANDOFF_2026-09-20b.md` + wpis `docs/PROJECT_HISTORY.md`
      + milestone w `docs/ENGINE_MILESTONES.md`;
- [ ] „Bieżący stan" w `README.md` odświeżony na koniec (L92);
- [ ] opis PR kumulatywny + blok przekazania w czacie (ADR 0013).

## Ryzyka i pułapki

- **ADR 0020 D / ENVIRONMENT §2** — sandbox potrafi zresetować workspace
  w środku sesji (w PR #130 zdarzyło się to DWA razy): push po każdym zielonym
  kroku; przed pushem `git log --oneline -3` + `git fetch origin <gałąź>` +
  porównanie `HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`; nigdy `--force`, nigdy
  `reset --hard` przy niecommitowanej pracy.
- **L76** — Żywy Tester mierzy `dist/`, nie `src/`; `npm run build` jest
  częścią pętli „popraw → zmierz".
- **L27/L13** — zero zgłoszeń detektorów to pomiar narzędzia; każdy nowy
  detektor/pin wymaga weryfikacji mutacyjnej w OBU kierunkach (L114).
- **ADR 0030** — żadnego twierdzenia regułowego z pamięci: przed fixem
  regułowym pobieram dosłowny CR/ruling przez `fetch_page` (egress bash
  zablokowany — ENVIRONMENT §4).
- **ADR 0018** — pełna macierz B0 wyłącznie na komendę właściciela.
- **Budżet lektury startowej** — 99 984/100 000 tokenów: nowy wpis w
  `docs/LESSONS.md` musi być opłacony skróceniem (narracja do
  `docs/LESSONS_PRZYPADKI.md`), progu NIE podnosimy (L5/L66).
- **Otwarte świadomie z PR #130** (nie jest kolejką — kontekst): pipy zdolności
  w kartach KOLOROWYCH i pary bez podziału (final-fantasy/balamb-UG, kaladesh,
  srodziemie, worek-dziki) oraz fallback `legalBlockerOptions` ponad cap 32
  (L151).

## Podsumowanie wykonania

### E2 — audyt: wykonany (raport `docs/audits/AUDYT_PR130_2026-09-20.md`, `c3c26b8`)

Przeczytane wszystkie 28 plików `src/` diffu `8af0c7c..0b49b12`, 28 nowych
testów i 24 zmodyfikowane, 34 dokumenty, 13 talii, 6 narzędzi. Kontrole ADR:
0002 (0 porównań po `cardId`/nazwie w dodanym kodzie `src/`), 0005 (0 nowych
`Math.random`), 0017 (`pendingDelveExile`/`pendingCraftExile` w widoku),
0029/0022 (druki w `docs/cards/`, deck-builder uśpiony). Ważność pinów PR #130
zmierzona mutacjami PA–PH: **8/8 wykrytych**.

Znaleziska (szczegóły, cytaty CR i rulingów — w raporcie):

| # | Ważność | Plik | Reguła | Decyzja |
|---|---|---|---|---|
| A | wysoka | `resources.js` / `spells.js` | CR 702.66a („may exile") | naprawione `b1c66e1` |
| B | wysoka | `spells.js` / `mana-cost.js` | CR 702.66a/b, ruling KTK 2021-03-19 | naprawione `b1c66e1` |
| C | średnia | `game-state.js` (reset tur) | ruling TDC 2023-04-14 | naprawione `b1c66e1` |
| D | wysoka | `effects.js` | CR 303.4f, ruling OTJ 2024-04-12 | naprawione `19f47fa` + piny `69b69e2` |

Otwarte świadomie (niskie, bez reguły CR): 7 pozycji — §6 raportu.

### E3 — naprawy: wykonane, każda z pinem RED→GREEN i mutacją

| Commit | Zakres | Testy | Build |
|---|---|---|---|
| `b1c66e1` | A+B+C, 8 pinów (`audyt-pr130-delve-i-licznik-tury`) | 6035/6035 | 59 / 3957,2 kB |
| `19f47fa` | D, 3 piny (`audyt-pr130-gospodarz-aury`) | 6038/6038 | 59 / 3965,2 kB |
| `69b69e2` | piny mutacyjne D (Q3/Q4/Q5 przeżywały pierwszą wersję) | 6041/6041 | 59 / 3965,2 kB |
| `c3c26b8` | raport audytu | — | — |

Mutacje własnych napraw: P1–P7 i Q1–Q5 — **12/12 wykrytych**. Dodatkowo trzy
istniejące strażniki zapaliły się same na nowym polu stanu (B2/2 odcisku,
`fingerprint-pending-decisions`, guardy renderu `m163` A3 / `m201`) — dowód,
że sieć strażników działa (§5 raportu).
