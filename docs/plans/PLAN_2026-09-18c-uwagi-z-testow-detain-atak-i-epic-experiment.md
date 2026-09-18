# Plan sesji 2026-09-18c — uwagi właściciela z testów: A (detain a atak bota), B/B1 (Epic Experiment X=0 i brak X w logu)

> Sesja na gałęzi `arena/01a0b60e-mtg`, PR #129 (kontynuacja — 1 sesja = 1 PR).
> Zlecenie: „Uwagi z testów” właściciela (2026-09-18), trzy punkty A, B, B1.

## Zlecenie właściciela (cytaty)

- **A.** „Karta Azorius Justicar. Bot wystawia go i nadaje stan detain mojej
  jedynej kreaturze. […] Nie mam ani jednej kreatury zdolnej do blokowania.
  Mimo to bot nie atakuje żadną ze swoich czterech kreatur na stole bo myśli,
  że mógłbym go zblokować tą swoją, która jest detained. […] Scoring do
  poprawki. Detain (i inne podobne zdolności/aury) powinny powodować, że moja
  kreatura nie jest brana pod uwagę przy ocenianiu sensowności i ryzyka ataku
  przez bota.”
- **B.** „Karta Epic Experiment. Bot rzuca go za UR i X=0. To bez sensu
  kompletnie. Ta karta ma jakikolwiek sens jeśli X>0, im większe X tym lepiej
  (chyba że bot ma wyczerpaną talię). W momencie gdy bot rzucał ten czar mógł
  wydać many na X=5 i rzucić kilka czarów za darmo […]. Scoring do naprawy.”
- **B1.** „W Rozgrywce ani w logu nie ma informacji za ile X bot zagrał Epic
  Experiment (mogę to sobie tylko zgadywać po ilości zatapowanych lądów) — ta
  informacja powinna znaleźć się w layerze Rozgrywka i w logu.”

Uwaga: w katalogu karta nazywa się **Azorius Justiciar** (RTR) — właściciel
pisze „Justicar”; to ta sama karta (właściciel widział ją w swojej talii
ravnica).

## Rozpoznanie (zmierzone, nie z pamięci)

### A — root cause

- Silnik jest POPRAWNY i generyczny: detain siedzi w `blockRestrictionError`
  (combat.js, para warstwa, używana przez ofertę `canBlock` i walidację
  `blockAssignmentViolation`), a „can't block” z cech/aur w centralnym
  odczycie `creatureCantBlock` (permanents.js:513, L55) + `attachmentRestrictions`.
- `PlayerView` niesie oba fakty: `entry.detained` (game-state.js:5967)
  i `entry.cantBlock` (game-state.js:5979 — liczony z `creatureCantBlock
  || attachmentRestrictions.cantBlock`).
- **Wada bota:** `untappedEnemyBlockers` (heuristic-bot.js:1105) =
  `enemyCreatures(view).filter((o) => !o.tapped)` — ignoruje `cantBlock`
  i `detained`. Ten jeden helper karmi CAŁE ryzyko ataku: `declare_attackers`
  scoring (5706: strongest/gang/weakest blocker), equip (2456, 5634), ewazję
  flying (4614, 4837) i `tieProjection` (7163). Bot liczy więc detained/cantBlock
  stwory jako potencjalnych blokerów → zawyża ryzyko → nie atakuje.
- To klasa L1 odwrotna: dane w widoku SĄ, bot ich nie czyta (nie ślepota —
  niedoczytanie). Naprawa w jednym helperze (L41: jedno źródło).

### B — root cause

- Oferta jest poprawna: `legalXCostCasts` (spells.js) enumeruje warianty
  X=0..min(maxX, cap), każdy jako osobna komenda z `xValue` (Epic Experiment:
  `xCost: { cap: 15 }`).
- **Wada bota:** efekt `epic_experiment` NIE MA wyceny w heuristic-bot
  (klasa L50) → wszystkie warianty X dostają identycznie `P.spellBase`(50),
  a linia 5582 (`score -= min(xValue,2)*0.5`) daje przewagę X=0. Bot wybiera
  X=0 — 2 many za nic, dokładnie objaw zgłoszony.
- Wzorzec: M237/1 rozwiązał `'X'` → `cmd.xValue` przed wyceną efektów
  (heuristic-bot.js:3839), więc gałąź dostaje `amount` liczbowy — trzeba tylko
  wycenić efekt. Ryzyko biblioteki liczy istniejący `libraryLossPenalty`
  (heuristic-bot.js, B/2026-09-11) — właściciel: „im większe X tym lepiej
  (chyba że bot ma wyczerpaną talię)”.

### B1 — root cause

- Zdarzenie `spell_cast` z `castXCostSpell` NIESIE `xValue` (spells.js:987).
- `describeGameEvent` case `spell_cast` (session.js:1051) go NIE renderuje —
  log i warstwa „Rozgrywka” (oba idą przez tę funkcję: `noteBotMove` +
  `recordTurnEvent`, L41 jedno źródło brzmienia) milczą o X.
