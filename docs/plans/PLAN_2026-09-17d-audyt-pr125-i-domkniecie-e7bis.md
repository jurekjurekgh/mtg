# Plan 2026-09-17d — audyt PR #125 + domknięcie pomiaru E7bis + pętla jakości (ADR 0020/0021)

Sesja: „Kontynuujemy projekt." — prompt bez nazwanego tematu → tryb obowiązkowy
ADR 0020 (PR → audyt poprzedniego PR → inkrementalne commity) + pętla domyślna
ADR 0021 §4. Gałąź sesji: `arena/01a0b0e5-mtg`, bazowy HEAD: `cf51ae9`
(squash PR #125 = stan `main` na starcie). Klon lokalny jest **shallow** —
historię pojedynczych commitów PR czytamy przez `gh api`, nie przez
`git show <sha>^` (to drugie pokazuje śmieci: brak rodzica).

## Rozpoznanie (stan na start, zmierzony)

- `npm test` **5723/5723** (0 fail, ~205 s) — o 4 testy więcej niż w handoffie
  2026-09-17c (5719), bo squash PR #125 zawiera jeszcze commit `M374/1`
  z czterema pinami (`test/m374-l48-grant-w-pipach.test.js`).
- `npm run build` — zielony (liczba modułów/kB odnotowana w E1 z wyniku).
- Poprzedni scalony PR: **#125** (`arena/01a0ae26-mtg`, scalony 2026-09-17;
  squash `cf51ae9`; 81 plików). PR #124 audytowany w poprzedniej sesji
  (`docs/audits/AUDYT_PR124_2026-09-17.md`, werdykt APPROVE).
- **Otwarta pozycja z handoffu 2026-09-17c:** pomiar quick 25 talii przerwany
  na 2400/5952 znaleziskiem `illegal_spell: Niewystarczająca mana`
  (`random(wiedzmin-bg) vs heuristic(tarkir-wur)`, seed 2039). Root cause
  naprawiony commitem `M374/1` (grant lądu w pipach + atomowość `spendMana`),
  ale **przebieg E7bis nie został wykonany**, a M374 nie ma wpisu
  w dokumentacji (grep `M374` po `docs/` i `README.md`: zero trafień).
- Plan `PLAN_2026-09-17c-*`: wszystkie etapy `[x]`, z zastrzeżeniem przy E7
  (przebieg quick-25 przerwany) — to jest do domknięcia w tej sesji.

## Etapy

- [ ] **E0 — plan sesji** (ten plik, commit 1, PR na GitHubie przed kodowaniem
  — ADR 0020 A).
