# Roadmapa — Batch 74: kolekcja 656–665 (10 kart realnych) + celowane pętle PMSSB-91

**Cel:** wdrożyć w pełni (bez `support.limitations`, ADR 0022) 10 nowych kart z kolekcji właściciela (pozycje `656..665` w `tools/collection-art-ids.csv`), uzupełnić brakujące mechaniki generyczne w silniku (ADR 0002), przydzielić karty do talii przez `tools/generate-plan-decks.mjs` (ADR 0023/0024), napisać pełne testy kartowe oraz przeprowadzić **celowane pętle PMSSB-91 manualnego strojenia scoringu bota** w roli pro-playera MtG (kontekst fazy gry, stołu, ręki, stworów własnych i przeciwnika, życia, biblioteki i cmentarza).

---

## 1. Zestaw kart (wiążące `plan` z listy właściciela — ADR 0029)

Wszystkie dane Oracle, numery druków, obrazy i rulingi WotC pobrane ze Scryfalla z parametrem `set=` (`2026-11-16`) i zapisane w `docs/cards/scryfall-<slug>.json`.

| # | Ilustracja | Karta (`id`) | Set / # | Plan (wiążący) | Typ / koszt / P/T | Istota Oracle i rulingów |
|---|---|---|---|---|---|---|
| 656 | `656EXO` | **Grollub** (`grollub`) | `EXO` #63 | Warhammer Fantasy | Creature — Beast `{2}{B}` 3/3 | *Whenever this creature is dealt damage, each opponent gains that much life.* |
| 657 | `657PLC` | **Saltfield Recluse** (`saltfield-recluse`) | `PLC` #16 | Amonkhet (`worek-legend`) | Creature — Human Rebel Cleric `{2}{W}` 1/2 | *{T}: Target creature gets -2/-0 until end of turn.* |
| 658 | `658DOM` | **Memorial to Genius** (`memorial-to-genius`) | `DOM` #243 | Dominaria | Land | *Enters tapped. `{T}`: Add `{U}`. `{4}{U}, {T}`, Sacrifice this land: Draw two cards.* |
| 659 | `659WOC` | **Gylwain, Casting Director** (`gylwain-casting-director`) | `WOC` #4 | Eldraine (`worek-basni`, po dodaniu 19 kart) | Legendary Creature — Human Bard `{1}{G}{W}` 2/3 | *Whenever Gylwain or another nontoken creature you control enters, choose one — Royal Role / Sorcerer Role / Monster Role token attached to that creature.* (SBA: max 1 Role per kontroler na jednym stworze, CR 303.7). |
| 660 | `660MID` | **Lambholt Harrier** (`lambholt-harrier`) | `MID` #145 | Innistrad | Creature — Wolf `{1}{R}` 2/2 | *`{3}{R}`: Target creature can't block this turn.* (Ruling: przed deklaracją blokerów). |
| 661 | `661KTK` | **Arrow Storm** (`arrow-storm`) | `KTK` #98 | Tarkir | Sorcery `{3}{R}{R}` | *4 damage to any target. Raid — If you attacked this turn, instead 5 damage and the damage can't be prevented.* (Ruling: pamięta atak nawet gdy atakujący zginął). |
| 662 | `662MBS` | **Loxodon Partisan** (`loxodon-partisan`) | `MBS` #12 | Mirrodin | Creature — Elephant Soldier `{4}{W}` 3/4 | *Battle cry* (*Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.*) |
| 663 | `663KTK` | **Temur Banner** (`temur-banner`) | `KTK` #226 | Tarkir | Artifact `{3}` | *`{T}`: Add `{G}`, `{U}`, or `{R}`. `{G}{U}{R}, {T}`, Sacrifice this artifact: Draw a card.* |
| 664 | `664M20` | **Frilled Sea Serpent** (`frilled-sea-serpent`) | `M20` #61 | Forgotten Realms | Creature — Serpent `{4}{U}{U}` 4/6 | *`{5}{U}{U}`: This creature can't be blocked this turn.* (Ruling: po blokach nie cofa bloku). |
| 665 | `665PIP` | **Mirelurk Queen** (`mirelurk-queen`) | `PIP` #33 | Teenage Mutant Ninja Turtles (`worek-dziki`) | Creature — Crab Mutant `{4}{U}` 4/4 | *Vigilance. ETB: target player gets 2 rad counters. Whenever one or more nonland cards are milled, draw a card, then put a +1/+1 counter on this creature. Only once each turn.* |

