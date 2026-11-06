# Mapa audytu scalonego PR #179

Źródło: pełna paginacja REST `pulls/179/files`: **223 pliki**, +10 872/−1 445; PR ma 126 commitów. Baza `04ca8e9`, wynik scalenia `7a18659` (= HEAD `main`). Diff pobrany przez `gh pr diff 179` (lokalnie, w tej sesji) i REST.

**Stan: przegląd zakończony, 0 otwartych wierszy.** Bilans: **43 produkcyjne/dane** (26 src + 7 tools + 2 konfiguracja/README + 8 talii) + **57 docs** + **123 testy**. Każdy wiersz ma jawny zakres i status; samo uruchomienie testu nie zamyka wiersza. To nie jest dowód wszystkich interakcji ani wszystkich konsumentów zmian produkcyjnych.


## Produkcja — src (26)

| Plik | +/− | Stan audytu |
|---|---|---|
| `src/cards/card-data.js` | +180/−0 | przejrzany; 10 kart batch 72 1:1 ze snapshotami Scryfall (`docs/cards/scryfall-*.json`); deskryptory generyczne (ADR 0002), bez wyjątków po nazwie |
| `src/cards/mana-costs-data.js` | +11/−0 | przejrzany; koszty spójne ze snapshotami i `card-data.js` (dokładnie jedna para `MANA_COSTS` per karta) |
| `src/controllers/heuristic-bot.js` | +544/−33 | przejrzany; wycena many celowej (Peeper `{U}` → Living History, +78.30 vs pass 0) i największego celu pompu generyczne; próg 8 landów Vortex Runner (−10/+6); golden-master zregenerowany świadomie (noty w `bot-scoring-snapshot.test.js`) |
| `src/controllers/heuristic-params.js` | +33/−0 | przejrzany; brak pokrętła po nazwie karty dla nowych ścieżek (pin w `audyt-pmssb72-batch72.test.js`) |
| `src/controllers/mana-offer-guards.js` | +20/−12 | przejrzany; purpose-aware `restrictedManaUnits`/`manaUnitsOfView`; granica celowa spójna z engine i pay solverem |
| `src/engine/abilities.js` | +42/−28 | przejrzany diff; bez nowego błędu |
| `src/engine/attachments.js` | +19/−1 | przejrzany diff; bestow (deskryptor, recast/odłączenie) bez uwag maszynowych |
| `src/engine/combat.js` | +197/−238 | przejrzany diff; ziarna + `combatDeclarationView` zamiast potęgi zbioru (zgłoszenia F→G); komentarze F dociągnięte do G (A-2, commit 40e0873); bramka blokerów bez zmian zachowania |
| `src/engine/destruction.js` | +2/−0 | przejrzany diff (2 linie); bez uwag |
| `src/engine/effects.js` | +3/−0 | przejrzany diff (3 linie); bez uwag |
| `src/engine/fingerprint.js` | +2/−1 | przejrzany diff; nowe pola pending (escape/delve/damage division/mulligan bottom) w odcisku; replay spójny |
| `src/engine/game-state.js` | +388/−209 | przejrzany diff; oferty ziarnowe + deskryptory pending (G etap 3); komentarze M241/Delve/M203 dociągnięte (A-2, commit 40e0873); brak dubli emiterów |
| `src/engine/mana-restrictions.js` | +64/−0 | przejrzany; model celu (enchantment/door/face-up) — klucz `purpose` spójny z pulą w `resources.js` i pay solverem |
| `src/engine/objects.js` | +19/−1 | przejrzany diff; LKI przy zdarzeniu; bestow reset bez uwag |
| `src/engine/permanents.js` | +6/−1 | przejrzany diff; bez nowego błędu |
| `src/engine/resources.js` | +164/−80 | przejrzany diff; pula celowa `purposeRestrictedPool` + księgowość; Converge spójny z ofertą |
| `src/engine/spells.js` | +105/−94 | przejrzany diff; Fireball ziarnowe rzuty (G etap 3); komentarze doc Fireball/Escape/Delve dociągnięte (A-2, commit 9615133); walidacje nie naruszone |
| `src/engine/state-based.js` | +10/−1 | przejrzany diff; LKI ofiar Sagi przy zdarzeniu; bez nowego błędu |
| `src/engine/triggers.js` | +216/−56 | przejrzany diff; **A-1 naprawione**: `attacks_you_control` raz na `attackers_declared` (CR 508.3d) — RED 160316b → GREEN ecec534; mutacje złapane (M1–M3, test kontra kontrolera); partia checkpointu ADR 0032 bez dubli w skanowanych ścieżkach |
| `src/table/choice-request.js` | +125/−51 | przejrzany diff; pula kandydatów bez limitu (wiersze wizarda), legalność przy execute; komentarz E6 dociągnięty (A-2, commit 40e0873) |
| `src/table/main.js` | +168/−69 | przejrzany diff; wiring hover/kreatorów i introCard; bez nowego błędu |
| `src/table/mana-wizard.js` | +3/−1 | przejrzany diff; hover props plumbing; bez nowego błędu |
| `src/table/multi-target.js` | +78/−0 | przejrzany diff; `commandForXSelection`/`commandForMulliganBottomSelection` — konstruuj + waliduj (G); koszt-wycena X konsekwentna z excessByLength |
| `src/table/picker.js` | +53/−15 | przejrzany diff; `renderPeekButton` hover; L6/L24 etykiety kompletne |
| `src/table/render.js` | +1/−0 | przejrzany diff; etykieta eventu opuszczającego grób; bez nowego błędu |
| `src/table/session.js` | +1/−0 | przejrzany diff; etykieta `attacks_you_control` → „twój atak” (korekta A-1, commit ecec534) |

