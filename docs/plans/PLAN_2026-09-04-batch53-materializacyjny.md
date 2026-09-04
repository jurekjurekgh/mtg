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