Uwaga do planów i generatora talii: `Eldraine` ma obecnie 18 kart w `worek-basni` (bez własnego wpisu w `SINGLE_PLAN_DECKS` lub z automatycznym awansem `SINGLE_PLAN_MIN = 15` w `tools/generate-plan-decks.mjs` — podczas Etapu 3 należy zweryfikować `git diff decks/` zgodnie z Krok 5 `HOW_TO_ADD_CARD.md`).

---

## 2. Inwentarz mechanik (istniejące vs nowe generyczne w silniku)

| Karta | Mechanika / deskryptor | Status w silniku | Praca do wykonania (ADR 0002 + L84) |
|---|---|---|---|
| 656 **Grollub** | Trigger `dealt_damage` (`cacophodon`) + dynamiczne `amountFrom: 'damageAmount'` (`amount` z `damage_dealt`) | Częściowo jest | Dodać obsługę `gain_life` z `scope: 'each_opponent'` i `amountFrom: 'damageAmount'` (albo `each_opponent_gain_life`), + L84 (etykieta PL, event log, wycena negatywna). |
| 657 **Saltfield Recluse** | `{T}: Target creature gets -2/-0 until end of turn` (`pump_negative` / `pump` w aktywowanej) | Istnieje | Zweryfikować `activate_ability` dla `pump` ujemnego na cel i ostrzyć w PMSSB-91 (timing: walka przeciwnika / własny atak, wybór celu, nie marnować w pusty stół lub w main2). |
| 658 **Memorial to Genius** | `entersTapped: true` + `{T}: Add {U}` + `{4}{U}, {T}, sacrificeSelf: Draw 2` | Istnieje | Zweryfikować `mana-sources.js` i `abilities.js` (`sacrificeSelf` na landzie z produkcją many); w PMSSB-91 sprawdzić moment poświęcenia landa (koniec tury przeciwnika vs własne okno, wpływ liczby lądów, ręki i biblioteki). |
| 659 **Gylwain, Casting Director** | Trigger `enters` (`includeSelf: true`, filtr `nontoken` pod kontrolą) z wyborem modalnym + **Role tokens** (Royal/Sorcerer/Monster) + SBA **max 1 Role per kontroler na obiekcie (CR 303.7)** | **NOWA** | Generyczne: (1) podtyp `Role` + SBA CR 303.7 w `destruction.js`/`attachments.js` (zastępuje starszą Rolę tego samego kontrolera na tym samym hoście, role różnych kontrolerów współistnieją); (2) modalny trigger wejścia tworzący wskazany token-aurę przypięty do wchodzącego stwora (`attachToTriggeringObject`); (3) 3 szablony Role (`Royal`: +1/+1 + `ward {1}`, `Sorcerer`: +1/+1 + `attacks` → `scry 1`, `Monster`: +1/+1 + `trample`); (4) L84 (eventy, etykiety PL, `gameObjectDataOf`/`installDeck`, wycena bota). |
| 660 **Lambholt Harrier** | `{3}{R}: Target creature can't block this turn` (`cant_block`) | Istnieje | Sprawdzić działanie przed blokami (ruling: po deklaracji blokerów nie cofa bloku) oraz stroić w PMSSB-91 (wybór najgroźniejszego blokera przeciwnika tylko przed walką i tylko gdy stwory mogą/chcą zaatakować). |
| 661 **Arrow Storm** | `4 dmg to any target`; **Raid** (`playerAttackedThisTurn` na graczu, pamięta śmierć atakującego) → `5 dmg` + **unpreventable** (`cantBePrevented`) | **NOWA** | Generyczne: (1) stan gracza `attackedThisTurn` ustawiany w `combat.declareAttackers` i zerowany w cleanup; (2) wariant/modyfikator `raid` w `effects.js` (`damage` 4→5 + `cantBePrevented: true`); (3) flaga `cantBePrevented` respektowana przez `prevent_next_damage`, `prevent_damage_this_turn`, `protection` / tarcze prewencji (CR 615.12); (4) L84 + wycena w `heuristic-bot.js`. |
| 662 **Loxodon Partisan** | `Battle cry` (`keywords: ['battle_cry']`, `trigger: { event: 'attacks' }`, `buff_attacking_creatures` z `excludeSource: true`) | Istnieje (`kuldotha-ringleader`) | Zweryfikować zgodność z `Kuldotha Ringleader`; w PMSSB-91 sprawdzić, czy bot docenia atak z innymi stworami (`declare_attackers` uwzględnia buff `+1/+0` dla współatakujących!). |
| 663 **Temur Banner** | `{T}: Add {G}/{U}/{R}` + `{G}{U}{R}, {T}, sacrificeSelf: Draw 1` | Istnieje | Zweryfikować `mana-sources.js` (trójkolorowy mana rock + `abilityCostColorsOf`); w PMSSB-91 sprawdzić poświęcanie na draw w kontekście zapasu many, ręki, tury (end step przeciwnika) i biblioteki. |
| 664 **Frilled Sea Serpent** | `{5}{U}{U}: This creature can't be blocked this turn` (self-target / `applyTo: 'self'`) | Częściowo jest | Zweryfikować ścieżkę `cant_be_blocked` bez `requiresTarget` w silniku (`abilities.js` + `effects.js`) i w `heuristic-bot.js` (dotąd `cant_be_blocked` zakładał `target` z `cmd.targetId`!). |
| 665 **Mirelurk Queen** | `Vigilance`; ETB `target player gets 2 rad counters`; **Rad counters** (CR 729: inherent trigger na początku `precombat main` aktywnego gracza — mill N, za każdą nonland utrata 1 życia i zdjęcie 1 rad countera); trigger `one or more nonland cards are milled` + `draw 1` + `+1/+1` (`oncePerTurn: true`) | **NOWA** | Generyczne: (1) `radCounters` na graczu (widok `PlayerView`, eventy, etykiety PL) + efekt `add_rad_counters` / `remove_rad_counters`; (2) inherent trigger na początku `main1` gracza z `radCounters > 0` (jednorazowy mill N, liczenie nonlandów → utrata życia i zdjęcie tylu rad counterów); (3) zdarzenie/grupowanie milla pozwalające odpalić trigger „whenever one or more nonland cards are milled” dokładnie RAZ na batch milla + `oncePerTurn: true` (CR 603.2 + ruling Mirelurk Queen); (4) L84 (4 miejsca). |

