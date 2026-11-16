# Mapa plików PR #186 — 62/62 (audyt 2026-11-16)

**Zakres:** `gh pr diff 186` (commit scalający na `main`: `c9a2200`, scalony `2026-11-16T14:39:13Z`; gałąź źródłowa `arena/4fa65e47-mtg`).
**Liczność:** 62 pliki, +9574/−412 (API `pulls/186/files`: 62 pliki == 62 nagłówki `^diff --git ` w `gh pr diff 186` — zgodność 1:1, 0 brakujących, 0 nadmiarowych).
**Kotwica:** dosłowny nagłówek `diff --git a/<plik> b/<plik>` — do odtworzenia przez `gh pr diff 186`.
**Oceny:** OK = bez zastrzeżeń · UWAGA = zastrzeżenie nieblokujące / odnotowany dług z PR #186 · **F-186/n** = nowe znalezisko audytu (`docs/audits/AUDYT_PR186_2026-11-16.md`).

## 1. Katalog i dane kart (3 pliki)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 22 | `a/src/cards/card-data.js b/src/cards/card-data.js` | +60/−2 | OK — naprawy danych Batch 73 z audytu PR #185: `setons-desire` (`must_block_enchanted` pod `condition: { minGraveyardCards: 7 }`), `spring-loaded-sawblades` (`tapped_creature` + `opponentControls: true`, tył `bladewheel-chariot` z 2 zdolnościami aktywowanymi: Tap 2 artefaktów + Crew 4), `necrosavant` (`onlyInStep: 'upkeep'`), `kessig-flamebreather` (`damage_each_opponent`), `ward: 2` na `leonin-lightbringer`, `lodestone-needle` (`craft` bez sztucznej pułapki) |
| 23 | `a/src/cards/materialize.js b/src/cards/materialize.js` | +11/−0 | OK — kopiowanie `ward` z definicji na obiekt (`ward: card.ward`) i dopięcie testu spójności dla Batcha 73 |
| 24 | `a/src/cards/registry.js b/src/cards/registry.js` | +23/−0 | OK — walidacja/obsługa nowych deskryptorów (`tapped_creature`, `opponentControls`, `must_block_enchanted`, `onlyInStep`) w rejestrze |

