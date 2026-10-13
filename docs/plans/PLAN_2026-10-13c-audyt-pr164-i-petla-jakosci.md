# PLAN 2026-10-13c — audyt PR #164 i dalsza pętla jakości

Zlecenie właściciela: „Kontynuujemy projekt.” Zgodnie z ADR 0020 i ADR 0021 sesja
otwiera PR z planem, wykonuje pełny audyt ostatniego scalonego PR **#164**
(`9ba2fde..7bd1fcf`, 22 pliki, +811/−67, 3 commity wewnętrzne: `ca61910`,
`3dbc760`, `ab18932`), naprawia każde znalezisko osobnym przyrostem, a po
zamknięciu audytu sprawdza niedokończone plany na `main` lub przechodzi do
celowanej pętli jakości.

Gałąź sesji: `arena/aadcf997-mtg`; jeden PR tej sesji do `main`.

## Stan wejściowy

- `main` / `HEAD`: `7bd1fcf` — squash PR #164 („audyt PR #163 F-1..F-6
  i pętla jakości Batch 66 F-7”).
- Zakres audytowanego diffu (`gh pr diff 164`, archiwum `.arena/pr164.diff`,
  1357 linii — przeczytany w całości):
  1. docs: `ENGINE_MILESTONES.md`, `PROJECT_HISTORY.md`,
     `audits/AUDYT_PR163_2026-10-13.md`, `plans/PLAN_2026-10-13b-*.md`,
     `setup/HANDOFF_2026-10-13b.md`;
  2. src silnika: `engine/{mana-sources,linked-exile-cast,resources,spells,triggers,game-state,fingerprint}.js`;
  3. src stołu i bota: `table/{mana-wizard,main,render,noop-probe,session}.js`,
     `controllers/heuristic-bot.js`;
  4. testy: `audyt-pmssb61-batch66`, `m179-inwentaryzacja`,
     `panel-odmiana-drugiej-osoby`, `real-cards-batch66`.
- Baseline `main` (zweryfikowany w tej sesji): `npm test` **8129/8129**,
  `npm run build` **74 moduły / 5106,4 kB**, `node tools/cr-numery.mjs --cr`
  **OK** (523 numery w tabeli), `node tools/event-contract-audit.mjs`
  **0 naruszeń**.
- Bez pełnego B0: właściciel nie zlecił pełnej macierzy (ADR 0018/0025).

## Etapy i kryteria ukończenia

### A. Plan i PR sesji (ADR 0020 A)

- [x] Zapisać ten plan w `docs/plans/PLAN_2026-10-13c-audyt-pr164-i-petla-jakosci.md`.
- [x] Potwierdzić zielony `npm test` i `npm run build` (cicho do `.arena/`).
- [x] Zacommitować plan, wypchnąć gałąź `arena/aadcf997-mtg` i otworzyć PR do
      `main` przed jakimkolwiek kodowaniem.

### B. Audyt pełnego diffu PR #164 (ADR 0020 B / ADR 0016)

- [x] Przejrzeć **każdy z 22 zmienionych plików** i ująć go w tabeli rejestru
      raportu `docs/audits/AUDYT_PR164_2026-10-13.md` (docs / silnik / stół /
      bot / testy).
- [x] Zweryfikować wobec kodu wszystkie twierdzenia napraw F-1..F-7 z
      `docs/audits/AUDYT_PR163_2026-10-13.md` (predykaty i ich call-site'y,
      kontrakty wiążące ofertę z walidacją, etykiety, projekcje odcisku).
- [x] Zweryfikować zgodność deklarowanych liczb (testy, moduły build, CR) ze
      stanem faktycznym.
- [x] Odtworzyć produkcyjnymi ścieżkami (`playerView` + `execute` + widok
      sesji) punkty brzegowe napraw: zdolności nadane przez statyk
      (`grantedActivatedAbilities`), eksport kart z wygnania w wycenie bota,
      pola stempli okien w `PlayerView`.
- [x] Spisać raport z findingami, dowodami i werdyktem; znaleziska naprawić
      u źródła.

### C. Naprawy findingów audytu

Dla każdej znalezionej usterki: test/reprodukcja RED na aktualnym stanie →
chirurgiczna naprawa u root cause (ADR 0002, ADR 0016) → GREEN (+ weryfikacja
mutacyjna, L13) → `npm test` + `npm run build` (cicho do `.arena/`) → osobny
commit i natychmiastowy `git push origin arena/aadcf997-mtg`.

- [x] A-1: `src/table/session.js` — auto-pass (`isManaOnly`) nie przekazuje
      `state` do `isPureManaAbilityCommand`, przez co panel i auto-pass czytają
      różne listy zdolności (L41); rozjazd utajony dla zdolności nadanych
      statykiem (`scope.grantsAbilities`).
- [x] A-2: `src/controllers/heuristic-bot.js` — filtr „karty rzucalne
      z wygnania” w `linkedManaGrantValue` opiera się na polach, których
      `PlayerView` nie wysyła (`playableFromExile`, `onAdventure`,
      `warpedAtTurn`), więc gubi realne stemple (impuls, madness, rebound,
      warp, adventure).
