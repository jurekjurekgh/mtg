# Roadmapa

**Aktualizacja 2026-08-08:** 158 kart supported, 9 talii singleton, 1084/1084 testów, 49 modułów / 1172.0 kB, B0 (9 talii / 50 seedów / 13 500 meczów) heuristic 90.4% vs random, 61.8% vs aggro (progi 0.78/0.57 utrzymane) + M52 (Batch 22) + M53 (Batch 23: 10 realnych kart — Vandalize, Expunge, Shiv's Embrace, Deepwood Denizen, Welder Automaton, Feedback, Vow of Wildness, Greater Tanuki, Scorch Spitter, Turn the Tide) — Etapy 0–5 zamknięte, Etap 2/3 przekroczony.

Roadmapa opisuje kolejność zdolności systemu, a nie sztywne terminy. Każdy etap powinien
kończyć się działającym, testowalnym przyrostem.

**Aktualizacja 2026-08-03:** roadmapa została przeliczona po audycie istniejącej aplikacji
([AUDIT_LEGACY_APP.md](AUDIT_LEGACY_APP.md)) i po decyzjach ADR 0009–0011. Największe zmiany:
Etap 5 zmienia charakter z „adapter starego stołu" na „UI nowego, samodzielnego stołu",
Etap 6 w dużej części odpada, a doszedł krok budowania jednoplikowego artefaktu
i publikacji na GitHub Pages, wymuszony wymaganiem gry na iPadzie
([ADR 0011](decisions/0011-modular-sources-single-file-artifact.md)).

## Legenda statusów

- `[x]` — zrobione
- `[ ]` — do zrobienia
- 🔒 — **zablokowane** do czasu decyzji lub danych od właściciela

## Etap 0 — repozytorium i audyt

**Cel:** bezpiecznie przejąć istniejący kod i ustalić fakty zamiast projektować na podstawie założeń.

- [x] Zapisać wizję, zakres i decyzje początkowe.
- [x] Utworzyć punkt wejścia dla przyszłych agentów/współpracowników.
- [x] Ustalić i udokumentować workflow bezpieczeństwa: chroniony `main`, obowiązkowe PR, squash merge.
- [x] Zaimportować aplikację kolekcjonerską wraz z Wirtualnym Stołem (wersja z wyciętymi sekretami).
- [x] Udokumentować sposób uruchomienia i zweryfikować, że aplikacja działa.
- [x] Wykonać audyt architektury, danych, storage i zależności od DOM-u.
- [x] Zinwentaryzować model danych kart, talii i zasobów graficznych.
- [x] Ustalić politykę dla ciężkich/licencjonowanych zasobów (grafiki poza repozytorium).
- [x] Wybrać stos technologiczny i sposób organizacji repozytorium (ADR 0008, ADR 0011).
- [x] Rozstrzygnąć strategię wydzielenia stołu (ADR 0009).
- [x] Rozstrzygnąć źródło danych reguł kart (ADR 0010).
- [x] Rozstrzygnąć sposób uruchamiania i dystrybucji, w tym wsparcie iPada (ADR 0011).
- [x] Zbudować pierwszy, stabilny workflow CI (`node --test` + build artefaktu) — działa i jest zielony na PR i `main`.
- [ ] Po kilku PR-ach potwierdzających stabilność CI włączyć required status checks
      i zaktualizować `WORKFLOW.md` oraz ADR 0007.

**Exit criteria:** audyt zapisany, stos i strategia wybrane, CI uruchamia testy przy każdym PR.

## Etap 0b — dystrybucja i uruchamianie

**Cel:** właściciel może otworzyć stół na iPadzie i na komputerze, nie instalując niczego.

Etap równoległy do Etapu 1 — powinien powstać wcześnie, żeby każdy kolejny przyrost
był od razu sprawdzalny na docelowym urządzeniu, a nie dopiero na końcu.

- [x] `tools/build.mjs` — sklejanie modułów ESM w jeden plik HTML, bez zależności zewnętrznych.
- [x] **Wykrywanie cyklicznych importów z twardym błędem.** Zweryfikowano prototypem:
      naiwna implementacja przy cyklu po cichu gubi moduły zamiast zgłosić problem.
- [x] Wykrywanie kolizji nazw po sklejeniu (jeden wspólny zasięg, brak izolacji modułów).
- [x] Testy pilnujące obu zabezpieczeń oraz braku `import`/`export` w artefakcie.
- [x] Szkielet `src/table/` z testem własnym widocznym po otwarciu pliku.
- [x] Workflow CI i publikacja na GitHub Pages — właściciel wgrał gotowe pliki,
      publikacja artefaktu działa (`pages.yml` zielony na `main`).
- [x] Włączenie GitHub Pages w ustawieniach repozytorium — wykonane przez właściciela.
- [x] Moduł rozwiązywania adresu obrazu: `./img/` właściciela z fallbackiem na Scryfall,
      z ręcznym przełącznikiem (`src/table/card-images.js`). **Rozszerzony 2026-08-02
      (M12):** kafle na stole renderują druk ze Scryfalla z `imageUri` definicji karty,
      hover i pełny podgląd ten sam obraz w `large`, syntetyczna twarz jest fallbackiem;
      tory podglądu `scryfall`/`FOT`/`KON` przełączane scrollem jak w legacy, a numery
      lokalnych ilustracji uzupełnia `tools/fetch-art-ids.mjs`
      ([docs/setup/ILUSTRACJE_KART.md](setup/ILUSTRACJE_KART.md)). **Numery
      (`artId`) uzupełnione 2026-08-02 (M13)** dla wszystkich 13 realnych kart —
      ekstrakcja obsługuje formaty `412FOT.png` / `1LTR`; bez plików `./img/`
      tory lokalne spadają na Scryfall. **Słownik kart kolekcji
      (`tools/collection-art-ids.csv`, 542 karty z ID setu, duplikaty
      setów zachowane) wersjonowany w repo (M13b)** — nowe batche sprawdza
      się offline; kolejność: słownik → fetch dla brakujących → bez FOT/KON.

**Exit criteria:** właściciel otwiera adres URL na iPadzie i pobrany plik na komputerze;
oba pokazują ten sam stan gry, różniąc się wyłącznie źródłem ilustracji.

**Blokada:** ~~dwa ostatnie punkty wymagają uprawnień właściciela~~ — wszystkie punkty
etapu wykonane. Instrukcja historyczna: [docs/setup/URLOP_CHECKLISTA.md](setup/URLOP_CHECKLISTA.md).

## Etap 1 — minimalny headless engine bez kart

**Cel:** uruchomić i testować szkielet gry bez UI.

Wszystko w `src/engine/` i `src/protocol/`, bez `document`, `window`, `fetch` i `localStorage`.

- [x] Tożsamość definicji karty, instancji w talii i obiektu gry; zmiana strefy tworzy nowy obiekt.
      Gracz pozostaje częścią konfiguracji `GameState`.
- [x] Strefy (`library`, `hand`, `battlefield`, `graveyard`, `exile`, `stack`) i niemutująca zmiana strefy.
- [x] Minimalna konfiguracja partii i autorytatywny `GameState`.
- [x] Tura, fazy i kroki zgodne z CR, active player.
- [x] Minimalny protokół `Command`, `Event` i `ChoiceRequest` z maszynowo rozpoznawalnymi odrzuceniami.
- [x] Projekcja `PlayerView` jako **nowy obiekt kopiujący tylko dozwolone pola**,
      z testem braku wycieków (kluczowe, bo JS nie odróżni widoku od stanu — ADR 0008 §„Czego
      świadomie nie dostajemy").
- [x] Seedowane RNG, poprawne tasowanie Fishera-Yatesa, powtarzalny log.
      Zastępuje `sort(() => Math.random() - 0.5)` ze starego kodu.
- [x] Interfejs kontrolera oraz `RandomBot` do testów.
- [x] Format zapisu partii jako seed + sekwencja komend, z odtwarzaniem
      ([ADR 0011](decisions/0011-modular-sources-single-file-artifact.md)).
      Powstaje tu, bo jest jednocześnie testem determinizmu.
- [x] Spójny kontrakt `legalCommands`: widok oferuje wyłącznie komendy akceptowane
      przez `execute` (test własnościowy), pełny przebieg tury przez protokół.

**Exit criteria:** dwaj kontrolerzy przechodzą przez minimalną symulację tur,
a ten sam seed i te same komendy dają identyczny wynik. Zapisana partia odtwarza się
krok po kroku do identycznego stanu końcowego.

## Etap 2 — podstawy rozgrywki i pierwsze karty

**Cel:** pierwsza pionowa ścieżka od definicji karty do legalnego działania.

- [x] Biblioteka, opening hand, draw, przegrana z pustej biblioteki.
- [x] Land drop z limitem na turę i podstawowy system many.
- [ ] Rzucanie prostego czaru, stos i priority pass.
- [x] Permanent na battlefield, tap/untap, summoning sickness.
- [x] Podstawowe statystyki stworzeń i obrażenia.
- [x] Format definicji karty i registry statusu wsparcia (`unsupported`/`in-development`/`supported`/`limited`).
- [x] Format talii jako pliku tekstowego w repozytorium + parser i test odrzucający talię z kartami
      spoza statusu `supported` ([ADR 0012](decisions/0012-deck-builder-and-text-deck-format.md)).
- [x] Syntetyczny katalog testowy z materializacją obiektów gry i taliami w `decks/`.
- [x] Kreator talii w UI (M20, 2026-08-03): filtry `Plan`/`Set`/nazwa, liczniki,
      walidacja kopii, kopiowanie oraz pobieranie tego samego tekstu co plik repozytorium;
      rozmiar talii pozostaje opcjonalny zgodnie z decyzją właściciela.
- [x] **Pierwszy batch realnych kart z listy właściciela (2026-08-01)** — każda poprzedzona
      pobraniem danych ze Scryfall (ADR 0010 §2a): Highland Game (KTK), Kappa Tech-Wrecker (NEO),
      Segmented Krotiq (DTK). Odfiltrowane JSON-y z API w `docs/cards/`, definicje w
      `src/cards/card-data.js` (status `supported`), talia `decks/real-batch1.txt`.
- [x] **Drugi batch realnych kart (2026-08-01):** Grizzled Outcasts (ISD, transform DFC),
      Entrancing Lyre (THB, {X} + blokada odkręcania), Zoraline, Cosmos Caller (BLB,
      flying/vigilance, tribał nietoperzy, reanimacja z finality). Talia `decks/real-batch2.txt`.
- [x] **Trzeci batch realnych kart (2026-08-01):** Rupture Spire (CON, ETB tapped +
      obowiązkowe „sacrifice unless you pay {1}"), Leafcrown Dryad (THS, enchantment
      creature z reach i PEŁNYM bestow {3}{G} — czar aury, załączenie, odłączenie,
      załączniki w engine), Prismari Campus (STX, ETB tapped + {4},{T}: Scry 1
      z blokującą decyzją gracza). Każda karta zakodowana w 100% mechanik.
      Talia `decks/real-batch3.txt`.
- [x] **Czwarty batch realnych kart (2026-08-01):** Gloomfang Mauler (MOM,
      menace + PEŁNY backup 2 z blokującą decyzją `resolve_backup` +
      swampcycling — typecycling w engine, martwy na bitwisku), Serra's
      Embrace (DVD, pierwsza czysta aura: czar aury, fizzle do grobu, grób
      po zgonie gospodarza — odwrotnie niż bestow), Cloak of the Bat (CLB,
      pierwszy equipment: equip sorcery-speed, flying+haste nosiciela,
      zostaje po jego śmierci, re-equip). Załączniki w engine uogólnione na
      trzy rodziny (bestow/aura/equipment); haste i menace dodane jako
      keywordy engine. W rejestrze wirtualne landy podstawowe (Basic Land
      bez limitu kopii, cel swampcyclingu). Każda karta w 100% mechanik.
      Talia `decks/real-batch4.txt`.
- [x] **Piąty batch realnych kart (2026-08-02):** Midnight Guard (DKA, trigger
      wejścia innego stworzenia → untap), Holdout Settlement (OGW, land
      {T}: Add {C} + {T}+tap stwora: add one mana), Skyclave Geopede (ZNR,
      trample + Landfall +2/+2 do końca tury). Nowe w engine: triggery
      wejścia na cudze źródła, trample, koszt `tapCreature`, efekty
      `untap_permanent`/`add_mana`. Talia `decks/real-batch5.txt`.
- [x] **Szósty batch realnych kart (2026-08-02):** Soulmender (M20, {T}:
      zysk 1 życia), Illusory Demon (ARB, flying + „when you cast a spell"
      → poświęcenie źródła), Jyoti, Moag Ancient (M3C, ETB tokeny Forest
      Dryad wg rzuceń commandera (tu: 0) + beginning_of_combat pompuje
      land creatures o moc Jyoti). Nowe w engine: trigger when_you_cast_spell,
      land creatures (typ Land + rodzaj creature), trigger beginning_of_combat,
      dynamiczny pump source_power, buff_land_creatures. Talia
      `decks/real-batch6.txt`.
- [x] **Siódmy batch realnych kart (2026-08-02, 5 kart — od tego batcha
      porcja to 5 kart):** Fake Your Own Death (OTJ, instant: +2/+0 i nadany
      trigger dies → powrót zatapniętego + token Treasure), Puppeteer Clique
      (SHM, flying + ETB reanimacja z grobu przeciwnika z haste i wygnaniem
      w następnym end stepie + persist), Unstable Frontier (CON, land: cel
      „land you control" zmienia typ podstawowy do końca tury), Apprentice
      Wizard (2XM, {U},{T}: add {C}{C}{C}), Delta Bloodflies (TDM, flying +
      warunkowy trigger ataku → drenaż 1 życia). Nowe w engine: liczniki
      -1/-1, granty zdolności do końca tury, LKI (CR 603.10), persist,
      reanimacja ze zmianą kontroli, opóźnione triggery (CR 603.7), tokeny
      nie-stwory, koszt „Sacrifice this", atomowe koszty zdolności, cel
      „land you control" i tymczasowa zmiana typu podstawowego, `lose_life`,
      intervening if. Talia `decks/real-batch7.txt`.
- [x] **Ósmy batch realnych kart (2026-08-02, 5 kart):** Phyrexian Rager
      (DMU, ETB draw + strata życia), Nefarious Imp (CLB, flying + scry przy
      odejściu własnych permanentów), Gather the Townsfolk (DDQ, dwa tokeny
      1/1 Human, a przy życiu ≤5 pięć — fateful hour), Evangel of Synthesis
      (BRO, ETB draw+discard i statyczne +1/+0 oraz menace po dwóch
      dobraniach), Woolly Loxodon (KTK, zwykły morph bez licznika). Nowe
      w engine: `draw_cards`, `discard_cards`, licznik dobrań w turze,
      zdolności statyczne warunkowe (CR 604.3), trigger odejścia permanentów
      (CR 603.2), scry poza własną turą, fateful hour, zwykły morph.
      Talia `decks/real-batch8.txt`.
- [x] **Dziewiąty batch realnych kart (2026-08-03, 5 kart):** Kor Cartographer
      (CMR, ETB wyszukuje Plains na bitwisko tapped), Scorpion Sentinel (FIN,
      statyczne +3/+0 od siedmiu landów), Dunland Crebain (LTR, flying + amass
      Orcs 2), Dragonbroods' Relic (TDM, tap stwora/mana + sorcery sacrifice
      tworzący Reliquary Dragon) oraz Secluded Steppe (DDO, ETB tapped + zwykły
      cycling). Nowe generyczne mechaniki: search-to-battlefield, warunek
      statyczny `minLandsControlled`, amass/Army, sorcery timing zdolności,
      tokenowe ETB damage i cycling draw. Talia `decks/real-batch9.txt`.
- [x] **Dziesiąty batch realnych kart (2026-08-03, 5 kart):** Goblin Piker (M11,
      vanilla 2/1), Angel of the Dawn (M19, globalny pump i vigilance), Armored
      Skaab (ISD, mill four), Tumbleweed Rising (OTJ, dynamiczny X/X Elemental
      i plot) oraz Dawntreader Elk (DKA, sacrifice/search Basic Land). Nowe
      generyczne mechaniki: buff wszystkich stworów do cleanup, mill, plot,
      dynamiczna moc tokenu i search po wielu typach. Talia `decks/real-batch10.txt`.
- [x] Testy legalnych i nielegalnych przypadków każdej karty
      (`test/real-cards-batch1.test.js` … `test/real-cards-batch10.test.js`).
- [x] Batche 1–23 (158 kart supported, 9 talii singleton) — zamknięte (ADR 0010 §2a, Scryfall przed kodowaniem, testy, talie, B0)
- [x] **Dwudziesty drugi batch realnych kart (2026-08-08, 10 kart):** Thistledown Players (BLB, trigger attacks + untap nonland permanent), Etherwrought Page (ARB, upkeep trigger z 3 trybami modalnymi: life gain / surveil / opp loses 1), Stomping Slabs (MOR, reveal top 7 + reorder bottom + named „Stomping Slabs" deal 7), Courage in Crisis (WAR, +1/+1 + proliferate — pierwsza karta z proliferate w katalogu), Selesnya Charm (RTR, 3 tryby: pump +2/+2 trample / exile creature ≥5 / 2/2 W Knight token), Wormfang Newt (JUD, ETB exile own land, LTB return — ping-pong exile), Raise the Alarm (CMR, 2× token Soldier), Cellar Door (ISD, {3},{T} mill_from_bottom + conditional 2/2 B Zombie token), Healer of the Glade (M20, ETB gain 3 life) i Enter the Enigma (DSK, cant_be_blocked + draw 1). Nowe generyczne mechaniki engine: `proliferate` (CR 701.27), `mill_from_bottom` (CR 701.13b), `return_exiled_to_battlefield` (CR 400.7), `reveal_top_to_bottom_order`, **modal upkeep trigger** (`pendingModalTrigger` + `resolve_modal_choice`), nowe typy celów (`creature_with_power_at_least {min:5}`, `nonland_permanent`, `land_you_control` w `triggerTargetCandidates`). 4 nowe kolejki pending, 4 nowe komendy resolve_*, 11 nowych zdarzeń, 1 nowy token (`token_knight`). 3 naprawy root cause (literówka `pendingDamageTargets`→`pendingDamageTarget`, parametr `name` w `addObject`, filtr tokenów `cardId.startsWith('token_')`). Talia Batch 22: karty dopisane singletonem do istniejących talii; plan sesji `docs/plans/PLAN_2026-08-08-batch22-cards.md`.
- [ ] Kolejne batche realnych kart z listy właściciela (Batch 23 czeka).

**Blokada:** kolejne realne karty czekają na dalszą listę od właściciela (ADR 0010). Docelowy katalog ~400 kart, przekroczono próg 20.
Do tego czasu Etap 2/3 rozwijamy na kartach syntetycznych oznaczonych jako testowe.

**Exit criteria:** headless test rozgrywa kontrolowany scenariusz z pierwszymi kartami.

## Etap 3 — combat i zestaw około 20 kart

**Cel:** pełna, mała rozgrywka człowiek/bot na ograniczonym katalogu.

- [x] Declare attackers / declare blockers.
- [x] Combat damage i pierwsza obsługa śmierci stworzeń.
- [x] Podstawowe state-based actions (scentralizowane po każdej komendzie).
- [x] Instant/sorcery timing i targetowanie z walidacją celu (stos, LIFO, fizzle).
- [x] Co najmniej jeden removal i jeden combat trick (Synthetic Shock / Synthetic Might).
- [x] Activated abilities w engine (M6): komenda `activate_ability`, koszt `tap` + efekt,
      dostępne jak instanty z priorytetem; na katalogu syntetycznym (`syn-warboar`).
- [x] Triggered abilities w minimalnym wymiarze (M8): `dies` i `combat_damage_to_player`,
      liczniki (+1/+1, deathtouch), Ninjutsu, Morph/Megamorph — na kartach Batchu 1.
- [x] 158 wspieranych kart tworzących grywalne talie singleton (9 talii) — przekroczono próg 20 (Etap 3 zamknięty na realnych kartach; syntetyczna wersja archiwalna)
- [x] Symulator headless z raportem i replayem z seeda (partia syntetyczna na taliach z `decks/`).

**Exit criteria:** boty wielokrotnie kończą partie na obsługiwanych taliach
bez ręcznej ingerencji w stan.

## Etap 4 — bot heurystyczny

**Cel:** przeciwnik wykonujący celowe, diagnozowalne ruchy.

- [x] Ocena stanu gry (punktowanie każdej legalnej komendy).
- [x] Reguły dla land drop, wykorzystania many, ataku i bloków.
- [x] Ważony wybór spośród ruchów o zbliżonej wartości.
- [x] Konfigurowany poziom losowości korzystający z seeda.
- [x] Ślad uzasadnienia punktowego do debugowania (`trace()`).
- [x] Benchmark scenariuszy i regresji jakości decyzji (testy scenariuszowe + mecze vs RandomBot i aggro).
- [x] **B0 — harness pomiarowy (2026-08-01):** `tools/benchmark.mjs` (macierz
      win-rate bot-vs-bot na wszystkich taliach `decks/*.txt`, N seedów, obie strony
      stołu na tych samych rozdaniach), produkcyjny bot referencyjny aggro
      (`src/controllers/aggro-bot.js`), test regresji `test/bot-benchmark.test.js`.
      Praktyka pomiaru (obowiązująca przy każdej zmianie bota) i baseline:
      [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
- [x] B1 — lepsza heurystyka: zegar (tury do zabicia/śmierci), ocena planszy,
      przewaga kart, sekwencjonowanie, optymalny {X}, wartość triggerów. Mierzone B0.
- [x] B2 — infrastruktura lookahead/symulacji na klonach stanu (top-K komend,
      cap, ocena liścia z B1); po pomiarze domyślnie wyłączona, bo pogarsza wynik.
- [x] B3 — modelowanie przeciwnika: prawdopodobieństwa z rozkładu hipergeometrycznego,
      adaptacja do obserwowanego zachowania.
- [x] B4 — deterministyczne strojenie rodzin wag hill-climbingiem na win-rate z B0;
      ewentualne ML pozostaje poza zakresem i wymaga osobnego ADR.
- [x] B5 — poziom trudności w UI (decyzja: maksymalny dostępny) i okienko
      „rozumowania" bota ze śladu `trace()` (domyślnie zwinięte).

**Exit criteria:** bot podejmuje legalne i podstawowo sensowne decyzje bez LLM —
potwierdzone testami scenariuszowymi oraz macierzą B0 (baseline 2026-08-01:
70.8% vs random, 61.6% vs aggro na 50 seedach; progi regresji w
`test/bot-benchmark.test.js`). Szczegóły rozwoju: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
Po B4 (2026-08-03) pełna macierz wynosi 77.9% vs random i 64.0% vs aggro;
progi regresji to 0.60 / 0.52.

## Etap 5 — standalone Wirtualny Stół (UI)

**Cel:** człowiek gra przez interfejs, a engine rozstrzyga reguły.

Zmiana względem poprzedniej wersji roadmapy: nie budujemy adaptera do starej aplikacji,
tylko samodzielny stół (ADR 0009). Zachowania przenosimy z listy w §8 audytu.

- [x] Własny `index.html` i punkt wejścia w `src/table/`, bez zakładek aplikacji kolekcjonerskiej.
- [x] Renderowanie `PlayerView` zamiast pełnego stanu.
- [x] Interakcja jako intencja: kliknięcie wysyła `Command`, UI czeka na odpowiedź engine
      (przeciąganie — później, gdy pojawi się naturalna potrzeba).
- [x] UI dla `ChoiceRequest` (M21, 2026-08-03): modal grupuje warianty celu,
      wartości X oraz decyzje scry/backup i wysyła wybraną legalną komendę;
      engine zachowuje enumerację `legalCommands` jako świadomy adapter przejściowy.
- [x] Prezentacja przyczyn odrzucenia komendy w formie czytelnej dla człowieka (log odrzuceń).
- [x] Sterowanie turą człowieka i automatyczne kroki bota (sesja przewija okna samego pasa).
- [x] **Faktyczne ukrycie ręki przeciwnika** — PlayerView pokazuje wyłącznie licznik kart.
- [x] Inspektor stref (groby), menu biblioteki, liczniki, tokeny (render tokenChip),
      log akcji, podgląd karty z ilustracją, autosave i wznawianie partii (Etap 5).
- [x] **M7 — nowy układ stołu:** karty jako kolorowe kafelki (syntetyczna twarz:
      nazwa, koszt, typ, P/T) zamiast tekstowych chipów; stół na całą szerokość
      (wróg u góry, Ty na dole, ręka na samym dole); strefy (groby/exile/biblioteka)
      w modalnym inspektorze; podgląd hover (desktop) i klik (menu kontekstowe / modal); rozwijane panele akcji/logu/zapisu.
- [x] **M7c — usprawnienia UX (po uwagach właściciela z iPada):** hover wyłączony na
      urządzeniach dotykowych (tap otwiera wyłącznie menu kontekstowe); auto-pass okien
      bez realnej decyzji (sam pass, samo tapnięcie landów bez wykonalnego zagrania,
      puste deklaracje ataku/bloków i puste rozstrzygnięcie walki przewijają się same;
      tap lądu zostaje decyzją, gdy po odkręceniu staje się wykonalny czar/stwór/zdolność);
      akcje przeniesione z dołu strony do wysuwanego panelu-warstwy (szuflada z PRAWEJ
      strony na desktopie — zgodnie z uwagą właściciela, bottom-sheet na mobile)
      z przyciskiem FAB.
- [x] Podgląd hover karty (syntetyczna twarz; Scryfall dołączy z realnymi kartami).
- [x] UI dla `ChoiceRequest` (M21, 2026-08-03): modal grupuje warianty celu,
      wartości X oraz decyzje scry/backup i wysyła wybraną legalną komendę;
      engine zachowuje enumerację `legalCommands` jako świadomy adapter przejściowy.
- [x] Bezpieczne renderowanie danych użytkownika (`textContent` zamiast `innerHTML` — §7 audytu).
- [x] Eksport i import zapisu partii jako pliku (seed + ruchy) — weryfikacja w Safari na
      iPadzie do wykonania ręcznie przez właściciela.
- [ ] Instrukcja uruchomienia dla obu trybów: adres URL oraz pobrany plik.

**Exit criteria:** człowiek rozgrywa przez UI pełną partię z botem na małym wspieranym katalogu
— sprawdzone zarówno na komputerze, jak i na iPadzie.

## Etap 6 — integracja z kolekcją i trwałość

**Cel:** połączyć stół z realnym katalogiem właściciela bez duplikowania danych.

Etap znacznie mniejszy niż w poprzedniej wersji roadmapy — samodzielność stołu
jest już osiągnięta w Etapie 5.

- [ ] Jeden interfejs źródła kart z dwiema implementacjami: definicje w repozytorium
      oraz opcjonalny odczyt katalogu właściciela.
- [ ] Mapowanie karty z kolekcji na definicję reguł (bez arytmetyki ID `+100000`/`+200000`).
- [x] Kreator talii w interfejsie — M20: talia jest nadal tekstem do skopiowania
      lub pobrania; brak `localStorage` pozostaje świadomym kosztem ADR 0011/0012.
- [ ] Decyzja o backendzie i docelowym poziomie ochrony FoW — osobny ADR.
- [ ] Usunięcie snapshotu `card_viewer_12_10_for_Github.html` z repozytorium.

## Etap ciągły — kolejne karty

Dla każdej karty lub małej partii:

1. zarejestrować dokładne dane i tekst reguł wraz z datą weryfikacji;
2. rozłożyć zachowanie na istniejące i nowe mechaniki;
3. zaimplementować brakujące klocki wielokrotnego użytku;
4. dodać definicję i status wsparcia;
5. napisać testy jednostkowe i interakcyjne;
6. uruchomić symulacje i regresje;
7. udokumentować ograniczenia;
8. dopiero wtedy dopuścić kartę do normalnej gry.

## Możliwe późniejsze kierunki

Nie są obecnie zobowiązaniem:

- search bot / MCTS;
- agent LLM korzystający z tego samego protokołu kontrolera;
- **generator SKIT-ów** jako osobny konsument logu partii, całkowicie poza ścieżką reguł
  (dziś wpleciony w prompt decyzyjny — §6 audytu);
- backend z realną ochroną ukrytych informacji;
- narzędzia do analizy partii;
- import nowych danych kart;
- dodatkowe formaty lub multiplayer.