## Produkcja — tools (7)

| Plik | +/− | Stan audytu |
|---|---|---|
| `tools/benchmark.mjs` | +1/−1 | przejrzany diff (+1/−1); bez uwag |
| `tools/bot-tie-audit.mjs` | +1/−1 | przejrzany diff (+1/−1); bez uwag |
| `tools/collection-art-ids.csv` | +10/−0 | przejrzany; +10 wierszy dla 10 kart batch 72; spójne z kolekcją właściciela (ADR 0029) |
| `tools/pmssb69-initiative-ab.mjs` | +1/−1 | przejrzany diff (+1/−1); bez uwag |
| `tools/pmssb72-batch72-sonda.mjs` | +136/−0 | przejrzany diff; probe Living History dostosowana do poprawki A-1 (decyzja celu otwiera się wprost, bez partii resolve_trigger_order); piny PMSSB-72 zachowane |
| `tools/pmssb88-batch72-scoring-sonda.mjs` | +235/−0 | przejrzany diff; linkedExileReturnValue, searchFindsLand (anyOf-aware), wycena powrotu powiązanego wygnania; piny PMSSB-88 |
| `tools/run-tests.mjs` | +31/−4 | przejrzany diff; tryb `audit` jawny, bez kwarantanny i bez force-RED; `--list`; manifest testowy nietknięty |

## Konfiguracja i README (2)

| Plik | +/− | Stan audytu |
|---|---|---|
| `README.md` | +8/−7 | przejrzany; tabela 32 talii i liczby spójne z plikami talii (sprawdzono mechanicznie w tej sesji) |
| `package.json` | +2/−1 | przejrzany diff; bez osłabień skryptów; pełne bramy: fast 10 065, test:all, build 78 modułów |

## Dane — talie (8)

| Plik | +/− | Stan audytu |
|---|---|---|
| `decks/forgotten-realms-br.txt` | +19/−0 | przejrzany; liczności spójne z README i raportem `PLAN_2026-11-06d-batch72-deck-report.md` |
| `decks/forgotten-realms-wug.txt` | +1/−17 | przejrzany; podział BR/WUG wg generatora (B6); spójne z raportem |
| `decks/ixalan.txt` | +2/−0 | przejrzany; bez nowego błędu |
| `decks/theros.txt` | +1/−0 | przejrzany; bez nowego błędu |
| `decks/wiedzmin-wur.txt` | +3/−1 | przejrzany; bez nowego błędu |
| `decks/worek-basni.txt` | +3/−1 | przejrzany; bez nowego błędu |
| `decks/worek-legend.txt` | +3/−1 | przejrzany; bez nowego błędu |
| `decks/worek-mroczny.txt` | +2/−1 | przejrzany; bez nowego błędu |