---

## 3. Etapy procedury wdrożenia (możliwe do realizacji w wielu sesjach)

Każdy etap kończy się samodzielnie zielonym commitem (`npm test` + `npm run build`), wypchnięciem na gałąź sesji oraz aktualizacją dokumentów postępu.

### Etap 0 + Etap 1 — Roadmapa, arkusz kolekcji i snapshoty Scryfall + rulingi *(aktualny etap startowy)*
- [x] Pobrać ze Scryfalla (`set=`) pełne dane wszystkich 10 kart (`656..665`) oraz ich rulingi WotC (ADR 0010 §2a, ADR 0030).
- [x] Zapisać 10 plików `docs/cards/scryfall-<slug>.json` (spójny `source`, `print`, `set`, `collector_number`, `image_uris`, `rulings`, `pobrano`).
- [x] Dopisać pozycje `656EXO..665PIP` do `tools/collection-art-ids.csv`.
- [x] Zapisać tę roadmapę w `docs/plans/PLAN_2026-11-16-batch74-kolekcja-656-665.md`.
- [x] Commit dokumentacyjno-danych + test `zgloszenie-a-druk-karty-z-arkusza.test.js` i `proweniencja-katalogu.test.js`.

### Etap 2 — Mechaniki generyczne w silniku (ADR 0002 + L84)
> **Stan (2026-11-16):** Etap 2 UKOŃCZONY — 2A (`5c8da5d`), 2B (`e112dca`), 2C (`afd1f1d`), 2D (ten commit).
> Każdy podetap ma własny plik testów (`test/etap2{a,b,c,d}-*.test.js`) i zieloną bramę `npm test` + `npm run build`.
> 2D dopiął także panel stołu `renderRadPanel` (`div#rad`, marker „Radiation” tpip/22 — ten sam wzorzec co Poison/Energy/Speed).
Każda nowa mechanika ma dedykowane testy jednostkowe/integracyjne RED → GREEN (na kartach syntetycznych przed dodaniem kart batcha, ADR 0029) oraz 4 dowiązania L84 (`EVENT_TYPES` + log, etykiety PL w `render.js`, ścieżka wyceny bota / `REVIEWED_UNVALUED`, `gameObjectDataOf` + `installDeck`).
- [x] **2A. Grollub + Frilled Sea Serpent (drobne uogólnienia):**
  - `gain_life` z `scope: 'each_opponent'` i `amountFrom: 'damageAmount'` (sprawdzić kolejność APNAP / kontekst `damageAmount`),
  - aktywowana zdolność `cant_be_blocked` na samym źródle (bez `requiresTarget`, `applyTo: 'self'`).
