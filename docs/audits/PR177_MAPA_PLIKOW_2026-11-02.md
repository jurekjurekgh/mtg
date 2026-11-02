# Mapa audytu diffu scalonego PR #177

Źródło: GitHub `pulls/177/files` (111 plików, 10 123 dodania, 361 usunięć). Stan: **audyt otwarty**. Oznaczenia dotyczą wyłącznie rzeczywistego zakresu opisanych ustaleń; „częściowo” NIE oznacza, że reszta pliku jest poprawna, a „otwarte” nie oznacza wykrycia błędu. Pełne dowody w `AUDYT_PR177_2026-11-01.md`.

Zakres: zmiany PR #177 i ich realne interakcje z kartami z katalogu. Bez nowych kart oraz implementacji hipotetycznych konfiguracji na przyszłość; w razie konieczności zostaje komentarz w kodzie. Osobne A24 Heap Gate z wcześniejszej fazy nie jest teraz kolejką.

| Plik z diffu #177 | Stan audytu |
|---|---|
| `README.md` | częściowo — aktualny status oraz liczności dziesięciu zmienionych talii A47; pozostała treść otwarta |
| `decks/alara.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/dominaria-brg.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/kaldheim.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/srodziemie.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/tarkir-wur.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/warhammer-ubr.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/worek-basni.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/worek-dziki.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/worek-legend.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `decks/worek-mroczny.txt` | częściowo — identyczna z bieżącym generatorem A30, bez oceny strategii |
| `docs/ENGINE_MILESTONES.md` | przejrzany diff M449–M462 jako zapis historyczny; rzeczywiste interakcje i poprawki A1–A64; sprostowano uogólnienie Reavera A65 |
| `docs/PMSSB.md` | przejrzany diff PMSSB-80–86 i rebaseline wcześniejszych; piny realnych kart A33/A36/A38/A49/A53/A54/A56/A64; sprecyzowany moment dodania Rockslide A65 |
| `docs/PROJECT_HISTORY.md` | przejrzany dodany zapis #177, nazwy kart i zakres funkcji porównane z diffem; wyniki historyczne nie są wynikami obecnego drzewa |
| `docs/audits/AUDYT_PR176_2026-10-27.md` | przejrzany dodany historyczny raport F1/O1–O3, realne nosiciele i granice A3/A29/A55; nie jest powtórnym audytem wszystkich plików PR #176 |
| `docs/audits/UWAGI_Z_GRY_2026-10-27c.md` | przejrzany historyczny zakres A–D, powiązane realne interakcje A8–A20/A41/A43/A44; dane pomiarów są historyczne |
| `docs/audits/UWAGI_Z_GRY_2026-10-29.md` | przejrzany historyczny zakres F–O i powiązane testy A4/A32–A37/A46/A48/A51/A63; sprostowany opis wyceny Reavera A65 |
| `docs/cards/scryfall-ambassador-oak.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-anticipate.json` | częściowo — nazwa, set, koszt A30; rzeczywisty Oracle i wybrane zachowania A37 ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-changeling-berserker.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-curse-of-the-bloody-tome.json` | częściowo — dane A30, Oracle i rzeczywisty upkeep/mill/draw A42 ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-rumbling-rockslide.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-sphinxs-herald.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-tail-slash.json` | częściowo — dane A30, Oracle/ruling i wybrane rzeczywiste przypadki A39 ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-trumpet-blast.json` | częściowo — dane A30 i wybrane realne zachowania A38 ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-vampire-hounds.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/cards/scryfall-violent-urge.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle ; A62: tekst i cechy zgodne z katalogiem i materializacją — zgodność ze snapshotem, nie dowód wszystkich interakcji |
| `docs/plans/PLAN_2026-10-27b-pmssb79-batch70.md` | przejrzany diff — status i historyczne piny B70, rzeczywisty Pummeler A29; bez ponownego uruchamiania historycznych pomiarów |
| `docs/plans/PLAN_2026-10-27c-audyt-pr176-petla-jakosci.md` | przejrzany dodany plan historyczny, skorelowany z diffem #177 i raportem; nie uznaje hipotetycznych nośników za realne karty |
| `docs/plans/PLAN_2026-10-30-batch71-kolekcja-625-634.md` | przejrzany plan i status historyczny, realne karty, koszty, generator oraz przykłady zachowania A30/A37–A40/A42/A53/A54/A56/A61/A62; deklaracja 100% nie dowodzi wszystkich interakcji |
| `docs/setup/HANDOFF_2026-10-27c.md` | przejrzany historyczny handoff, odniesienia do A–D/F–O i obszarów bez nośnika; stare liczby są pomiarem ówczesnego drzewa |
| `docs/setup/HANDOFF_2026-11-01.md` | przejrzany historyczny handoff batcha 71, zestaw kart A30/A62 i zmiany zachowania w A25–A64; stare wyniki nie oznaczają wyników obecnej wersji |
| `src/cards/card-data.js` | częściowo — batch 71, wybrane karty i Oracle; A17/A25 |
| `src/cards/mana-costs-data.js` | częściowo — 10 kosztów batcha 71 zgodnych ze snapshotami A30 |
| `src/controllers/heuristic-bot.js` | częściowo — Herald, discard, ETB, Edifice, Rupture Spire bounce oraz ochrona przed poświęceniem (A6/A9/A10/A12/A13/A33/A34/A35/A36/A40) |
| `src/controllers/heuristic-params.js` | częściowo — parametry bounce i znak stun/finality A33; inne otwarte |
| `src/engine/abilities.js` | częściowo — kwalifikowany discard (A12); migawka poświęcenia A66; interakcja madness A27/A28: okno i kolejność w opisanych przypadkach naprawione; inne ścieżki otwarte |
| `src/engine/counters.js` | częściowo — snapshot przy zdjęciu licznika i realny Pummeler/Trigon (A29); reszta otwarta |
| `src/engine/effects.js` | częściowo — champion, Curse, Rockslide, Violent Urge, Tail Slash (A1/A2/A17/A25/A26/A39), Final Parting A50; kontrakt wyboru poświęcenia A57, migawka ofiar Plague Reaver A66, cele Scorn/Curiosity/Feedback A68 |
| `src/engine/fingerprint.js` | częściowo — rzeczywista decyzja championa oraz oba wybory w replay A31; inne pola otwarte |
| `src/engine/game-state.js` | częściowo — Morbid, champion (A1/A4/A26); Morbid i unearth/token A66 oraz faktyczne wejście Spider A67; madness A27/A28: priorytet i wybór kolejności w badanych przypadkach naprawione; pełne APNAP otwarte; Final Parting privacy/tasowanie A50 |
| `src/engine/permanents.js` | częściowo — nazwy rzeczywistego tokena i DFC A32; prewencja i reszta otwarte |
| `src/engine/resources.js` | częściowo — Converge (A3), rzut płatny/darmowy i flashback na rzeczywistych kartach A69; zdarzenie ofiary tokena many zaopatrzono w migawkę A66, bez osobnego realnego scenariusza tej ścieżki |
| `src/engine/spells.js` | częściowo — nazwy transformu w scenariuszach realnych kart/tokena A32; koszt Village Rites i migawka tokena A66; inne ścieżki otwarte |
| `src/engine/state-based.js` | częściowo — token wygnany przez championa, anihilacja Magmy A29/A31; migawka ofiary Sagi A66 bez osobnego realnego testu tej ścieżki; inne ścieżki otwarte |
| `src/engine/triggers.js` | częściowo — Morbid, upkeep Curse (A2/A4); zdarzenia śmierci/token/unearth A66; counter removal częściowo: realny Pummeler/Trigon/Rockslide (A29); inne ścieżki otwarte |
| `src/table/main.js` | częściowo — kreator podrzędny i rezerwacje (A8/A11/A14–A20) |
| `src/table/render.js` | częściowo — ostrzeżenia animacji (A7) |
| `test/art-ids-tool.test.js` | przejrzany diff — wzrost liczby wpisów i zgodność CSV/ID A30/A62 |
| `test/audyt-batch71-b5-dowiazania.test.js` | częściowo — wycena championa i tokena na realnych kartach A40; inne wiązania otwarte |
| `test/audyt-bot-walka-remisy.test.js` | częściowo — pokrewny zestaw i realne scenariusze A41, pozostałe remisy otwarte |
| `test/audyt-katalog-dane-vs-snapshoty.test.js` | przejrzany diff — przyrost pokrycia o 10 snapshotów i token, A30/A62; wynik łącznie 631 par i jawne wyjątki |
| `test/audyt-pmssb1-bounce.test.js` | częściowo — pokrewne i rzeczywiste scenariusze bounce A33; Scorn na hoście i aurach A68 |
| `test/audyt-pmssb18-proliferate.test.js` | częściowo — rzeczywisty infect, poison, −1/−1 i wybór Courage/proliferate A49 |
| `test/audyt-pmssb19-search.test.js` | częściowo — zmiana wyceny Elka z #177 sprawdzona w realnej aktywacji i cienkiej bibliotece A58; inne tutory otwarte |
| `test/audyt-pmssb25-discard.test.js` | przejrzany diff — zmiana wagi niegrywalnej karty, sprawdzona na rzeczywistym koszcie Hounds A64 |
| `test/audyt-pmssb26-land-drabina.test.js` | przejrzany diff — zmiana wagi niegrywalnej karty, kontrola z dostępem i bez dostępu do koloru A64 |
| `test/audyt-pmssb60-batch65.test.js` | częściowo — część Edifice skonfrontowana z rzeczywistymi celami A51; pozostałe ścieżki otwarte |
| `test/audyt-pmssb80-kwota-z-landow.test.js` | częściowo — realne cele, progi i ląd-stwór A53; inne scenariusze otwarte |
| `test/audyt-pmssb81-koszt-kwalifikowany.test.js` | częściowo — sprostowany błędny cytat Oracle #177; rzeczywista legalność i dwie aktywacje A54, selekcja bota częściowo A12/A27 |
| `test/audyt-pmssb82-delirium-trik.test.js` | częściowo — A25 czas delirium, A56 rzeczywista walka i wybór bota z łącznym first/double strike; inne warianty otwarte |
| `test/audyt-pmssb83-klatwa-mill.test.js` | częściowo — realne biblioteki, wybór, mill, draw i Naturalize A42 |
| `test/audyt-pmssb84-champion-okno.test.js` | częściowo — realne shroud, token i replay A31; rzeczywiste wybory bota i poprawka tokena A40 |
| `test/audyt-pmssb85-pump-atakujacych.test.js` | częściowo — realni atakujący, bot, ninjutsu, zmiana kontroli i cleanup A38 |
| `test/audyt-pmssb86-pozostale-karty-batcha.test.js` | częściowo — realna wycena Tail Slash, deathtouch i ochrona źródła A45; pozostałe testy otwarte |
| `test/audyt-pr149-stempel-wygnania.test.js` | przejrzany diff — zmiana pinu kosztu bloku o +2, realna walka A41; nie cały plik |
| `test/audyt-pr176-f1-prewencja-licznikow-sprzet.test.js` | przejrzany diff — wyłącznie syntetyczny nośnik grantu, brak realnego sprzętu; własny Magma Pummeler A29 |
| `test/audyt-pr176-o1-etykieta-saddle-po-aktywacji.test.js` | przejrzany diff — prawdziwa etykieta karty i helper transkryptu A55, bez pełnej przeglądarki |
| `test/audyt-pr176-o2-converge-platnosc-kolorow.test.js` | przejrzany diff — rzeczywisty Kaleidoscorch i poprawka wyboru płatności A3 |
| `test/audyt-pr177-a-etb-uszkodzenie-w-turze.test.js` | częściowo — rzeczywiste obrażenia bojowe, Shock i Magic Damper A43 |
| `test/audyt-pr177-c-blok-bezkosztowy.test.js` | częściowo — realny bezkosztowy blok i antykontrole A41 |
| `test/audyt-pr177-d-cuombajj-wycena.test.js` | częściowo — rzeczywiste obrażenia, aktywacja i wybór drugiego celu, częściowa nielegalność A44 |
| `test/audyt-pr177-mana-wizard-koszt-aktywacji.test.js` | częściowo — rzeczywisty kreator i regresje kosztów / powrotu A8/A11/A14–A20; nie pełna przeglądarkowa macierz |
| `test/audyt-typy-efektow-katalogu.test.js` | przejrzany diff — wzrost liczby rodzajów efektów o champion, realne przypadki A1/A26/A31/A40 |
| `test/bot-modal-modes.test.js` | częściowo — porównanie kontr i odbicia Steel Sabotage na realnych kartach A52; inne tryby otwarte |
| `test/bot-params.test.js` | przejrzany diff: wagi kontry i bounce, rzeczywiste kontry A52/A60, Force Away A59; reszta testu poza diffem |
| `test/bot-scoring-snapshot.test.js` | przejrzany diff i sprostowana interpretacja wybranej decyzji; pełne ślady 6 partii przed i po batch 71 A65, bieżąca jakość poza golden masterem |
| `test/druki-druga-strona-i-uuid-obrazu.test.js` | przejrzany diff — wyłącznie komentarz o pustej liście snapshotów w toku |
| `test/f-morbid-kreatura-zginela.test.js` | częściowo — źródłowy tracker #177 oraz realne bestow/death/Morbid A4/A5 |
| `test/fixtures/bot-scoring-snapshot.json` | przejrzany diff; pełne ślady 6 partii odtworzone z commitów a55693c/86b25b9 i hashe zgodne A65, nie dowód optymalności bota |
| `test/g-sea-gods-scorn-ranking.test.js` | częściowo — realne stun/finality/aury A33, rzeczywista selekcja, bestow i living weapon A70 |
| `test/h-incubator-nazwa-po-transformacji.test.js` | częściowo — porównany z realnymi Merciless Repurposing, Scholar, Jill i sesją stołu A32 |
| `test/helpers/cr-numery-tabela.js` | przejrzany diff — data i 108.1, 303.4b, 702.72a porównane z plikiem CR o wskazanym SHA A62 |
| `test/i-poswiecenie-stwora.test.js` | częściowo — rzeczywiste Spellkeeper Weird, hexproof, protekcja, niezniszczalność i wygnanie A34; inne zagrożenia otwarte |
| `test/j-benevolent-blessing-kolor.test.js` | częściowo — realne ataki/bloki, kolor, obrażenia i Tail Slash A46 |
| `test/k-rupture-spire-etb-oplata.test.js` | częściowo — realny Druid, opłata i odpowiedź Fiery Fall A48 |
| `test/katalog-pole-plan.test.js` | przejrzany diff — wzrost liczby tokenów bez planu o Elf Warrior, A61/A62 |
| `test/l-ambulatory-edifice-debuff.test.js` | częściowo — realne cele, decyzja płatności/refleks, shield i odpowiedź A51; A63: wycena rzutu z rzeczywistą ochroną poprawiona (brak sprzed #177); inne przypadki otwarte |
| `test/m-lorescale-coatl-obowiazkowy.test.js` | częściowo — Oracle, rzeczywisty Anticipate nie dobiera, Inspiration daje dwa obowiązkowe triggery A37 |
| `test/m348-przerwanie-kreatora-many.test.js` | przejrzany diff — wstrzymanie priorytetu i kreator z kosztową aktywacją A8/A11 |
| `test/n-wretched-banquet-least-power.test.js` | częściowo — rzeczywiste cele, remis, liczniki i odpowiedzi oraz koszt poświęcenia A35 |
| `test/o-plague-reaver-darowanie.test.js` | częściowo — rzeczywisty próg 12/13, Zoraline/finality, odpowiedzi i przekazanie A36; inne przypadki bota otwarte |
| `test/o3-trigger-counter-removed.test.js` | częściowo — porównany z rzeczywistym Pummelerem i Trigonem w A29; syntetyczny nosiciel ogólny nie jest dowodem realnej karty |
| `test/o5-tester-etykiety-logu.test.js` | częściowo — helper granice i rzeczywista etykieta Gila Courser A55 |
| `test/obiekty-wsparcia-poza-rejestrem.test.js` | przejrzany diff — wyłącznie komentarz o zakończeniu batcha 71, strażnik bez zmian |
| `test/panel-rozgrywka-tura-przeciwnika.test.js` | przejrzany diff reseedu do realnej talii; test slow po A63 i ponownie related A65; nie pełny test interfejsu przeglądarki |
| `test/pmssb10-ogon-wave-b2.test.js` | częściowo — zmieniony pin Reaver i realne karty A36; uwaga o niejednakowej sumie 74,71/78,31 w przeglądzie dokumentacji |
| `test/pmssb12-pay-wave-a.test.js` | przejrzany diff — brak many i prawdziwe inne źródła Rupture Spire A9/A48 |
| `test/pmssb3-draw-wave-b.test.js` | częściowo — rzeczywista decyzja Force Away i ferocious po zmianie inwestycji A59; inne draw otwarte |
| `test/pmssb5-kontry-wave-a.test.js` | częściowo — Negate, Steel Sabotage, prawdziwy stos i wybory bota A52; inne warianty otwarte |
| `test/pmssb6-discard-wave-a.test.js` | częściowo — realna kontra Frightful Delusion, wycena #177 i rider odrzutu A60; pozostałe discard otwarte |
| `test/pmssb8-loot-wave-a.test.js` | częściowo — Force Away: dobór/odrzut i warunek z realnymi kartami A59; inne loot otwarte |
| `test/real-cards-batch65.test.js` | przejrzany diff — płatność Edifice na realnych celach i ochrona A51/A63 |
| `test/real-cards-batch71.test.js` | częściowo — wybrane testy kart i mechanik, bez oceny całości |
| `test/statusy-wpisow-katalogu.test.js` | przejrzany diff — wzrost liczby tokenów o Elf Warrior A61/A62 |
| `tools/benchmark.mjs` | częściowo — cały diff #177 to tekst help; liczba 27 i 4 seedy sprawdzone bez uruchomienia benchmarku A55 |
| `tools/collection-art-ids.csv` | częściowo — 625–634 zgodne z katalogiem/snapshotami A30 |
| `tools/generate-plan-decks.mjs` | częściowo — wynik 31 talii identyczny z plikami A30, semantyka i strategia nie wyczerpane |
| `tools/table-tester/labels.mjs` | częściowo — cała nowa funkcja i rzeczywista etykieta A55; bez partii przeglądarkowej |
| `tools/table-tester/run-game.mjs` | częściowo — obie zmienione linie #177 przekazują etykiety do helpera; bez partii przeglądarkowej A55 |
| `tools/tune-card.mjs` | częściowo — rejestr parametrów bounce z #177, A33; działanie tunera otwarte |

A34: rzeczywiste komendy Spellkeeper Weird + Magic Damper/Benevolent Blessing/Crumb and Get It wobec Fiery Fall, Expunge i Merciless Repurposing; poprawiono fałszywą „pewną śmierć” w heurystyce (szczegóły i granice w raporcie). Plik heurystyki nadal tylko częściowo sprawdzony.

A35: rzeczywiste Wretched Banquet, Spellkeeper Weird, Fleeting Distraction, Fleeting Flight i Crumb and Get It; naprawiono dodatkowy błąd oceny warunkowego zniszczenia. Semantyka pozostałych wariantów nadal otwarta.

A36: rzeczywista Zoraline i Plague Reaver — poprawki powrotu po finality i kontrolera opóźnionej zdolności, odsłonięte przez testowanie wyboru z #177 O. Nie są uznane za nowe regresje #177 bez dowodu; dalsze ścieżki silnika pozostają otwarte.

A37: Anticipate 0–4 kart biblioteki z rzeczywistym Lorescale Coatl, prawdziwy dobór przez Inspiration, kolejność spodu, atomowość i prywatność widoku/logu. Inne interakcje kart batcha 71 nadal otwarte.

A38: rzeczywisty Trumpet Blast i Kappa/ninjutsu, kontrola Trostani, bot w obu turach oraz cleanup; zakres testowany, pozostałe scenariusze otwarte.

A39: Tail Slash na rzeczywistych Child of Night, Deadly Recluse, Brute Force, Spare from Evil, Shock i Magic Damper; legalność celów i cechy źródła w wybranych przypadkach, nie cała macierz.

A40: rzeczywisty wybór hosta championa, token Elf Warrior nie wraca, poprawka rabatu wygnania tokena; pozostałe stany i wiązania otwarte.

A41: realne ataki, blok bezkosztowy, latanie i deathtouch, wybór bota i obrażenia; inne warianty walki otwarte.

A42: realny Curse i biblioteki, wybór/wycena bota, deck-out na draw, Naturalize przed/po wyzwoleniu; pozostałe przypadki otwarte.

A43: realny Cutthroat, walka i Shock, własny przeciwny cel oraz hexproof, wybór i rzeczywisty trigger; inne scenariusze otwarte.

A44: Cuombajj Witches, prawdziwe obrażenia, wybór przeciwnika, dwukrotne wskazanie celu i utrata legalności; inne scenariusze otwarte.

A45: Tail Slash na rzeczywistych kartach, RED→GREEN braku uwzględnienia ochrony przed źródłem w wycenie bite; pozostałe warianty otwarte.

A46: flash Benevolent Blessing, prawdziwy blok i atak, kolor względem źródła Tail Slash; pozostałe stany walki otwarte.

A47: tabela dziesięciu zmienionych talii i aktualizacja nieaktualnego punktu zaczepienia README, z zachowaniem historycznych wyników #177.

A48: Rupture Spire z rzeczywistą odpowiedzią na trigger i produkcją many, bez pełnego audytu wszystkich źródeł.

A49: rzeczywisty infect, dwa rodzaje liczników i wybór proliferate bota; inne warianty otwarte.

A50: rzeczywiste Final Parting, prywatność i jedno tasowanie naprawione (błędy już w bazie #177); pozostałe wyszukiwania i wyceny otwarte.

A51: bezpośredni diff #177 L, rzeczywisty Edifice i decyzja bota; inne przypadki otwarte.

A52: bezpośredni diff #177 G, waga kontry i realny stos — pięć przypadków, mutacja wagi wykryta.

A53: bezpośredni diff #177 PMSSB-80, sześć realnych scenariuszy Rockslide; dwie mutacje wykryte.

A54: sprostowany błędny cytat Oracle Vampire Hounds w teście #177; rzeczywista legalność dwóch aktywacji, dwie mutacje wykryte.

A55: Gila label, rzeczywiste karty i mutacja; bez dowodu działania przeglądarki.

A56: Violent Urge, prawdziwe komendy walki i bota, dwie mutacje; pozostałe stany otwarte.

A57: źródło decyzji o ofierze naprawione dla Liliana’s Triumph i Grave Exchange; defekt sprzed #177.

A58: Dawntreader Elk, rzeczywista ofiara/wyszukiwanie, wybór bota i mutacja kosztu.

A59: Force Away, realny wybór celu bota i ferocious także przy odpowiedzi, mutacja wagi.

A60: Frightful Delusion, realny stos, płatność i odrzut, bot oraz mutacja wagi; pozostałe przypadki otwarte.

A61: Ambassador Oak z Ivy Lane Denizen, prawdziwy token i dwa wyzwolenia oraz niezależność ETB od źródła; nie pełny audyt batch 71.

A62: dziesięć kart — porównanie ze snapshotami i instalacja rzeczywistej talii; zmienione strażniki katalogu, tokena, CSV i trzy nowe numery CR z #177. Zgodność ze snapshotem nie jest osobną weryfikacją aktualności źródła ani kompletnym dowodem mechanik.

A63: realna ochrona Benevolent Blessing blokuje czarną zdolność Edifice; naprawiono przewidywanie wartości i rzeczywisty wybór bota, z porównaniem bazy #177.

A64: kwalifikowany odrzut Hounds w rzeczywistej walce i różnicowanie kart bez koloru, obie kolejności oraz kontrola z Forest.

A65: odtworzone wszystkie 6 śladów golden-master przed i po batchu, sprostowana przyczyna zmiany scoreSum i nadmierne uogólnienie Reavera; przegląd historycznych raportów/planów bez udawania pomiaru bieżącej jakości.

A66–A67: token, finality i unearth — sprawdzono obie istniejące karty Morbid, Caravan Vigil i Somberwald Spider, zarówno rzut Spider, jak i Unbreakable Bond; wykryto regresję #177 i starszy defekt tokena. Pozostałe ścieżki poza opisanym zakresem są otwarte.

A68: realny Sea God’s Scorn i Curiosity/Feedback: odbicie wybranych aur i hosta niezależnie od kolejności, rzeczywisty wybór bota i kontrola po Magic Damper; wada sprzed #177. Generyczna jednoczesność/LKI dla wszystkich efektów pozostaje otwarta.

A69: Converge Kaleidoscorch — rzut płatny, flashback oraz darmowe rzuty Appraiser/Halo Forager/Epic Experiment; dwie mutacje wykryte. Nie badano wszystkich możliwych mechanik darmowego rzutu.

A70: Sea God’s Scorn, realny ranking czterech stworów i Curiosity; bestow Dryad i living weapon Strandwalker po odbiciu, porównane wagi. To wybrane scenariusze, nie pełna optymalność bota.