## 2. Silnik (9 plików)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 26 | `a/src/engine/abilities.js b/src/engine/abilities.js` | +100/−16 | OK — F-4 (`onlyInStep` w wspólnym `abilityConditionFailure`), F-6 (koszt `tapArtifacts` w ofercie i walidacji Bladewheel Chariot), F-90/1 (`sacrificeCreatureVariants` w aktywacji z grobu `fromGraveyard`), strażnik `craft` |
| 27 | `a/src/engine/combat.js b/src/engine/combat.js` | +112/−13 | **F-186/1 (KRYTYCZNY, CR 509.1c)** — implementacja wymogu `must_block_enchanted` (`mustBlockHostCounts`, `blockRequirementCountOf`, `fulfilledBlockRequirements`, `completeBlockingAssignment`, `combatDeclarationView`), ale `maximalRequiredBlocks` w `search` przypisuje każdego obowiązkowego blokera co najwyżej do JEDNEGO atakującego nawet przy `slots > 1` (`blockSlotsFor`, np. `cenns-tactician` z licznikiem `+1/+1`) |
| 28 | `a/src/engine/deck.js b/src/engine/deck.js` | +7/−0 | OK — propagacja `ward` przy materializacji talii (F-7) |
| 29 | `a/src/engine/effects.js b/src/engine/effects.js` | +27/−18 | OK — usunięcie martwego zapisu flagi `mustBlockEnchanted` z F-1, poprawka `explorerOfExplore` dla triggerów explore na permanentach (F-19: `river-herald-guide`) |
| 30 | `a/src/engine/game-state.js b/src/engine/game-state.js` | +16/−7 | OK — `mustBlockHosts` przekazywane do `playerView` na atakujących i w auto-deklaracji `pass_priority` (ADR 0017) |
| 31 | `a/src/engine/permanents.js b/src/engine/permanents.js` | +46/−2 | OK — F-1 (`minGraveyardCards` w `staticConditionHolds` z `isCardObject`), F-2 (`condition.equipped` przez wspólny predykat przyłączonego Equipment) |
| 32 | `a/src/engine/spells.js b/src/engine/spells.js` | +17/−3 | OK — F-3: `opponentControls` / `controller` w `targetCandidatesBySpec` i `validateTargets` dla `tapped_creature` |
| 33 | `a/src/engine/triggers.js b/src/engine/triggers.js` | +19/−0 | OK — F-3: `tapped_creature` i `opponentControls` w `triggerTargetCandidates` (spójne z `spells.js`) |
| 25 | `a/src/controllers/heuristic-bot.js b/src/controllers/heuristic-bot.js` | +397/−47 | **F-186/2, F-186/3** + UWAGA (`F-90/12`, `F-90/5b`) — 9 napraw PMSSB-90 (`craftTransformValue`, `etbConditionalValue`, `mustBlockEnchantedValue`, `exploreActionValue`, `equipTriggerValue` + `equippedStaticPumpOf`, `opponentLifeEffectValue` dla `damage_each_opponent`, haste w `precombat_main`); otwarte błędy: `equippedStaticPumpOf` podwaja `+1/+1` na stworze już wyposażonym innym sprzętem (**F-186/2**), `mustBlockEnchantedValue` zwraca `0` przy `menace` (**F-186/3**), oraz jawny dług `F-90/12` (`pendingTwin` po `abilityIndex`) |

## 3. Stół / UI (4 pliki)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 34 | `a/src/table/choice-request.js b/src/table/choice-request.js` | +8/−1 | OK — formatowanie opcji wyboru celu/kosztu z `sacrificeCreatureId` (spójne z F-90/1) |
| 35 | `a/src/table/main.js b/src/table/main.js` | +50/−2 | OK — F-6: `tapArtifactsPlanFor` (kreator tapnięcia N innych artefaktów dla Bladewheel Chariot, wzorzec `crewPlanFor`) |
| 36 | `a/src/table/multi-target.js b/src/table/multi-target.js` | +53/−2 | OK — czysty planner `tapArtifactsWizardPlanFor` + dopasowanie do istniejącego kreatora wielokrotnego wyboru |
| 37 | `a/src/table/render.js b/src/table/render.js` | +141/−15 | OK — F-17 (etykieta Threshold z dynamicznym progiem z danych), F-21 (`STATIC_CONDITION_CLAUSES` 17/17 kluczy), usunięcie martwego `KEYWORD_LABELS.crew`, etykieta kosztu `tapArtifacts` |