- [ ] **E1 — pełny audyt PR #125** (raport `docs/audits/AUDYT_PR125_2026-09-17.md`)
  ADR 0020 B / 0016: przegląd każdego obszaru zmienionego pliku — stan po PR
  wobec stanu na jego starcie, zgodność z CR i ADR 0002, generyczność mechanik,
  cards vs Oracle/Scryfall, RED→GREEN (weryfikacja mutacyjna L13), spójność
  dokumentacji:
  - `src/engine/players.js` — energia (CR 122.1: licznik GRACZA, brak czyszczenia
    na koniec tury, „can't pay more than you have"),
  - `src/engine/abilities.js` — koszt `{E}` (oferta PRZED walidacją, atomowość
    CR 601.2h), wspólne źródło kandydatów celów (M82/L48: `legalTargetCandidates`),
  - `src/engine/resources.js` — bramka sumy przed mutacją, fallback koloru grantu
    (M374/1); czy oferta == płatność na wszystkich ścieżkach,
  - `src/engine/triggers.js` — kontroler z LKI przy śmierci/odejściu
    (CR 603.10a, CR 400.3), `beginning_of_second_main` + intervening-if
    (CR 603.4), `artifact_or_creature` z `controlledBy`/`notSelf` (CR 115.2),
  - `src/engine/combat.js` — `mandatoryAttackerIds` (CR 508.1a/c, goad 701.38,
    „if able" M270) w trzech konsumentach: oferta, walidacja, auto-deklaracja,
  - `src/engine/effects.js`, `spells.js`, `destruction.js`, `identity.js`,
    `attachments.js`, `permanents.js`, `game-state.js`, `protocol/types.js`,
  - `src/cards/*` — batch 56 (10 kart + 2 tokeny) wobec `docs/cards/scryfall-*.json`,
    `MANA_COSTS`, dwie ścieżki deskryptorów (registry + identity: L21),
  - `src/controllers/*` — wycena exploita (bramki B), klamra landu 16→25
    (audyt remisów), koszt `{E}`,
  - `src/table/*` + `tools/*` — stempel ISO/`clock.js`, morph w tle tokenu
    (E2/H), filtr zdolności many, hover z numerem kopii, tester (E3).
  - Kryterium: raport z werdyktem, listą znalezisk i weryfikacją mutacyjną
    (mutacje 1-liniowe, plik kopiowany `cp` do `/tmp` przed i po — L136).
- [ ] **E2 — naprawy znalezisk audytu** u root cause, każda z pinem RED→GREEN
  i mutacją L13, osobnym commitem i pushem (ADR 0020 C). Znaleziska z E1
  (co najmniej F1: `effectTargets` — niezadeklarowany identyfikator w gałęzi
  `get_energy`).
- [ ] **E3 — domknięcie pomiaru E7bis** (otwarta pozycja handoffu): przebieg
  quick 25 talii (`node tools/benchmark.mjs --quick --decks <wszystkie>`) bez
  potoku `| tail` (ENVIRONMENT §5) + kontrola, że znalezisko seeda 2039 nie
  wraca; wynik do planu, `docs/PROJECT_HISTORY.md` i opisu PR. Pełne B0
  wyłącznie na wyraźną komendę właściciela (ADR 0018) — NIE odpalamy.
- [ ] **E4 — pętla jakości** (ADR 0021 §4a, inna ścieżka niż poprzednia sesja):
  Żywy Tester (`npm i` w `tools/table-tester`, `npm run build`, kilka partii
  na taliach z nowymi mechanikami), transkrypty czytane RĘCZNIE wzdłuż trzech
  osi; każda znaleziona klasa kończy się detektorem (L27), naprawa u root cause.
- [ ] **E5 — polowanie na niezgodności z CR** (ADR 0021 §4b) na ścieżce
  niebadanej w poprzedniej sesji (nowe mechaniki: koszt `{E}`/CR 122,
  `beginning_of_second_main`/CR 603.4, LKI kontroli przy śmierci) + narzędzia
  audytu (`tools/family-audit.mjs`, `tools/event-contract-audit.mjs`).
- [ ] **E6 — domknięcie**: dokumentacja (milestone M374/M375, historia, README
  z liczbami zmierzonymi na końcu — L92), bramki `npm test` + `npm run test:all`
  + `npm run build`, aktualizacja opisu PR, handoff sesji.

## Ryzyka i pułapki

- **Mutacje testowe dotykają plików silnika** — przed każdą kopiujemy plik do
  `/tmp` (`cp`), a po niej przywracamy KOPIĄ (nie `git checkout` — L136/ENVIRONMENT §3)
  i sprawdzamy `git diff --stat`.
- **Shallow klon** — `git show <sha>^` i `git log --stat` na squashu kłamią
  (pokazują całe repo jako dodane); do zmian używamy `gh pr diff`/`gh api`.
- **Pomiar quick-25 trwa ~10 min** — bez potoku, przed nim wypchnięty stan
  (ENVIRONMENT §2 profilaktyka); nie przerywamy w połowie bez adresu błędu (L88).
- **Katalog kart nie rośnie** z inicjatywy sesji (ADR 0029); nowe karty tylko
  z listy właściciela.
- **Nie scala się PR** i nie rusza ustawień `main` (ADR 0007/0020).
