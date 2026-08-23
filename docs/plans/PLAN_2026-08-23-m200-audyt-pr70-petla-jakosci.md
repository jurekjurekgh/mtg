# Plan sesji M200 — audyt PR #70 (M187–M199) + pętla jakości

- **Data:** 2026-08-23
- **Sesja:** `arena/01a02ebc-mtg`, PR sesji: otwarty na starcie (ADR 0020 A)
- **Wzorzec:** ADR 0020 (PR → audyt poprzedniego PR → inkrementalne commity),
  ADR 0021 (pętla domyślna — brak nazwanego tematu), ADR 0016 (metoda audytu),
  ADR 0018 (pełne B0 NIE — tylko próba szybka), ADR 0019 (tiers testów).

## Rozpoznanie

- `main` = squash `aa61167` (PR #70, scalony 2026-08-23 13:05 UTC), poprzedni
  stan `ec82411` (PR #69). Klon shallow — pogłębiony do 5 commitów, diff PR #70
  = `git diff ec82411..aa61167`.
- **Zakres PR #70:** 182 pliki (71 M, 110 A, 1 D).
  - **Batch 46 (M191):** 10 kart (Infectious Horror, Roiling Regrowth,
    Bring Low, Cathartic Reunion, Guildscorn Ward, Glint-Sleeve Artisan,
    Bone Shredder, Manor Gate, Gila Courser, Rediscover the Way).
  - **Batch 47 (M194):** 8 kart + 2 warianty druku Curate/Negate
    (Curate STX, Negate M15, Divest, Supernatural Stamina, Sequestered Stash,
    Enduring Sliver, Caves of Chaos Adventurer, Pyxis of Pandemonium).
  - **Batch 48 (M196):** 14 kart (Wooden Stake, Thraben Valiant, Fuel for
    the Cause, Clawing Torment, Quicksilver Fisher, Steelclaw Lance,
    Stampeding Elk Herd, Frost Lynx, Contested Game Ball, Ettercap,
    Coat with Venom, Cherished Hatchling, Bedhead Beastie, Ruthless Invasion).
  - **M190/M195:** uwagi właściciela (opisy zdolności many, graf Undercity,
    equip Thieves' Tools, samobójcza płatność basilisk, wizard many przy
    decyzjach płatniczych, bot-trick, multi-target wizard, komunikaty decydenta).
  - **M193:** źródła many Oracle; **M197:** plany kolekcji + strażniki +
    układ stołu; **M198:** poprawki układu po screenshotcie;
    **M199:** „Przebieg tur (dla AI)" w pełnym FoW.
  - 15 plików talii (regeneracja generatorem), `src/table/multi-target.js`
    (nowy moduł), usunięty `test/bot-reasoning.test.js` (panel G z M198).
- Stan wg PROJECT_STATE: `npm test` 2987/2987 (M199), build 53 moduły /
  2542.9 kB, katalog 459 kart.

## Etapy

### E1 — Weryfikacja bazy (kryterium: zielone liczby równe PROJECT_STATE)
- [ ] `npm test` → oczekiwane 2987/2987.
- [ ] `npm run build` → 53 moduły.
- [ ] `node --test test/bot-benchmark.test.js` → 9/9 (próba regresji, ADR 0019).
- Commit: brak (weryfikacja), ewentualnie fix bazowy jeśli coś się nie zgadza.

### E2 — Audyt PR #70 (ADR 0020 B)
Metoda (ADR 0016): przegląd KODU per mechanika, nie mapowania plików.
Minimowy zakres:
- [ ] **E2a. Karty batchy 46–48 vs Oracle** — dane (koszty, typy, P/T,
  oracleText) z `docs/cards/scryfall-*.json` maszynowo (strażniki istnieją —
  uruchomić + czytać komunikaty); zachowanie — testy `batch4[6-8]-kart` vs
  scenariusze Oracle (przejrzeć każdy test: czy testuje deklarowany skutek,
  nie tylko istnienie pola — L5/L21).
- [ ] **E2b. ADR 0002** — skan `src/engine/` po nazwach/ID kart z PR #70
  (grep po nazwach 28 kart w `src/engine/` i `src/cards/registry.js`,
  `materialize.js`, `identity.js` — zero trafień oczekiwane; strażnik
  `engine-card-agnostic-guard` działa).
- [ ] **E2c. Nowe mechaniki vs CR** — per mechanika z planów m191/m194/m196:
  `blockers_declared` (Wooden Stake), equip z warunkiem podtypu,
  `formidable` (CR 702.103), flash podtypu na jedną turę, `outlast`
  (CR 702.100a) + statyka dająca zdolność plemieniu, `freeIfCondition`,
  `combat_damage_to_you` z transferem kontroli, `filter.anyTypes`,
  wielocelowość (M195/C: `multi-target.js` — czy zatwierdzenie wraca do
  komendy z `legalCommands`, dedup, anty-over-fix L32), FoW w przebiegu tur
  (M199: czy flaga włączona TYLKO w `recordTurnEvent`, test „nie cenzuruj za
  dużo").
- [ ] **E2d. Oferta = walidacja (L48)** — nowe pendingi/pola widoku z PR:
  czy każda ścieżka oferty ma lustro w walidacji i w OBU botach.
- [ ] **E2e. Weryfikacja mutacyjna próbki** (L13/L34) — 2–3 świadome
  mutacje z obszarów PR #70 (np. `seesHiddenOf`, `creatureCantBlock`,
  wielocelowość) — testy muszą czerwienieć.
- [ ] Raport: `docs/audits/AUDYT_PR70_2026-08-23.md` + wynik w opisie PR.
- Commity: raport (może iść z pierwszym fixem), każdy fix OSOBNO
  (RED→GREEN), push po każdym.

### E3 — Pętla jakości (ADR 0021)
- [ ] **E3a. Żywy Tester z perspektywy gracza** — 6–10 partii na zbudowanym
  artefakcie, talie z nowych batchy (kamigawa/theros/… — talie, które
  zawierają karty batchy 46–48) + worki; profile: greedy, explorer,
  defensive, random, impatient. Czytanie transkryptu WZDŁUŻ OSI z
  `TESTER_STOLU.md` (bezsensowne działania bota, kompletność logu/modalu,
  ptaszki wyciszenia). Znaleziska: repro headless → root cause → fix +
  test → nowy detektor dla klasy (L27/L40).
- [ ] **E3b. Polowanie na niezgodności z CR inną ścieżką** niż M187/M192 —
  kandydaci (rozpoznanie): obszary dotykanie PR #70 od strony CR
  (declare_blockers CR 509, transfer kontroli CR 712, flash CR 701.8,
  outlast CR 702.100a, transfer counters), + 2–3 obszary nienotykanie
  ostatnio (np. CR 701.43 amass, CR 603.6a trigger LIFO, CR 702.103
  formidable). Wynik (także czysty) utrwala się testem-strażnikiem (L39).
- Commity: każdy fix osobno; nowe lekcje do `docs/LESSONS.md` (L57+).

### E4 — Zamknięcie sesji
- [ ] `npm test` + `npm run build` + próba bota zielone.
- [ ] `docs/PROJECT_STATE.md` — wpis M200+; `docs/setup/HANDOFF_2026-08-23-m200.md`.
- [ ] Opis PR zaktualizowany kumulatywnie.
- [ ] Blokada przekazania w czacie (AGENTS.md).

## Ryzyka i pułapki

- Klon shallow (depth 1) — diffy audytowe z `ec82411..aa61167` po
  `fetch --depth=5`; jeśli zabraknie historii — `gh api` po plikach PR.
- Reset workspace w trakcie sesji (ENVIRONMENT §2) — commit+push po każdym
  zielonym kroku, `git log -1` po każdym commicie.
- `edit_file` psuje polskie znaki — edycje plików PL przez `python3`
  (ENVIRONMENT §4).
- Żywy Tester gra na ZBUDOWANYM artefakcie — `npm run build` przed
  weryfikacją; `npm i` w `tools/table-tester` przy pierwszym użyciu.
- `npm test` = szybki rdzeń; brama = `npm run test:all` (ADR 0019) — przed
  zamknięciem sesji puścić `test:all`.
- Pełne B0 zabronione (ADR 0018) — tylko `node --test
  test/bot-benchmark.test.js` i ewentualnie `node tools/benchmark.mjs`
  (profil szybki, ~2–4 min).
- Pułapka L21 (pole spoza kontraktu ginie po cichu) przy nowych testach;
  L48 (oferta ≠ walidacja) przy nowych pendingach; L33 (tester kłamie o
  stanie gry); L15 (polowa tropów to fałszywe alarmy — dokumentować).
- Nie wymyślać nowych batchy kart (ADR 0021 §4c) — karty tylko z listy
  właściciela.

## Podsumowanie wykonania

(dopisać na końcu)