- [x] **2B. Arrow Storm (Raid + obrażenia nie do zapobiegnięcia):**
  - stan gracza `attackedThisTurn` (ustawiany przy deklaracji atakujących, zachowany nawet po śmierci atakującego w walce/usunięciu, czyszczony w cleanup),
  - warunek/modyfikator `raid` na efektach i `cantBePrevented: true` w ścieżce zadawania obrażeń i prewencji (tarcze, prevent-turn, protection).
- [x] **2C. Gylwain (Role tokens + SBA CR 303.7 + modalny trigger wejścia):**
  - podtyp `Role` i reguła SBA zastępująca starszą Rolę tego samego kontrolera na tym samym stworze (różni kontrolerzy mogą mieć po jednej),
  - generyczne tworzenie tokena-aury przyczepianego do obiektu z kontekstu triggera (`attachToTriggeringObject`) oraz wybór trybu na triggerze (`choose one`),
  - szablony 3 Ról (`Royal`, `Sorcerer`, `Monster`).
- [x] **2D. Mirelurk Queen (Rad counters + nonland milled once-per-turn):**
  - licznik gracza `radCounters`, `PlayerView`, zdarzenia + log PL,
  - inherent trigger na starcie `precombat main` (CR 729.1 / ruling 2024-03-08: jednorazowy mill N, zliczenie nonlandów, utrata życia + zdjęcie rad counterów; poprawna obsługa biblioteki `< N`),
  - batchowy trigger „whenever one or more nonland cards are milled” odpalany dokładnie raz na pojedynczą operację milla (także przy jednoczesnym millu z rad counterów, `mill_cards`, `surveil` itd.) z poszanowaniem `oncePerTurn: true`.

