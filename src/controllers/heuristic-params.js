/**
 * Parametry deskryptorowe wyceny bota heurystycznego (B6).
 *
 * To DRUGA, drobnoziarnista warstwa strojenia — komplementarna do 7 wag rodzin
 * z `heuristic-weights.js`. Wagi rodzin to GLOBALNE mnożniki całej rodziny
 * komend (`spell`, `permanent`, …). Parametry deskryptorowe to KONKRETNE stałe
 * z `scoreCommand` (dawniej „magiczne liczby": baza stwora 70, baza czaru 50,
 * mnożniki mocy/wytrzymałości), wyciągnięte pod nazwy i pogrupowane po
 * DESKRYPTORACH efektu — nigdy po nazwie/ID karty (ADR 0002).
 *
 * Kontrakt bezpieczeństwa (B6 T0): domyślna wartość każdego parametru jest
 * RÓWNA dawnej stałej co do punktu, więc bot z parametrami domyślnymi wycenia
 * bit w bit tak samo jak przed refaktorem (golden-master
 * test/bot-scoring-snapshot.test.js). To są parametry STRATEGII, nie reguły
 * gry — tuner offline (tools/tune-bot.mjs) może je zmieniać, engine nie.
 *
 * Rozbudowa (kolejne sesje, typ zadania „Strojenie Bota" —
 * docs/setup/STROJENIE_BOTA.md): dokładaj rodziny stałych po jednej, każda
 * osobnym commitem, golden-master zielony po ekstrakcji przy wartości domyślnej.
 */

