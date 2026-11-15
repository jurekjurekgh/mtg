# Mapa plików PR #184 (`0d0a12b`, 54/54 pliki)

Źródło prawdy: `gh api repos/jurekjurekgh/mtg/pulls/184/files --paginate` == `grep -c '^diff --git ' .arena/pr184.diff` (**54** pliki, **+7081/−404**, 39 commitów na gałęzi `arena/76d4141f-mtg`, base `9b9591c`, head `fcc9e87`, squash-merge `0d0a12b`).

| # | Plik | Status | +/− | Werdykt | Uwagi |
|---|---|---|---|---|---|
| 1 | `README.md` | modified | +64/−266 | OK | Oczyszczona wizytówka repozytorium (bez dziennika sesji), liczby katalogu 639/54/9 zgodne z `card-data.js`. |
| 2 | `docs/PROJECT_HISTORY.md` | modified | +341/−0 | UWAGA (F-5) | Wpisy sesji do zgłoszenia V obecne, ale pominięto 3 końcowe commity PR #184 (`9dfdbd7`, `0b25071`, `fcc9e87`) oraz zgłoszenia W/X/Y/Z. |
| 3 | `docs/audits/AUDYT_PR183_2026-11-08.md` | added | +198/−0 | OK | Pełny raport audytu PR #183 (znaleziska F-1 i F-2 zamknięte w tym samym PR). |
| 4 | `docs/audits/PR183_MAPA_PLIKOW_2026-11-08.md` | added | +21/−0 | OK | Mapa 11/11 plików PR #183 zgodna z REST `pulls/183/files`. |
| 5 | `docs/audits/ZGLOSZENIE_FJ_FIERY_JUSTICE_NETTO_2026-11-09.md` | added | +173/−0 | UWAGA (F-5) | Opisuje pierwszą falę FJ (`6c215e4`), bez dopisku o późniejszym `fcc9e87` (`FJ/7b`), który wprowadził F-1. |
| 6 | `docs/audits/ZGLOSZENIE_INSPIRATION_INSTANT_DRAW_2026-11-08.md` | added | +161/−0 | OK | Cytaty CR 117.1a / 513.1 zweryfikowane przeciw CR 2026-11-06. |
| 7 | `docs/audits/ZGLOSZENIE_KV_KISHLA_KREATOR_MANY_2026-11-09.md` | added | +158/−0 | OK | Cytaty CR 601.2g / 602.1a / 605.1a dosłowne, zgodne z CR 2026-11-06. |
| 8 | `docs/audits/ZGLOSZENIE_P_TWIDDLE_COMBAT_TRICK_2026-11-08.md` | added | +162/−0 | OK | Cytaty CR 509.1a / 506.4b / 510.1d / 302.6 i mutacje mP1–mP7 rzetelne. |
| 9 | `docs/audits/ZGLOSZENIE_RT_RENEGADE_TACTICS_CANTRIP_2026-11-09.md` | added | +182/−0 | OK | Cytaty CR 509.1b / 307.1 + ruling WotC 2020-11-10 poprawne. |
| 10 | `docs/handoffs/HANDOFF_2026-11-09-v-up-to.md` | added | +60/−0 | OK | Dokumentuje odrzucone ślepe zaułki zgłoszenia V (znaczniki w `execute`, widełki z deskryptora). |
| 11 | `docs/handoffs/HANDOFF_2026-11-11-wx-gate-flight.md` | added | +57/−0 | OK | Dokumentuje wiążącą decyzję właściciela o nienaprawianiu stałej `counterInstantHoldPenalty` (120) dla ciał ≥19/19. |
| 12 | `docs/plans/PLAN_2026-11-08c-audyt-pr183.md` | added | +122/−0 | OK | Zamknięty plan audytu PR #183. |
| 13 | `docs/plans/PLAN_2026-11-08d-twiddle-bot.md` | added | +96/−0 | OK | Zamknięty plan zgłoszenia P (Twiddle). |
| 14 | `docs/plans/PLAN_2026-11-08e-inspiration-bot.md` | added | +140/−0 | OK | Zamknięty plan zgłoszenia Inspiration. |
| 15 | `docs/plans/PLAN_2026-11-09-fiery-justice-netto.md` | added | +222/−0 | OK | Plan pierwszej fali Fiery Justice. |
| 16 | `docs/plans/PLAN_2026-11-09-kishla-kreator-many.md` | added | +191/−0 | OK | Zamknięty plan zgłoszenia KV (Kishla Village). |
| 17 | `docs/plans/PLAN_2026-11-09-readme-wizytowka.md` | added | +68/−0 | OK | Zamknięty plan czyszczenia `README.md`. |
| 18 | `docs/plans/PLAN_2026-11-09-renegade-tactics-cantrip.md` | added | +226/−0 | OK | Zamknięty plan zgłoszenia RT (Renegade Tactics). |
| 19 | `docs/plans/PLAN_2026-11-09-v-up-to-regresja.md` | added | +82/−0 | OK | Plan zgłoszenia V (korekta po pomiarze w `HANDOFF_2026-11-09-v-up-to.md`). |
| 20 | `docs/plans/PLAN_2026-11-11-wx-gate-flight.md` | added | +145/−0 | OK | Plan zgłoszeń W i X. |
| 21 | `docs/plans/PLAN_2026-11-11-yz-witches-nightsnare.md` | added | +152/−0 | OK | Plan zgłoszeń Y i Z (w tym decyzja właściciela o Z). |
| 22 | `docs/setup/DZWIEKI_KART.md` | added | +53/−0 | OK | Wydzielona dokumentacja opcjonalnych plików `snd/<artId>.mp3`. |
| 23 | `docs/setup/HANDOFF_2026-11-08.md` | modified | +195/−0 | UWAGA (F-5) | Zatrzymany na `10257` / `78 modułów` przed 3 końcowymi commitami PR #184 (`10269` / `79 modułów`). |
| 24 | `src/controllers/heuristic-bot.js` | modified | +494/−82 | DEFEKT (F-1, F-4) | P/ID/RT/W/X/Y(a)/#183-F1 poprawne i generyczne; błędy w `dividedDamageValue` (`fcc9e87`, F-1) oraz `springbloomDrainVeto` + `resolve_springbloom` (`0b25071`, F-4). |
| 25 | `src/controllers/heuristic-params.js` | modified | +15/−0 | OK | Dwa nowe pokrętła (`instantDrawHoldPenalty: 120`, `cantBlockCantripHoldPenalty: 120`) spójne z normalizacją. |
| 26 | `src/engine/abilities.js` | modified | +8/−0 | OK | `opponent_target_required` niesie jawny `activatingTargetId` (CR 601.2c). |
| 27 | `src/engine/effect-intent.js` | modified | +17/−4 | OK | `triggerTargetPowerPumpOf` przyjmuje opcjonalny resolver kwoty (#183/F-2, L41). |
| 28 | `src/engine/effects.js` | modified | +25/−20 | OK | Wspólny `resolvePumpDelta` z dolnym zerem dla `source_power` (CR 107.1b, Gruul Beastmaster ruling). |
| 29 | `src/engine/game-state.js` | modified | +33/−4 | OK | `resolvePumpDelta` spięty z `triggerPumpField` i wykonaniem `pump` (L41). |
| 30 | `src/engine/resources.js` | modified | +71/−0 | DEFEKT (F-2) | `koloryNastepnegoCzaru` nie odejmuje bieżącego wydatku `amount`, nie sprawdza rzucalności kolorowej przed `break;` i filtruje po `cardId` zamiast `objectId`. |
| 31 | `src/table/choice-request.js` | modified | +15/−1 | OK | Kreator wielocelowy buduje komendę z szablonu w granicach `maxTargets` i przekazuje `chipPenalty` nie dotyczy (czysta warstwa UI). |
| 32 | `src/table/mana-wizard.js` | modified | +89/−4 | OK | Kanoniczna, niezależna od kolejności `alternativeTapCostSignature` po deskryptorach (CR 601.2g / 602.1a / 605.1a, ADR 0002/0005). |
| 33 | `src/table/multi-target.js` | modified | +9/−0 | OK | Komentarz wyjaśniający rozpiętość ziaren `proliferatePlanOf` (CR 701.34). |
| 34 | `src/table/session.js` | modified | +10/−2 | DEFEKT (F-3) | `opponent_target_required` łamie własny fallback bez `activatingTargetId`, gubi `isPlayer` w czystym `describeGameEvent` i wypisuje mianownik „wskazuje Ty”. |
| 35 | `src/table/target-set-commands.js` | added | +52/−0 | OK | Generyczny `builtTargetSetCommand` bez sztucznych flag na kontrakcie `execute`. |
| 36 | `test/audyt-pmssb58-zasoby.test.js` | modified | +10/−1 | OK | Zasadna wymiana nośnika z Inspiration na syntetyk `surveil+draw` (L181), exact piny zachowane. |
| 37 | `test/audyt-pr146-predykat-pipow-jeden.test.js` | modified | +5/−0 | OK | Dokumentuje niezmienioną kotwicę 20 wywołań `unitCoversAnyRequirement`. |
| 38 | `test/audyt-pr177-a47-readme-decks.test.js` | modified | +18/−3 | OK | Przepięcie strażnika odsyłaczy #177 z `README.md` na `docs/PROJECT_HISTORY.md` bez osłabienia warunku (L56). |
| 39 | `test/audyt-pr183-f1-ujemne-source-power.test.js` | added | +140/−0 | OK | Mutacja `m-F1-effects-clamp` → RED (`fail 3`). |
| 40 | `test/audyt-pr183-f2-pump-w-ofercie.test.js` | added | +157/−0 | OK | Mutacja `m-F2-effect-intent` → RED (`fail 5`). |
| 41 | `test/bot-scoring-snapshot.test.js` | modified | +24/−0 | OK | Uczciwy opis pomiarowy per partia przy regeneracji po `9dfdbd7`. |
| 42 | `test/fixtures/bot-scoring-snapshot.json` | modified | +19/−15 | OK | Spójny ze stanem HEAD `0d0a12b` (`95f3692a…`). |
| 43 | `test/helpers/cr-numery-tabela.js` | modified | +3/−2 | OK | Dopisany numer CR `513.1`, zweryfikowany z `cr-current.txt` (`sha256: d7cdcc11…`). |
| 44 | `test/readme-wizytowka.test.js` | added | +74/−0 | OK | Pilnuje liczności katalogu, linków względnych i braku dziennika w `README.md`. |
| 45 | `test/zgloszenie-fj-fiery-justice-netto.test.js` | added | +330/−0 | UWAGA (F-1) | Mutacja `m-FJ-potracRider` → RED (`fail 1`), ale brak świadka `zabijaCokolwiek` przy niskim życiu wroga (`foeLife <= amount`), gdzie `fcc9e87` daje fałszywe `+1000`. |
| 46 | `test/zgloszenie-inspiration-instant-draw-timing.test.js` | added | +264/−0 | OK | Mutacja `m-ID-instantDrawHold` → RED (`fail 7`). |
| 47 | `test/zgloszenie-kv-kishla-kreator-many.test.js` | added | +317/−0 | OK | Mutacja `m-KV-altTapSig` → RED (`fail 9`). |
| 48 | `test/zgloszenie-p-twiddle-combat-trick.test.js` | added | +252/−0 | OK | Mutacja `m-P-tapTiming` → RED (`fail 2`). |
| 49 | `test/zgloszenie-roiling-regrowth-drenaz.test.js` | added | +119/−0 | UWAGA (F-4) | Mutacja `m-Roil-springbloomDrainVeto` → RED (`fail 4`), brak świadków dla `cast: false` i `resolve_springbloom`. |
| 50 | `test/zgloszenie-rt-renegade-tactics-cantrip.test.js` | added | +387/−0 | OK | Mutacja `m-RT-cantBlockHold` → RED (`fail 13`). |
| 51 | `test/zgloszenie-tapowanie-many-nadmiar.test.js` | added | +131/−0 | UWAGA (F-2) | Mutacja `m-Mana-koloryNastepnegoCzaru` → RED (`fail 1`), brak świadków na odjęcie bieżącego `amount`, nieopłacalny kolor przed drugim czarem i drugą kopię karty w ręce. |
| 52 | `test/zgloszenie-v-up-to-two-regresja.test.js` | added | +347/−0 | OK | Mutacja `m-V-builtTargetSetCommand` → RED (`fail 7`). |
| 53 | `test/zgloszenie-wx-gate-flight-z-logu.test.js` | added | +194/−0 | OK | Mutacje `m-W-zamiarAtaku` i `m-X-closesGame` → obie RED (`fail 1`). |
| 54 | `test/zgloszenie-yz-witches-nightsnare.test.js` | added | +183/−0 | DEFEKT (F-3) | `m-Y1-chipPenalty` → RED (`fail 1`), ale `m-Y5-session-log` → **GREEN (`pass 6 / fail 0`)**: test `Y/5` nigdy nie wywołuje `describeGameEvent` ani `session.log` (L34). |