## 4. Dokumentacja i snapshoty kart (21 plików)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 1 | `a/docs/ENGINE_MILESTONES.md b/docs/ENGINE_MILESTONES.md` | +306/−0 | OK — kamienie M464 (audyt PR #185 + naprawy Batch 73) i M465 (PMSSB-90) |
| 2 | `a/docs/LESSONS.md b/docs/LESSONS.md` | +76/−250 | UWAGA (budżet lektury) — lekcje L192–L194 oraz kondensacja 24 wpisów; po PR #186 budżet lektury wynosi 99 780 / 100 000 tokenów (zapas 220 tokenów — wymaga kondensacji przed kolejnym wpisem) |
| 3 | `a/docs/LESSONS_PRZYPADKI.md b/docs/LESSONS_PRZYPADKI.md` | +221/−0 | OK — przeniesione 1:1 przykłady z kondensowanych lekcji (ADR 0031) |
| 4 | `a/docs/PMSSB.md b/docs/PMSSB.md` | +84/−7 | OK — sprostowanie §PMSSB-89 (F-16/F-20) i dopisanie §PMSSB-90 z uczciwym wykazem 3 otwartych pozycji (`F-90/5b`, `F-90/6`, `F-90/12`) i decyzji właściciela (`F-90/10`) |
| 5 | `a/docs/PROJECT_HISTORY.md b/docs/PROJECT_HISTORY.md` | +72/−0 | OK — kronika wpisów audytu PR #185 i PMSSB-90 |
| 6 | `a/docs/audits/AUDYT_PR185_2026-11-15.md b/docs/audits/AUDYT_PR185_2026-11-15.md` | +938/−0 | OK — pełny raport audytu PR #185 (F-1..F-22, re-weryfikacja mutacji, E3 13 partii, E4 bramki) |
| 7 | `a/docs/audits/PR185_MAPA_PLIKOW_2026-11-15.md b/docs/audits/PR185_MAPA_PLIKOW_2026-11-15.md` | +132/−0 | OK — mapa 85/85 plików PR #185 |
| 8 | `a/docs/cards/scryfall-get-the-point.json b/docs/cards/scryfall-get-the-point.json` | +11/−0 | OK — F-18: rulingi WotC w snapshocie |
| 9 | `a/docs/cards/scryfall-kessig-flamebreather.json b/docs/cards/scryfall-kessig-flamebreather.json` | +5/−0 | OK — F-18: rulingi WotC w snapshocie |
| 10 | `a/docs/cards/scryfall-leonin-lightbringer.json b/docs/cards/scryfall-leonin-lightbringer.json` | +5/−0 | OK — F-18: rulingi WotC w snapshocie |
| 11 | `a/docs/cards/scryfall-messengers-speed.json b/docs/cards/scryfall-messengers-speed.json` | +5/−0 | OK — F-18: rulingi WotC w snapshocie |
| 12 | `a/docs/cards/scryfall-might-beyond-reason.json b/docs/cards/scryfall-might-beyond-reason.json` | +31/−0 | OK — F-18: rulingi WotC w snapshocie |
| 13 | `a/docs/cards/scryfall-necrosavant.json b/docs/cards/scryfall-necrosavant.json` | +11/−0 | OK — F-18: rulingi WotC w snapshocie |
| 14 | `a/docs/cards/scryfall-plummet.json b/docs/cards/scryfall-plummet.json` | +3/−0 | OK — F-18: rulingi WotC w snapshocie |
| 15 | `a/docs/cards/scryfall-river-herald-guide.json b/docs/cards/scryfall-river-herald-guide.json` | +36/−0 | OK — F-18: rulingi WotC w snapshocie |
| 16 | `a/docs/cards/scryfall-setons-desire.json b/docs/cards/scryfall-setons-desire.json` | +11/−0 | OK — F-18: rulingi WotC w snapshocie |
| 17 | `a/docs/cards/scryfall-spring-loaded-sawblades.json b/docs/cards/scryfall-spring-loaded-sawblades.json` | +26/−0 | OK — F-18: rulingi WotC w snapshocie |
| 18 | `a/docs/plans/PLAN_2026-11-15-audyt-pr185-batch73.md b/docs/plans/PLAN_2026-11-15-audyt-pr185-batch73.md` | +387/−0 | OK — plan sesji audytu PR #185 (domknięty) |
| 19 | `a/docs/plans/PLAN_2026-11-16-pmssb90-batch73-petla-reczna.md b/docs/plans/PLAN_2026-11-16-pmssb90-batch73-petla-reczna.md` | +551/−0 | OK — plan sesji PMSSB-90 (domknięty) |
| 20 | `a/docs/setup/HANDOFF_2026-11-15.md b/docs/setup/HANDOFF_2026-11-15.md` | +145/−0 | OK — handoff po audycie PR #185 |
| 21 | `a/docs/setup/HANDOFF_2026-11-16-pmssb90.md b/docs/setup/HANDOFF_2026-11-16-pmssb90.md` | +206/−0 | OK — handoff po PMSSB-90 z listą długu (§3) i decyzjami właściciela (§4–§5) |