export const HEURISTIC_PARAM_KEYS = Object.freeze([
  // Rodzina „wyceny bazowe" (B6 T1) — fundament punktacji stworów i czarów.
  'creatureBase',            // baza za rzucenie stwora (dawniej 70)
  'creaturePowerWeight',     // mnożnik mocy w wycenie stwora (dawniej *2)
  'creatureToughnessWeight', // mnożnik wytrzymałości w wycenie stwora (dawniej *1)
  'creatureManaCostWeight',  // kara za punkt many przy rzucaniu stwora (audyt remisów, tura 6)
  'spellBase',               // baza za rzucenie czaru niebędącego permanentem (dawniej 50)
  // Rodzina „premie agresji w ataku" (B6 T1) — jak chętnie bot przepycha
  // obrażenia. Same PREMIE (dodatnie) — progi/kary za złe ataki zostają
  // twardymi stałymi (mają siedzieć poniżej passu). Wpływa wyłącznie na
  // declare_attackers.
  'attackThroughBonus',      // premia, gdy atakujący bezpiecznie zadaje moc (dawniej +3 w power+3)
  'attackOpenBoardBonus',    // premia za atak w pustą planszę przeciwnika (dawniej +8)
  'attackEvasionBonus',      // premia za ewazję latania omijającą blokerów (dawniej +3)
  // E (zgłoszenie właściciela 2026-09-20): kara za ODDANIE GARDY — atak
  // tapnięciem stwora, który był potrzebny, by przeżyć następną turę
  // (crackback). Kara (nie premia), bo tylko ona niweluje dodatnią wycenę
  // ataku; premia wyścigu jest przy takim ataku POMIJANA (L3).
  'crackbackPenalty',
  // A (uwaga właściciela 2026-09-23c, Somberwald Spider): karta z deskryptorem
  // `entersWithCountersIf: { morbid: true }` liczy liczniki W CHWILI WEJŚCIA
  // (CR 614.1c) — we własnej Głównej 1 zwykle jeszcze nic nie umarło, więc
  // rzut czeka na Główną 2 (po walce). Kara domyślnie przebija bazę stwora
  // (70), więc rzut schodzi pod pass; wyjątek `flash` + realny zamiar ataku
  // w tej turze zdejmuje karę (bot chce ciało przed deklaracją). Pokrętła
  // strategii, nie reguły gry.
  'morbidMain1Penalty',      // kara za rzut Morbida w Głównej 1 (domyślnie 90)
  'morbidMain2Bonus',        // premia za rzut Morbida po walce (domyślnie 8)
  // Rodzina „removal, obrażenia i przewaga kartowa" (B6 T1) — wycena efektów
  // czarów najczęstszych w cast_spell. Same PREMIE za trafienie CELU WROGA
  // (kary za zły cel/własny permanent zostają twardymi stałymi). Deskryptory
  // efektu (destroy/exile/bounce, damage, draw), zero nazw kart (ADR 0002).
  'removalEnemyBase',        // baza za usunięcie permanentu wroga (dawniej +22)
  'removalWorthWeight',      // waga (power+toughness) usuwanego permanentu (dawniej *2)
  'bounceEnemyBase',         // baza za odbicie permanentu wroga do ręki (dawniej +25)
  'bounceEnemyPowerWeight',  // waga mocy odbijanego permanentu (dawniej *2)
  // M239/2 (audyt PR #83, znalezisko Z3): rodzina „damage w stwora" (baza,
  // waga mocy celu, premia lethal) usunięta — po M237/4 damageTargetValue
  // wycenia obrażenia MODELIEM PER-CEL (bezpieczny blok → do wyceny wartości
  // przeciwnika + juba lethal z połówką ceny stworzenia), więc te klucze były
  // MARTWYMI pokrętłami (tuner zmieniał je bez jakiegokolwiek wpływu). Gromadzenie
  // martwych parametrów zatruwa tablicę tune-card.mjs — wycinane u korzenia.
  'drawCardValue',           // wartość jednej dobranej karty (dawniej *6)
  // D (uwaga właściciela 2026-09-23c, Cemetery Recruitment): karta wracająca
  // z grobu do RĘKI jest warta nie tylko swoje ciało — bot musi ją jeszcze
  // RZUCIĆ, więc wartość rośnie z jej mana value, ale tylko do granicy
  // potencjału many bota (źródła na polu bitwy liczone NIEZALEŻNIE od
  // tapnięcia + pula). Osobne pokrętło strategii (jak creatureManaCostWeight),
  // nie reguła gry; 0 = powrót do wyceny po samym ciele (L50: koniec remisów
  // równocielesnych wariantów).
  'graveReturnManaWeight',   // punkty za każdy achievable punkt mana value odzyskanej karty
  // Rodzina „efektywność removalu" (B6 T1 — M234, zlecenie właściciela). Bot ma
  // maksymalizować wartość zdejmowanego stwora: preferować DROŻSZE cele (TMC to
  // publiczny proxy „ma unikalne zdolności" — PlayerView NIE niesie `abilities`,
  // ADR 0017, więc koszt many jest jedynym sygnałem tekstu karty), a przy tanich
  // celach zdejmować przede wszystkim te NIE DO PRZEJŚCIA w walce (deathtouch,
  // protekcja od mojego koloru). Deskryptory z widoku (manaCost, keywords,
  // protection), zero nazw kart (ADR 0002).
  'removalTmcWeight',        // waga TMC celu w wycenie usunięcia (proxy zdolności)
  'removalDeathtouchBonus',  // premia za zdjęcie stwora z deathtouch (nie do przejścia w walce)
  'removalProtectionBonus',  // premia za zdjęcie stwora z protekcją od mojego koloru
  'removalCombatHandledPenalty', // kara za marnowanie removalu na TANI cel, którego bloker i tak zabije w walce
  // M247 (audyt Żywym Testerem, 2026-08-28 — Banishment Decree za 5 many
  // w Great Furnace): CZYSTY LĄD (typu Land, nie Creature — np. ląd
  // artefaktowy) jako cel efektu niszczącego/odbijającego nie zdejmuje ze
  // stołu ANI jednej wartości bojowej; właściciel odtworzy go za darmo, a
  // odesłanie na wierzch biblioteki zwraca go przy następnym doborze.
  // Kara musi PRZEBIĆ bazę czaru (+50) i premię removalu, żeby wariant
  // zszedł poniżej passu (wzec M237/2 — trywialny cel kontry).
  'removalPureLandPenalty',  // kara za removal/odbicie kierowane w czysty ląd przeciwnika
  // Rodzina „timing aury-sztuczki" (M235, zlecenie właściciela po audycie).
  // Aura FLASH, której cała wartość jest bojowa (czysta ochrona), to combat
  // trick — jej wartość zależy od OKNA: sensowna w walce (ochrona atakującego
  // przed blokerami danego koloru / bezstratny blok w turze przeciwnika), a we
  // własnym upkeepie/kroku bez walki to zmarnowana elastyczność (lepiej trzymać
  // kartę do właściwego okna). Deskryptor: flash + pure-protection (ADR 0002).
  'flashProtectionAuraOffWindowPenalty', // kara za rzut flash-aury ochronnej poza oknem walki
  // Rodzina „aura” (M257 r4, B6 T1) — wycena rzutu aury/bestow w
  // cast_permanent. Dotąd magiczne stałe w bloku aury scoreCommand: baza
  // buffa 66, unieruchomienie stwora wroga/własnego (auraIsHostile:
  // „doesn't untap”, „can't attack”), jałowa aura (brak celu, losesKeywords
  // na stworze bez keyworda) i czysta ochrona (protection: z zagrozeniami /
  // bez). Deskryptory: aura/bestow + losesKeywords/protection/pump (ADR
  // 0002). Domyślne == dawne stałe co do punktu (kontrakt B6 T0).
  'auraBase',                    // baza za rzucenie BUFF-aury na własnego stwora (dawniej 66)
  'auraBuffWorthWeight',         // waga (moc+pump) gospodarza w wycenie buff-aury (dawniej *2)
  'auraHostileEnemyBase',        // baza za UNIERUCHOMIENIE stwora wroga (dawniej 55)
  'auraHostileEnemyWorthWeight', // waga worth (moc+wytrzymałość) unieruchamianego stwora wroga (dawniej *2)
  'auraHostileOwnPenalty',       // kara za unieruchomienie WŁASNEGO stwora (dawniej -70)
  'auraHostileWorthWeight',      // waga worth unieruchamianego stwora w karze (własny + losesKeywords) (dawniej *1)
  'auraNoTargetPenalty',         // kara za aurę bez legalnego celu (hostile bez celu / buff bez gospodarza) (dawniej -50)
  'auraLosesKeywordsWastedPenalty', // kara za losesKeywords na stworze BEZ żadnego z odbieranych keywordów (dawniej -80)
  'auraKeywordFreshValue',         // M431: wartosc SWIEZEGO grantu slowa-kluczowego aury (zwierzece `auraLosesKeywordsWastedPenalty`, lustrzana strona te samej klasy)
  'auraKeywordRedundantPenalty',   // M431: kara za KAZDY grant, ktorego gospodarz juz ma (duplikat zdolnosci nic nie dodaje)
  'auraKeywordAllWastedPenalty',   // M431: kara, gdy WSZYSTKIE granty sa jałowe (musi przebic baze aury — wzor: auraLosesKeywordsWastedPenalty)
  'auraProtectionNoThreatPenalty',  // kara za czystą ochronę, gdy przeciwnik nie ma zagrożeń tej jakości (dawniej -40)
  'auraProtectionBase',          // baza czystej ochrony przy istniejących zagrożeniach (dawniej 20)
  'auraProtectionThreatWeight',  // waga LICZBY zagrożeń, przed którymi aura chroni (dawniej *12)
  // Zgłoszenie właściciela G (2026-09-11): aury na GRACZU (CR 303.4 „Enchant
  // player", klątwy). Cel-gracz nie jest permanentem, więc ścieżka „gospodarz
  // na polu bitwy" wyceniała oba warianty celu TAK SAMO (zmierzone: -45 dla
  // curse->wróg i curse->siebie) — klątwa na siebie nie była odróżniona od
  // klątwy na wroga, a bot w ogóle klątw nie rzucał.
  'curseEnemyBase',              // zysk z klątwy rzuconej na PRZECIWNIKA
  'curseSelfTargetPenalty',      // kara za klątwę na WŁASNEGO gracza (właściciel: -1000)
  // Zgłoszenie właściciela C (2026-09-10, Gurmag Drowner): Exploit przy 5
  // kartach w bibliotece — trigger miele 3 (`look_top_put_one_hand_rest_grave`,
  // amount 4), a ofiara była liczona tylko z P/T, więc użyteczny latający stwór
  // był „tani" prawie jak token. Właściciel: exploit tylko przy DUŻEJ
  // bibliotece (~15+) i ofiara = token bez zdolności.
  'exploitSkipBase',             // zysk z POMINIĘCIA exploita (punkt odniesienia)
  'exploitBase',                 // bazowy zysk z wykonania exploita
  'exploitDeckOutPenalty',       // kara, gdy mill exploita sięga dna biblioteki (CR 121.4/704.5b)
  'exploitThinLibraryPenalty',   // kara za exploit przy cienkiej bibliotece (ryzyko deck-outu)
  'exploitSafeLibraryMargin',    // minimalny ZAPAS kart po millu, żeby exploit był bezpieczny
  'exploitVictimKeywordWeight',  // waga keyworda ofiary (latanie itd. = realna wartość)
  'exploitVictimAbilityWeight',  // waga zdolności ofiary z rejestru (użyteczny stwór)
  'exploitTokenDiscount',        // premia za poświęcenie TOKENU (zamiast karty)
  // Znalezisko właściciela B (2026-09-17, Silumgar Butcher): exploit
  // DEBUFFUJĄCY (-X/-X) jest wymianą, nie darmowym zyskiem — wchodzi tylko
  // gdy zabija wrogi stwór (a), a ofiara jest tańsza niż zabijany (TMC) albo
  // zabijany niesie istotne walory (keywordy/zdolności/aury) (b).
  'exploitNoKillPenalty',        // kara, gdy debuff exploita nie zabija NICZEGO (schodzi pod skip)
  'exploitKillAssetMargin',      // próg „istotnych walorów" zabijanego (keywordy/zdolności/aury)
  'exploitKillAuraValue',        // wartość aury przyklejonej do zabijanego (ginie z nim, CR 704.5m)
  'exploitFaceDownEntryCost',    // TMC permanentu twarzą w dół (CR 708.2a: mana value 0; zapłacono {3})
  // Zgłoszenie właściciela B (2026-09-11, Chronic Flooding + Curiosity): bot
  // z ~9 kartami w bibliotece tapował ląd, który miele mu 3 karty na każde
  // tapnięcie, i dokładał własnemu stworowi aurę z powtarzalnym „draw a card".
  // Wspólna kara za uszczuplanie WŁASNEJ biblioteki (CR 121.4/704.5b),
  // sterowana danymi karty (ADR 0002) — patrz `libraryLossPenalty`.
  'libraryDeckOutPenalty',       // kara, gdy strata sięga dna biblioteki (deck-out = przegrana)
  'libraryThinPenalty',          // kara bazowa, gdy po stracie zapas < librarySafeMargin
  'libraryThinPerCardPenalty',   // dopłata za każdą kartę brakującą do bezpiecznego zapasu
  'librarySafeMargin',           // minimalny zapas kart po stracie (właściciel: ~20)
  // I (uwaga właściciela 2026-09-23c, Chronic Flooding): zapas wymagany, gdy
  // płatność/tapnięcie sięga po źródło, którego tapnięcie miele bibliotekę
  // („nie tapować przy bibliotece < ~30 kart", mill 3). Osobne pokrętło, bo
  // to ryzyko POWTARZALNE (każde tapnięcie), a nie jednorazowy dobór z karty.
  'libraryTapSafeMargin',        // minimalny zapas kart po mielącym tapnięciu (właściciel: ~30)
  'repeatLibraryDrainTurns',     // horyzont: ile odpaleń powtarzalnego triggera zakładamy
  // F1 v2 (uwaga właściciela 2026-09-23d, Veiled Ascension): efekt zakrywający
  // kartę z biblioteki (cloak — CR 701.58a) ZAMIENIA ją na permanenta 2/2
  // z wardem, a nie marnuje jak mill czy dobranie — więc „you may” jest
  // opłacalne ZAWSZE; karę nakładamy dopiero, gdy własna biblioteka spadnie
  // pod próg (jedyna realna strata to deck-out, CR 121.4).
  'cloakLibraryFloor',           // biblioteka < próg ⇒ „pass” (właściciel: 10)
  'cloakThinLibraryPenalty',     // kara za cloak przy cienkiej bibliotece (> 50 ⇒ schodzi pod „pass”)
  // M429 (zlecenie właściciela 2026-09-24e — karty batcha 59, „P1 Mutagen"):
  // rodzina „licznik na wskazanym celu". Dotąd licznik na WŁASNYM stworze był
  // wart płasko 8 + 4·amount w OBU bliźniaczych gałęziach (czar i aktywacja),
  // więc wszystkie gospodarze remisowały (pomiar: 14/14/14 dla tokena 1/1,
  // Cryptida 2/3 i Hill Gianta 3/3) i bot brał pierwszą ofertę — najczęściej
  // najsłabsze ciało (L50). Model z precedensu aury-buffa (M257 r4: „opłaca się
  // tym bardziej, im większy gospodarz" — tam waga 2 na mocy i 1 na
  // wytrzymałości): wartość licznika rośnie z WAGĄ CIAŁA gospodarza, a dwa
  // terminy taktyczne rozstrzygają remisy wartości:
  //  - `counterCombatBonus` — licznik, który POPRAWIA wynik toczonej walki
  //    (M218/2 `pumpImprovesOutcome`), kupuje coś TERAZ (żywy bloker/lethal);
  //  - `counterDoomedHostPenalty` — licznik na gospodarzu SKAZANYM w tej turze
  //    (M236/2 `permanentDoomedThisTurn`) ginie razem z nim, więc nie kupuje
  //    NIC: wartość licznika jest ZEROWANA do −kara (nie zmniejszana), żeby
  //    aktywacja zeszła pod „pass" niezależnie od wielkości ciała („wielki, ale
  //    martwy" to nadal zero) — L3: kara musi przebić bazę aktywacji.
  // Domyślne wartości są PRZEMYŚLANE, nie wytunerowane (zlecenie): baza 2 + waga
  // gospodarza 2 × worth(1/1)=3 odtwarza dawną stałą 8 co do punktu, więc
  // NAJSŁABSZY gospodarz nie traci na wartości (kontrakt B6 T0 dla przypadku
  // z obserwacji), a różnicę zyskują realne ciała. Pomiar PO na ścieżce bota
  // (audyt PR #136, F-3): token 1/1 → 14, Cryptid 2/3 → 22 (+8), Hill Giant
  // 3/3 → 26 (+12); worth = moc×2 + wytrwałość, więc 2/3 = 7, 3/3 = 9.
  'counterBase',                 // baza licznika przy gospodarzu-wzorcu 1/1 (dawna 8 = 2 + 2·3)
  'counterAmountWeight',         // wartość każdego punktu licznika (dawna *4)
  'counterHostWorthWeight',      // waga ciała gospodarza (moc×2 + wytrzymałość), wzorzec aury
  'counterCombatBonus',          // premia, gdy licznik poprawia wynik WALKI, która trwa
  'counterDoomedHostPenalty',    // kara, gdy gospodarz ginie w tej turze mimo licznika
  // M429 („P2 Memory's Journey"): rodzina „wtasowanie kart z grobu do
  // biblioteki". Dotąd efekt był wart płasko 4 + 2·karty (NIEZALEŻNIE od stanu
  // biblioteki — pomiar: 58 pkt przy 30 i przy 12 kartach, a wariant z ZERO
  // wybranych kart też dawał 58), więc bot rzucał czar „na zero kart" i bez
  // żadnej presji deck-outu, tracąc kartę z ręki. Model z istniejącej rodziny
  // bibliotecznej (D/M162: `librarySafeMargin` + kara per karta, CR 121.4/
  // 704.5b): karty wracają do BIBLIOTEKI, więc kupują czas tylko wtedy, gdy
  // biblioteka jest cienka — inaczej instant czeka na realne zagrożenie
  // (wzorzec „trzymaj czar na okno", M235). Karne warianty schodzą pod „pass"
  // (L3: kara musi przebić bazę czaru i wartość zwrotu).
  'graveyardShuffleBase',        // wartość samego zwrotu (dawna 4, gdy karty wracają)
  'graveyardShuffleCardValue',   // wartość każdej wracającej karty (dawna *2)
  'graveyardShuffleRescueWeight',// dopłata za kartę, gdy biblioteka jest pod progiem
  'graveyardShuffleNoPressurePenalty', // kara, gdy biblioteka jest zdrowa (czekaj na okno)
  'graveyardShuffleEmptyPenalty',// kara, gdy nie wraca ŻADNA karta (efekt jałowy)
  // M429 („P3 Charismatic Vanguard"): rodzina „masowy pump/debuff do końca
  // tury". Czar miał tę wycenę od M106/Z7 (okno walki: pump wygasa w cleanup,
  // CR 514.2, więc poza walką nie kupuje nic), ale AKTYWOWANA ZDOLNOŚĆ nie
  // miała żadnej — bot dostawał gołe `score = 2` i przepalał {4}{W}
  // w Głównej 1 (pomiar: 2 pkt w każdym kroku tury). Te same stałe wyjęte pod
  // nazwy (kontrakt B6 T0: domyślne == dawne wartości) + jedna ścieżka dla obu
  // gałęzi (L41 — bliźniacze gałęzie, jedna reguła).
  'teamPumpPerCreature',         // wartość za każdego objętego stwora (dawna *6)
  'teamPumpEmptyPoolPenalty',    // kara, gdy nie ma kogo objąć (dawna -30)
  'teamPumpNoChangePenalty',     // kara, gdy pump nie zmienia wyniku walki (dawna -25)
  'teamPumpSorceryOffWindowPenalty', // kara dla sorcery poza własną Główną 1 (dawna -60)
]);