- Wzór istnieje: `ability_activated` robi `xPart` (session.js:1301);
  etykiety komend render.js (2714, 2911) już pokazują X własnych zagrań.

## Źródła reguł (ADR 0030 — pobrane, nie z pamięci)

- **Detain** — snapshot `docs/cards/scryfall-azorius-justiciar.json`, Oracle
  reminder text dosłownie: „(Until your next turn, those creatures can't attack
  or block and their activated abilities can't be activated.)”; rulingi WotC
  2013-04-15 (api.scryfall.com/cards/rtr/6/rulings), m.in.: „If a creature is
  already attacking or blocking when it's detained, it won't be removed from
  combat. It will continue to attack or block.” (utrwalone w teście-stróżu).
- **Epic Experiment** — snapshot `docs/cards/scryfall-epic-experiment.json`
  (Oracle zgodny 1:1) + rulingi WotC 2021-03-19
  (api.scryfall.com/cards/otc/222/rulings), m.in. „If the card has {X} in its
  mana cost, you must choose 0 as the value of X when casting it without paying
  its mana cost.” (dotyczy darmowych rzutów Z eksperymentu, nie samego rzutu
  eksperymentu — bez wpływu na fix, odnotowane dla kompletności).
- Zmiany NIE zmieniają legalności silnika (silnik już poprawny) — to wycena
  bota (heurystyka) i warstwa prezentacji (log), więc bez zmian CR w engine.

## Etapy

- [x] E0. Rozpoznanie + ten plan (commit i push PRZED kodowaniem — ADR 0020 A/C).
- [x] E1 (A). RED: test, w którym bot NIE atakuje mimo jedynego „blokera”
  detained/cantBlock → fix `untappedEnemyBlockers` (jedno źródło, L41) →
  GREEN + mutacja (L13). Bramka: `npm test` + build. Commit + push.
- [x] E2 (B). RED: test, że bot rzuca Epic Experiment z X>0 (najwyższe
  opłacalne) i NIE rzuca X=0; anty-over-fix: cienka biblioteka ogranicza X
  (`libraryLossPenalty`) → wycena `epic_experiment` w gałęzi czarów (L50) →
  GREEN + mutacja. Bramka j.w. Commit + push.
- [x] E3 (B1). RED: `describeGameEvent('spell_cast', {xValue})` bez X w tekście
  → dopisać `xPart` w case `spell_cast` (jedno źródło brzmienia — log + modal
  „Ruch bota” + warstwa Rozgrywka, L41) → GREEN + mutacja + pin obu powierzchni
  (L99). Bramka j.w. Commit + push.
- [x] E4. Golden-master `test/bot-scoring-snapshot.test.js`: regeneracja
  `--write` DOPIERO na gotowym drzewie wag (L124), z atrybucją w commicie;
  szybka próbka benchmarku (`test/bot-benchmark.test.js` w `npm test`) zielona.
- [x] E5. Pętla jakości: partie celowane Żywym Testerem na talii ravnica
  (Epic Experiment + Azorius Justiciar) — potwierdzenie „X=” w logu
  i zachowania bota; detektory bez nowych zgłoszeń klasy A/B/B1.
- [x] E6. Domknięcie: plan [x], `npm run test:all` (brama PR), handoff
  2026-09-18c, wpis PROJECT_HISTORY, README (liczby zmierzone, L92),
  kumulatywny opis PR (gh api PATCH — `gh pr edit` odrzucane, ENVIRONMENT §3),
  blok przekazania w czacie.

## Ryzyka i pułapki

- **Golden-master i ratchety** (`bot-scoring-snapshot`, `audyt-bot-walka-remisy`):
  zmiany wyceny ruszają ślad bota — regeneracja dopiero po E1–E3 (L124: trzy
  drzewa atrybucji), nie „po drodze”.
- **Benchmark:** fix A zachęci bota do częstszych ataków, fix B doda rzuty EE —
  próbka regresji (w `npm test`) musi zostać nad progami; pełny B0 tylko na
  komendę właściciela (ADR 0018).
- **Anty-over-fix A:** stwory `cantBlockAlone` i tapped-to-untap NIE są
  wykluczane (mogą blokować); wykluczamy tylko twarde zakazy (L55: odczyt
  centralny, nie własna lista).
- **Anty-over-fix B:** X=0 innych czarów X (np. Consume Spirit) już dziś
  rozróżnia wycena damage/gain_life po `xResolved` (M237/1) — nie ruszamy
  ogólnej kary 5582, tylko dodajemy wycenę efektu `epic_experiment`.
- Mutacje zawsze z kopią `/tmp` (L136), przywracanie kopią, nie `git checkout`.

## Kryterium ukończenia całości

`npm run test:all` zielone, build zielony, próbka benchmarku nad progami,
transkrypty testera bez zgłoszeń A/B/B1, wszystkie piny zweryfikowane mutacją
(L13), PR #129 zaktualizowany kumulatywnie.
