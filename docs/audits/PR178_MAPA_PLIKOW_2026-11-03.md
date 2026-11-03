# Mapa audytu scalonego PR #178

Źródło: pełna paginacja REST `pulls/178/files`: **194 pliki**, +14073/−523; PR ma 308 commitów. Baza `7aff9b6`, wynik scalenia `04ca8e9`. Diff pobrany przez `gh pr diff 178`.

**Stan: audyt częściowy.** Wszystkie 26 plików produkcyjnych ma przejrzany diff na poziomie zmienionych linii i wskazane ryzyka. Nie jest to dowód wszystkich interakcji. Testy i dokumentacja są zinwentaryzowane i uruchomione w bramie, ale ich pełny przegląd semantyczny pozostaje otwarty. Zielony pakiet z pominięciami nie zamyka kwarantanny.

| Plik | Kategoria | Stan audytu |
|---|---|---|
| `README.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/ENGINE_MILESTONES.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/PMSSB.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/PROJECT_HISTORY.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/AUDYT_PR177_2026-11-01.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/PR177_MAPA_PLIKOW_2026-11-02.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/UWAGI_Z_GRY_2026-10-29.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/A107_NIE_WDRAZAC.patch` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/A109_NIE_WDRAZAC.patch` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/A110_NIE_WDRAZAC.patch` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/A111_A112_NIE_WDRAZAC.patch` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/A99_NIE_WDRAZAC.patch` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/README_A107.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/README_A109.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/README_A110.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/README_A111_A112.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/audits/experiments/README_A99.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/plans/PLAN_2026-11-01-audyt-pr177.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/plans/PLAN_2026-11-01-minimalne-x-bota.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/plans/PLAN_2026-11-01-uwagi-o-p-r.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/plans/PLAN_2026-11-01-zgloszenie-magma-x.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/plans/PLAN_2026-11-02-uwagi-manowar-austere.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `docs/setup/HANDOFF_2026-11-01-audyt-pr177.md` | dokumentacja | otwarty — inwentarz diffu; przegląd treści niedokończony |
| `src/cards/card-data.js` | produkcja | przejrzany diff; choiceComponents dla trybów złożonych |
| `src/controllers/aggro-bot.js` | produkcja | przejrzany diff; filtr dopłat i resolve_trigger_order |
| `src/controllers/heuristic-bot.js` | produkcja | przejrzany diff; filtry many, X, cele, discard, champion; otwarte ryzyka regresji botów |
| `src/controllers/heuristic-params.js` | produkcja | przejrzany diff; parametry X/discard |
| `src/controllers/mana-offer-guards.js` | produkcja | przejrzany diff; wspólny filtr dopłat triggerów |
| `src/controllers/random-bot.js` | produkcja | przejrzany diff; filtr wykonywalnych dopłat |
| `src/engine/abilities.js` | produkcja | przejrzany diff; walidacja kosztów tapnięcia przed mutacją |
| `src/engine/attachments.js` | produkcja | przejrzany diff; linia typów bestow i odłączanie załączników |
| `src/engine/effects.js` | produkcja | przejrzany diff; porządek bounce, champion, LKI i search |
| `src/engine/fingerprint.js` | produkcja | przejrzany diff; nowe pola pending w odcisku |
| `src/engine/game-state.js` | produkcja | przejrzany diff; otwarte APNAP/SBA/LKI (114 RED), kolejki madness/death-batch i płatności |
| `src/engine/mana-sources.js` | produkcja | przejrzany diff; pomocnicze bramki ręcznej many |
| `src/engine/objects.js` | produkcja | przejrzany diff; B1 naprawiony w #179: reset wydrukowanego spell po bestow |
| `src/engine/resources.js` | produkcja | przejrzany diff; B1 naprawiony w #179: zapis bestowOriginalSpell; dobór many Converge |
| `src/engine/spells.js` | produkcja | przejrzany diff; B1 naprawiony w #179: Negate czyta aktualne cechy stosu |
| `src/engine/state-based.js` | produkcja | przejrzany diff; LKI obiektu w zdarzeniu ofiary Sagi |
| `src/engine/triggers.js` | produkcja | przejrzany diff; otwarte APNAP/SBA/LKI, LKI i kolejność triggerów |
| `src/engine/zones.js` | produkcja | przejrzany diff; deathZoneFor respektuje unearthExile |
| `src/protocol/types.js` | produkcja | przejrzany diff; dodana komenda resolve_trigger_order |
| `src/table/choice-request.js` | produkcja | przejrzany diff; kreator trybów i zakaz wierszy kombinacji |
| `src/table/main.js` | produkcja | przejrzany diff; rezerwacje kosztów, bestow, kreator many i trybów |
| `src/table/mana-wizard.js` | produkcja | przejrzany diff; źródła many, tap-cost, pipy i improvise |
| `src/table/multi-target.js` | produkcja | przejrzany diff; X-only i wybór wielu trybów |
| `src/table/no-combination-rows.js` | produkcja | przejrzany diff; fail-closed dla kombinacji |
| `src/table/render.js` | produkcja | przejrzany diff; etykiety trigger order/champion/search i ostrzeżenia crew/saddle |
| `src/table/session.js` | produkcja | przejrzany diff; klucze opcji, FoW search i log champion |
| `test/audyt-pmssb81-koszt-kwalifikowany.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pmssb86-pozostale-karty-batcha.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr146-predykat-pipow-jeden.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr176-o1-etykieta-saddle-po-aktywacji.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a10-bestow-inwestycja.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a100-ward-triggers.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a101-reflexive-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a102-draw-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a103-second-draw-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a104-flooding-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a105-nanoform-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a106-ward-target-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a107-two-ward-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a108-ward-sba.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a109-ward-aura-sba.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a11-powrot-kreatora.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a110-auto-mana-events.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a111-imp-self-lki.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a112-imp-selhoff-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a113-mixed-combat-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a12-koszt-kwalifikowany.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a13-cel-lad-stwor.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a14-wynik-kreatora.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a15-zarezerwowane-zrodla.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a16-improvise-kreator.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a17-rozstrzygniecie-celow.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a18-auto-platnosc-rodzic.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a19-bezbarwne-zrodla.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a20-platny-tryb-ladu.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a21-bestow-na-stosie.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a22-bestow-ochrona-celu.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a23-koszt-bestow.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a25-violent-urge-delirium.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a26-champion-kontrola.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a27-madness-priorytet.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a28-kolejnosc-madness.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a29-magma-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a30-dane-talie.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a31-champion-niecelujacy.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a32-transform-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a33-bounce-stun.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a34-sac-ochrona.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a35-banquet-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a36-reaver-finality.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a37-anticipate-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a38-trumpet-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a39-tail-slash-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a40-champion-bot.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a41-blok-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a42-curse-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a43-cutthroat-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a44-cuombajj-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a45-tail-bot-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a46-blessing-combat-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a47-readme-decks.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a48-spire-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a49-proliferate-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a50-final-parting-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a51-edifice-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a52-counter-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a53-rockslide-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a54-hounds-oracle.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a55-etykieta-tester-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a56-violent-urge-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a57-zrodlo-ofiary-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a58-elk-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a59-force-away-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a60-frightful-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a61-oak-token-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a62-batch71-dane.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a63-edifice-legalne-etb.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a64-hounds-discard-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a66-token-morbid-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a67-spider-morbid.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a68-scorn-aura-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a69-converge-free-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a7-ostrzezenie-animacji.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a70-bounce-investment-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a71-apnap-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a72-shared-qualifier-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a73-search-destination-real.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a75-apnap-land.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a76-apnap-combat.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a77-apnap-activation.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a78-apnap-mana.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a79-ward-manual.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a8-priorytet-zagniezdzonej-many.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a80-rupture-manual.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a81-optional-manual.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a82-wizard-colors.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a83-colored-manual.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a84-ward-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a85-holdout-pay.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a86-wizard-auto-colors.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a87-wizard-cost-objects.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a88-single-manual-color.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a89-bot-payment.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a9-oplata-nieladowa.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a90-wizard-tap-cost.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a91-gate-cost-reservation.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a92-stale-gate-atomicity.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a93-animated-self-cost.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a94-optional-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a95-ward-two-scions.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a96-counter-two-scions.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a97-echo-two-scions.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-a98-spellbomb-apnap.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-bestow-typy.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-champion-na-stosie.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-converge-dobor-many.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-klatwa-gracz-upkeep.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/audyt-pr177-morbid-bestow.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/batch39-kart.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/batch40-kart.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/batch41-kart.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/bot-scoring-snapshot.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/epic-experiment-sequential-choice.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/fixtures/bot-scoring-snapshot.json` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/helpers/cr-numery-tabela.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/helpers/madness-priority.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m160-uwagi-wlasciciela.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m161-madness-spell-path.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m200-uwagi-wlasciciela.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m258-madness-kolejka.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m277-widok-render-kontrakt.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m359-bronze-cleanup-514.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m382-apnap-kolejnosc-triggerow.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/owner-cathartic-reunion-auto-discard.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/owner-discard-selection.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/pmssb10-ogon-wave-b2.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/pmssb4-zycie-wave-a.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/pmssb5-kontry-wave-a.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/pr66-audit-fixes.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/real-cards-batch54-auras.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/real-cards-batch7.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/real-cards-batch71.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/uwaga-2026-11-01-minimum-x.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/uwagi-2026-11-01-o-imp.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/uwagi-2026-11-01-p-fireball.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/uwagi-2026-11-01-r-bloodlust.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/uwagi-2026-11-02-austere-modal.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/uwagi-2026-11-02-manowar.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/zgloszenie-j-fledgling-imp-latanie.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/zgloszenie-n-magma-wybor-x.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/znaleziska-a4-madness-batch-x3.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
