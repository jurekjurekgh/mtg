# Mapa audytu scalonego PR #181 (2026-11-08)

Źródło: pełna paginacja REST `pulls/181/files` (`gh api --paginate`, 88 plików) + `gh pr diff 181` rozdzielony kotwicą `^diff --git ` (88 bloków = 88 plików REST, bez zagnieżdżonych patchy; L190/ENVIRONMENT §3).
Scalenie `5f8ede8` (= HEAD `main` w chwili startu sesji), baza `d2e0d61` (scalenie #180). Rozmiar: **88 plików, +4636/−235, 23 commity**.

**Stan: przegląd zakończony, 0 otwartych wierszy.** Bilans: **24 produkcyjne** (23 `src/` + 1 `tools/`) + **11 dokumentów** + **53 testy** (12 nowych plików + 41 zmienionych). Każdy wiersz ma jawny zakres i status; samo uruchomienie testu nie zamyka wiersza. To nie jest dowód wszystkich interakcji ani wszystkich konsumentów zmian produkcyjnych.


## Produkcja — `src/` (23)

| Plik | +/− | Stan audytu |
|---|---|---|
| `src/cards/card-data.js` | +11/−7 | przejrzany; noty Powerstone doganiają implementację M214 (restrykcja w formie NEGATYWNEJ — „can't be spent to cast a nonartifact spell", CR 106.3) + bump cytatów CR; zero zmian danych kart poza komentarzami/notes |
| `src/cards/deck-text.js` | +1/−1 | renumeracja CR 712.8→712.6 (DFC poza polem bitwy) — jedna linia komentarza |
| `src/cards/materialize.js` | +3/−3 | renumeracja CR (712.8a→712.6a, 712.11/712.13→712.8/712.10, 712.8→712.6) |
| `src/cards/registry.js` | +2/−2 | renumeracja CR (712.8→712.6, 714.4→715.4) |
| `src/controllers/heuristic-bot.js` | +195/−20 | przejrzany; cztery decyzje właściciela: N (`uphillTmc` — brak wymiany w górę TMC w bloku), O (`hardRemovalHeldForWorthierTarget` — twardy removal trzymany na cel ≥ MV czaru), M (Basilisk Gate: premia tylko na stwora godnego w Main 1), H2 (`suspendMain1Penalty` — dodatni scoring suspend wyłącznie w Głównej 2); golden zregenerowany świadomie (noty w `bot-scoring-snapshot.test.js`) |
| `src/controllers/heuristic-params.js` | +29/−0 | przejrzany; nowe pokrętło `suspendMain1Penalty` (40) — generyczne po typie komendy, nie po nazwie karty |
| `src/engine/deck.js` | +1/−1 | renumeracja CR 712.8a→712.6a |
| `src/engine/effects.js` | +60/−5 | przejrzany; nowy `undercityRoomEffectText` + `describeRoomEffectForUi`/`polishPluralOf` — tekst etykiet pokoi wyprowadzony z DANYCH `UNDERCITY_ROOMS` (L41), nieznany deskryptor spada na typ efektu (opis nigdy pusty) |
| `src/engine/game-state.js` | +14/−6 | przejrzany; bump CR + L: `entry.manaGrant` w ofercie widoku (grant many z aury na lądzie jest informacją publiczną — Nature's Embrace) |
| `src/engine/identity.js` | +2/−2 | renumeracja CR |
| `src/engine/objects.js` | +4/−4 | renumeracja CR |
| `src/engine/permanents.js` | +7/−7 | renumeracja CR (m.in. 712.18→712.15) |
| `src/engine/spells.js` | +9/−9 | renumeracja CR |
| `src/engine/state-based.js` | +1/−1 | renumeracja CR 714.4→715.4 |
| `src/engine/triggers.js` | +13/−13 | renumeracja CR (Sagi 714→715, przygody 715→716) |
| `src/engine/zones.js` | +4/−4 | renumeracja CR (716.3d/716.2a) |
| `src/table/choice-request.js` | +18/−1 | przejrzany; I: pseudo-id `undercity` dla opcji „Podziemia — idź do: X" (karta lochu poza rejestrem); K: `resolve_trigger_order` → podgląd ŹRÓDŁA zdolności (`cmd.cardId`), nie celu; nowa etykieta awaryjna pokoju |
| `src/table/index.html` | +5/−0 | przycisk `#undo-turn` w górnej belce (ikona jak pozostałe toggl-e; `disabled` sterowany stanem sesji) |
| `src/table/main.js` | +111/−6 | przejrzany; obsługa Undo (klik → `undoToTurnStart`, stan `disabled`, modal „Rozgrywka”), hover/pełny ekran karty lochu (`undercity`), `stackAtOpen` dla drenażu płatności (F-CYK), bramka `artPause` przy pauzie granicy (J) |
| `src/table/mana-wizard.js` | +89/−8 | przejrzany; L: grant many z aury na lądzie jako źródło kreatora (`manaGrant`, kolory z grantu) zamiast tapowania własnej zdolności lądu; F-CYK: `stackAtOpen` przekazywany do zagnieżdżonego kreatora |
| `src/table/multi-target.js` | +8/−0 | przejrzany; K: `resolve_trigger_order` wyłączone z rodziny jednowyborowej (modal pokazywał „wskaż kartę:" z wierszami „?" — decyzja o kolejności nie jest wyborem karty) |
| `src/table/render.js` | +34/−6 | przejrzany; J. Undercity: tytuł grupy i wiersze nazywają POKÓJ + EFEKT (`undercityRoomEffectText`); K: opis skutku z pełnych deskryptorów wpisu stosu (`abilityEffects`, fallback `effectTypes`); bump CR Sagi |
| `src/table/session.js` | +184/−4 | przejrzany; Undo (migawki `turnCheckpoints` + `undoToTurnStart`, `noteTurnBoundaryPause` w `apply`/`advance`), F-OGŁ (`paymentUnit` — płatność kreatora to jedna jednostka ogłoszeń), J (`continueArtPlay` nie przetacza gry przy niepotwierdzonej pauzie z nagłówkiem tury) |

## Narzędzia (1)

| Plik | +/− | Stan audytu |
|---|---|---|
| `tools/table-tester/run-game.mjs` | +8/−2 | przejrzany; HELP bierze domyślne talie z `parseArgs([])` (jedno źródło, L41) — stale `[ravnica-wub]` po przemianowaniu |

## Testy (53)

Piny nowych zachowań (**12 nowych plików**) + 41 plików zmienionych. W plikach zmienionych rozdzielono dwie klasy: **czysta renumeracja CR** (25 plików; dowód maszynowy: multizbiór linii `+/−` po normalizacji numerów reguł `\d+\.\d+[a-z]?` → `#` jest identyczny — zmieniły się wyłącznie numery sekcji, nie asercje) oraz **zmiany merytoryczne** (16 plików, opisane niżej).

| Plik | +/− | Stan audytu |
|---|---|---|
| `test/audit-m257-fixes.test.js` | +5/−5 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/audyt-pmssb35-odroczenie.test.js` | +46/−7 | H2: sceny odroczenia suspend przeniesione do Głównej 2 (w Głównej 1 pasowanie), kotwica 24−40=−16 |
| `test/audyt-pmssb38-licznik-spelli-incubate.test.js` | +8/−3 | O: cel inkubate podniesiony do TMC 6 (próg twardego removal) — 120 → 124 (M234), by pin mierzył rzut, nie karę „spalenia silnego czaru" |
| `test/audyt-pr134-2026-09-24-cytaty-cr.test.js` | +33/−17 | bump CR: `POMIN` + oczekiwania par numerów doprowadzone do wydania 2026-11-06 |
| `test/audyt-pr134-2026-09-24-transform-w-miejscu.test.js` | +4/−4 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/audyt-pr140-look-top-atomic.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/audyt-pr149-stempel-wygnania.test.js` | +2/−2 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/audyt-pr168-initiative-dokumentacja.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/audyt-pr168-initiative.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/audyt-pr177-mana-wizard-koszt-aktywacji.test.js` | +4/−0 | F-CYK: sandbox deklaruje `session` (kreator czyta `stackAtOpen`) |
| `test/audyt-pr180-cf-cycling-kolejnosc-stosu.test.js` | +200/−0 | NOWY (6 pinów): triggery z płatności (tapnięcie źródła) rozstrzygają się PRZED komendą natychmiastową — CR 602.2a+b/603.3/117.5 |
| `test/bot-scoring-snapshot.test.js` | +12/−0 | noty świadomej regeneracji goldena abc4017e… → 83ee50de… (H2) z pomiarem: tylko wyceny NIE-WYBRANYCH opcji w Głównej 1 |
| `test/bot-wyceny-pakiet-c.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/card-data.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/checkpoint-sba-kontrole.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/copy-token-dfc.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/cr-numery-701-tabela-straznik.test.js` | +5/−5 | bump CR: `POMIN` + tabela 701 |
| `test/cr-numery-702-tabela-straznik.test.js` | +9/−4 | bump CR: tabela 702 (nowe 702.145 nightbound, 702.62 suspend) |
| `test/cr-numery-mechanik-straznik.test.js` | +19/−9 | bump CR: `PARY` mechanik doprowadzone do wydania 2026-11-06 |
| `test/deck-text.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/etap-f-2026-09-24-fizzle-i-zejscie-ze-stosu.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/fingerprint.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/fixtures/bot-scoring-snapshot.json` | +10/−10 | golden master zregenerowany (H2) — 10 linii |
| `test/helpers/cr-numery-tabela.js` | +26/−13 | bump CR: tabela istnienia numerów (570 → 575 po audycie #181) i wersja wydania |
| `test/m159-zywy-tester.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/m163-uwagi-wlasciciela.test.js` | +2/−2 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/m164-saga-etap-badge.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/m203-talie-testera-i-dokumentacji.test.js` | +19/−0 | NOWY pin M203/8: HELP `run-game.mjs` czyta domyślne talie z `parseArgs` (behawioralnie z wyjścia `--help`) |
| `test/m258-cr202-kopia-tylu-dfc.test.js` | +3/−3 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/m264-enter-as-copy-dfc.test.js` | +9/−7 | bump CR 712.9→712.7 + dostrojenie asercji do nowego numeru |
| `test/m272-saga-poswiecenie-strefa.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/permanent-stack.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/pmssb6-discard-wave-a.test.js` | +7/−3 | H2: scena suspend przeniesiona do Głównej 2 (`newState({ step: 'main2' })`) |
| `test/real-cards-batch16.test.js` | +2/−2 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/real-cards-batch59.test.js` | +2/−2 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/statusy-wpisow-katalogu.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/table-tester-detectors.test.js` | +5/−0 | J. Undercity: detektor grupy celu pokoju zna nowe etykiety („Pokój Forge — …: wybierz cel") — brak fałszywych alarmów na Żywym Testerze |
| `test/zgloszenie-a-gray-slaad-przygoda-kind.test.js` | +1/−1 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/zgloszenie-a-numery-zrodel-kreatora.test.js` | +4/−1 | L: wiersz „Tapnij: …" pokazuje numer źródła także dla grantu many z aury |
| `test/zgloszenie-b-saga-rozdzial-i-poswiecenie.test.js` | +6/−6 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/zgloszenie-d-rozdzial-sagi-po-smierci.test.js` | +2/−2 | czysta renumeracja CR (bump 2026-11-06) — brak zmian asercji merytorycznych |
| `test/zgloszenie-h-ogloszenie-zawieszenia.test.js` | +129/−0 | NOWY (H): `card_suspended`/`card_plotted` w `BOT_PAUSE_EVENTS` — modal pauzuje przy akcie, we właściwej fazie |
| `test/zgloszenie-h1-suspend-timing.test.js` | +101/−0 | NOWY (H1): piny gwarancyjne timingu suspend (upkeep = brak oferty; main1/main2 = oferta; cudza main i stos = brak) |
| `test/zgloszenie-i-undercity-podglad-trasy.test.js` | +125/−0 | NOWY (I): hover nazwy trasy pokazuje kartę lochu (3 warstwy: funkcja / instalacja w modalu / drut main.js) |
| `test/zgloszenie-j-pauza-granicy-tury.test.js` | +138/−0 | NOWY (J): zamknięcie warstwy grafik nie zjada pauzy granicy tury (wilkołak bota, dzień→noc) |
| `test/zgloszenie-j-undercity-etykiety-pokoi.test.js` | +203/−0 | NOWY (J. Undercity): etykiety grup i wierszy nazywają pokój i efekt (dane → tekst) |
| `test/zgloszenie-k-kolejnosc-zdolnosci.test.js` | +128/−0 | NOWY (K): modal kolejności zdolności nie jest „wyborem karty" (brak wierszy „?") |
| `test/zgloszenie-k-kontynuacja-wspolny-model.test.js` | +218/−0 | NOWY (K): wspólny model listy przycisków — etykieta i podgląd źródła zdolności |
| `test/zgloszenie-l-natures-embrace.test.js` | +225/−0 | NOWY (L): Nature's Embrace na lądzie — grant 2 many dowolnego koloru widoczny w ofercie i użyty przez kreator |
| `test/zgloszenie-m-basilisk-gate.test.js` | +115/−0 | NOWY (M): Basilisk Gate — premia tylko na stwora godnego w Main 1 |
| `test/zgloszenie-n-blokowanie-tmc.test.js` | +129/−0 | NOWY (N): bot nie wymienia w górę TMC w bloku |
| `test/zgloszenie-o-lichs-caress.test.js` | +102/−0 | NOWY (O): Lich's Caress — twardy removal trzymany na cel ≥ MV czaru |
| `test/zgloszenie-undo-poczatek-tury.test.js` | +185/−0 | NOWY (Undo): cofanie do początku tury (7 testów; kolejne kliknięcia schodzą do poprzednich tur) |

## Dokumentacja (11)

| Plik | +/− | Stan audytu |
|---|---|---|
| `docs/PROJECT_HISTORY.md` | +304/−0 | wpis #181 (sesja, 23 commity, bramy, zamknięcie planów) |
| `docs/audits/AUDYT_PR180_2026-11-06.md` | +232/−0 | NOWY: raport audytu #180 (mapa 17/17, weryfikacja mutacyjna, §8 pętla jakości) |
| `docs/plans/PLAN_2026-11-06-audyt-pr180.md` | +133/−0 | NOWY: plan audytu #180 (etapy odhaczone) |
| `docs/plans/PLAN_2026-11-07-bump-cr-i-ogloszenia.md` | +73/−0 | NOWY: plan bumpu CR + F-OGŁ |
| `docs/plans/PLAN_2026-11-07-zgloszenia-h-i.md` | +137/−0 | NOWY: plan zgłoszeń H+I/O-2 |
| `docs/setup/HANDOFF_2026-11-06-audyt-pr180.md` | +102/−0 | NOWY: handoff po audycie #180 |
| `docs/setup/HANDOFF_2026-11-07-bump-cr-ogloszenia.md` | +97/−0 | NOWY: handoff po bumpie CR i F-OGŁ |
| `docs/setup/HANDOFF_2026-11-07-zgloszenia-h-i.md` | +111/−0 | NOWY: handoff zgłoszeń H+I |
| `docs/setup/HANDOFF_2026-11-07-zgloszenie-j-granica-tury.md` | +168/−0 | NOWY: handoff J (granica tury) + sekcja kontynuacji bez DFC |
| `docs/setup/HANDOFF_2026-11-07-zgloszenie-j-undercity-etykiety-pokoi.md` | +88/−0 | NOWY: handoff „J. Undercity" (etykiety pokoi) |
| `docs/setup/HANDOFF_2026-11-07-zgloszenie-k-kolejnosc-zdolnosci.md` | +120/−0 | NOWY: handoff K (kolejność zdolności) |
