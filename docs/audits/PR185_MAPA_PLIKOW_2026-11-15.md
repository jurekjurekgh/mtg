# Mapa plików PR #185 — 85/85 (audyt 2026-11-15)

**Zakres:** `git diff 0d0a12b 5df0e96` (base PR #185 → squash na `main`).
**Liczność:** 85 plików, +2187/−320 (zgłoszenie PR: 85 plików, +2187/−320 — zgodność 1:1).
**Kotwica:** dosłowny nagłówek `diff --git a/<plik> b/<plik>` — do odtworzenia przez
`git diff 0d0a12b 5df0e96 -- <plik>` albo `git diff 0d0a12b 5df0e96 | grep -n '^diff --git '`.
**Oceny:** OK = bez zastrzeżeń · UWAGA = zastrzeżenie nieblokujące · **F-n** = finding audytu
(`docs/audits/AUDYT_PR185_2026-11-15.md`).

## 1. Katalog i dane kart (2 pliki)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 34 | `a/src/cards/card-data.js b/src/cards/card-data.js` | +205/−0 | **F-1, F-2, F-3, F-4, F-5, F-6, F-7** — 11 wpisów Batch 73; dane kosztów/typów/P-T zgodne ze snapshotami Oracle (pomiar: `manaCost` 2/5/1/4/3/2/3/6/2 = Oracle), ale pięć deskryptorów nie ma desygnatu w silniku (`must_block_enchanted`, `condition.minGraveyardCards`, `condition.equipped`, `requiresTarget.qualifier`, `effect.damage.toEachOpponent`), tył TDFC bez zdolności, `ward: 2` nie dociera na obiekt; wszystkie wpisy `supported` z pustym `limitations` (ADR 0022) |
| 35 | `a/src/cards/mana-costs-data.js b/src/cards/mana-costs-data.js` | +11/−0 | OK — 11 kluczy kosztów; zgodne z Oracle (`spring-loaded-sawblades` `{1}{W}`, craft `{3}{W}` jako `mana: 4`, `necrosavant` `{3}{B}{B}` jako `mana: 5`) |

## 2. Silnik (3 pliki)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 37 | `a/src/engine/effects.js b/src/engine/effects.js` | +10/−0 | **F-1** — jedyna zmiana silnika dla Batch 73: gałąź `must_block_enchanted` zapisuje flagę `mustBlockEnchanted` na aurze; grep: zero konsumentów w `src/` (pomiar: po rozliczeniu progu flaga `null`, pusty blok przyjęty `ok=true`) |
| 38 | `a/src/engine/resources.js b/src/engine/resources.js` | +53/−22 | OK — naprawa F-2 z audytu PR #184 (`koloryNastepnegoCzaru`: budżet `reservedAmount`, `spellManaPurpose`, `planGrantManaColors(..., ignorePool)`, pomijanie egzemplarza po `objectId`/`instanceId`, `break` tylko dla czarów kolorowych); wszyscy wołający zaktualizowani (pomiar: 1 wołający w `src/`, sygnatura wstecznie zgodna dla stringa) |
| 36 | `a/src/controllers/heuristic-bot.js b/src/controllers/heuristic-bot.js` | +144/−42 | **F-8, F-9, F-10** — naprawy F-1/F-4 audytu PR #184 OK (`isLibraryDrainCastCommand`, `springbloomShouldDecline`, `dividedDamageValue` z `effectiveFoeLife`); blok PMSSB-89: zdublowany komentarz (8 linii dosłownie dwa razy), `reanimatedValue = 10 + (5 * 2) + 5` jako stała P/T Necrosavanta w gałęzi generycznej, bramka `step !== 'upkeep' → finish(-100)` maskująca brak reguły w silniku, komentarz opisujący zdolności aktywowane Leonin/Kessig, których nie ma w Oracle |

## 3. Stół / UI (2 pliki)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 39 | `a/src/table/render.js b/src/table/render.js` | +2/−0 | **F-6, F-17** — `KEYWORD_LABELS.crew` jest martwe (pomiar: 0 kart z keywordiem `crew`, 0 grantów w `effects.js`/`tokens.js`; pojazdy niosą crew jako `cost.crewPower`); opis `must_block_enchanted` bez polskich znaków („musza go blokowac") i z literałem progu „7+" zamiast odczytu z `condition.minGraveyardCards` |
| 40 | `a/src/table/session.js b/src/table/session.js` | +16/−5 | OK — naprawa F-3 audytu PR #184: `drugaOsoba` propagowana do `describeGameEventRaw`, helper `celWskazania` (biernik „Ciebie"/„siebie"), fallback `opponent_target_required` bez `activatingTargetId`; etykieta `reanimate_under_your_control` w `ABILITY_EFFECT_LABELS` (L84/M255-C1) |

## 4. Talie (13 plików) — migracja nazw planu Dominaria (L180)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 2 | `a/decks/dominaria-ub.txt b/decks/dominaria-ub.txt` | +28/−0 | **F-16** — nowa połówka planu Dominaria (35 kart: 23 nielandy + 12 basic) |
| 3 | `a/decks/dominaria-brg.txt b/decks/dominaria-wrg.txt` | +13/−14 | **F-16** — zmiana nazwy połówki + `1x Seton's Desire` (Batch 73); 35 kart |
| 4 | `a/decks/dominaria-wu.txt b/decks/dominaria-wu.txt` | +0/−26 | **F-16** — plik usunięty (karty rozdzielone między `-ub` i `-wrg`) |
| 5 | `a/decks/forgotten-realms-br.txt b/decks/forgotten-realms-br.txt` | +2/−1 | OK — przeliczenie landów po Batchu 73 (24 karty) |
| 6 | `a/decks/forgotten-realms-wug.txt b/decks/forgotten-realms-wug.txt` | +2/−2 | OK — `1x Spring-Loaded Sawblades` (23 karty) |
| 7 | `a/decks/innistrad-brg.txt b/decks/innistrad-brg.txt` | +2/−1 | OK — `1x Kessig Flamebreather` (33 karty) |
| 8 | `a/decks/innistrad-wu.txt b/decks/innistrad-wu.txt` | +1/−1 | OK — przeliczenie landów (33 karty) |
| 9 | `a/decks/ixalan.txt b/decks/ixalan.txt` | +3/−1 | OK — `1x Plummet`, `1x River Herald Guide` (32 karty) |
| 10 | `a/decks/mirrodin-wu.txt b/decks/mirrodin-wu.txt` | +1/−0 | OK — `1x Leonin Lightbringer` (33 karty) |
| 11 | `a/decks/ravnica-bg.txt b/decks/ravnica-bg.txt` | +3/−2 | OK — `1x Get the Point` (24 karty) |
| 12 | `a/decks/theros.txt b/decks/theros.txt` | +2/−1 | OK — `1x Messenger's Speed` (32 karty) |
| 13 | `a/decks/worek-dziki.txt b/decks/worek-dziki.txt` | +3/−2 | OK — `1x Might Beyond Reason` (24 karty) |
| 14 | `a/decks/worek-legend.txt b/decks/worek-legend.txt` | +4/−3 | OK — `1x Necrosavant` (35 kart) |

## 5. Snapshoty Oracle i dokumentacja (18 plików)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 19 | `a/docs/cards/scryfall-get-the-point.json b/docs/cards/scryfall-get-the-point.json` | +16/−0 | OK — `{3}{B}{R}` Instant, „Destroy target creature. Scry 1." |
| 20 | `a/docs/cards/scryfall-kessig-flamebreather.json b/docs/cards/scryfall-kessig-flamebreather.json` | +18/−0 | OK — źródło prawdy dla **F-5** (trigger, nie zdolność aktywowana) |
| 21 | `a/docs/cards/scryfall-leonin-lightbringer.json b/docs/cards/scryfall-leonin-lightbringer.json` | +18/−0 | OK — źródło prawdy dla **F-2**, **F-7**, **F-10** |
| 22 | `a/docs/cards/scryfall-messengers-speed.json b/docs/cards/scryfall-messengers-speed.json` | +16/−0 | OK — `{R}` Aura, trample + haste |
| 23 | `a/docs/cards/scryfall-might-beyond-reason.json b/docs/cards/scryfall-might-beyond-reason.json` | +16/−0 | OK — 2 liczniki, Delirium → 3 |
| 24 | `a/docs/cards/scryfall-necrosavant.json b/docs/cards/scryfall-necrosavant.json` | +18/−0 | OK — źródło prawdy dla **F-4**, **F-8** |
| 25 | `a/docs/cards/scryfall-plummet.json b/docs/cards/scryfall-plummet.json` | +16/−0 | OK — `{1}{G}`, „Destroy target creature with flying." |
| 26 | `a/docs/cards/scryfall-river-herald-guide.json b/docs/cards/scryfall-river-herald-guide.json` | +18/−0 | OK — Vigilance + ETB explore |
| 27 | `a/docs/cards/scryfall-setons-desire.json b/docs/cards/scryfall-setons-desire.json` | +18/−0 | OK — źródło prawdy dla **F-1** (Threshold 7+) |
| 28 | `a/docs/cards/scryfall-spring-loaded-sawblades.json b/docs/cards/scryfall-spring-loaded-sawblades.json` | +38/−0 | OK — obie twarze w jednym pliku (`layout: transform`); źródło prawdy dla **F-3**, **F-6** |
| 15 | `a/docs/PMSSB.md b/docs/PMSSB.md` | +41/−0 | **F-10, F-15** — wpis PMSSB-89 „DONE": tabela findingów opisuje zdolności aktywowane Leonin/Kessig nieistniejące w Oracle, bramki `10278/10280 (2 pre-existing ability-cost-pips)` i `5 863,4 kB` sprzeczne z pomiarem, „żadna talia ich nie zawiera" sprzeczne z pomiarem (wszystkie 10 kart jest w taliach), brak wzmianki o rotacji `BENCH_DECKS` i regeneracji golden-mastera |
| 16 | `a/docs/PROJECT_HISTORY.md b/docs/PROJECT_HISTORY.md` | +87/−0 | **F-15, F-16** — dwa wpisy: audyt PR #184 (F-1..F-5, bramy 10 280/10 280 i 10 549/10 549) oraz uzupełnienie śladu końcówki PR #184; BRAK wpisu o Batchu 73 (11 kart), o migracji talii Dominaria i o rotacji próbki benchmarku |
| 17 | `a/docs/audits/AUDYT_PR184_2026-11-11.md b/docs/audits/AUDYT_PR184_2026-11-11.md` | +149/−0 | OK — raport audytu PR #184 (F-1..F-5) z cytatami CR 2026-11-06 |
| 18 | `a/docs/audits/PR184_MAPA_PLIKOW_2026-11-11.md b/docs/audits/PR184_MAPA_PLIKOW_2026-11-11.md` | +60/−0 | OK — mapa 54/54 plików PR #184 |
| 29 | `a/docs/plans/PLAN_2026-11-11-audyt-pr184.md b/docs/plans/PLAN_2026-11-11-audyt-pr184.md` | +183/−0 | OK — plan sesji audytowej PR #184 |
| 30 | `a/docs/plans/PLAN_2026-11-11-batch73-kolekcja-645-655.md b/docs/plans/PLAN_2026-11-11-batch73-kolekcja-645-655.md` | +78/−0 | **F-11, F-15** — plan Batch 73: sam rozpoznaje `minGraveyardCards`, `equipped` i wymóg blokowania jako mechaniki NOWE (commit #2) i wymaga `test/real-cards-batch73.test.js` (commit #11) oraz wpisu w `docs/ENGINE_MILESTONES.md` (commit #13) — pomiar: ani jednego, ani drugiego nie ma; trzy pozycje „Kryteria ukończenia" niespełnione |
| 31 | `a/docs/plans/PLAN_2026-11-11-pmssb89-batch73-scoring-audit.md b/docs/plans/PLAN_2026-11-11-pmssb89-batch73-scoring-audit.md` | +53/−0 | **F-10** — plan PMSSB-89 ze statusem COMPLETED; luki scoringu wyprowadzone z opisów kart niezgodnych z Oracle (tap-zdolności Leonin/Kessig) |
| 32 | `a/docs/setup/HANDOFF_2026-11-11.md b/docs/setup/HANDOFF_2026-11-11.md` | +70/−0 | **F-15** — handoff domyka audyt PR #184 i pętlę E3; nie wspomina o stanie Batch 73 (brak testów kart, niespełnione kryteria planu) ani o rotacji próby benchmarku |
| 33 | `a/docs/setup/TESTER_STOLU.md b/docs/setup/TESTER_STOLU.md` | +2/−2 | OK — synchronizacja nazw talii po migracji |
| 1 | `a/README.md b/README.md` | +12/−12 | OK — liczby zweryfikowane pomiarem: 649 supported + 54 tokeny + 10 tyłów = 713 wpisów, 32 talie; tabela talii zgodna co do karty z `decks/*.txt` (dominaria-wrg 35, dominaria-ub 35, ixalan 32, theros 32, mirrodin-wu 33, ravnica-bg 24, forgotten-realms-br 24, innistrad-brg 33, worek-dziki 24, worek-legend 35) |

## 6. Testy (38 plików)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 45 | `a/test/audyt-pmssb89-batch73.test.js b/test/audyt-pmssb89-batch73.test.js` | +91/−0 | **F-11** — 12 pinów PMSSB-89; B1/B3 jałowe (assert „bot nie aktywuje zdolności, której karta nie ma"), C1/C2 trywialne (`castScore > 0 && < Infinity`); żaden pin nie dotyka thresholdu, `equipped`, kwalifikatora ETB, bramki upkeep ani Crew |
| 57 | `a/test/library-manipulation-modal.test.js b/test/library-manipulation-modal.test.js` | +19/−41 | **F-14** — test integracyjny (prawdziwa sesja, seedy 3/45, `playCollectingModals`, asercje FoW na modalach) zastąpiony syntetycznym wywołaniem `describeGameEvent` z ręcznie zbudowanym zdarzeniem; usunięto 10 linii dokumentacji łowienia seedów |
| 73 | `a/test/uwagi-z-testow-d-malamet-i-e-reach.test.js b/test/uwagi-z-testow-d-malamet-i-e-reach.test.js` | +1/−1 | **F-13** — D/2: seed 9→7; pomiar: przy seed 9 harness `sesja()` zostaje z `pendingMulligans=['p2']` i pustym widokiem człowieka, bo nie potwierdza pauz bota (`botPausePending`/`continueBotPlay`); produkt w tym samym scenariuszu dochodzi do `main1` po dwóch ack-ach |
| 53 | `a/test/fixtures/bot-scoring-snapshot.json b/test/fixtures/bot-scoring-snapshot.json` | +47/−54 | **F-16** — golden-master zregenerowany: `overallHash 95f3692a… → ada1d349…`, wszystkie 6 par zmienione (pary `dominaria-brg` → `dominaria-wrg`, decyzje 235→217, 256→309, `scoreSum` 2825,82→1584,98); brak udokumentowanego przeglądu PRZED/PO (L176) |
| 43 | `a/test/audyt-katalog-dane-vs-snapshoty.test.js b/test/audyt-katalog-dane-vs-snapshoty.test.js` | +14/−10 | OK — liczniki snapshotów (642→652 plików, 641→651 par, 62 bez snapshotu, 12 wielostronnych) + `bladewheel-chariot` do `BEZ_SNAPSHOTU`/`PARY_TDFC` |
| 47 | `a/test/audyt-typy-efektow-katalogu.test.js b/test/audyt-typy-efektow-katalogu.test.js` | +1/−1 | **F-1 (luka strażnika)** — kotwica `UZYTE.size` 192→193 rośnie, bo `must_block_enchanted` ma gałąź w `effects.js`; strażnik liczy TYP, nie skutek (L13) — martwy efekt przechodzi |
| 56 | `a/test/keywords-katalog-straznik.test.js b/test/keywords-katalog-straznik.test.js` | +2/−0 | UWAGA — `ward: { mechanika: 'abilities' }` dodane; strażnik nie pokrywa tego, że `ward` nie dociera na obiekt (**F-7**) |
| 69 | `a/test/repo-decks.test.js b/test/repo-decks.test.js` | +2/−1 | OK — pin sumy nielandów Innistrad 43→44 (Kessig Flamebreather) |
| 72 | `a/test/statusy-wpisow-katalogu.test.js b/test/statusy-wpisow-katalogu.test.js` | +3/−2 | UWAGA — licznik tyłów DFC 9→10; strażnik sprawdza tylko status, nie zgodność tyłu z Oracle (**F-6**) |
| 41 | `a/test/art-ids-tool.test.js b/test/art-ids-tool.test.js` | +4/−4 | OK — liczniki arkusza 645–655 (pomiar: `tools/collection-art-ids.csv` spójny z `artId` kart) |
| 42 | `a/test/audyt-bot-walka-remisy.test.js b/test/audyt-bot-walka-remisy.test.js` | +2/−2 | OK — pary po migracji nazw (`dominaria-wrg`, `dominaria-ub`) |
| 44 | `a/test/audyt-pmssb58-ewaluacja.test.js b/test/audyt-pmssb58-ewaluacja.test.js` | +1/−1 | OK — nazwa talii w teście błędu |
| 46 | `a/test/audyt-pr177-a47-readme-decks.test.js b/test/audyt-pr177-a47-readme-decks.test.js` | +1/−1 | OK — lista nazw talii README po migracji |
| 48 | `a/test/bot-hidden-draw-scan.test.js b/test/bot-hidden-draw-scan.test.js` | +1/−1 | OK — nazwa talii |
| 49 | `a/test/bot-opponent-model.test.js b/test/bot-opponent-model.test.js` | +1/−1 | OK — nazwa talii |
| 50 | `a/test/bot-spell-resolution-in-modal.test.js b/test/bot-spell-resolution-in-modal.test.js` | +1/−1 | OK — nazwa talii |
| 51 | `a/test/bug-hunt-2026-08-10.test.js b/test/bug-hunt-2026-08-10.test.js` | +4/−0 | OK — dopisanie talii do listy (bez zmiany asercji) |
| 52 | `a/test/druki-druga-strona-i-uuid-obrazu.test.js b/test/druki-druga-strona-i-uuid-obrazu.test.js` | +2/−0 | OK — `bladewheel-chariot` w spisach tyłów DFC |
| 54 | `a/test/human-draw-modal.test.js b/test/human-draw-modal.test.js` | +1/−1 | OK — nazwa talii |
| 55 | `a/test/human-plays-modal.test.js b/test/human-plays-modal.test.js` | +1/−1 | OK — nazwa talii |
| 58 | `a/test/m157-uwagi-wlasciciela.test.js b/test/m157-uwagi-wlasciciela.test.js` | +1/−1 | OK — nazwa talii |
| 59 | `a/test/m200-uwagi-wlasciciela.test.js b/test/m200-uwagi-wlasciciela.test.js` | +3/−3 | OK — nazwy talii |
| 60 | `a/test/m257ef-znalezione-petla.test.js b/test/m257ef-znalezione-petla.test.js` | +1/−1 | OK — nazwa talii |
| 61 | `a/test/m304-mulligan-bottom-klin.test.js b/test/m304-mulligan-bottom-klin.test.js` | +1/−1 | OK — nazwa talii |
| 62 | `a/test/modal-impulse-exile-cast.test.js b/test/modal-impulse-exile-cast.test.js` | +3/−3 | OK — nazwy talii |
| 63 | `a/test/mulligan.test.js b/test/mulligan.test.js` | +1/−1 | OK — nazwa talii |
| 64 | `a/test/panel-odmiana-drugiej-osoby.test.js b/test/panel-odmiana-drugiej-osoby.test.js` | +1/−1 | OK — nazwa talii |
| 65 | `a/test/panel-rozgrywka-tura-przeciwnika.test.js b/test/panel-rozgrywka-tura-przeciwnika.test.js` | +1/−1 | OK — nazwa talii |
| 66 | `a/test/real-cards-batch16.test.js b/test/real-cards-batch16.test.js` | +1/−1 | OK — nazwa talii |
| 67 | `a/test/real-cards-batch29.test.js b/test/real-cards-batch29.test.js` | +1/−1 | OK — nazwa talii (import modułu) |
| 68 | `a/test/real-cards-batch3.test.js b/test/real-cards-batch3.test.js` | +1/−1 | OK — nazwa talii (import modułu) |
| 70 | `a/test/session-autopass.test.js b/test/session-autopass.test.js` | +1/−1 | OK — nazwa talii |
| 71 | `a/test/spell-resolution-symmetry-modal.test.js b/test/spell-resolution-symmetry-modal.test.js` | +1/−1 | OK — nazwa talii |
| 74 | `a/test/zgloszenie-d-pipy-zdolnosci-podzial.test.js b/test/zgloszenie-d-pipy-zdolnosci-podzial.test.js` | +11/−11 | OK — D/2 i D/3 po migracji (`dominaria-wu`→`dominaria-ub`, `dominaria-brg`→`dominaria-wrg`) |
| 75 | `a/test/zgloszenie-fj-fiery-justice-netto.test.js b/test/zgloszenie-fj-fiery-justice-netto.test.js` | +49/−0 | OK — piny FJ/15–FJ/16 dla naprawy F-1 audytu PR #184 |
| 76 | `a/test/zgloszenie-roiling-regrowth-drenaz.test.js b/test/zgloszenie-roiling-regrowth-drenaz.test.js` | +74/−9 | OK — piny R/7–R/9 dla naprawy F-4 audytu PR #184 |
| 77 | `a/test/zgloszenie-tapowanie-many-nadmiar.test.js b/test/zgloszenie-tapowanie-many-nadmiar.test.js` | +94/−0 | OK — piny M/5–M/8 dla naprawy F-2 audytu PR #184 |
| 78 | `a/test/zgloszenie-yz-witches-nightsnare.test.js b/test/zgloszenie-yz-witches-nightsnare.test.js` | +104/−19 | OK — wzmocnienie Y/5 + piny Y/6–Y/7 dla naprawy F-3 audytu PR #184 |

## 7. Narzędzia (7 plików)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 82 | `a/tools/pmssb89-batch73-scoring-sonda.mjs b/tools/pmssb89-batch73-scoring-sonda.mjs` | +193/−0 | **F-10, F-11** — 10 sond PMSSB-89; etykiety `console.log` opisują karty niezgodnie z Oracle („Leonin Lightbringer ({W},{T} tap target)", „Kessig Flamebreather ({1}{R},{T} damage 2)", „Necrosavant (reanimate minGraveyardCards)", „Seton's Desire (aura +2/+2 ward {2})"); sondy B1/B3 mierzą tylko „bot nie aktywuje", więc nie mogą złapać regresji wyceny |
| 79 | `a/tools/bot-scoring-snapshot.mjs b/tools/bot-scoring-snapshot.mjs` | +1/−1 | OK — nazwa talii po migracji |
| 80 | `a/tools/bot-tie-audit.mjs b/tools/bot-tie-audit.mjs` | +1/−1 | OK — nazwa talii po migracji |
| 81 | `a/tools/collection-art-ids.csv b/tools/collection-art-ids.csv` | +11/−0 | OK — wiersze 645–655; pomiar: `artId` w `card-data.js` zgodne z arkuszem |
| 83 | `a/tools/table-tester/README.md b/tools/table-tester/README.md` | +1/−1 | OK — nazwa talii |
| 84 | `a/tools/table-tester/run-game.mjs b/tools/table-tester/run-game.mjs` | +1/−1 | OK — tally `dominaria-brg` → `dominaria-wrg` |
| 85 | `a/tools/test-manifest.json b/tools/test-manifest.json` | +1/−0 | UWAGA — `audyt-pmssb89-batch73.test.js` dodany do tieru `slow`; przy 12 pinach deterministycznej sondy (bez partii) naturalny jest tier `fast` — pomiar: plik nie uruchamia partii ani benchmarku |

**Podsumowanie:** 85/85 plików przejrzane. Findings: **F-1..F-17** (7 silnik/karty, 3 bot,
3 testy, 4 proces/dokumentacja). Szczegóły, pomiary i cytaty CR:
`docs/audits/AUDYT_PR185_2026-11-15.md`.