### Etap 3 — Definicje 10 kart, przydział talii i testy Batcha 74
> **Stan (2026-11-16): Etap 3 UKOŃCZONY.** Bramy: fast `10 509/0`, slow `282/0`
> (`node tools/run-tests.mjs fast|slow`), `npm run build` → 5970.7 kB.
- [x] Dodać definicje `656..665` w `src/cards/card-data.js` (`support: { status: 'supported', limitations: [] }`) oraz wpisy w `src/cards/mana-costs-data.js` — najlepiej pogrupowane tematycznie w czytelne commity (proste karty → Grollub/Arrow Storm → Gylwain → Mirelurk Queen).
  - Rejestr definicji: **726**; wszystkie 10 kart `supported`, bez `limitations`; 3 tokeny Ról (`Royal`/`Sorcerer`/`Monster`) w `REAL_CARDS`.
  - Poprawka danych: `Mirelurk Queen` `add_counter` wymagał `applyTo: 'self'` (bez tego cichy no-op) — złapane testem karty, nie wizualnie.
- [x] Uruchomić `node tools/generate-plan-decks.mjs` i sprawdzić `git diff decks/` (zweryfikować ewentualny auto-awans `Eldraine` / bilans `worek-basni`, `worek-legend`, `worek-dziki`, test `repo-decks.test.js`).
  - Generator przeliczył split po kolorach: `dominaria-wrg`→`dominaria-brg` (26 kart) + `dominaria-wu` (23), `warhammer-ubr`→`warhammer-ub` (23) + `warhammer-wrg` (23); imbalance kolorów 9→0. `Eldraine` awansowało do 19 kart w `worek-basni` (Gylwain).
  - Konsekwencja: dryf 3 testów scenariuszowych (golden-master 70/71, M101/D 162, F3 172) — wszystkie przelosowane wg konwencji **L25** z dowodem w komentarzach (seedy, liczby `sledzone/opisane`, hash-e).
- [x] Napisać `test/real-cards-batch74.test.js` (dla każdej karty: scenariusz legalny, nielegalny/walidacyjny, sanity danych z snapshotów + sprawdzenie rulingów krawędziowych).
  - **17/17 GREEN** — po jednym teście danych + po 1–2 scenariuszach na kartę; krawędzie z rulingów: Raid po śmierci atakującego (5 zamiast 4 + `damage_prevented`), Rad przy bibliotece `< N`, „one or more nonland milled” dokładnie raz na operację milla, `cant_be_blocked` na samym sobie (Frilled), `sacrificeSelf` landa (Memorial), `battle_cry` jako trigger na stosie (Loxodon).

### Etap 4 — Celowane pętle PMSSB-91 (manualne strojenie scoringu bota w roli pro-playera)

> Zasada nadrzędna: **nie** pytamy „czy bot wybiera legalną akcję bez crasha”, tylko **jak zagrałby doświadczony gracz MtG (pro-player)** w konkretnych sytuacjach fazy, stołu, ręki, stworów obu stron, życia, biblioteki i cmentarza.

#### Metodyka pętli PMSSB-91 (według `docs/PMSSB.md` i M429)
1. **Plan pętli** `docs/plans/PLAN_<data>-pmssb91-batch74.md` (lub sekcja szczegółowa po zaimplementowaniu kart).
2. **Sonda macierzowa PRZED** `tools/pmssb91-batch74-sonda.mjs`: dla każdej z 10 kart ≥4 scenariusze zmieniające **jeden wymiar** (realistyczna mana, ≥2 kandydatów na cel, różne fazy gry, różne stany życia/biblioteki/grobu/ręki), drukująca wybraną akcję, jej pełny `score` oraz `score` wszystkich sensownych alternatyw.
3. **Audyt pro-playera (macierz T × C × S)** i fala poprawek w `heuristic-params.js` + wspólnych helperach `heuristic-bot.js`:
   - obowiązkowa kontrola **(a) L41** (wszystkie ścieżki decyzji dla danej mechaniki liczą to samo),
   - obowiązkowa kontrola **(b) S11** (koszt many naprawdę różnicuje czary/zdolności),
   - obowiązkowa kontrola **(c) M429 anty-over-fix** (najsłabszy realny wariant = dawna wartość; nowe wymiary to dopłaty/kary; wyzerowanie pokrętła przywraca poprzedni punkt odniesienia).
4. **Piny RED → GREEN + dowód mutacyjny** w `test/audyt-pmssb91-batch74.test.js`.