## 5. Testy i strażniki (22 pliki)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 38 | `a/test/audyt-deskryptory-celow-katalog.test.js b/test/audyt-deskryptory-celow-katalog.test.js` | +182/−0 | OK — strażnik klasowy DESK-A..E (spójność typów i kluczy deskryptorów celu między katalogiem, ofertą, walidacją i triggerami) |
| 39 | `a/test/audyt-pmssb90-batch73.test.js b/test/audyt-pmssb90-batch73.test.js` | +713/−0 | OK — 46 pinów RED→GREEN + 3 kotwice dla PMSSB-90, oparte na wspólnej sondzie (L41) |
| 40 | `a/test/audyt-pr185-f17-etykieta-threshold-must-block.test.js b/test/audyt-pr185-f17-etykieta-threshold-must-block.test.js` | +71/−0 | OK — piny etykiety `must_block_enchanted` i progu Threshold |
| 41 | `a/test/audyt-pr185-f18-rulingi-batch73.test.js b/test/audyt-pr185-f18-rulingi-batch73.test.js` | +136/−0 | OK — strażnik proweniencji rulingów w snapshotach Batch 73 |
| 42 | `a/test/audyt-pr185-f20-sonda-pmssb89.test.js b/test/audyt-pr185-f20-sonda-pmssb89.test.js` | +78/−0 | OK — piny aktywnego `main` i etykiet Oracle w sondzie PMSSB-89 |
| 43 | `a/test/audyt-pr185-f21-warunki-statyczne-batch73.test.js b/test/audyt-pr185-f21-warunki-statyczne-batch73.test.js` | +193/−0 | OK — strażnik kompletności `STATIC_CONDITION_CLAUSES` (17/17) |
| 44 | `a/test/audyt-pr185-f22-martwe-nazwy-talii.test.js b/test/audyt-pr185-f22-martwe-nazwy-talii.test.js` | +94/−0 | OK — strażnik żywych nazw talii w `AUDIT_PAIRS` i `deckFiles` |
| 45 | `a/test/audyt-pr185-f6-kreator-tap-artefaktow.test.js b/test/audyt-pr185-f6-kreator-tap-artefaktow.test.js` | +213/−0 | OK — piny plannera i UI kreatora `tapArtifacts` (Bladewheel Chariot) |
| 46 | `a/test/audyt-pr185-f7-ward-sciezka-danych.test.js b/test/audyt-pr185-f7-ward-sciezka-danych.test.js` | +223/−0 | OK — piny pełnej ścieżki danych `ward` (definicja → deck → obiekt → stos → płatność) |
| 47 | `a/test/audyt-pr185-f8-wycena-reanimacji.test.js b/test/audyt-pr185-f8-wycena-reanimacji.test.js` | +188/−0 | OK — piny `graveyardBodyValue` i spójności skali z P/T z widoku grobu (ADR 0002/0017) |
| 48 | `a/test/batch60-bot-wycena.test.js b/test/batch60-bot-wycena.test.js` | +23/−0 | OK — pin `Unbreakable Bond` (bliźniak `Xu-Ifit` na wspólnej skali `graveyardBodyValue`) |
| 49 | `a/test/bot-benchmark.test.js b/test/bot-benchmark.test.js` | +33/−1 | OK — rekalibracja progu vs aggro `0.63 → 0.69` z pomiarem (97.0% vs random, 84.2% vs aggro) i śladem golden-mastera |
| 50 | `a/test/helpers/cr-numery-tabela.js b/test/helpers/cr-numery-tabela.js` | +7/−2 | OK — dopisane numery CR 2026-11-06 cytowane przez nowe piny (117.1, 301.5a, 602.1b, 702.57a, 702.167a) |
| 51 | `a/test/library-manipulation-modal.test.js b/test/library-manipulation-modal.test.js` | +46/−0 | OK — przywrócenie integracyjnego przebiegu `E4 (modal)` na seedach 1/7/13 |
| 52 | `a/test/m348-przerwanie-kreatora-many.test.js b/test/m348-przerwanie-kreatora-many.test.js` | +6/−2 | OK — dopisany stub `tapArtifactsPlanFor` w harnessie przerwania kreatora |
| 53 | `a/test/oracle-restrykcje-aktywacji-straznik.test.js b/test/oracle-restrykcje-aktywacji-straznik.test.js` | +117/−0 | OK — strażnik STRZ-1..6 fraz restrykcji aktywacji w `oracleText` |
| 54 | `a/test/pmssb10-ogon-wave-b2.test.js b/test/pmssb10-ogon-wave-b2.test.js` | +18/−2 | OK — re-pin `fear-of-burning-alive` po naprawie F-90/9 (`70.20 → 81.00`, lethal `138.60`) |
| 55 | `a/test/real-cards-batch25.test.js b/test/real-cards-batch25.test.js` | +5/−2 | OK — naprawa F-22 (`dominaria-wrg`, głośny `assert.ok(fs.existsSync(path))`) |
| 56 | `a/test/real-cards-batch26.test.js b/test/real-cards-batch26.test.js` | +5/−2 | OK — naprawa F-22 (`dominaria-wrg`, głośny `assert.ok(fs.existsSync(path))`) |
| 57 | `a/test/real-cards-batch73.test.js b/test/real-cards-batch73.test.js` | +1312/−0 | OK — pełne pokrycie 11 wpisów Batch 73 (snapshoty Oracle + mechanika + regresja) |
| 58 | `a/test/uwagi-tura9-bot-rowne-ciala-equip.test.js b/test/uwagi-tura9-bot-rowne-ciala-equip.test.js` | +10/−1 | OK — świadomy re-pin `equipValuation` po F-90/8 z zachowaniem jednego mnożnika `wagaSily` |
| 59 | `a/test/uwagi-z-testow-d-malamet-i-e-reach.test.js b/test/uwagi-z-testow-d-malamet-i-e-reach.test.js` | +49/−3 | OK — F-13: harness potwierdzający pauzy bota (`botPausePending`) i pin na seed 9 |

