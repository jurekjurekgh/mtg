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
| `docs/ENGINE_MILESTONES.md` | otwarte |
| `docs/PMSSB.md` | otwarte |
| `docs/PROJECT_HISTORY.md` | otwarte |
| `docs/audits/AUDYT_PR176_2026-10-27.md` | otwarte |
| `docs/audits/UWAGI_Z_GRY_2026-10-27c.md` | otwarte |
| `docs/audits/UWAGI_Z_GRY_2026-10-29.md` | otwarte |
| `docs/cards/scryfall-ambassador-oak.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle |
| `docs/cards/scryfall-anticipate.json` | częściowo — nazwa, set, koszt A30; rzeczywisty Oracle i wybrane zachowania A37 |
| `docs/cards/scryfall-changeling-berserker.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle |
| `docs/cards/scryfall-curse-of-the-bloody-tome.json` | częściowo — dane A30, Oracle i rzeczywisty upkeep/mill/draw A42 |
| `docs/cards/scryfall-rumbling-rockslide.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle |
| `docs/cards/scryfall-sphinxs-herald.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle |
| `docs/cards/scryfall-tail-slash.json` | częściowo — dane A30, Oracle/ruling i wybrane rzeczywiste przypadki A39 |
| `docs/cards/scryfall-trumpet-blast.json` | częściowo — dane A30 i wybrane realne zachowania A38 |
| `docs/cards/scryfall-vampire-hounds.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle |
| `docs/cards/scryfall-violent-urge.json` | częściowo — nazwa, set i koszt względem katalogu A30; nie pełne Oracle |
| `docs/plans/PLAN_2026-10-27b-pmssb79-batch70.md` | otwarte |
| `docs/plans/PLAN_2026-10-27c-audyt-pr176-petla-jakosci.md` | otwarte |
| `docs/plans/PLAN_2026-10-30-batch71-kolekcja-625-634.md` | otwarte |
| `docs/setup/HANDOFF_2026-10-27c.md` | otwarte |
| `docs/setup/HANDOFF_2026-11-01.md` | otwarte |
| `src/cards/card-data.js` | częściowo — batch 71, wybrane karty i Oracle; A17/A25 |
| `src/cards/mana-costs-data.js` | częściowo — 10 kosztów batcha 71 zgodnych ze snapshotami A30 |
| `src/controllers/heuristic-bot.js` | częściowo — Herald, discard, ETB, Edifice, Rupture Spire bounce oraz ochrona przed poświęceniem (A6/A9/A10/A12/A13/A33/A34/A35/A36/A40) |
| `src/controllers/heuristic-params.js` | częściowo — parametry bounce i znak stun/finality A33; inne otwarte |
| `src/engine/abilities.js` | częściowo — kwalifikowany discard (A12); interakcja madness A27/A28: okno i kolejność w opisanych przypadkach naprawione; inne ścieżki otwarte |
| `src/engine/counters.js` | częściowo — snapshot przy zdjęciu licznika i realny Pummeler/Trigon (A29); reszta otwarta |
| `src/engine/effects.js` | częściowo — champion, Curse, Rumbling Rockslide, Violent Urge, Tail Slash na rzeczywistych kartach (A1/A2/A17/A25/A26/A39), Final Parting A50 |
| `src/engine/fingerprint.js` | częściowo — rzeczywista decyzja championa oraz oba wybory w replay A31; inne pola otwarte |
| `src/engine/game-state.js` | częściowo — Morbid, champion (A1/A4/A26); madness A27/A28: priorytet i wybór kolejności w badanych przypadkach naprawione; pełne APNAP otwarte; Final Parting privacy/tasowanie A50 |
| `src/engine/permanents.js` | częściowo — nazwy rzeczywistego tokena i DFC A32; prewencja i reszta otwarte |
| `src/engine/resources.js` | częściowo — Converge (A3) |
| `src/engine/spells.js` | częściowo — nazwy transformu w scenariuszach realnych kart/tokena A32; inne ścieżki otwarte |
| `src/engine/state-based.js` | częściowo — token wygnany przez championa, anihilacja Magmy A29/A31; inne ścieżki otwarte |
| `src/engine/triggers.js` | częściowo — Morbid, upkeep Curse (A2/A4); counter removal częściowo: realny Pummeler/Trigon/Rockslide (A29); inne ścieżki otwarte |
| `src/table/main.js` | częściowo — kreator podrzędny i rezerwacje (A8/A11/A14–A20) |
| `src/table/render.js` | częściowo — ostrzeżenia animacji (A7) |
| `test/art-ids-tool.test.js` | częściowo — pokrewne testy i 625–634 A30 |
| `test/audyt-batch71-b5-dowiazania.test.js` | częściowo — wycena championa i tokena na realnych kartach A40; inne wiązania otwarte |
| `test/audyt-bot-walka-remisy.test.js` | częściowo — pokrewny zestaw i realne scenariusze A41, pozostałe remisy otwarte |
| `test/audyt-katalog-dane-vs-snapshoty.test.js` | otwarte |
| `test/audyt-pmssb1-bounce.test.js` | częściowo — pokrewne i rzeczywiste scenariusze bounce A33 |
| `test/audyt-pmssb18-proliferate.test.js` | częściowo — rzeczywisty infect, poison, −1/−1 i wybór Courage/proliferate A49 |
| `test/audyt-pmssb19-search.test.js` | otwarte |
| `test/audyt-pmssb25-discard.test.js` | otwarte |
| `test/audyt-pmssb26-land-drabina.test.js` | otwarte |
| `test/audyt-pmssb60-batch65.test.js` | częściowo — część Edifice skonfrontowana z rzeczywistymi celami A51; pozostałe ścieżki otwarte |
| `test/audyt-pmssb80-kwota-z-landow.test.js` | otwarte |
| `test/audyt-pmssb81-koszt-kwalifikowany.test.js` | otwarte |
| `test/audyt-pmssb82-delirium-trik.test.js` | częściowo — warunek delirium wyceny; A25 sprawdza czas na prawdziwych kartach |
| `test/audyt-pmssb83-klatwa-mill.test.js` | częściowo — realne biblioteki, wybór, mill, draw i Naturalize A42 |
| `test/audyt-pmssb84-champion-okno.test.js` | częściowo — realne shroud, token i replay A31; rzeczywiste wybory bota i poprawka tokena A40 |
| `test/audyt-pmssb85-pump-atakujacych.test.js` | częściowo — realni atakujący, bot, ninjutsu, zmiana kontroli i cleanup A38 |
| `test/audyt-pmssb86-pozostale-karty-batcha.test.js` | częściowo — realna wycena Tail Slash, deathtouch i ochrona źródła A45; pozostałe testy otwarte |
| `test/audyt-pr149-stempel-wygnania.test.js` | otwarte |
| `test/audyt-pr176-f1-prewencja-licznikow-sprzet.test.js` | otwarte |
| `test/audyt-pr176-o1-etykieta-saddle-po-aktywacji.test.js` | otwarte |
| `test/audyt-pr176-o2-converge-platnosc-kolorow.test.js` | otwarte |
| `test/audyt-pr177-a-etb-uszkodzenie-w-turze.test.js` | częściowo — rzeczywiste obrażenia bojowe, Shock i Magic Damper A43 |
| `test/audyt-pr177-c-blok-bezkosztowy.test.js` | częściowo — realny bezkosztowy blok i antykontrole A41 |
| `test/audyt-pr177-d-cuombajj-wycena.test.js` | częściowo — rzeczywiste obrażenia, aktywacja i wybór drugiego celu, częściowa nielegalność A44 |
| `test/audyt-pr177-mana-wizard-koszt-aktywacji.test.js` | otwarte |
| `test/audyt-typy-efektow-katalogu.test.js` | otwarte |
| `test/bot-modal-modes.test.js` | częściowo — porównanie kontr i odbicia Steel Sabotage na realnych kartach A52; inne tryby otwarte |
| `test/bot-params.test.js` | otwarte |
| `test/bot-scoring-snapshot.test.js` | otwarte |
| `test/druki-druga-strona-i-uuid-obrazu.test.js` | otwarte |
| `test/f-morbid-kreatura-zginela.test.js` | otwarte |
| `test/fixtures/bot-scoring-snapshot.json` | otwarte |
| `test/g-sea-gods-scorn-ranking.test.js` | częściowo — realne stun/finality/aury, wybór i rozstrzygnięcie A33 |
| `test/h-incubator-nazwa-po-transformacji.test.js` | częściowo — porównany z realnymi Merciless Repurposing, Scholar, Jill i sesją stołu A32 |
| `test/helpers/cr-numery-tabela.js` | otwarte |
| `test/i-poswiecenie-stwora.test.js` | częściowo — rzeczywiste Spellkeeper Weird, hexproof, protekcja, niezniszczalność i wygnanie A34; inne zagrożenia otwarte |
| `test/j-benevolent-blessing-kolor.test.js` | częściowo — realne ataki/bloki, kolor, obrażenia i Tail Slash A46 |
| `test/k-rupture-spire-etb-oplata.test.js` | częściowo — realny Druid, opłata i odpowiedź Fiery Fall A48 |
| `test/katalog-pole-plan.test.js` | otwarte |
| `test/l-ambulatory-edifice-debuff.test.js` | częściowo — realne cele, decyzja płatności/refleks, shield i odpowiedź A51; wycena rzutu i inne przypadki otwarte |
| `test/m-lorescale-coatl-obowiazkowy.test.js` | częściowo — Oracle, rzeczywisty Anticipate nie dobiera, Inspiration daje dwa obowiązkowe triggery A37 |
| `test/m348-przerwanie-kreatora-many.test.js` | otwarte |
| `test/n-wretched-banquet-least-power.test.js` | częściowo — rzeczywiste cele, remis, liczniki i odpowiedzi oraz koszt poświęcenia A35 |
| `test/o-plague-reaver-darowanie.test.js` | częściowo — rzeczywisty próg 12/13, Zoraline/finality, odpowiedzi i przekazanie A36; inne przypadki bota otwarte |
| `test/o3-trigger-counter-removed.test.js` | częściowo — porównany z rzeczywistym Pummelerem i Trigonem w A29; syntetyczny nosiciel ogólny nie jest dowodem realnej karty |
| `test/o5-tester-etykiety-logu.test.js` | otwarte |
| `test/obiekty-wsparcia-poza-rejestrem.test.js` | otwarte |
| `test/panel-rozgrywka-tura-przeciwnika.test.js` | otwarte |
| `test/pmssb10-ogon-wave-b2.test.js` | otwarte |
| `test/pmssb12-pay-wave-a.test.js` | otwarte |
| `test/pmssb3-draw-wave-b.test.js` | otwarte |
| `test/pmssb5-kontry-wave-a.test.js` | częściowo — Negate, Steel Sabotage, prawdziwy stos i wybory bota A52; inne warianty otwarte |
| `test/pmssb6-discard-wave-a.test.js` | otwarte |
| `test/pmssb8-loot-wave-a.test.js` | otwarte |
| `test/real-cards-batch65.test.js` | otwarte |
| `test/real-cards-batch71.test.js` | częściowo — wybrane testy kart i mechanik, bez oceny całości |
| `test/statusy-wpisow-katalogu.test.js` | otwarte |
| `tools/benchmark.mjs` | otwarte |
| `tools/collection-art-ids.csv` | częściowo — 625–634 zgodne z katalogiem/snapshotami A30 |
| `tools/generate-plan-decks.mjs` | częściowo — wynik 31 talii identyczny z plikami A30, semantyka i strategia nie wyczerpane |
| `tools/table-tester/labels.mjs` | otwarte |
| `tools/table-tester/run-game.mjs` | otwarte |
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