#### Pytania pro-playera per karta i mechanika (planowana macierz PMSSB-91)

1. **Grollub (`{2}{B}` 3/3, *when dealt damage → opponents gain that much life*):**
   - **T/S (rzut i walka własna):** czy bot rzuca 3/3 za 3 gdy ma przewagę tempa albo potrzebuje blokera (życie niskie), a wstrzymuje lub nisko ceni wystawienie/atak, gdy przeciwnik ma tanie bloki (np. 1/3, 2/2) dające mu darmowe 2–3 życia w wyścigu? Czy `Grollub` nie atakuje w ścianę 0/4 lub 1/5 (daje rywalowi 1–5 życia za darmo, nic nie zabijając)?
   - **C/S (strona przeciwnika / obrona):** czy gdy to przeciwnik ma `Grolluba`, bot przy blokowaniu i celowaniu obrażeniami (np. *Arrow Storm*, *Shock*) uwzględnia, że 3–4 obrażenia w `Grolluba` wyleczą samego bota? A przy własnym `Grollubie` w obronie — czy blokuje tylko wtedy, gdy blok ratuje życie albo zabija groźnego atakującego, a nie bez sensu dając rywalowi heal?

2. **Saltfield Recluse (`{2}{W}` 1/2, `{T}: target creature gets -2/-0 EOT`):**
   - **T (okno):** czy bot NIGDY nie tapuje go bez sensu w `main1` lub `main2` swojej tury (gdy efekt -2/-0 wyparuje zanim przeciwnik zaatakuje!), tylko trzyma na okno ataku przeciwnika (`declare_attackers` / przed obrażeniami) albo na własny atak (żeby 1/2 Recluse lub własny 3/3 wygrał wymianę z blokerem 3/3)?
   - **C (cel):** czy wybiera atakującego o mocy ≥2 (albo takiego, któremu -2/-0 odbiera wygraną w walce / ratuje kluczowego blokera), a nie celuje w stworzenie z mocą 0 lub w własnego stwora?
   - **S (stół/życie):** przy niskim życiu i wielu atakujących wroga — czy tłumi największe nieblokowane obrażenia (lub zbija moc groźnego pierwszo-uderzeniowca)?

3. **Memorial to Genius (Land, enters tapped, `{4}{U}, {T}, Sac: Draw 2`):**
   - **T (okno):** czy bot NIE poświęca landa w swojej `main1`/`main2`, gdy nie potrzebuje rozpaczliwie odpowiedzi teraz (traci 1 źródło many na całą resztę tury), tylko odpala `{4}{U}` na **end stepie przeciwnika** (instant-speed mana sink z pełnym odkręceniem za chwilę)?
   - **S (ręka / mana / biblioteka):**
     - przy wczesnym manascrew (np. 5 lądów vs potrzeba 6. landa do ręki / drogiego czaru w ręce) — czy bot nie poświęca ląda pochopnie, jeśli spadnie poniżej potrzebnej many?
     - przy pustej ręce (topdeck war) i 6+ landach — czy chętnie zamienia nadmiarowy land w 2 karty?
     - przy **cienkiej bibliotece (`<= 5` lub `<= 2` kart)** — czy kategorycznie nie popełnia samobójstwa od deck-outu dobierając 2 karty?

