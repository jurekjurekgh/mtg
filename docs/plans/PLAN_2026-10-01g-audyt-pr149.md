# Plan sesji 2026-10-01g — audyt scalonego PR #149 + pętla jakości

**Tryb:** ADR 0020 (A: PR na starcie, B: audyt poprzedniego PR, C: commity
inkrementalne, D: bez force push) + ADR 0021 (prompt „Kontynuujemy projekt.\"
nie nazywa tematu ⇒ pętla domyślna, bez pytania o kolejkę) + ADR 0016/0030.

## Rozpoznanie

| Pomiar | Wartość |
|---|---|
| `main` (baza sesji) | `85a63a3` = squash PR #149 („Audyt PR #148 + pętla jakości (01b) + PMSSB-32…35 (01c–01f)\") |
| Poprzedni scalony PR | #149 — 49 plików: 12 × `src/` (`card-data.js`, `heuristic-bot.js`, `heuristic-params.js`, `combat.js`, `effect-intent.js`, `effects.js`, `game-state.js`, `impulse-window.js`, `objects.js`, `triggers.js`, `ai-modes.js`, `choice-request.js`), ~25 × testy, fixture golden-mastera, tabela CR, dokumentacja (5 planów, 5 handoffów, PMSSB, AUDYT_PR148) |
| Baseline `npm test` / `build` | do zmierzenia na starcie (handoff 01f: 7304/7304, build 70 / 4708,3 kB) |
| Niedokończone plany na `main` | `PLAN_2026-10-01f-pmssb35-odroczenie.md` zamknięty; kolejka z handoffu 01f = obserwacje bez dowodu z partii (nie zadania) |
| Uwaga środowiskowa | lokalny `git log` to jeden commit (import `main`); diff PR #149 tylko przez `gh pr diff 149` |

## Etapy

- [x] **Etap 0 — lektura startowa**: `AGENTS.md`, ADR 0001–0030, `LESSONS.md`
  (L1–L172, w kawałkach do końca pliku), `ENVIRONMENT.md`, handoff 2026-10-01f.
- [x] **Etap 1 — PR na starcie** (ADR 0020 A): ten plan jako pierwszy commit.
- [x] **Etap 2 — audyt PR #149**: `gh pr diff 149` czytany plik po pliku
  (priorytet: `src/engine/*` — zwłaszcza `objects.js` / `impulse-window.js`
  (pieczęć wygnania w `moveObjectDirectly`, CR 400.7 / 702.185b), `effects.js`,
  `effect-intent.js`, `triggers.js`, `combat.js`; potem `heuristic-bot.js`
  i nowe pokrętła `heuristic-params.js`), zgodność z CR (źródła online, ADR 0030),
  ADR 0002 (zero przypadków po nazwie/ID karty), generyczność, RED→GREEN pinów
  weryfikowane mutacjami (L13/L159). Raport: `docs/audits/AUDYT_PR149_2026-10-01.md`.
- [x] **Etap 3 — naprawy znalezisk audytu** (każde: repro → fix u root cause → pin
  → osobny zielony commit + push).
- [x] **Etap 4 — pętla jakości** (ADR 0021 §4): Żywy Tester z perspektywy gracza
  na ścieżkach NIEpowtarzanych z 01f (rodzina odroczeń zamknięta — nie wracać),
  detektory, polowanie na rozjazdy CR innymi ścieżkami niż poprzednia sesja.
- [x] **Etap 5 — zamknięcie**: handoff `HANDOFF_2026-10-01g.md`,
  `PROJECT_HISTORY.md`, liczby bramki zmierzone na końcu (L92), opis PR, blok
  przekazania.

## Ryzyka i pułapki

- Zmiana wycen bota ⇒ golden-master (`node tools/bot-scoring-snapshot.mjs --write`)
  tylko po świadomej decyzji i z raportem różnic.
- Żywy Tester czyta ARTEFAKT (`dist/`): rebuild po każdej zmianie `src/` (L76);
  talie tymczasowe nie zostają w `decks/` podczas `npm test`.
- Cytaty CR tylko z dosłownego tekstu u źródła (CR 2026-09-25); nowy numer →
  ręcznie w `test/helpers/cr-numery-tabela.js` z uzasadnieniem.
- Pełny B0 NIE uruchamiany (ADR 0018).
