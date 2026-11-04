# Mapa audytu scalonego PR #178

Źródło: pełna paginacja REST `pulls/178/files`: **194 pliki**, +14073/−523; PR ma 308 commitów. Baza `7aff9b6`, wynik scalenia `04ca8e9`. Diff pobrany przez `gh pr diff 178`.

**Stan: audyt częściowy.** Wszystkie 26 plików produkcyjnych ma przejrzany diff na poziomie zmienionych linii i wskazane ryzyka. Nie jest to dowód wszystkich interakcji. Testy i dokumentacja są zinwentaryzowane i uruchomione w bramie, ale ich pełny przegląd semantyczny pozostaje częściowo otwarty. 2026-11-04 przejrzano pełne pliki A10–A17 (30/30), A75–A93 (165/165), A94–A108 (82/82), A7–A9/A25–A34 (47/47), A35–A46 (73/73), A47–A58 (51/51), A59–A73 (79/79), bestow/champion/converge/klątwa/Morbid, M359/PR66/uwagi właściciela oraz pięć dokumentów historycznych; liczba otwartych wierszy spadła ze 114 do 6. Zielony pakiet nie zamyka semantyki pliku ani dawnego audytu.

| Plik | Kategoria | Stan audytu |
|---|---|---|
| `README.md` | dokumentacja | przejrzany diff; aktualizacja statusu PR/handoff, bez wpływu na runtime |
| `docs/ENGINE_MILESTONES.md` | dokumentacja | przejrzany diff; korekta opisu pomiaru wrath, bez wpływu na runtime |
| `docs/PMSSB.md` | dokumentacja | przejrzany diff; doprecyzowanie historii PMSSB-80, bez wpływu na runtime |
| `docs/PROJECT_HISTORY.md` | dokumentacja | przejrzany diff PR #178 i bieżące wpisy; zapisy historyczne A1–A113 oznaczone jako stan przeszły, aktualne sekcje PR #179 na górze |
| `docs/audits/AUDYT_PR177_2026-11-01.md` | dokumentacja | przejrzany diff PR #178; historyczny raport A1–A81 z jawnymi granicami, dodany banner stanu historycznego i odesłanie do PR #179 |
| `docs/audits/PR177_MAPA_PLIKOW_2026-11-02.md` | dokumentacja | przejrzany diff PR #178; historyczna mapa 111 plików #177, statusy cząstkowe nie są werdyktem obecnego drzewa, banner |
| `docs/audits/UWAGI_Z_GRY_2026-10-29.md` | dokumentacja | przejrzany diff; korekta opisu premii wrath, bez wpływu na runtime |
| `docs/audits/experiments/A107_NIE_WDRAZAC.patch` | dokumentacja | przejrzany pełny patch; izolowany eksperyment Ward/fingerprint, nie wdrożony |
| `docs/audits/experiments/A109_NIE_WDRAZAC.patch` | dokumentacja | przejrzany patch; izolowany eksperyment SBA/Ward, nie wdrożony |
| `docs/audits/experiments/A110_NIE_WDRAZAC.patch` | dokumentacja | przejrzany patch; izolowany eksperyment auto-mana, nie wdrożony |
| `docs/audits/experiments/A111_A112_NIE_WDRAZAC.patch` | dokumentacja | przejrzany patch; izolowany eksperyment LKI/batch, nie wdrożony |
| `docs/audits/experiments/A99_NIE_WDRAZAC.patch` | dokumentacja | przejrzany pełny patch; izolowany eksperyment odroczonych triggerów, nie wdrożony |
| `docs/audits/experiments/README_A107.md` | dokumentacja | przejrzany diff; opis izolowanego prototypu, NIE_WDRAŻAĆ |
| `docs/audits/experiments/README_A109.md` | dokumentacja | przejrzany diff; opis izolowanego prototypu, NIE_WDRAŻAĆ |
| `docs/audits/experiments/README_A110.md` | dokumentacja | przejrzany diff; opis izolowanego prototypu, NIE_WDRAŻAĆ |
| `docs/audits/experiments/README_A111_A112.md` | dokumentacja | przejrzany diff; opis izolowanego prototypu, NIE_WDRAŻAĆ |
| `docs/audits/experiments/README_A99.md` | dokumentacja | przejrzany diff; opis izolowanego prototypu, NIE_WDRAŻAĆ |
| `docs/plans/PLAN_2026-11-01-audyt-pr177.md` | dokumentacja | przejrzany diff PR #178; historyczny plan/postęp A1–A81, checkboxy nie są bieżącym backlogiem, banner i odesłanie do planu #178 |
| `docs/plans/PLAN_2026-11-01-minimalne-x-bota.md` | dokumentacja | przejrzany pełny nowy dokument; historyczny plan/wynik |
| `docs/plans/PLAN_2026-11-01-uwagi-o-p-r.md` | dokumentacja | przejrzany pełny nowy dokument; historyczny plan/wynik |
| `docs/plans/PLAN_2026-11-01-zgloszenie-magma-x.md` | dokumentacja | przejrzany pełny nowy dokument; historyczny plan/wynik |
| `docs/plans/PLAN_2026-11-02-uwagi-manowar-austere.md` | dokumentacja | przejrzany pełny nowy dokument; historyczny plan/wynik |
| `docs/setup/HANDOFF_2026-11-01-audyt-pr177.md` | dokumentacja | przejrzany diff PR #178; historyczny handoff sesji #177/#178, pomiary nieaktualne, banner i odesłanie do bieżącego handoffu |
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
| `test/audyt-pmssb81-koszt-kwalifikowany.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/audyt-pmssb86-pozostale-karty-batcha.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/audyt-pr146-predykat-pipow-jeden.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/audyt-pr176-o1-etykieta-saddle-po-aktywacji.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/audyt-pr177-a10-bestow-inwestycja.test.js` | test/fixture | przejrzany pełny test; bestow/inwestycja Edifice na rzeczywistych kartach, 3 warianty bot/payment, CR 702.103f, bez nowego błędu |
| `test/audyt-pr177-a100-ward-triggers.test.js` | test/fixture | przejrzany i naprawiony w PR #179; Imp/Forebear/aura nie kładą triggera podczas dopłaty Ward |
| `test/audyt-pr177-a101-reflexive-apnap.test.js` | test/fixture | przejrzany i skorygowany do CR 603.12/603.3b; refleks Zoraline w pierwszej partii APNAP, wybór kontrolera i replay |
| `test/audyt-pr177-a102-draw-apnap.test.js` | test/fixture | przejrzany i naprawiony w PR #179; dobór Lorescale Coatl i śmierć Sciona w jednej partii APNAP |
| `test/audyt-pr177-a103-second-draw-apnap.test.js` | test/fixture | przejrzany i naprawiony w PR #179; drugi dobór Jolrael i śmierć Sciona w jednej partii APNAP |
| `test/audyt-pr177-a104-flooding-apnap.test.js` | test/fixture | przejrzany i naprawiony w PR #179; Chronic Flooding czeka z wpisem, znaczy tapnięcie, APNAP po dopłacie |
| `test/audyt-pr177-a105-nanoform-apnap.test.js` | test/fixture | przejrzany i naprawiony w PR #179; cel Nanoform Sentinel czeka, limit raz na turę zachowany, APNAP i odtapowanie |
| `test/audyt-pr177-a106-ward-target-apnap.test.js` | test/fixture | przejrzany i naprawiony w PR #179; Ward z celu Nanoform czeka na koniec partii i leży nad APNAP, zapłata/odmowa |
| `test/audyt-pr177-a107-two-ward-apnap.test.js` | test/fixture | przejrzany i naprawiony w PR #179; dwa Ward z jednego checkpointu, kolejność kontrolera i replay w trakcie partii |
| `test/audyt-pr177-a108-ward-sba.test.js` | test/fixture | przejrzany i naprawiony w PR #179; aura nie umiera z SBA w środku Ward, śmierć i token po checkpointcie |
| `test/audyt-pr177-a109-ward-aura-sba.test.js` | test/fixture | przejrzany pełny test; otwarte RED SBA/Ward/LKI, bez lokalnej naprawy |
| `test/audyt-pr177-a11-powrot-kreatora.test.js` | test/fixture | przejrzany pełny test; powrót z zagnieżdżonego kreatora many, sesja + funkcje main.js, modal zamknięty/nadal widoczny, bez nowego błędu |
| `test/audyt-pr177-a110-auto-mana-events.test.js` | test/fixture | przejrzany pełny test; otwarte RED checkpointu/LKI/APNAP, bez lokalnej naprawy |
| `test/audyt-pr177-a111-imp-self-lki.test.js` | test/fixture | przejrzany pełny test; otwarte RED checkpointu/LKI/APNAP, bez lokalnej naprawy |
| `test/audyt-pr177-a112-imp-selhoff-apnap.test.js` | test/fixture | przejrzany pełny test; otwarte RED checkpointu/LKI/APNAP, bez lokalnej naprawy |
| `test/audyt-pr177-a113-mixed-combat-apnap.test.js` | test/fixture | przejrzany pełny test; otwarte RED checkpointu/LKI/APNAP, bez lokalnej naprawy |
| `test/audyt-pr177-a12-koszt-kwalifikowany.test.js` | test/fixture | przejrzany pełny test; kwalifikowany discard Vampire Hounds, wycena bota, ukryta ręka przeciwnika, jawny wariant dowolnej karty, bez nowego błędu |
| `test/audyt-pr177-a13-cel-lad-stwor.test.js` | test/fixture | przejrzany pełny test; cel Cutthroata po obrażeniach, animowany ląd, hexproof i ochrona, oferta bot vs legalność celu, bez nowego błędu |
| `test/audyt-pr177-a14-wynik-kreatora.test.js` | test/fixture | przejrzany pełny test; nieaktualny wariant convoke odrzucony bez fałszywego sukcesu, ważny wariant finalizuje, wyjątek sesji, bez nowego błędu |
| `test/audyt-pr177-a15-zarezerwowane-zrodla.test.js` | test/fixture | przejrzany pełny test; rezerwacja źródła convoke w kreatorze nadrzędnym i podrzędnym, źródło nie płaci samo za siebie, bez nowego błędu |
| `test/audyt-pr177-a16-improvise-kreator.test.js` | test/fixture | przejrzany pełny test; improvise płaci tylko generyczną część po ustaleniu kosztu, kicker/obniżka i nadmiar artefaktów, CR 702.126, bez nowego błędu |
| `test/audyt-pr177-a17-rozstrzygniecie-celow.test.js` | test/fixture | przejrzany pełny test; Tail Slash przy nielegalnych celach/ochronie/lifelink i Rockslide liczony przy rozstrzyganiu, CR 608.2b, bez nowego błędu |
| `test/audyt-pr177-a18-auto-platnosc-rodzic.test.js` | test/fixture | przejrzany pełny test; rezerwacje convoke w kreatorze many, bez nowego błędu |
| `test/audyt-pr177-a19-bezbarwne-zrodla.test.js` | test/fixture | przejrzany pełny test; koszt {C} i źródła bezbarwne, bez nowego błędu |
| `test/audyt-pr177-a20-platny-tryb-ladu.test.js` | test/fixture | przejrzany pełny test; płatny tryb bramy i wspólna rezerwacja, bez nowego błędu |
| `test/audyt-pr177-a21-bestow-na-stosie.test.js` | test/fixture | przejrzany pełny test; bestow na stosie i powrót linii typów, zgodne z B1 |
| `test/audyt-pr177-a22-bestow-ochrona-celu.test.js` | test/fixture | przejrzany pełny test; ochrona celu bestow, bez nowego błędu |
| `test/audyt-pr177-a23-koszt-bestow.test.js` | test/fixture | przejrzany pełny test; Powerstone/rabaty bestow, bez nowego błędu |
| `test/audyt-pr177-a25-violent-urge-delirium.test.js` | test/fixture | przejrzany pełny test; delirium Violent Urge liczone przy rozstrzyganiu, Halo Scarab/Shock w odpowiedzi, CR 608.2h |
| `test/audyt-pr177-a26-champion-kontrola.test.js` | test/fixture | przejrzany pełny test; champion przejmuje i wygania, powrót do właściciela, odmowa i Morbid |
| `test/audyt-pr177-a27-madness-priorytet.test.js` | test/fixture | przejrzany pełny test; madness/priorytet i okna odpowiedzi, bez nowego błędu |
| `test/audyt-pr177-a28-kolejnosc-madness.test.js` | test/fixture | przejrzany pełny test; wybór kolejności madness/APNAP, bot/replay/UI, bez nowego błędu |
| `test/audyt-pr177-a29-magma-real.test.js` | test/fixture | przejrzany pełny test; prewencja i refleks Magma Pummeler, Trigon/anihilacja to nie prewencja, Rockslide i Spin Out/LKI |
| `test/audyt-pr177-a30-dane-talie.test.js` | test/fixture | przejrzany pełny test; statyczne dane 10 kart względem CSV/snapshotów i talie względem generatora, bez runtime |
| `test/audyt-pr177-a31-champion-niecelujacy.test.js` | test/fixture | przejrzany pełny test; champion nie celuje (shroud), token nie wraca z exile, decyzja w replay/fingerprint |
| `test/audyt-pr177-a32-transform-real.test.js` | test/fixture | przejrzany pełny test; nazwy po transformacji Incubator/Scholar/Jill w sesji i etykietach |
| `test/audyt-pr177-a33-bounce-stun.test.js` | test/fixture | przejrzany pełny test; wycena Scorn nie premiuje wrogich stun/finality, własna aura i +1/+1 podnoszą wartość |
| `test/audyt-pr177-a34-sac-ochrona.test.js` | test/fixture | przejrzany pełny test; bot nie poświęca Weird przy hexproof/indestructible przeciw obrażeniom, poświęca przy wygnaniu/braku ochrony |
| `test/audyt-pr177-a35-banquet-real.test.js` | test/fixture | przejrzany pełny test; Wretched Banquet warunek przy rozstrzyganiu, odpowiedzi zmieniające moc i wycena Weird |
| `test/audyt-pr177-a36-reaver-finality.test.js` | test/fixture | przejrzany pełny test; Reaver finality/exile/grave, expectedZone opóźnionego triggera, Memory’s Journey i kontroler aktywacji |
| `test/audyt-pr177-a37-anticipate-real.test.js` | test/fixture | przejrzany pełny test; Anticipate nie dobiera, prywatność look-top, atomowa kolejność spodu, Inspiration dobiera; URL CR poprawiony |
| `test/audyt-pr177-a38-trumpet-real.test.js` | test/fixture | przejrzany pełny test; Trumpet Blast ustala zbiór atakujących, ninjutsu po efekcie bez bonusu, zmiana kontrolera i cleanup |
| `test/audyt-pr177-a39-tail-slash-real.test.js` | test/fixture | przejrzany pełny test; Tail Slash z lifelink/deathtouch/ochroną i odpowiedziami, nielegalne źródło/cel |
| `test/audyt-pr177-a40-champion-bot.test.js` | test/fixture | przejrzany pełny test; bot champion nie wygania tokena bez potrzeby, trwała strata tokena vs czasowa karty |
| `test/audyt-pr177-a41-blok-real.test.js` | test/fixture | przejrzany pełny test; realne bloki, flying/deathtouch, bot nie blokuje bez presji |
| `test/audyt-pr177-a42-curse-real.test.js` | test/fixture | przejrzany pełny test; klątwa mill nie przegrywa bez draw, Naturalize przed/po wyzwoleniu, presja deck-out |
| `test/audyt-pr177-a43-cutthroat-real.test.js` | test/fixture | przejrzany pełny test; Cutthroat po prawdziwym combacie/Shock, hexproof i własny stwór nie są celem |
| `test/audyt-pr177-a44-cuombajj-real.test.js` | test/fixture | przejrzany pełny test; Cuombajj dwa wystąpienia target, wybór przeciwnika, częściowa nielegalność celu |
| `test/audyt-pr177-a45-tail-bot-real.test.js` | test/fixture | przejrzany pełny test; bot Tail Slash wybiera źródło i nie marnuje czaru przy ochronie przed non-Human |
| `test/audyt-pr177-a46-blessing-combat-real.test.js` | test/fixture | przejrzany pełny test; Benevolent Blessing wybór koloru przez bota zależny od realnego źródła obrażeń |
| `test/audyt-pr177-a47-readme-decks.test.js` | test/fixture | przejrzany pełny test; statyczne wiersze README i odsyłacze audytu względem talii/plików, bez runtime |
| `test/audyt-pr177-a48-spire-real.test.js` | test/fixture | przejrzany pełny test; Rupture Spire jako trigger, odpowiedzi Fiery Fall i mana przed/po, automatyczne poświęcenie |
| `test/audyt-pr177-a49-proliferate-real.test.js` | test/fixture | przejrzany pełny test; proliferate po realnym infect, poison/-1/-1 i bot nie wzmacnia własnej szkody |
| `test/audyt-pr177-a50-final-parting-real.test.js` | test/fixture | przejrzany pełny test; Final Parting prywatność/tasowanie po dwóch wyborach, Caravan Vigil ujawnia, pusta biblioteka |
| `test/audyt-pr177-a51-edifice-real.test.js` | test/fixture | przejrzany pełny test; Edifice zapłata  życia i refleks, shield nie chroni przed 0 toughness, odpowiedź Crumb |
| `test/audyt-pr177-a52-counter-real.test.js` | test/fixture | przejrzany pełny test; bot kontruje realne czary, zachowuje Negate przy Twiddle, Steel Sabotage wybiera tryb |
| `test/audyt-pr177-a53-rockslide-real.test.js` | test/fixture | przejrzany pełny test; Rockslide liczy własne landy w chwili rozstrzygania, animacja/koszty/Regrowth w odpowiedzi |
| `test/audyt-pr177-a54-hounds-oracle.test.js` | test/fixture | przejrzany pełny test; Vampire Hounds bez many i limitu, discard tylko stwora, kumulacja +2/+2 |
| `test/audyt-pr177-a55-etykieta-tester-real.test.js` | test/fixture | przejrzany pełny test; etykieta Gila Courser saddle i limit logu, benchmark bez worków |
| `test/audyt-pr177-a56-violent-urge-real.test.js` | test/fixture | przejrzany pełny test; Violent Urge w realnej walce, delirium z własnego grobu, bot nie marnuje przed atakiem |
| `test/audyt-pr177-a57-zrodlo-ofiary-real.test.js` | test/fixture | przejrzany pełny test; źródło decyzji poświęcenia w zdarzeniu/logu, champion vs sacrifice, shroud i brak kandydatów |
| `test/audyt-pr177-a58-elk-real.test.js` | test/fixture | przejrzany pełny test; Dawntreader Elk koszt/tutor, brak zielonej many, pusta/cienka biblioteka i wycena |
| `test/audyt-pr177-a59-force-away-real.test.js` | test/fixture | przejrzany pełny test; Force Away bounce/ferocious przy rozstrzyganiu, odpowiedzi Shock/Brute Force i wycena |
| `test/audyt-pr177-a60-frightful-real.test.js` | test/fixture | przejrzany pełny test; Frightful Delusion kontra, zapłata 1 nie usuwa discardu, cel nielegalny przed rozstrzygnięciem |
| `test/audyt-pr177-a61-oak-token-real.test.js` | test/fixture | przejrzany pełny test; Ambassador Oak token i Ivy Lane Denizen, cudzy trigger, śmierć Oak nie cofa ETB |
| `test/audyt-pr177-a62-batch71-dane.test.js` | test/fixture | przejrzany pełny test; statyczne snapshoty batcha 71 i materializacja do talii, bez runtime Oracle |
| `test/audyt-pr177-a63-edifice-legalne-etb.test.js` | test/fixture | przejrzany pełny test; Edifice refleks i ochrona od czarnego, wycena oraz inny legalny cel |
| `test/audyt-pr177-a64-hounds-discard-real.test.js` | test/fixture | przejrzany pełny test; Hounds discard jako koszt w walce, wycena kart i dostępność kolorów |
| `test/audyt-pr177-a66-token-morbid-real.test.js` | test/fixture | przejrzany pełny test; token/unearth/finality a Morbid i śmierć, LKI zdarzeń, następna tura |
| `test/audyt-pr177-a67-spider-morbid.test.js` | test/fixture | przejrzany pełny test; Somberwald Spider Morbid przy cast/bond po śmierci tokena/unearth |
| `test/audyt-pr177-a68-scorn-aura-real.test.js` | test/fixture | przejrzany pełny test; Sea God’s Scorn zwraca host/aurę/łańcuch Feedback, SBA po rozstrzygnięciu |
| `test/audyt-pr177-a69-converge-free-real.test.js` | test/fixture | przejrzany pełny test; Kaleidoscorch liczy kolory wydane na ten czar, discover/free cast/flashback |
| `test/audyt-pr177-a7-ostrzezenie-animacji.test.js` | test/fixture | przejrzany pełny test; ostrzeżenia animacji/crew nie mylą ponownego odtapowania z obsadzeniem, realny Invoker i kreator crew |
| `test/audyt-pr177-a70-bounce-investment-real.test.js` | test/fixture | przejrzany pełny test; wycena bounce inwestycji, bestow zostaje stworem, living weapon/Germ |
| `test/audyt-pr177-a71-apnap-real.test.js` | test/fixture | przejrzany pełny test; realne karty, wybory/replay/bot, bez nowego błędu |
| `test/audyt-pr177-a72-shared-qualifier-real.test.js` | test/fixture | przejrzany pełny test; wspólny kwalifikator wyszukiwania i discardu, atomowe odrzucenie złej komendy |
| `test/audyt-pr177-a73-search-destination-real.test.js` | test/fixture | przejrzany pełny test; strefy docelowe wyszukiwania narzucone przez efekt, nie komendę gracza |
| `test/audyt-pr177-a75-apnap-land.test.js` | test/fixture | przejrzany pełny test; APNAP śmierci i celów lądowych Polluted Dead/Circle, replay, jawna granica syntetycznego Ward na lądzie |
| `test/audyt-pr177-a76-apnap-combat.test.js` | test/fixture | przejrzany pełny test; APNAP obrażeń bojowych, osobne okno first strike, jednoczesna śmierć, replay |
| `test/audyt-pr177-a77-apnap-activation.test.js` | test/fixture | przejrzany pełny test; APNAP po poświęceniu w koszcie Elk/Dreadmaw, Plague Reaver bez batcha śmierci, zdolność many Sciona |
| `test/audyt-pr177-a78-apnap-mana.test.js` | test/fixture | przejrzany pełny test; mana Sciona przy otwartym priorytecie w APNAP, granica podczas dopłaty Ward, replay |
| `test/audyt-pr177-a79-ward-manual.test.js` | test/fixture | przejrzany pełny test; ręczna dopłata Ward Scionem, atomowość niewystarczającej zapłaty, odmowa, celowana zdolność Justiciara, replay |
| `test/audyt-pr177-a8-priorytet-zagniezdzonej-many.test.js` | test/fixture | przejrzany pełny test; podrzędny kreator many nie auto-passuje nadrzędnego, priorytet/krok/pula zachowane |
| `test/audyt-pr177-a80-rupture-manual.test.js` | test/fixture | przejrzany pełny test; Rupture Spire i echo Bone Shreddera, ręczna mana, atomowość, kolorowy pip, kreator, replay |
| `test/audyt-pr177-a81-optional-manual.test.js` | test/fixture | przejrzany pełny test; opcjonalna dopłata Pangolin/Zoraline/Kappa, atomowość starej komendy, replay |
| `test/audyt-pr177-a82-wizard-colors.test.js` | test/fixture | przejrzany pełny test; kreator opisuje kolory Zoraline {W}{B} i echo {2}{B}, nie kończy się błędnymi wyspami, finalizacja z refleksem |
| `test/audyt-pr177-a83-colored-manual.test.js` | test/fixture | przejrzany pełny test; kolorowe echo/Forebear i Scion, brak zastąpienia kolorowego pipa, replay |
| `test/audyt-pr177-a84-ward-apnap.test.js` | test/fixture | przejrzany i naprawiony w PR #179; Ward nie miesza się z batchem Sciona, po dopłatach APNAP, 8/8 + mutacja + kontrole |
| `test/audyt-pr177-a85-holdout-pay.test.js` | test/fixture | przejrzany pełny test; Holdout produkuje {R} dla Panic Spellbomb przez tapnięcie stwora, brak stwora i wariant kreatora |
| `test/audyt-pr177-a86-wizard-auto-colors.test.js` | test/fixture | przejrzany pełny test; bramka kreatora rozróżnia automatyczną i ręczną osiągalność koloru, router main.js; komentarz odświeżony |
| `test/audyt-pr177-a87-wizard-cost-objects.test.js` | test/fixture | przejrzany pełny test; countPaymentVariants nie używa tego samego stwora jako koszt i źródło, dwa Holdouty; komentarz odświeżony |
| `test/audyt-pr177-a88-single-manual-color.test.js` | test/fixture | przejrzany pełny test; pojedynczy ręczny kolor osiągalny dopiero po aktywacji, atomowość zapłaty, boty, dwa pipy nie mnożą stworów |
| `test/audyt-pr177-a89-bot-payment.test.js` | test/fixture | przejrzany pełny test; bot najpierw aktywuje ręczne źródło, potem dopłaca; mana ograniczona i polityka refleksu bez celów |
| `test/audyt-pr177-a9-oplata-nieladowa.test.js` | test/fixture | przejrzany pełny test; Rupture Spire opłacany z Druida/Powerstone/many ograniczonej, choroba przywołania i bot |
| `test/audyt-pr177-a90-wizard-tap-cost.test.js` | test/fixture | przejrzany pełny test; router/DOM kreatora wybiera osobny koszt tapnięcia, odrzuca stare wybory, rezerwacje i replay |
| `test/audyt-pr177-a91-gate-cost-reservation.test.js` | test/fixture | przejrzany pełny test; Heap Gate rezerwuje Gate kosztu w kreatorze i potomku, target efektu nie jest kosztem, Holdout/Station, replay |
| `test/audyt-pr177-a92-stale-gate-atomicity.test.js` | test/fixture | przejrzany pełny test; przestarzała/nielegalna brama kosztu odrzucana atomowo, wydana mana i zmiana strefy, replay |
| `test/audyt-pr177-a93-animated-self-cost.test.js` | test/fixture | przejrzany pełny test; ożywiony Holdout nie płaci sobą przy własnym {T}, inny stwór i stare komendy, syntetyczna kontrola bez {T}, replay |
| `test/audyt-pr177-a94-optional-apnap.test.js` | test/fixture | przejrzany i skorygowany do CR; opcjonalna płatność nie blokuje zdolności many, cele czekają, odmowa i replay |
| `test/audyt-pr177-a95-ward-two-scions.test.js` | test/fixture | przejrzany pełny test; dwa Sciony finansują Ward, wybór celu/pass nie omija decyzji, replay |
| `test/audyt-pr177-a96-counter-two-scions.test.js` | test/fixture | przejrzany pełny test; dwa Sciony finansują kontrę Izzet Charm, odmowa i replay; komentarz nagłówka odświeżony |
| `test/audyt-pr177-a97-echo-two-scions.test.js` | test/fixture | przejrzany pełny test; dwa Sciony płacą echo {2}{B}, cel Selhoff nie blokuje many, replay; komentarz odświeżony |
| `test/audyt-pr177-a98-spellbomb-apnap.test.js` | test/fixture | przejrzany i naprawiony w PR #179; triggery Sciona czekają do końca dopłaty Spellbomb, potem APNAP |
| `test/audyt-pr177-bestow-typy.test.js` | test/fixture | przejrzany pełny test; bestow jako aura na polu i karta stwora poza nim, typy/LKI/fingerprint |
| `test/audyt-pr177-champion-na-stosie.test.js` | test/fixture | przejrzany pełny test; champion po śmierci źródła, wygnanie bez powrotu, kontroler zdolności i etykiety |
| `test/audyt-pr177-converge-dobor-many.test.js` | test/fixture | przejrzany pełny test; maksymalizacja kolorów many, restricted/hybrid/{C}, brute force małych pul |
| `test/audyt-pr177-klatwa-gracz-upkeep.test.js` | test/fixture | przejrzany pełny test; trigger klątwy niezależny od źródła i gracza upkeepu |
| `test/audyt-pr177-morbid-bestow.test.js` | test/fixture | przejrzany pełny test; bestow aura nie umiera jako stwór, LKI klasyfikuje śmierć |
| `test/batch39-kart.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/batch40-kart.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/batch41-kart.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/bot-scoring-snapshot.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/epic-experiment-sequential-choice.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/fixtures/bot-scoring-snapshot.json` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/helpers/cr-numery-tabela.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/helpers/madness-priority.js` | test/fixture | przejrzany helper; wybór kolejności i rundy priorytetu madness |
| `test/m160-uwagi-wlasciciela.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/m161-madness-spell-path.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m200-uwagi-wlasciciela.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m258-madness-kolejka.test.js` | test/fixture | przejrzany diff i ścieżka produkcji; kolejność madness zgodna z CR 603.3b/702.35 |
| `test/m277-widok-render-kontrakt.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/m359-bronze-cleanup-514.test.js` | test/fixture | przejrzany pełny test; pętla cleanup CR 514.3a, brak priorytetu w pustym cleanupie, obrażenia 514.2 |
| `test/m382-apnap-kolejnosc-triggerow.test.js` | test/fixture | przejrzany pełny test; APNAP/LIFO i wybór kolejności, bez nowego błędu |
| `test/owner-cathartic-reunion-auto-discard.test.js` | test/fixture | przejrzany diff; trigger madness po auto-discarcie, bez nowego błędu |
| `test/owner-discard-selection.test.js` | test/fixture | przejrzany diff; osobne triggery madness i wybór kolejności |
| `test/pmssb10-ogon-wave-b2.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/pmssb4-zycie-wave-a.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/pmssb5-kontry-wave-a.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/pr66-audit-fixes.test.js` | test/fixture | przejrzany pełny test; madness timing/oferta=walidacja, obowiązkowy cel ETB i etykieta karty |
| `test/real-cards-batch54-auras.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/real-cards-batch7.test.js` | test/fixture | otwarty — uruchomiony w bramie; przegląd asercji niedokończony |
| `test/real-cards-batch71.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/uwaga-2026-11-01-minimum-x.test.js` | test/fixture | przejrzany pełny test; strategia minimalnego X bota, legalne oferty człowieka, discover/Vaan |
| `test/uwagi-2026-11-01-o-imp.test.js` | test/fixture | przejrzany pełny test; kosztowny grant latania jako trik bojowy, wycena i wybór kosztu |
| `test/uwagi-2026-11-01-p-fireball.test.js` | test/fixture | przejrzany pełny test; próg X Fireballa w strategii bota bez zmiany ofert człowieka |
| `test/uwagi-2026-11-01-r-bloodlust.test.js` | test/fixture | przejrzany pełny test; badge wymogu ataku z aury w playerView/cardInfo/overlay |
| `test/uwagi-2026-11-02-austere-modal.test.js` | test/fixture | przejrzany pełny test; choose-two jako składniki, DOM i strażnik zakazanych kombinacji |
| `test/uwagi-2026-11-02-manowar.test.js` | test/fixture | przejrzany pełny test; Man-o’-War bot czeka bez wrogiego stwora, hexproof z Magic Damper |
| `test/zgloszenie-j-fledgling-imp-latanie.test.js` | test/fixture | przejrzany diff zmienionych asercji/kotwic; bez nowego błędu |
| `test/zgloszenie-n-magma-wybor-x.test.js` | test/fixture | przejrzany pełny test; modal X Magma Pummeler wybiera istniejące legalne komendy i kreator many |
| `test/znaleziska-a4-madness-batch-x3.test.js` | test/fixture | przejrzany diff; batch discard → triggery → decyzje, bez nowego błędu |