4. **Gylwain, Casting Director (`{1}{G}{W}` 2/3, *ETB nontoken creature → Royal / Sorcerer / Monster Role*):**
   - **T (kolejność zagrań w ręce):** jeśli bot ma na ręce w `main1` **Gylwaina** oraz drugiego nietokenowego stwora (i wystarczającą manę), czy jako pro-player **najpierw wystawia Gylwaina**, żeby drugi stwór również dostał Rolę (zamiast odwrotnie)?
   - **C (wybór trybu Role zależnie od stwora i stanu gry):**
     - **Royal Role (+1/+1, `ward {1}`):** priorytet, gdy przeciwnik ma otwartą manę / gramy na cennego stwora zagrożonego removalem albo gdy potrzebujemy obrony przed pojedynczym spellem;
     - **Monster Role (+1/+1, `trample`):** priorytet dla dużego stwora (np. 4/4, 5/5) przy stole pełnym małych chump-blokerów przeciwnika albo przy wyścigu na lethal;
     - **Sorcerer Role (+1/+1, `attacks: scry 1`):** priorytet przy słabej ręce / poszukiwaniu lądów lub odpowiedzi (manascrew / flood) i bezpiecznym ataku (np. evasive / vigilance stwór);
     - oraz czy przy stworze mającym **już** `trample` nie dubluje bez sensu `Monster Role`, tylko bierze `Royal` lub `Sorcerer` (L41: zasada świeżości grantów jak `auraKeywordValue`)!
   - **S (SBA własnych Ról):** jeśli wejdzie sytuacja nadpisania istniejącej własnej Roli na tym samym stworze (np. inny efekt tworzący Rolę), czy uwzględnia utratę starej Roli?

5. **Lambholt Harrier (`{1}{R}` 2/2, `{3}{R}: Target creature can't block this turn`):**
   - **T (okno):** wyłącznie własne okno przed deklaracją blokerów (`main1` lub `beginning_of_combat`), nigdy w `main2` i nigdy w turze przeciwnika (bo po fakcie nic nie daje!).
   - **C (cel):** najgroźniejszy odkręcony legalny bloker przeciwnika (taki, który bez tego wyłączyłby nam atak albo zabił naszego najlepszego atakującego), nigdy tapnięty bloker, nigdy stwór z `cant_block` i nigdy własny stwór!
   - **S (stół/życie):** tylko gdy mamy atakujących gotowych zadać realne obrażenia lub domknąć lethal za 4 many — nie płaci `{3}{R}` przy pustym własnym stole albo gdy ma w ręce lepszy czar za 4 many rozwijający stół.

6. **Arrow Storm (`{3}{R}{R}` Sorcery: 4 dmg any target; *Raid → 5 dmg unpreventable*):**
   - **T (kolejność w turze — kluczowe dla Raid!):** czy bot w swojej turze mając atakującego **najpierw deklaruje atak (włącza Raid)**, a dopiero w `main2` rzuca *Arrow Storm*, żeby zamienić 4 obrażenia na **5 obrażeń nie do zapobiegnięcia** — zamiast palić go bez sensu w `main1` za 4? (Wyjątek pro-playera: w `main1` usuwamy blokera z 4 toughness lub mniej, bez którego atak by nie przeszedł albo stracilibyśmy kluczowego atakującego!).
   - **C (cel):** zabicie groźnego stwora z toughness 5 (osiągalne TYLKO po Raid!), nie strzelanie w stwora 5/5 przed atakiem (zmarnowane 4 dmg!), przechodzenie przez tarcze prewencji / `protection` przy Raid, lub dobijanie gracza na `<= 5` życia po ataku.
   - **S (koszt 5 many):** czy nie marnuje 5-manowego sorcery na token 1/1 lub cel o niskiej wartości, gdy przeciwnik ma pełne życie i pusto na stole.

7. **Loxodon Partisan (`{4}{W}` 3/4, *Battle cry*):**
   - **T/S (atak i rozwój stołu):** czy przy `declare_attackers` w obecności innych własnych stworów (np. dwa 1/1 tokeny albo 2/2) bot uwzględnia w kalkulacji wymiany +1/+0 dla współatakujących (np. 2/2 zyskuje 3/2 i przebija blokera 2/3, a łączny zegar ataku rośnie o liczbę pozostałych atakujących)? Czy przy wyborze permanentu do zagrania za 5 many woli Partisana przy szerokim stole własnym niż przy pustym?