- [x] A-3 (znalezisko z przeglądu F-3): `src/engine/triggers.js` — gałąź
      `artifact_you_control` bez bramki `shroud` (`hexproofBlocked`), inaczej
      niż bliźniacze `creature_you_control` / `land_you_control` (CR 702.18,
      L52); luka utajona (żadna karta katalogu nie ma artefaktu ze `shroud`).

### D. Domyślna kontynuacja po audycie (ADR 0021)

- [x] Sprawdzić, czy na `main` zostały niedokończone plany (`docs/plans/PLAN_*.md`
      z nieodhaczonymi punktami realizacji); brak → celowana pętla jakości na
      rodzinach dotkniętych w PR #164: przebieg Żywym Testerem
      (`tools/table-tester/run-game.mjs`) + ręczna lektura transkryptów i
      polowanie na błędy CR / kontraktów widoku i decyzji.
      **Wynik kontroli planów:** nieodhaczone punkty w starszych planach
      (`PLAN_2026-09-25a` — 21, `PLAN_2026-08-26-batch49` — 24, `PLAN_2026-09-29b`
      — 8, …) to zaległa księgowość, nie niezrealizowana praca: flagowe punkty
      tych planów są w kodzie (`untapChoice` na kartach → `materialize.js` /
      `registry.js` / `pendingUntapChoice` i `resolve_untap_choice`,
      `resolve_food_choice`, karty Batcha 49/50). Żaden plan nie wymaga
      dokończenia implementacji — wykonano pętlę jakości (poniżej).
- [x] Pętla jakości (Żywy Tester, świeży `dist/`): partie `seed` 6611–6614 na
      taliach z kartami z PR #164 (`worek-mroczny` — Rakish Revelers,
      `kaladesh` — Skilled Animator, `wiedzmin-bg` — Scythe Tiger,
      `dominaria-wu` — Impulse) — 0 zgłoszeń detektorów, 0 `undefined`/`NaN`,
      0 niewycenionych akcji bota. Lektura transkryptów: etykieta shroud
      („Shroud (całun — niecelowalny dla nikogo)”), odznaka „animowany przez
      Skilled Animator” z bazowym 5/5, modal celu triggera z odmową dla
      „you may” (Reclusive Artificer) — zgodne z Oracle.
- [x] Przemiał KLASY znaleziska A-2 (pola-widma kontraktu `PlayerView`):
      narzędzie `tools/probe-phantom-view.mjs` + przebieg szeroki (28 partii,
      wszystkie talie) + triage kandydatów → 1 realny martwy odczyt
      (`descriptor.locksUntap` w `auraIsHostile`), naprawiony, z klasowym
      strażnikiem `test/audyt-pr164-pola-widm.test.js` i nową osią audytu
      („Oś 7”) w `docs/setup/TESTER_STOLU.md`.
- [x] Nie dodawać nowych kart do katalogu (ADR 0029).

### E. Brama końcowa i dokumentacja

- [x] `npm test` (cicho do `.arena/`).
- [x] `npm run test:all` (cicho do `.arena/`, ADR 0019).
- [x] `npm run build` (cicho do `.arena/`).
- [x] `node --test test/bot-benchmark.test.js` (cicho do `.arena/`).
- [x] `node tools/cr-numery.mjs --cr` oraz `node tools/event-contract-audit.mjs`.
- [x] Zaktualizować ten plan, raport audytu, `docs/PROJECT_HISTORY.md`, nowy
      handoff `docs/setup/HANDOFF_2026-10-13c.md` i opis PR.
- [x] Potwierdzić czyste drzewo, wypchnięte commity i zielony GitHub CI.

## Ryzyka i pułapki

- Diff PR #164 jest mały (22 pliki), ale dotyka czterech warstw naraz (silnik,
  widok, sesja, bot) — przegląd musi sprawdzać spójność MIĘDZY warstwami
  (L41/L48), nie tylko każdy plik osobno.
- Wszystkie testy i narzędzia uruchamiamy z przekierowaniem `> .arena/*.log 2>&1`
  (ENVIRONMENT §5a).
- Żywy Tester czyta `dist/mtg-table.html` — po każdej zmianie w `src/`
  obowiązkowy `npm run build` (L76).
- Zakaz force pusha na każdej gałęzi; przed każdym pushem kontrola `HEAD`
  i zdalnej gałęzi (ADR 0020 D).

## Wynik bram końcowych (etap E)

- `npm test` — **8133/8133**; `npm run test:all` — **8399/8399** (12 suite'ów,
  0 fail); `npm run build` — **74 moduły / 5108,5 kB**;
  `node --test test/bot-benchmark.test.js` — **10/10**.
- `node tools/cr-numery.mjs --cr /tmp/cr.txt` — **OK**: 523 numery w tabeli,
  522 unikalne w 5719 cytatach, 3165 numerów w pliku CR; sha256 pliku CR
  (`8d860e45…`) zgodny z nagłówkiem tabeli (ADR 0030).
- `node tools/event-contract-audit.mjs` — **0 naruszeń** (zdarzenia + kasowanie
  obiektów z pola bitwy).
- Pełnego B0 nie uruchamiano (ADR 0018 — brak zlecenia właściciela).
