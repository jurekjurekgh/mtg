# Mapa audytu scalonego PR #179

Źródło: pełna paginacja REST `pulls/179/files`: **223 pliki**, +10 872/−1 445; PR ma 126 commitów. Baza `04ca8e9`, wynik scalenia `7a18659` (= HEAD `main`). Diff pobrany przez `gh pr diff 179` (lokalnie, w tej sesji) i REST.

**Stan: mapa otwarta — przegląd w toku.** Bilans: **43 produkcyjne/dane** (26 src + 7 tools + 2 konfiguracja/README + 8 talii) + **57 docs** + **123 testy**. Każdy wiersz ma jawny zakres i status; samo uruchomienie testu nie zamyka wiersza. To nie jest dowód wszystkich interakcji ani wszystkich konsumentów zmian produkcyjnych.


## Produkcja — src (26)

| Plik | +/− | Stan audytu |
|---|---|---|
| `src/cards/card-data.js` | +180/−0 | do przeglądu |
| `src/cards/mana-costs-data.js` | +11/−0 | do przeglądu |
| `src/controllers/heuristic-bot.js` | +544/−33 | do przeglądu |
| `src/controllers/heuristic-params.js` | +33/−0 | do przeglądu |
| `src/controllers/mana-offer-guards.js` | +20/−12 | do przeglądu |
| `src/engine/abilities.js` | +42/−28 | do przeglądu |
| `src/engine/attachments.js` | +19/−1 | do przeglądu |
| `src/engine/combat.js` | +197/−238 | do przeglądu |
| `src/engine/destruction.js` | +2/−0 | do przeglądu |
| `src/engine/effects.js` | +3/−0 | do przeglądu |
| `src/engine/fingerprint.js` | +2/−1 | do przeglądu |
| `src/engine/game-state.js` | +388/−209 | do przeglądu |
| `src/engine/mana-restrictions.js` | +64/−0 | do przeglądu |
| `src/engine/objects.js` | +19/−1 | do przeglądu |
| `src/engine/permanents.js` | +6/−1 | do przeglądu |
| `src/engine/resources.js` | +164/−80 | do przeglądu |
| `src/engine/spells.js` | +105/−94 | do przeglądu |
| `src/engine/state-based.js` | +10/−1 | do przeglądu |
| `src/engine/triggers.js` | +216/−56 | do przeglądu |
| `src/table/choice-request.js` | +125/−51 | do przeglądu |
| `src/table/main.js` | +168/−69 | do przeglądu |
| `src/table/mana-wizard.js` | +3/−1 | do przeglądu |
| `src/table/multi-target.js` | +78/−0 | do przeglądu |
| `src/table/picker.js` | +53/−15 | do przeglądu |
| `src/table/render.js` | +1/−0 | do przeglądu |
| `src/table/session.js` | +1/−0 | do przeglądu |

## Produkcja — tools (7)

| Plik | +/− | Stan audytu |
|---|---|---|
| `tools/benchmark.mjs` | +1/−1 | do przeglądu |
| `tools/bot-tie-audit.mjs` | +1/−1 | do przeglądu |
| `tools/collection-art-ids.csv` | +10/−0 | do przeglądu |
| `tools/pmssb69-initiative-ab.mjs` | +1/−1 | do przeglądu |
| `tools/pmssb72-batch72-sonda.mjs` | +136/−0 | do przeglądu |
| `tools/pmssb88-batch72-scoring-sonda.mjs` | +235/−0 | do przeglądu |
| `tools/run-tests.mjs` | +31/−4 | do przeglądu |

## Konfiguracja i README (2)

| Plik | +/− | Stan audytu |
|---|---|---|
| `README.md` | +8/−7 | do przeglądu |
| `package.json` | +2/−1 | do przeglądu |

## Dane — talie (8)

| Plik | +/− | Stan audytu |
|---|---|---|
| `decks/forgotten-realms-br.txt` | +19/−0 | do przeglądu |
| `decks/forgotten-realms-wug.txt` | +1/−17 | do przeglądu |
| `decks/ixalan.txt` | +2/−0 | do przeglądu |
| `decks/theros.txt` | +1/−0 | do przeglądu |
| `decks/wiedzmin-wur.txt` | +3/−1 | do przeglądu |
| `decks/worek-basni.txt` | +3/−1 | do przeglądu |
| `decks/worek-legend.txt` | +3/−1 | do przeglądu |
| `decks/worek-mroczny.txt` | +2/−1 | do przeglądu |