8. **Temur Banner (`{3}`, `{T}: Add G/U/R`, `{G}{U}{R}, {T}, Sac: Draw 1`):**
   - **T (okno):** rzut jako rampa/fix we wczesnej grze (`main1` gdy brakuje koloru lub chcemy przyspieszyć drogi spell w ręce); poświęcenie na dobranie **wyłącznie na end stepie przeciwnika** (lub pod pilną odpowiedź w sytuacji kryzysu), nigdy zamiast użycia go jako many w swojej `main1` na zagrania z ręki!
   - **S (ręka / mana / biblioteka):**
     - jeśli mamy w ręce karty wymagające G/U/R lub kosztujące więcej niż sama liczba landów — trzymamy Banner jako manę;
     - przy floodzie many / pustej ręce (topdeck) — wymieniamy na kartę;
     - przy bibliotece `<= 1..4` kart — unikamy samobójstwa / przyspieszenia deck-outu.

9. **Frilled Sea Serpent (`{4}{U}{U}` 4/6, `{5}{U}{U}: This creature can't be blocked this turn`):**
   - **T (okno):** wyłącznie własna `main1` / `beginning_of_combat` przed blokami (ruling: po deklaracji blokerów nic nie robi!), gdy Serpent naprawdę może zaatakować.
   - **S (stół i koszt 7 many!):** kluczowa decyzja pro-playera: płacić **7 many** za nieblokowalność ma sens TYLKO wtedy, gdy przeciwnik ma odkręconego blokera mogącego zatrzymać/zabić 4/6 (albo chump-blockować w sytuacji, gdy 4 obrażenia dają **lethal** lub wyścig jest na ostrzu noża) — przy pustym stole przeciwnika lub samych tapniętych blokerach płacenie `{5}{U}{U}` jest czystą stratą (0 dodatkowych obrażeń)!

10. **Mirelurk Queen (`{4}{U}` 4/4 Vigilance, ETB target player +2 rad counters, trigger nonland milled → draw 1 + +1/+1 counter once/turn):**
    - **C (cel ETB rad counters):** zawsze przeciwnik (chyba że bardzo skrajny brak innych legalnych celi — a gracze są obaj legalni, więc NIGDY własna głowa przy zdrowych zmysłach!), bo rad counters to mill + utrata życia dla poszkodowanego! A w kontekście biblioteki wroga: dodatkowa premia, gdy przeciwnik ma cienką bibliotekę lub niskie życie.
    - **S (synergia stołu i biblioteki własnej):** mając `Mirelurk Queen` na stole, jak bot wycenia efekty millujące (własne surveil/self-mill czy mill wroga) w pierwszym oknie tury (`oncePerTurn`), wiedząc, że pierwszy nonland mill w turze daje **+1 kartę i +1/+1** (ale pamiętając o progu bezpieczeństwa własnej biblioteki!)? I czy nie dobiera sam siebie na pustą bibliotekę?

### Etap 5 — Ewaluacja całościowa, Żywy Tester, dokumentacja i bramy
- `tools/bot-scoring-snapshot.mjs` (przegląd lub świadoma aktualizacja różnic), `tools/bot-tie-audit.mjs --gry=2`, `tools/mirror-eval.mjs` (pokrętła nowe vs `×0`).
- **Żywy Tester** (`tools/table-tester/`): rozegranie partii taliami zawierającymi wszystkie 10 kart batcha 74 po zbudowaniu `dist/mtg-table.html` (weryfikacja braku `NIEWYCENIONE`, brak regresji detektorów, ręczny przegląd decyzji w logach).
- Dokumentacja: raport `§PMSSB-91` w `docs/PMSSB.md`, wpis w `docs/PROJECT_HISTORY.md`, kamień milowy w `docs/ENGINE_MILESTONES.md`, aktualizacja `docs/LESSONS.md` (z zachowaniem budżetu lektury <= 100 000 tokenów), aktualizacja opisu PR.
- Bramy końcowe: `npm run test:all`, `npm run build`, `node tools/cr-numery.mjs`, `node tools/bot-tie-audit.mjs --gry=2`.