export const DEFAULT_HEURISTIC_PARAMS = Object.freeze({
  creatureBase: 70,
  creaturePowerWeight: 2,
  creatureToughnessWeight: 1,
  // 1 punkt za każdy punkt many: wystarcza, by rozstrzygnąć „to samo ciało za
  // mniejszą manę" (remis w audycie: 4 na 12 partii), ale nie waży tyle co
  // sama siła (2/pt), więc większy stwór za większą manę nadal wygrywa.
  creatureManaCostWeight: 1,
  morbidMain1Penalty: 90,
  morbidMain2Bonus: 8,
  spellBase: 50,
  attackThroughBonus: 3,
  attackOpenBoardBonus: 8,
  attackEvasionBonus: 3,
  crackbackPenalty: 12,
  removalEnemyBase: 22,
  removalWorthWeight: 2,
  bounceEnemyBase: 25,
  bounceEnemyPowerWeight: 2,
  drawCardValue: 6,
  graveReturnManaWeight: 4,
  // M234 — WŁĄCZONE wprost jako część zlecenia właściciela (efektywność
  // removalu). Wartości dobrane pomiarem (ordering + mirror-eval + divergence):
  //  - TMC*2: 6-drop dostaje +12, 1-drop +2 → wyraźna preferencja drogich celów
  //    (proxy „ma zdolności", bo PlayerView nie niesie `abilities`, ADR 0017);
  //  - deathtouch +14 (~7 pkt worth): tani deathtoucher przeskakuje równorzędne
  //    vanilla, ale nie przebija realnie większego zagrożenia;
  //  - protekcja od mojego koloru +18: stwór nie do przejścia w walce staje się
  //    priorytetem czaru.
  // Zmiana zachowania jest ŚWIADOMA → golden-master (bot-scoring-snapshot)
  // zregenerowany razem z tym commitem; mirror-eval i bot-benchmark bez regresji.
  removalTmcWeight: 2,
  removalDeathtouchBonus: 14,
  removalProtectionBonus: 18,
  // M234/3 — kara za zdejmowanie CZAREM taniego celu, którego i tak zabiję
  // blokerem (oszczędzaj removal na realne zagrożenia). Mała (tie-break):
  // NIE ma przebijać passu przy dobrym celu — działa tylko na TANIE, nieewazyjne
  // cele bez deathtouch/protekcji, gdy mam blokera zabijającego bez straty.
  removalCombatHandledPenalty: 12,
  removalPureLandPenalty: 60,
  // M235 — aura FLASH o czystej wartości ochronnej rzucona POZA oknem walki
  // (własny upkeep/draw/end, postcombat, tura przeciwnika przed deklaracją
  // ataków) marnuje elastyczność instanta. Kara musi przebić bazę takiej aury
  // (do ~auraBase + auraBuffWorthWeight·moc + wytrzymałość gospodarza), żeby
  // wariant zszedł PONIŻEJ passu (0) — bot trzyma kartę do właściwego okna.
  // W oknie walki kara nie działa, więc aura nadal wygrywa.
  flashProtectionAuraOffWindowPenalty: 120,
  // M257 r4/B6 T1 — rodzina „aura”: ekstrakcja stałych bloku aury
  // scoreCommand (domyślne = dawne stałe co do punktu; golden-master
  // pilnuje, że domyślne nic nie zmieniają).
  auraBase: 66,
  auraBuffWorthWeight: 2,
  auraHostileEnemyBase: 65,
  auraHostileEnemyWorthWeight: 2,
  auraHostileOwnPenalty: 70,
  auraHostileWorthWeight: 1,
  auraNoTargetPenalty: 50,
  auraLosesKeywordsWastedPenalty: 80,
  // M431 (uwaga z gry wlasciciela 2026-09-25: aura +latanie na stworze, ktory
  // juz je mial). Aura nadajaca slowa-kluczowe byla wyceniana WYLACZNIE po ciele gospodarza
  // (`auraBase + auraBuffWorthWeight*(moc+pump) + (wytrzm+pump)`), a `descriptor.keywords`
  // nie byl czytany nigdzie w wycenie — trzy warianty (3/3 bez keywordow / z flying /
  // z flying+vigilance) mialy identyczne 72,9. Naprawa idzie w slady `equipValuation`
  // (M243/D-G) i `auraLosesKeywordsWastedPenalty` (M200/H): ta sama reguła swiezosci,
  // druga strona lustra. Swiezy grant = +8 (tyle co `ofensywne` w equipValuation),
  // redundancja = -6 (roznica miedzy gospodarzem a jałowym celem na tym samym ciele),
  // a calkowicie jałowa aura = kara, ktora PRZEBIJA baze (L3) — wzor: 80 dla losesKeywords.
  auraKeywordFreshValue: 8,
  auraKeywordRedundantPenalty: 6,
  auraKeywordAllWastedPenalty: 80,
  auraProtectionNoThreatPenalty: 40,
  auraProtectionBase: 20,
  auraProtectionThreatWeight: 12,
  curseEnemyBase: 40,
  curseSelfTargetPenalty: 1000,
  exploitSkipBase: 20,
  exploitBase: 40,
  exploitDeckOutPenalty: 120,
  exploitThinLibraryPenalty: 60,
  exploitSafeLibraryMargin: 12,
  exploitVictimKeywordWeight: 6,
  exploitVictimAbilityWeight: 8,
  exploitTokenDiscount: 8,
  exploitNoKillPenalty: 30,
  exploitKillAssetMargin: 12,
  exploitKillAuraValue: 30,
  exploitFaceDownEntryCost: 3,
  libraryDeckOutPenalty: 120,
  libraryThinPenalty: 60,
  libraryThinPerCardPenalty: 6,
  librarySafeMargin: 20,
  libraryTapSafeMargin: 30,
  repeatLibraryDrainTurns: 3,
  cloakLibraryFloor: 10,
  cloakThinLibraryPenalty: 60,
  // M429 „licznik na wskazanym celu" (P1 Mutagen, pomiar PRZED: remis 14/14/14).
  // Przemysłane wartości (nie tuner): patrz uzasadnienie przy HEURISTIC_PARAM_KEYS.
  counterBase: 2,
  counterAmountWeight: 4,
  counterHostWorthWeight: 2,
  counterCombatBonus: 12,
  counterDoomedHostPenalty: 20,
  // M429 „wtasowanie kart z grobu do biblioteki" (P2 Memory's Journey).
  // Próg presji = `librarySafeMargin` (20, istniejąca rodzina biblioteczna).
  // Dopłata ratunkowa 8/kartę: 3 karty przy cienkiej bibliotece = 34 pkt efektu
  // (84 z bazą czaru) — realny ratunek, a nie „ładna karta"; przy zdrowej
  // bibliotece kara 70 spycha rzut pod pass.
  graveyardShuffleBase: 4,
  graveyardShuffleCardValue: 2,
  graveyardShuffleRescueWeight: 8,
  graveyardShuffleNoPressurePenalty: 70,
  graveyardShuffleEmptyPenalty: 70,
  // M429 „masowy pump/debuff do końca tury" (P3 Charismatic Vanguard) —
  // ekstrakcja stałych istniejącej reguły (M106/Z7, M218/1); wartości == dawne.
  teamPumpPerCreature: 6,
  teamPumpEmptyPoolPenalty: 30,
  teamPumpNoChangePenalty: 25,
  teamPumpSorceryOffWindowPenalty: 60,
});

/**
 * Łączy nadpisania parametrów z domyślną konfiguracją i odrzuca literówki.
 * Zwracany obiekt jest nowy i zamrożony — tuner nie może zmienić konfiguracji
 * używanej przez inną instancję bota (ani przez caller po jego utworzeniu).
 * Symetryczne do normalizeHeuristicWeights (jedna konwencja walidacji).
 */
export function normalizeHeuristicParams(overrides = undefined) {
  if (overrides == null) return Object.freeze({ ...DEFAULT_HEURISTIC_PARAMS });
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError('Parametry heurystyki muszą być obiektem');
  }
  const unknown = Object.keys(overrides).filter((key) => !HEURISTIC_PARAM_KEYS.includes(key));
  if (unknown.length > 0) {
    throw new RangeError(`Nieznane parametry heurystyki: ${unknown.join(', ')}`);
  }
  for (const key of Object.keys(overrides)) {
    const value = overrides[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RangeError(`Parametr heurystyki ${key} musi być skończoną liczbą`);
    }
  }
  return Object.freeze({ ...DEFAULT_HEURISTIC_PARAMS, ...overrides });
}