## Dokumentacja (57)

| Plik | +/− | Stan audytu |
|---|---|---|
| `docs/ENGINE_MILESTONES.md` | +38/−0 | do przeglądu |
| `docs/LESSONS.md` | +10/−0 | do przeglądu |
| `docs/LESSONS_PRZYPADKI.md` | +15/−0 | do przeglądu |
| `docs/PMSSB.md` | +76/−0 | do przeglądu |
| `docs/PROJECT_HISTORY.md` | +210/−0 | do przeglądu |
| `docs/audits/AUDYT_PR177_2026-11-01.md` | +3/−0 | do przeglądu |
| `docs/audits/AUDYT_PR178_2026-11-03.md` | +484/−0 | do przeglądu |
| `docs/audits/INWENTARZ_ZDARZEN_I_TRIGGEROW_2026-11-04.md` | +92/−0 | do przeglądu |
| `docs/audits/PR177_MAPA_PLIKOW_2026-11-02.md` | +3/−0 | do przeglądu |
| `docs/audits/PR178_MAPA_PLIKOW_2026-11-03.md` | +202/−0 | do przeglądu |
| `docs/cards/scryfall-banishing-light.json` | +47/−0 | do przeglądu |
| `docs/cards/scryfall-creeping-peeper.json` | +32/−0 | do przeglądu |
| `docs/cards/scryfall-feral-ridgewolf.json` | +26/−0 | do przeglądu |
| `docs/cards/scryfall-kraken-hatchling.json` | +26/−0 | do przeglądu |
| `docs/cards/scryfall-lichs-caress.json` | +32/−0 | do przeglądu |
| `docs/cards/scryfall-living-history.json` | +26/−0 | do przeglądu |
| `docs/cards/scryfall-open-the-gates.json` | +26/−0 | do przeglądu |
| `docs/cards/scryfall-pheres-band-centaurs.json` | +26/−0 | do przeglądu |
| `docs/cards/scryfall-shining-aerosaur.json` | +26/−0 | do przeglądu |
| `docs/cards/scryfall-vortex-runner.json` | +26/−0 | do przeglądu |
| `docs/decisions/0031-event-identity-and-trigger-batches.md` | +16/−0 | do przeglądu |
| `docs/decisions/0032-shared-trigger-checkpoint.md` | +16/−0 | do przeglądu |
| `docs/decisions/README.md` | +8/−67 | do przeglądu |
| `docs/plans/PLAN_2026-11-01-audyt-pr177.md` | +3/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-03-audyt-pr178.md` | +64/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-03-bezpieczne-kroki-zdarzen.md` | +145/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-04-c-magma-lethal.md` | +47/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-04-przeglad-mapy-pr178.md` | +99/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-04-wspolny-checkpoint.md` | +56/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-05-d-combat-tricki.md` | +258/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-05-e-inferno-podzial.md` | +58/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-05-f-brak-ucinania-enumeracji.md` | +62/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-05-g-architektura-konstruuj-waliduj.md` | +225/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-05-modal-hover.md` | +149/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-06-batch72-kolekcja-635-644.md` | +74/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-06b-batch72-rule-inventory.md` | +49/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-06c-pmssb72.md` | +67/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-06d-batch72-deck-report.md` | +42/−0 | do przeglądu |
| `docs/plans/PLAN_2026-11-06e-pmssb88-batch72-scoring-audit.md` | +64/−0 | do przeglądu |
| `docs/setup/ENVIRONMENT.md` | +6/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-01-audyt-pr177.md` | +3/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-03-audyt-pr178.md` | +47/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-a100.md` | +42/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-a101.md` | +39/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-a102-a103.md` | +40/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-a104-a107.md` | +70/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-a108-a109.md` | +42/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-a84.md` | +40/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-a98.md` | +41/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-c-magma-lethal.md` | +22/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-przeglad-mapy.md` | +54/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-04-wspolny-checkpoint.md` | +22/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-05-modal-hover.md` | +30/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-05-zgloszenie-d.md` | +69/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-05-zgloszenie-e.md` | +31/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-05-zgloszenie-g.md` | +87/−0 | do przeglądu |
| `docs/setup/HANDOFF_2026-11-06-batch72.md` | +75/−0 | do przeglądu |