## 6. Narzędzia (3 pliki)

| # | Kotwica `diff --git` | ± | Ocena |
|---|---|---|---|
| 60 | `a/tools/bot-tie-audit.mjs b/tools/bot-tie-audit.mjs` | +10/−1 | OK — naprawa F-22 (`dominaria-wu → dominaria-ub` w `AUDIT_PAIRS`) |
| 61 | `a/tools/pmssb89-batch73-scoring-sonda.mjs b/tools/pmssb89-batch73-scoring-sonda.mjs` | +29/−11 | OK — naprawa martwego `main` (F-20) i etykiet Oracle (F-16) |
| 62 | `a/tools/pmssb90-batch73-petla-sonda.mjs b/tools/pmssb90-batch73-petla-sonda.mjs` | +1464/−0 | OK — sonda macierzowa PMSSB-90 (53 scenariusze, 189 rekordów, 26 mutacji) |

**Podsumowanie:** 62/62 plików przejrzane. Wykryto **3 nowe znaleziska** w kodzie wprowadzonym/zmodyfikowanym w PR #186 (**F-186/1** krytyczny w silniku walki, **F-186/2** wysoki w wycenie equipu bota, **F-186/3** średni w wycenie `must_block_enchanted` przy `menace`) oraz potwierdzono listę długu przeniesionego z PMSSB-90 (`F-90/12`, `F-90/5b`/`6`, budżet lektury `LESSONS.md`). Szczegóły i pomiary: `docs/audits/AUDYT_PR186_2026-11-16.md`.
