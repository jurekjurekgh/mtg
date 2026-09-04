# PLAN 2026-09-04 — batch 53 (589–598, lista właściciela „nowy batch materializacyjny”)

**Sesja:** `arena/01a06dd7-mtg` (PR #96 — nośnik batcha; sesja już ma otwarty
PR, więc plan jest kolejnym commitem tego samego PR — model sesyjny ADR 0013).
**Baza:** `main` @ `bf615b1` (squash PR #95). **HEAD przed pracą:** `5d763ca`.
**Prompt (właściciel):** „Proponuję nowy batch materializacyjny. Podziel to
sobie na sensowne etapy i commituj po kawałku” — 10 kart:

| # | Nazwa | Set | Talia (plan) |
|-|---|---|---|
| 589 | Acidic Slime | M3C | Warhammer Fantasy |
| 590 | Keep Out | ECL | Wiedźmin |
| 591 | Rust-Shield Rampager | BLB | Bloomburrow |
| 592 | Glorifier of Suffering | LCI | Warhammer Fantasy |
| 593 | Inspiring Captain | SOI | Warhammer Fantasy |
| 594 | Ironclad Slayer | EMN | Wiedźmin |
| 595 | Óin the Brave | HOB | Śródziemie |
| 596 | Ghirapur Gearcrafter | ORI | Kaladesh |
| 597 | Ichorclaw Myr | SOM | Mirrodin |
| 598 | Sheriff of Safe Passage | OTJ | Śródziemie |

Zasady: **ADR 0010 §2a** (Scryfall najpierw → `artId` ze słownika →
`defineCard` w `REAL_CARDS` → talie → testy → dokumentacja; procedura
`docs/cards/HOW_TO_ADD_CARD.md`), **ADR 0002** (mechaniki generyczne, bez
warunków po nazwie karty), **ADR 0022** (`supported` = 100% Oracle albo
nieobsługiwana; `limitations` puste lub tylko strukturalne), **ADR 0020**
(inkrementalne commity na gałęzi sesji, każdy samodzielnie zielony,
bez force push), **ADR 0028** (rulingi ściągnięte przy karcie).

## Pomiar startowy (przed kodowaniem)

- [x] `npm test` (fast): **4402/4402** pass, 0 fail (zmierzone na `5d763ca`).
- [x] `npm run build`: OK — **59 modułów / 3226,2 kB**.
- [x] `npm run test:all`: **4412/4412**.
- [x] Baza `bf615b1`, gałąź `arena/01a06dd7-mtg`, HEAD `5d763ca`.
- [x] Oracle 10 kart pobrany ze Scryfalla przez `fetch_page` (egress
      arbitralny zablokowany — ENVIRONMENT §4); `pobrano` 2026-09-04.
- [x] Rulingi WotC pobrane dla wszystkich 10 kart (puste dla prostych,
      istotne dla: Offspring, Glorifier (reflexive), Inspiring Captain,
      Storied/Óin, Ichorclaw (becomes blocked), Plot/Sheriff).

## Transza 1 — 3 proste karty (590 Keep Out, 594 Ironclad Slayer, 596 Ghirapur Gearcrafter)

- [x] `defineCard` ×3 w `REAL_CARDS` + `plan`/`artId` (ADR 0010 §2a).
- [x] `MANA_COSTS` ×3.
- [x] `tools/collection-art-ids.csv`: 590/594/596 (jeszcze przed pełnym 589–598).
- [x] Generyczne filtry celów w `triggers.js`:
      `aura_or_equipment_card_in_graveyard` (Ironclad) oraz
      `artifact_or_enchantment_or_land` (przygotowanie pod Acidic Slime).
- [x] PL etykiety filtrów w `src/table/render.js` (strażnik M126).
- [x] Wpis katalogowy `token_thopter` + obraz Scryfall (strażnik M202/K).
- [x] `node tools/generate-plan-decks.mjs` → decks/ (kaladesh, wiedzmin).
- [x] `test/real-cards-batch53.test.js` (sanity danych + legalne scenario;
      Ironclad: „you may” z celowym i z odmową; Keep Out: oba tryby; Ghirapur: token).
- [x] Pomiar: `npm test` **4410/4410**, `npm run build` **59 modułów / 3232,0 kB**.

## Transza 2 — Sheriff of Safe Passage (598 OTJ, Plot)

- [x] `defineCard` + `MANA_COSTS` + `tools/collection-art-ids.csv` (598).
- [x] Generyczna formuła wejścia `other_creatures_you_control_plus_one`
      w `applyEnterCounters` (`src/engine/effects.js`) — CR 121.6/614.1c,
      bez kartowych warunków (ADR 0002).
- [x] `node tools/generate-plan-decks.mjs` → `decks/srodziemie.txt`.
- [x] `test/real-cards-batch53.test.js`: sanity danych + wejście 1 licznik
      (pusty stół) oraz 3 liczniki (dwóch sojuszników).
- [x] Pomiar: `npm test` **4413/4413**, `npm run build` **59 modułów / 3233,8 kB**.

## Transza 3 — Rust-Shield Rampager (591 BLB, Offspring)

- [x] `defineCard` + `MANA_COSTS` + `tools/collection-art-ids.csv` (591).
- [x] Deskryptor `offspring` `{cost, colors}` (registry/materialize/identity/
      game-state/resources) — wzorzec kickera (CR 702.16b?); `cast_permanent`
      z `offspring: true` sumuje koszt, dodaje pipy i flagę `wasOffspring`;
      `legalCommands` oferuje wariant tylko gdy stać na dopłatę.
- [x] Generyczny efekt `create_offspring_token` (effects.js): 1/1 token-kopia
      WARTOŚCI Z DRUKU (bez liczników/aur/atachamentów — ruling BLB);
      dziedziczy „enters"/„enters with", station/saga/transformTo.
- [x] `condition.wasOffspring` (triggers.js) — trigger tylko u spłaconego rzutu.
- [x] Statyczna restrykcja `cantBeBlockedByPower` (abilities/combat)
      — bloker o efektywnej mocy <= próg nie może blokować (legalBlockerOptions).
- [x] `createBattlefieldToken` przenosi `entersWithCounters/If` na token-kopię.
- [x] PL etykieta `create_offspring_token` (strażnik M122).
- [x] `node tools/generate-plan-decks.mjs` → `decks/worek-basni.txt`.
- [x] `test/real-cards-batch53.test.js`: sanity danych + bez/Offspring 1/1
      + bloker 2/2 odrzucony a 3/3 dopuszczony (legalBlockerOptions).
- [x] Pomiar: `npm test` **4417/4417**, `npm run build` **59 modułów / 3241,3 kB**.

## Transza 4 — Óin the Brave (595 HOB, Storied)

- [x] `defineCard` + `MANA_COSTS` + `tools/collection-art-ids.csv` (595).
- [x] Generyczny `Storied` (abilities.js): statyczna zdolność `storied: true`
      + warunek statyczny `condition.enduringStory` (permanents.js) z etykietą
      NA GRACZU (`player.enduringStory`) — raz nadana, trwa do końca gry.
- [x] `hasEnduringStory` liczy artefakty/legendy/Sagi RAZ per permanent i
      ustawia etykietę w `runStateBasedActions` (nie trigger, nie stos;
      rulingi HOB 2026-06-29).
- [x] `defineCard`: Storied + +1/+0/haste (as long) + `{1},{T},Discard a
      card: Draw a card` (istniejący koszt `discardCard`).
- [x] `decks/srodziemie.txt` przez generator (ADR 0023).
- [x] `test/real-cards-batch53.test.js`: sanity danych, 1/3 bez story →
      2/3+haste przy 3 kwalifikowanych, trwałość po utracie, aktywacja
      `{1},{T}` z odrzuceniem.
- [x] Pomiar: `npm test` **4421/4421**, `npm run build` **59 modułów / 3245,5 kB**.

## Transza 5 — Ichorclaw Myr (597 SOM, Infect + „becomes blocked”)

- [x] `defineCard` + `MANA_COSTS` + `tools/collection-art-ids.csv` (597).
- [x] Generyczny trigger `becomes_blocked` (triggers.js): raz na atakującego,
      niezależnie od liczby blokerów (ruling SOM); blok bez blokerów nie odpala.
- [x] PL etykieta `TRIGGER_EVENT_LABELS` (strażnik M122/A).
- [x] `decks/mirrodin-*` przez generator (ADR 0023/0024, split pozostaje
      `mirrodin-wu`+`mirrodin-brg`).
- [x] `test/real-cards-batch53.test.js`: sanity danych (Infect w keywordach),
      blok 1 blokerem + blok 2 blokerami (pump tylko +2/+2), brak bloku = brak.
- [x] Pomiar: `npm test` **4424/4424**, `npm run build` **59 modułów / 3248,1 kB**.

## Etap 1 — dane kart (ADR 0010 §2a)

- [ ] 10 × `docs/cards/scryfall-<slug>.json` (uproszczony kształt wg
      `HOW_TO_ADD_CARD.md` + `rulings`/`rulingsSource`/`rulingsPobrano`).
- [ ] `tools/collection-art-ids.csv` dopisane 589–598 (trzykolumnowy format
      `Ilustracja,Nazwa Karty,Plan`).
- [ ] `test/art-ids-tool.test.js` 588→598 (jeśli zszywa zakres).

## Etap 2 — mechaniki silnika (generyczne, ADR 0002)

Przewidywane braki w core (nazwane REGUŁY, nie łatki):

- [ ] **`permanent_artifact_enchantment_land`** — filtr celu dla Acidic Slime
      („target artifact, enchantment, or land”) w `spells.js`/`triggers.js`.
- [ ] **`aura_or_equipment_card_in_graveyard`** — filtr celu dla Ironclad
      Slayer („target Aura or Equipment card from your graveyard”).
- [ ] **`becomes_blocked`** — generyczny trigger „whenever this creature
      becomes blocked” (Ichorclaw Myr); emitowany raz na atakującego przy
      `declareBlockers`, skanowany przez `triggers.js` (wzorzec
      `blockers_declared` dla Wooden Stake). Ruling WotC: raz, niezależnie
      od liczby blokerów.
- [ ] **`cantBeBlockedByPower`** — statyczna restrykcja „can't be blocked by
      creatures with power 2 or less” (Rust-Shield Rampager) w
      `canBlock`/`declareBlockers`; ruling: już zablokowanie nie odwraca się,
      gdy bloker zmaleje.
- [ ] **Offspring** (Rust-Shield Rampager) — deskryptor kosztu dodatkowego
      przy rzucie + trigger „when this creature enters, create a 1/1 token
      copy of it” (CR 702.16x?); jednokrotna dopłata, kopia bez atachman­tów/
      liczników/niekopiowalnych, „enters” kopii działają, kontrowany rzut = brak
      tokenu.
- [ ] **reflexive „When you do” po sacrifice** (Glorifier of Suffering) —
      najpierw decyzja „may sacrifice another creature or artifact”, potem
      refleksyjna zdolność z celami „up to two target creatures” i licznikami.
      Wzorzec: `requiresTarget` z kosztem (Zoraline — pay) + `pendingSacrifice`
      (istnieje); należy domknąć timing refleksyjny.
- [ ] **Storied** (Óin the Brave) — gracz (nie źródło) z 3+ legendarnymi,
      sagami i/lub artefaktami dostaje trwałą etykietę `enduringStory` na
      resztę gry (nie trigger, nie idzie na stos; raz ustawiona nie znika).
      Statyka: „As long as you have an enduring story, Óin gets +1/+0 and has
      haste.” Rulingi WotC: liczy się 1 raz za permanent, źródło musi mieć
      storied, etykieta nieusuwalna.

## Etap 3 — definicje kart

- [ ] `256`-słownik: 10 × `defineCard` w `src/cards/card-data.js` + `plan`.
- [ ] `MANA_COSTS` dla 10 kart (`src/cards/mana-costs-data.js`).
- [ ] Token Thopter (Ghirapur) i token-kopia Rust-Shield oraz (jeśli trzeba)
      tokeny/obrazy w `TOKEN_IMAGES`/katalogu tokenów.

## Etap 4 — etykiety, klasyfikacje, talie, testy

- [ ] Etykiety PL dla nowych zdarzeń/efektów (strażnik M122, M202/C,
      KEYWORD_LABELS / KEYWORD_EVENT_LABELS).
- [ ] Klasyfikacja nowych efektów w heuristic-bocie (strażnik M157,
      `FRIENDLY_TARGET_EFFECTS`, `REVIEWED_UNVALUED`).
- [ ] `gameObjectDataOf` (`src/cards/materialize.js`) — nowe deskryptory
      (offspring/storied/becomes_blocked) muszą dojść na obiekt gry (L84).
- [ ] `node tools/generate-plan-decks.mjs` → decks/ (singleton, ADR 0023).
- [ ] Testy `test/real-cards-batch53.test.js` (legalny + nielegalny + sanity
      danych + interakcje), w tym testy reguł generycznych.
- [ ] `npm test` + `npm run build` zielone po każdej samodzielnej paczce;
      aktualizacja README/PROJECT_HISTORY/ENGINE_MILESTONES (M305+).

## Etap 5 — domknięcie

- [ ] Bramy: `npm test`, `npm run build`, `npm run test:all` zielone.
- [ ] `node --test test/bot-benchmark.test.js` (dopuszczalny profil szybki,
      ADR 0018 — bez pełnego B0).
- [ ] Opis PR #96 kumulacyjnie; `docs/setup/HANDOFF_2026-09-04.md` i
      `docs/PROJECT_HISTORY.md` z wynikami.
- [ ] `git status` czysty; wszystko wypchnięte.

## Ryzyka i pułapki

- **Nowe mechaniki to 4 dowiązania** (EVENT_TYPES + opis, etykieta PL,
  wycena bota, `gameObjectDataOf`) — L84; strażnik zgłosi brak osobno.
- **Offspring i Storied to nowe reguły o niejednoznacznym sformułowaniu** —
  rozstrzygnięcia bierz z rulingów WotC (już zapisane w Scryfall JSON).
- **Reflexive „When you do” ma dwie decyzje w kolejności** (najpierw
  sacrifice, potem cele) — nie skracać do jednej, bo to zmienia timing
  (CR 603.3d / ruling Glorifier).
- **Przydział planów** musi uruchomić `generate-plan-decks.mjs`, nigdy nie
  zszywać `decks/*.txt` ręcznie (L122); po zmianie składu talii sprawdzić
  złote-mastery i re-hunt seedów (M228/L25).
- **Sandbox potrafi resetować workspace** (ENVIRONMENT §2) — commituj+pushuj
  po każdym zielonym kroku; przed dłuższym pomiarem sprawdź HEAD.
- **Polskie znaki**: edycje `docs/*.md` i CSV przez `python3` + UTF-8.