## Dokumentacja (57)

| Plik | +/− | Stan audytu |
|---|---|---|
| `docs/ENGINE_MILESTONES.md` | +38/−0 | przejrzany diff; spójność wewnętrzna i odesłań OK;  M463: adnotacja poprawki A-1 (508.3d) — historia zachowana, błąd skorygowany u źródła |
| `docs/LESSONS.md` | +10/−0 | przejrzany diff; spójność wewnętrzna i odesłań OK;  lekcje spisane z PR #179 (checkpoint/enumeracja); spójne z kodem |
| `docs/LESSONS_PRZYPADKI.md` | +15/−0 | przejrzany diff; spójność wewnętrzna i odesłań OK;  lekcje spisane z PR #179 (checkpoint/enumeracja); spójne z kodem |
| `docs/PMSSB.md` | +76/−0 | przejrzany diff; spójność wewnętrzna i odesłań OK;  PMSSB-87/88 DONE — liczby spójne z sondą i testami |
| `docs/PROJECT_HISTORY.md` | +210/−0 | przejrzany diff; spójność wewnętrzna i odesłań OK;  wpisy batch72 z własnymi pomiarami; nie przepisywano historii — korekta A-1 żyje w M463/mapie/historii audytu |
| `docs/audits/AUDYT_PR177_2026-11-01.md` | +3/−0 | przejrzany; historyczny raport #177 z bannerem stanu historycznego i odesłaniem do #179 |
| `docs/audits/AUDYT_PR178_2026-11-03.md` | +484/−0 | przejrzany; pełny raport audytu #178 — spójny z mapą #178 (0 otwartych wierszy) |
| `docs/audits/INWENTARZ_ZDARZEN_I_TRIGGEROW_2026-11-04.md` | +92/−0 | przejrzany; rejestr zdarzeń spójny ze skanem `INWENTARZ` i kodem (triggers.js) |
| `docs/audits/PR177_MAPA_PLIKOW_2026-11-02.md` | +3/−0 | przejrzany; historyczny raport #177 z bannerem stanu historycznego i odesłaniem do #179 |
| `docs/audits/PR178_MAPA_PLIKOW_2026-11-03.md` | +202/−0 | przejrzany; mapa #178 zamknięta (0 wierszy); bilans kategorii skorygowany |
| `docs/cards/scryfall-banishing-light.json` | +47/−0 | przejrzany; karta `banishing-light` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-creeping-peeper.json` | +32/−0 | przejrzany; karta `creeping-peeper` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-feral-ridgewolf.json` | +26/−0 | przejrzany; karta `feral-ridgewolf` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-kraken-hatchling.json` | +26/−0 | przejrzany; karta `kraken-hatchling` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-lichs-caress.json` | +32/−0 | przejrzany; karta `lichs-caress` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-living-history.json` | +26/−0 | przejrzany; karta `living-history` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-open-the-gates.json` | +26/−0 | przejrzany; karta `open-the-gates` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-pheres-band-centaurs.json` | +26/−0 | przejrzany; karta `pheres-band-centaurs` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-shining-aerosaur.json` | +26/−0 | przejrzany; karta `shining-aerosaur` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/cards/scryfall-vortex-runner.json` | +26/−0 | przejrzany; karta `vortex-runner` zweryfikowana 1:1 ze snapshotu (koszt/typ/P-T/Oracle/słowa/plan/artId) |
| `docs/decisions/0031-event-identity-and-trigger-batches.md` | +16/−0 | przejrzany; ADR 0031 zgodny z implementacją (checkpoint/partia APNAP/LKI/Ward second pass w `triggers.js`) |
| `docs/decisions/0032-shared-trigger-checkpoint.md` | +16/−0 | przejrzany; ADR 0032 zgodny z implementacją (checkpoint/partia APNAP/LKI/Ward second pass w `triggers.js`) |
| `docs/decisions/README.md` | +8/−67 | przejrzany diff; kondensacja bez utraty odesłań; rejestr ADR 0031/0032 dodany; `docs-decisions.test.js` zielony |
| `docs/plans/PLAN_2026-11-01-audyt-pr177.md` | +3/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-03-audyt-pr178.md` | +64/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-03-bezpieczne-kroki-zdarzen.md` | +145/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-04-c-magma-lethal.md` | +47/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-04-przeglad-mapy-pr178.md` | +99/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-04-wspolny-checkpoint.md` | +56/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-05-d-combat-tricki.md` | +258/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-05-e-inferno-podzial.md` | +58/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-05-f-brak-ucinania-enumeracji.md` | +62/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-05-g-architektura-konstruuj-waliduj.md` | +225/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-05-modal-hover.md` | +149/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-06-batch72-kolekcja-635-644.md` | +74/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-06b-batch72-rule-inventory.md` | +49/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-06c-pmssb72.md` | +67/−0 | przejrzany; adnotacja poprawki A-1 (508.3d — raz na deklarację, commit 40e0873) zamiast przepisywania opisu |
| `docs/plans/PLAN_2026-11-06d-batch72-deck-report.md` | +42/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/plans/PLAN_2026-11-06e-pmssb88-batch72-scoring-audit.md` | +64/−0 | przejrzany; historyczny plan etapu — liczby i odesłania spójne z historią; bez bieżącego backlogu |
| `docs/setup/ENVIRONMENT.md` | +6/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-01-audyt-pr177.md` | +3/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-03-audyt-pr178.md` | +47/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-a100.md` | +42/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-a101.md` | +39/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-a102-a103.md` | +40/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-a104-a107.md` | +70/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-a108-a109.md` | +42/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-a84.md` | +40/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-a98.md` | +41/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-c-magma-lethal.md` | +22/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-przeglad-mapy.md` | +54/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-04-wspolny-checkpoint.md` | +22/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-05-modal-hover.md` | +30/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-05-zgloszenie-d.md` | +69/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-05-zgloszenie-e.md` | +31/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-05-zgloszenie-g.md` | +87/−0 | przejrzany; handoff etapu z pomiarami przy swoich commitach; bannery stanu historycznego obecne |
| `docs/setup/HANDOFF_2026-11-06-batch72.md` | +75/−0 | przejrzany; liczby (10 060 / build 78 / 5 757,7 kB) zgodne z pomiarami sesji; granice dowodu jawne |

## Testy (123)

| Plik | +/− | Stan audytu |
|---|---|---|
| `test/art-ids-tool.test.js` | +5/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audit-m119-zywy-tester.test.js` | +11/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audit-pr171-bug-t-detain-badges.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-grupowanie-triggerow-tag.test.js` | +4/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-katalog-dane-vs-snapshoty.test.js` | +16/−12 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-m431-untap-choice.test.js` | +11/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pmssb23-liczniki.test.js` | +18/−11 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pmssb32-mana.test.js` | +4/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pmssb33-remisy-wyboru.test.js` | +3/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pmssb36-nowe-karty.test.js` | +4/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pmssb72-batch72.test.js` | +46/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pmssb84-champion-okno.test.js` | +67/−9 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pmssb88-batch72.test.js` | +124/−0 | przejrzany punktowo; piny scoringu per karta (anyOf/nested/linkedExileReturnValue); osłona `unlock_door` jawnie nieistniejąca |
| `test/audyt-pr129-f1-fireball-x-w-logu.test.js` | +10/−6 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr129-kopia-zbioru-bloku.test.js` | +5/−5 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr140-block-requirements.test.js` | +20/−18 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr150-podzial-w-oknach-rzutu.test.js` | +5/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr173-skarb-podwojny-osiagalnosc.test.js` | +17/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a100-ward-triggers.test.js` | +1/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a101-reflexive-apnap.test.js` | +64/−7 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a102-draw-apnap.test.js` | +1/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a103-second-draw-apnap.test.js` | +1/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a104-flooding-apnap.test.js` | +2/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a105-nanoform-apnap.test.js` | +2/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a106-ward-target-apnap.test.js` | +1/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a107-two-ward-apnap.test.js` | +1/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a108-ward-sba.test.js` | +1/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a109-ward-aura-sba.test.js` | +10/−19 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a110-auto-mana-events.test.js` | +8/−13 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a111-imp-self-lki.test.js` | +11/−9 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a112-imp-selhoff-apnap.test.js` | +41/−19 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a113-mixed-combat-apnap.test.js` | +23/−11 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a28-kolejnosc-madness.test.js` | +5/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a37-anticipate-real.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a40-champion-bot.test.js` | +3/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a47-readme-decks.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a61-oak-token-real.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a69-converge-free-real.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a75-apnap-land.test.js` | +10/−5 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a77-apnap-activation.test.js` | +6/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a83-colored-manual.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a84-ward-apnap.test.js` | +2/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a86-wizard-auto-colors.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a87-wizard-cost-objects.test.js` | +4/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a94-optional-apnap.test.js` | +7/−7 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a95-ward-two-scions.test.js` | +0/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a96-counter-two-scions.test.js` | +1/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a97-echo-two-scions.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-a98-spellbomb-apnap.test.js` | +2/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr177-morbid-bestow.test.js` | +5/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr178-b1-bestow-recast.test.js` | +133/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr178-b2-bestow-detach-recast.test.js` | +139/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/audyt-pr179-zbiorowe-opuszczenie-regresje.test.js` | +252/−0 | przejrzany punktowo; regression 7 testów (Imp/zborowe odejścia/mieszani kontrolerzy) — behavioralne |
| `test/audyt-pr93-koszt-x-z-exile.test.js` | +12/−6 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/batch25-etb-enters-fix.test.js` | +2/−0 | przejrzany diff (+2/−0); whitelist `attacks_you_control` nietknięty — potwierdzony po naprawie A-1 |
| `test/batch39-kart.test.js` | +5/−5 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/batch40-kart.test.js` | +4/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/batch47-kart.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/batch70-mechaniki.test.js` | +11/−10 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/benchmark-equip-protection-offer.test.js` | +35/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/block-slots-trojka-oferta.test.js` | +7/−9 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/bot-owner-reports-2026-08-16.test.js` | +10/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/bot-scoring-snapshot.test.js` | +40/−0 | przejrzany diff; wyłącznie dopisane noty świadomego dryfu hashy (zgłoszenia F/G, ADR 0032); asercje nieosłabione |
| `test/bug-c1-fireball-koszt-widoczny.test.js` | +7/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/bug-hunt-2026-08-16-owner-c.test.js` | +3/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/checkpoint-etb-kolejnosc.test.js` | +107/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/checkpoint-madness-kolejnosc.test.js` | +95/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/checkpoint-modal-kolejnosc.test.js` | +56/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/checkpoint-sba-kontrole.test.js` | +112/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/e6-pula-blokerow-ponad-cap.test.js` | +26/−18 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/fiery-justice-autotap-minimal.test.js` | +67/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/fix-b-chump-blok-przezycie.test.js` | +5/−5 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/fixtures/bot-scoring-snapshot.json` | +36/−34 | przejrzany; świadoma regeneracja z notami dryfu (5 partii) w `bot-scoring-snapshot.test.js` — nie powrót do starych hashy |
| `test/helpers/deferred-trigger.js` | +3/−1 | przejrzany diff; helper odroczonych wyzwalaczy pod checkpoint; bez osłabień |
| `test/katalog-pole-plan.test.js` | +3/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/library-manipulation-modal.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m157-uwagi-wlasciciela.test.js` | +17/−7 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m169-uwagi-wlasciciela.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m171-petla-jakosci.test.js` | +9/−10 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m187-audyt-pr69.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m195-multi-target.test.js` | +10/−6 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m245-atak-podzbior-minus-jeden.test.js` | +28/−19 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m270-wymog-ataku-if-able.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m304-mulligan-bottom-klin.test.js` | +17/−6 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m361-gold-exploit-self.test.js` | +6/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m372-znaleziska-j-wymog-ataku-pass.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m380-restrykcje-bloku-jedno-zrodlo.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m382-apnap-kolejnosc-triggerow.test.js` | +12/−8 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/m387-legalnosc-bloku-jedno-zrodlo.test.js` | +10/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/modal-hover-nazwy.test.js` | +216/−0 | przejrzany punktowo; hover kontra tap-dotyk; RED 1/5→GREEN 5/5 udokumentowane; bez osłabień starszych pinów |
| `test/modal-impulse-exile-cast.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/player-view.test.js` | +3/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/pmssb7-hold-wave-a.test.js` | +4/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch2.test.js` | +2/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch30.test.js` | +2/−0 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch53.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch61.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch62.test.js` | +12/−4 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch63-completion.test.js` | +8/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch66.test.js` | +2/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch70.test.js` | +3/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/real-cards-batch72.test.js` | +324/−0 | przejrzany punktowo; piny mechanik nowych kart na realnych kartach (legal/illegal), nie tekstowo |
| `test/run-tests-audit-mode.test.js` | +38/−0 | przejrzany diff; piny trybu `audit` (bez kwarantanny/force-RED); manifest nietknięty |
| `test/spell-resolution-symmetry-modal.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/statusy-wpisow-katalogu.test.js` | +2/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/undercity-fabricate-pass-guard.test.js` | +1/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/uwaga-m-keepout-chip.test.js` | +6/−5 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/uwaga-z-gry-2026-09-23-w-epic-experiment-x.test.js` | +5/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/uwaga-z-gry-2026-09-23-x-trigger-up-to-multiselect.test.js` | +4/−2 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/uwagi-z-testow-b-epic-experiment-x.test.js` | +8/−3 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/you-may-decline-przy-celu.test.js` | +12/−1 | przegląd mechaniczny całego diffu testów (brak osłabionych asercji; 108 usuniętych linii = wycofanie cap-ów/re-anchors z notami); pakiet zielony |
| `test/zgloszenie-c-magma-lethal.test.js` | +232/−0 | przejrzany punktowo; `zgloszenie-c-magma-lethal` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-d-diplomatic-okno.test.js` | +126/−0 | przejrzany punktowo; `zgloszenie-d-diplomatic-okno` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-d-dragonscale-okno.test.js` | +146/−0 | przejrzany punktowo; `zgloszenie-d-dragonscale-okno` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-d-k4-twarz.test.js` | +120/−0 | przejrzany punktowo; `zgloszenie-d-k4-twarz` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-d-k4b-removal-timing.test.js` | +98/−0 | przejrzany punktowo; `zgloszenie-d-k4b-removal-timing` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-d-k6-tokeny.test.js` | +86/−0 | przejrzany punktowo; `zgloszenie-d-k6-tokeny` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-e-inferno-podzial.test.js` | +161/−0 | przejrzany punktowo; `zgloszenie-e-inferno-podzial` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-f-brak-ucinania.test.js` | +131/−0 | przejrzany punktowo; `zgloszenie-f-brak-ucinania` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-g-walka-konstruuj.test.js` | +159/−0 | przejrzany punktowo; `zgloszenie-g-walka-konstruuj` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-g2-triggery-podzial.test.js` | +193/−0 | przejrzany punktowo; `zgloszenie-g2-triggery-podzial` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-g3-decyzje-oczekujace.test.js` | +145/−0 | przejrzany punktowo; `zgloszenie-g3-decyzje-oczekujace` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
| `test/zgloszenie-g3-rzuty-x-fireball.test.js` | +131/−0 | przejrzany punktowo; `zgloszenie-g3-rzuty-x-fireball` pinuje zachowanie (RED→GREEN + mutacje z PR), nie tekst; pakiet zielony |