## Testy (123)

| Plik | +/− | Stan audytu |
|---|---|---|
| `test/art-ids-tool.test.js` | +5/−3 | do przeglądu |
| `test/audit-m119-zywy-tester.test.js` | +11/−3 | do przeglądu |
| `test/audit-pr171-bug-t-detain-badges.test.js` | +1/−1 | do przeglądu |
| `test/audyt-grupowanie-triggerow-tag.test.js` | +4/−2 | do przeglądu |
| `test/audyt-katalog-dane-vs-snapshoty.test.js` | +16/−12 | do przeglądu |
| `test/audyt-m431-untap-choice.test.js` | +11/−4 | do przeglądu |
| `test/audyt-pmssb23-liczniki.test.js` | +18/−11 | do przeglądu |
| `test/audyt-pmssb32-mana.test.js` | +4/−2 | do przeglądu |
| `test/audyt-pmssb33-remisy-wyboru.test.js` | +3/−3 | do przeglądu |
| `test/audyt-pmssb36-nowe-karty.test.js` | +4/−2 | do przeglądu |
| `test/audyt-pmssb72-batch72.test.js` | +46/−0 | do przeglądu |
| `test/audyt-pmssb84-champion-okno.test.js` | +67/−9 | do przeglądu |
| `test/audyt-pmssb88-batch72.test.js` | +124/−0 | do przeglądu |
| `test/audyt-pr129-f1-fireball-x-w-logu.test.js` | +10/−6 | do przeglądu |
| `test/audyt-pr129-kopia-zbioru-bloku.test.js` | +5/−5 | do przeglądu |
| `test/audyt-pr140-block-requirements.test.js` | +20/−18 | do przeglądu |
| `test/audyt-pr150-podzial-w-oknach-rzutu.test.js` | +5/−4 | do przeglądu |
| `test/audyt-pr173-skarb-podwojny-osiagalnosc.test.js` | +17/−0 | do przeglądu |
| `test/audyt-pr177-a100-ward-triggers.test.js` | +1/−3 | do przeglądu |
| `test/audyt-pr177-a101-reflexive-apnap.test.js` | +64/−7 | do przeglądu |
| `test/audyt-pr177-a102-draw-apnap.test.js` | +1/−3 | do przeglądu |
| `test/audyt-pr177-a103-second-draw-apnap.test.js` | +1/−3 | do przeglądu |
| `test/audyt-pr177-a104-flooding-apnap.test.js` | +2/−4 | do przeglądu |
| `test/audyt-pr177-a105-nanoform-apnap.test.js` | +2/−4 | do przeglądu |
| `test/audyt-pr177-a106-ward-target-apnap.test.js` | +1/−3 | do przeglądu |
| `test/audyt-pr177-a107-two-ward-apnap.test.js` | +1/−3 | do przeglądu |
| `test/audyt-pr177-a108-ward-sba.test.js` | +1/−3 | do przeglądu |
| `test/audyt-pr177-a109-ward-aura-sba.test.js` | +10/−19 | do przeglądu |
| `test/audyt-pr177-a110-auto-mana-events.test.js` | +8/−13 | do przeglądu |
| `test/audyt-pr177-a111-imp-self-lki.test.js` | +11/−9 | do przeglądu |
| `test/audyt-pr177-a112-imp-selhoff-apnap.test.js` | +41/−19 | do przeglądu |
| `test/audyt-pr177-a113-mixed-combat-apnap.test.js` | +23/−11 | do przeglądu |
| `test/audyt-pr177-a28-kolejnosc-madness.test.js` | +5/−2 | do przeglądu |
| `test/audyt-pr177-a37-anticipate-real.test.js` | +2/−2 | do przeglądu |
| `test/audyt-pr177-a40-champion-bot.test.js` | +3/−3 | do przeglądu |
| `test/audyt-pr177-a47-readme-decks.test.js` | +2/−2 | do przeglądu |
| `test/audyt-pr177-a61-oak-token-real.test.js` | +1/−1 | do przeglądu |
| `test/audyt-pr177-a69-converge-free-real.test.js` | +1/−1 | do przeglądu |
| `test/audyt-pr177-a75-apnap-land.test.js` | +10/−5 | do przeglądu |
| `test/audyt-pr177-a77-apnap-activation.test.js` | +6/−2 | do przeglądu |
| `test/audyt-pr177-a83-colored-manual.test.js` | +2/−2 | do przeglądu |
| `test/audyt-pr177-a84-ward-apnap.test.js` | +2/−4 | do przeglądu |
| `test/audyt-pr177-a86-wizard-auto-colors.test.js` | +1/−1 | do przeglądu |
| `test/audyt-pr177-a87-wizard-cost-objects.test.js` | +4/−3 | do przeglądu |
| `test/audyt-pr177-a94-optional-apnap.test.js` | +7/−7 | do przeglądu |
| `test/audyt-pr177-a95-ward-two-scions.test.js` | +0/−2 | do przeglądu |
| `test/audyt-pr177-a96-counter-two-scions.test.js` | +1/−3 | do przeglądu |
| `test/audyt-pr177-a97-echo-two-scions.test.js` | +1/−1 | do przeglądu |
| `test/audyt-pr177-a98-spellbomb-apnap.test.js` | +2/−4 | do przeglądu |
| `test/audyt-pr177-morbid-bestow.test.js` | +5/−1 | do przeglądu |
| `test/audyt-pr178-b1-bestow-recast.test.js` | +133/−0 | do przeglądu |
| `test/audyt-pr178-b2-bestow-detach-recast.test.js` | +139/−0 | do przeglądu |
| `test/audyt-pr179-zbiorowe-opuszczenie-regresje.test.js` | +252/−0 | do przeglądu |
| `test/audyt-pr93-koszt-x-z-exile.test.js` | +12/−6 | do przeglądu |
| `test/batch25-etb-enters-fix.test.js` | +2/−0 | do przeglądu |
| `test/batch39-kart.test.js` | +5/−5 | do przeglądu |
| `test/batch40-kart.test.js` | +4/−4 | do przeglądu |
| `test/batch47-kart.test.js` | +1/−1 | do przeglądu |
| `test/batch70-mechaniki.test.js` | +11/−10 | do przeglądu |
| `test/benchmark-equip-protection-offer.test.js` | +35/−0 | do przeglądu |
| `test/block-slots-trojka-oferta.test.js` | +7/−9 | do przeglądu |
| `test/bot-owner-reports-2026-08-16.test.js` | +10/−4 | do przeglądu |
| `test/bot-scoring-snapshot.test.js` | +40/−0 | do przeglądu |
| `test/bug-c1-fireball-koszt-widoczny.test.js` | +7/−3 | do przeglądu |
| `test/bug-hunt-2026-08-16-owner-c.test.js` | +3/−4 | do przeglądu |
| `test/checkpoint-etb-kolejnosc.test.js` | +107/−0 | do przeglądu |
| `test/checkpoint-madness-kolejnosc.test.js` | +95/−0 | do przeglądu |
| `test/checkpoint-modal-kolejnosc.test.js` | +56/−0 | do przeglądu |
| `test/checkpoint-sba-kontrole.test.js` | +112/−0 | do przeglądu |
| `test/e6-pula-blokerow-ponad-cap.test.js` | +26/−18 | do przeglądu |
| `test/fiery-justice-autotap-minimal.test.js` | +67/−0 | do przeglądu |
| `test/fix-b-chump-blok-przezycie.test.js` | +5/−5 | do przeglądu |
| `test/fixtures/bot-scoring-snapshot.json` | +36/−34 | do przeglądu |
| `test/helpers/deferred-trigger.js` | +3/−1 | do przeglądu |
| `test/katalog-pole-plan.test.js` | +3/−2 | do przeglądu |
| `test/library-manipulation-modal.test.js` | +2/−2 | do przeglądu |
| `test/m157-uwagi-wlasciciela.test.js` | +17/−7 | do przeglądu |
| `test/m169-uwagi-wlasciciela.test.js` | +2/−2 | do przeglądu |
| `test/m171-petla-jakosci.test.js` | +9/−10 | do przeglądu |
| `test/m187-audyt-pr69.test.js` | +2/−2 | do przeglądu |
| `test/m195-multi-target.test.js` | +10/−6 | do przeglądu |
| `test/m245-atak-podzbior-minus-jeden.test.js` | +28/−19 | do przeglądu |
| `test/m270-wymog-ataku-if-able.test.js` | +2/−2 | do przeglądu |
| `test/m304-mulligan-bottom-klin.test.js` | +17/−6 | do przeglądu |
| `test/m361-gold-exploit-self.test.js` | +6/−0 | do przeglądu |
| `test/m372-znaleziska-j-wymog-ataku-pass.test.js` | +2/−2 | do przeglądu |
| `test/m380-restrykcje-bloku-jedno-zrodlo.test.js` | +2/−2 | do przeglądu |
| `test/m382-apnap-kolejnosc-triggerow.test.js` | +12/−8 | do przeglądu |
| `test/m387-legalnosc-bloku-jedno-zrodlo.test.js` | +10/−4 | do przeglądu |
| `test/modal-hover-nazwy.test.js` | +216/−0 | do przeglądu |
| `test/modal-impulse-exile-cast.test.js` | +1/−1 | do przeglądu |
| `test/player-view.test.js` | +3/−2 | do przeglądu |
| `test/pmssb7-hold-wave-a.test.js` | +4/−3 | do przeglądu |
| `test/real-cards-batch2.test.js` | +2/−0 | do przeglądu |
| `test/real-cards-batch30.test.js` | +2/−0 | do przeglądu |
| `test/real-cards-batch53.test.js` | +2/−2 | do przeglądu |
| `test/real-cards-batch61.test.js` | +2/−2 | do przeglądu |
| `test/real-cards-batch62.test.js` | +12/−4 | do przeglądu |
| `test/real-cards-batch63-completion.test.js` | +8/−3 | do przeglądu |
| `test/real-cards-batch66.test.js` | +2/−2 | do przeglądu |
| `test/real-cards-batch70.test.js` | +3/−3 | do przeglądu |
| `test/real-cards-batch72.test.js` | +324/−0 | do przeglądu |
| `test/run-tests-audit-mode.test.js` | +38/−0 | do przeglądu |
| `test/spell-resolution-symmetry-modal.test.js` | +1/−1 | do przeglądu |
| `test/statusy-wpisow-katalogu.test.js` | +2/−1 | do przeglądu |
| `test/undercity-fabricate-pass-guard.test.js` | +1/−1 | do przeglądu |
| `test/uwaga-m-keepout-chip.test.js` | +6/−5 | do przeglądu |
| `test/uwaga-z-gry-2026-09-23-w-epic-experiment-x.test.js` | +5/−2 | do przeglądu |
| `test/uwaga-z-gry-2026-09-23-x-trigger-up-to-multiselect.test.js` | +4/−2 | do przeglądu |
| `test/uwagi-z-testow-b-epic-experiment-x.test.js` | +8/−3 | do przeglądu |
| `test/you-may-decline-przy-celu.test.js` | +12/−1 | do przeglądu |
| `test/zgloszenie-c-magma-lethal.test.js` | +232/−0 | do przeglądu |
| `test/zgloszenie-d-diplomatic-okno.test.js` | +126/−0 | do przeglądu |
| `test/zgloszenie-d-dragonscale-okno.test.js` | +146/−0 | do przeglądu |
| `test/zgloszenie-d-k4-twarz.test.js` | +120/−0 | do przeglądu |
| `test/zgloszenie-d-k4b-removal-timing.test.js` | +98/−0 | do przeglądu |
| `test/zgloszenie-d-k6-tokeny.test.js` | +86/−0 | do przeglądu |
| `test/zgloszenie-e-inferno-podzial.test.js` | +161/−0 | do przeglądu |
| `test/zgloszenie-f-brak-ucinania.test.js` | +131/−0 | do przeglądu |
| `test/zgloszenie-g-walka-konstruuj.test.js` | +159/−0 | do przeglądu |
| `test/zgloszenie-g2-triggery-podzial.test.js` | +193/−0 | do przeglądu |
| `test/zgloszenie-g3-decyzje-oczekujace.test.js` | +145/−0 | do przeglądu |
| `test/zgloszenie-g3-rzuty-x-fireball.test.js` | +131/−0 | do przeglądu |
