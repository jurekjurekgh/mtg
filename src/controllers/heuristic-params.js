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
  // PMSSB-1 (M239/2: bounceEnemyBase/Weight usunięte — martwe; typ
  // return_to_hand nie występuje w kartach ani silniku). Rodzina „bounce":
  // siła efektu (hand < top < bottom) + wymiary celu (token-trwałość
  // CR 704.5d, powtórka ETB wroga).
  'bounceLibraryTopBonus',   // dopłata: odbicie na WIERZCH biblioteki (tempo doboru)
  'bounceLibraryBottomBonus', // dopłata: odbicie na SPÓD (prawie removal)
  'bounceTokenBonus',        // dopłata: cel-token wroga znika na zawsze (CR 704.5d)
  'bounceFoeEtbWeight',      // waga kary: cel z ETB da wrogowi powtórkę
  // PMSSB-1/B: kierunek własny — ratunek (F5) i reuse ETB (F4) płacą
  // kosztem przerzucenia (many) i tempem (tura + choroba po powrocie).
  'bounceRecastManaWeight',  // waga 1 many przerzucenia własnego stwora
  'bounceTempoPenalty',      // kara tempa za zdjęcie własnego stwora ze stołu
  // PMSSB-1/C: timing (F1: okna instantu + sorcery-precombat), unik-lethal
  // i przepełnienie ręki (CR 514.1 — limit 7, odrzut w cleanupie).
  'bounceTimingSwing',       // wahnięcie wartości między oknami rzutu
  'bounceLethalDodgeBonus',  // premia: bounce zdejmuje lethal z atakujących
  'bounceOverflowBonus',     // premia/kara: pełna ręka (wróg odrzuci / ja odrzucę)
  // PMSSB-2/A (F4): token-bank many (Treasure/Powerstone/Scion) —
  // 1 mana ≈ 3 (symetria z bounceRecastManaWeight: many nie wracają).
  'tokenManaBankWeight',     // wartość 1 many z tokena-bank (Treasure ≈ 3)
  'tokenTimingSwing',          // wahnięcie okien instantu tokenowego (EOT-own/reakcja vs po-blokach)
  'tokenManaCostTieBreak',     // dogrywka kosztem czaru tokenowego (ten sam efekt → tańszy wygrywa)
  // M239/2 (audyt PR #83, znalezisko Z3): rodzina „damage w stwora" (baza,
  // waga mocy celu, premia lethal) usunięta — po M237/4 damageTargetValue
  // wycenia obrażenia MODELIEM PER-CEL (bezpieczny blok → do wyceny wartości
  // przeciwnika + juba lethal z połówką ceny stworzenia), więc te klucze były
  // MARTWYMI pokrętłami (tuner zmieniał je bez jakiegokolwiek wpływu). Gromadzenie
  // martwych parametrów zatruwa tablicę tune-card.mjs — wycinane u korzenia.
  'drawCardValue',           // wartość jednej dobranej karty (dawniej *6)
  'instantDrawFoeEndBonus', // PMSSB-3/F2: premia za instant-draw na EOT wroga (lustro M211/A1, 10)
  // PMSSB-15 (audyt taktyczny prewencji/fog, prevent_*): okna wartości
  // fog —właściciel (zgłoszenie B): „preventować u stworów które by lethal
  // dostały albo u siebie jeśli któryś z kreatur przeciwnika go zrani" +
  // odpowiedź na dmg-czar z lethalem. Helper fogWindowValue (L41: cast_spell
  // + rodzina darmowych rzutów).
  'fogWindowOwnTurnValue',        // własna tura: fog kasuje własny atak (M91, kara > max zysk)
  'fogWindowWastedValue',         // nic nie da się zapobiec: brak napastników / pełny wyciek (M236)
  'fogWindowChipValue',           // chip bez zagrożeń — najsłabszy realny wariant (dawna płaska premia)
  'fogWindowLethalSaveValue',     // dopłata: ratunek bota przed śmiercią w tym starciu (życie LUB poison)
  'fogWindowSavedCreatureValue',  // dopłata: mój stwór, którego ta walka by zabiła (lustro animate_linked 10)
  'preventEtbWindowBaseValue',    // PMSSB-15/F4: ETB-prewencji dla artifact-stworów — baza słabego okna
  // PMSSB-16 (walka bez fazy walki: fight + bite `damage_from_target_power`):
  // CR 701.14a–d (damage nie-bojowe — deathtouch/lifelink działają, first
  // strike nie). Helper `fightExchangeValue` (L41 dla fight+bite).
  'fightBiteChipBase',        // bite: baza (stare 8) — chip bez killa
  'fightBitePowerWeight',     // bite: waga mocy dealera (stare 2)
  'fightBiteLethalBonus',     // bite: dopłata za zabicie ofiary (stare 15)
  'fightKillBase',            // fight: baza zabicia ofiary PRZEŻYWAM (stare 25)
  'fightKillPowerWeight',     // fight: waga mocy ofiary przy zabiciu (stare 2)
  'fightMissBase',            // fight: brak zabicia (stare 5)
  'fightTradeWorthWeight',    // fight (wymiana): waga różnicy ciał ofiary i walczącego (2p+t+mv)
  'fightTradeCardCost',       // fight (wymiana): koszt DODATKOWEJ karty (mojego stwora) w wymianie
  'fightWastedDeathExtra',    // fight: dodatkowa kara śmierci BEZ zabicia ofiary (musi przebić bazę)
  'fightLifelinkWeight',      // fight/bite: waga lifelinku obu stron (CR 701.14d — damage nie-bojowe)
  // PMSSB-17 (kradzież do końca tury — Act of Treason / Awaken / Insurrection):
  // czasowa zmiana kontroli (CR 110.2 właściciel ≠ kontroler; CR 514.2 — wraca
  // w cleanup PRZED ich turą, więc ZERO osi obronnej; CR 506.4 — zmiana kontroli
  // usuwa z walki). Wartość = JEDEN pewny atak z haste w właściciela + luki w
  // bloku + equipment (M257). Helper `gainControlValue`.
  'gainControlStealBase',     // kradzież: baza tempa (karta wraca — brak zysku trwałego)
  'gainControlAttackWeight',  // kradzież: waga mocy skradzionego (pewny atak w właściciela)
  'gainControlOpenValue',     // kradzież: wartość luki w bloku (skradziony wypada z ich blokujących)
  'gainControlEquipBonus',    // kradzież (M257): bonus za cel z equipmentem (niszczony riderem)
  'gainControlEquipPerItem',  // kradzież (M257): dopłata za każdy equipment na celu
  'gainControlOwnPenalty',    // kradzież (M231): kara celu własnego/braku (przebija bazę 50)
  // PMSSB-19 (search_library — CR 701.23b search/shuffle): rider szukania
  // w trzech ścieżkach (tabela ETB, cast_spell, activate_ability — L41).
  // Tutor = NAJLEPSZA karta kategorii (nie losowa — stąd baza > drawCardValue 6).
  'searchToBattlefieldBase',  // ląd na planszę (trwały ramp; stara ETB-10)
  'searchToHandBase',         // karta do ręki (selekcja > losowe dobranie 6)
  'searchLandScrewBonus',     // dopłata za ląd do ręki przy manascrew (moje lądy < 3)
  'searchTwoCardsValue',      // Final Parting (2 karty: ręka + grób = 9 + 7)
  'millFoeDeckOutWinValue',   // PMSSB-20: mill do 0 = wygrana przy ich dobraniu (CR 121.4)
  'millFoePressureWeight',    // PMSSB-20: waga presji deck-outu wroga (wyścig bibliotek)
  'millFoePressureCap',       // PMSSB-20: próg presji (ich karty po millu poniżej = rośnie)
  'millReanimateBonus',       // PMSSB-20: self-mill pod reanimację w ręce (combo)
  'millSelfTargetGuard',      // PMSSB-20: guard celowanego self-millu (−80 historyczne)
  // (PMSSB-8/F-L1b: 'ferociousLootExpected' usunięte — may-loot-rider
  // schodzi do LOOT_NET_VALUE; decyzja modalna ma literalny 5-vs-(−2).)
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
  'untapChoiceLockValue',          // M431: baza za to, że źródło zostaje w tapie i trzyma WROGI byt (CR 502.3)
  'untapChoiceOwnLockPenalty',     // M431: kara za trzymanie w tapie źródła, które unieruchamia WŁASNY byt
  'untapChoiceSourceTapCost',      // M431: koszt pozostawienia w tapie źródła ze zdolnością {T} / stworzenia do ataku
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
  // PMSSB-23 (F2/F3) — dalszy ciąg rodziny liczników. Pomiar PRZED: wrogi
  // licznik nie widział, w co trafia (3× stun na 6/6 trample = 3× stun na 1/1,
  // oba 62 pkt; `-1/-1` na 3/3 = na 6/6, oba 16), więc cel wybierała kolejność
  // enumeracji — a rider „połóż licznik na KAŻDYM moim stworze z licznikiem"
  // (Lifecrafter's Gift, Vaan Street Thief) nie miał gałęzi wcale: 1, 2 i 4
  // odbiorców dawało tę samą ocenę (74/74/74). Miara zagrożenia jest TA SAMA co
  // w PMSSB-21 (`opponentTargetThreatWeight`: 0,5 × (moc·2 + wytrzymałość)
  // z limitem): wybór między ocalałymi celami rozstrzyga wartość celu, a limit
  // trzyma dopłatę poniżej progu dobicia (30 + 2·moc), żeby „zabij 1/1" nie
  // przegrało z „osłab 8/8". Dopłata za odbiorcę ridera to sam przyrost
  // licznika (równy `counterAmountWeight`) — termin ciała i okna walki należą
  // do efektu celowanego, który `counterHostValue` już wycenił z kontekstem.
  'counterThreatWeight',         // dopłata za zagrożenie celu wrogiego licznika (worth × waga)
  'counterThreatCap',            // limit dopłaty — dobijanie zostaje wyżej
  'counterSpreadPerRecipient',   // rider „na każdy mój stwór z licznikiem" — za odbiorcę
  // PMSSB-23 (F4/F5) — OKNA, w których trwały licznik kupuje coś konkretnego.
  // Pomiar PRZED: wszystkie trzy były niewidoczne — licznik na 2/2 z Flying
  // = na 2/2 z Menace = na wanilii 2/2 (68/68/68), a ten sam czar w Głównej 1
  // (przed walką, którą licznik rozstrzyga) był warty tyle, co w Głównej 2
  // (70/70), choć ten drugi musi jeszcze przetrwać turę przeciwnika, zanim
  // cokolwiek zrobi (`counterCombatBonus` zapala się tylko dla walki, która
  // TRWA — `pumpImprovesOutcome` zwraca null poza walką). Wartości:
  //  - `counterEvasionBonus` 5 — około jednego punktu ciała (waga ciała to
  //    2 × worth, więc krok 2/2→3/3 = 6): ewazja jest warta tyle, co odrobina
  //    ciała, nie cały stwór; dopłata zapala się tylko, gdy przeciwnik MA
  //    blokujących, ale nie dosięgnie gospodarza (inaczej nie rozstrzyga
  //    wyboru celu — patrz `hostEvadesBlockers`);
  //  - `counterLateWindowPenalty` 4 — tyle, ile baza okna M179/C dla grantu
  //    („zdąży pomóc w tej walce”), bez mnożnika za liczbę keywordów; to KARA
  //    za Główną 2/fazę końcową, nie premia za Główną 1 (kotwica anty-over-fix
  //    M429 — wycena okna głównego zostaje dawna). Szkic planu miał premię
  //    `counterPrecombatBonus`; pokrętło nigdy nie weszło do kodu (audyt #147, F2);
  //  - `counterLethalClockBonus` 50 — istniejąca konwencja „moc ≥ życie
  //    przeciwnika” (jak w gałęzi obrażeń od mocy), daleko poniżej 1000 za
  //    dowiedzioną wygraną: licznik sam nie wygrywa, atak trzeba jeszcze
  //    zadeklarować.
  'counterEvasionBonus',         // gospodarz, którego ataku przeciwnik nie zatrzyma
  'counterLateWindowPenalty',    // kara, gdy walka tej tury już za nami (Główna 2 / faza końcowa)
  'counterLethalClockBonus',     // licznik domyka grę: moc ≥ życie przeciwnika, atak nie do zatrzymania
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
  // PMSSB-21 (mikro, 2026-09-29): rodzina „cel wskazywany przez przeciwnika"
  // (`resolve_opponent_target` — Cuombajj Witches, drugi cel obrażeń wskazuje
  // przeciwnik; CR 601.2c). Nowy dowód: audyt remisów 190/190 rozróżnialnych
  // w tej decyzji (gałąź „ocalały wrogi stwór" miała gołą stałą 30).
  'opponentTargetFoeBase',      // kotwica: dawna stała 30 dla ocalałego wroga
  'opponentTargetThreatWeight', // dopłata za zagrożenie celu (moc·2+wytrz) — ×0 = dawna wartość
  'foodKeepValue',      // PMSSB-22: wartość ZACHOWANEGO Food (3 życia) — ×0 = dawne „zawsze poświęcaj”
  'foodDecisiveBonus',  // PMSSB-22: dopłata, gdy większy wariant zmienia wynik walki, a mniejszy nie
  // O3/U5 (audyt #146, fala 2026-10-01): próg „mało życia” i mnożnik ceny
  // zatrzymania Food siedziały w kodzie bota jako twarde `10` i `2`.
  // Kotwica anty-over-fix: próg 0 wyłącza podwojenie (mnożnik przestaje
  // działać), mnożnik 1 = brak dopłaty under pressure.
  'foodKeepLowLifeThreshold',   // próg życia, od którego Food jest cenniejszy (dawniej stała 10)
  'foodKeepLowLifeMultiplier',  // mnożnik wartości Food pod presją życia (dawniej stała 2)
  'opponentTargetThreatCap',    // limit dopłaty, by nie zbliżyć się do progu dobicia (100+2·moc)
  // PMSSB-24 (F1) — KOLEJNOŚĆ kart, które zostają na wierzchu po scry/surveil.
  // CR 701.22a („the rest on top of your library in any order") i 701.25 dają
  // graczowi wybór kolejności, a silnik oferuje permutacje
  // (`game-state.js:7149-7160`). Pomiar PRZED (sonda pmssb24-scry-przed.mjs):
  // `resolve_scry` liczył tylko `bottomIds`, więc 6 permutacji keep-all
  // remisowało po 20 i wybór padał na pierwszą z listy; przy surveil było
  // gorzej — `keepsOrder ? 1 : 0` premiowało kolejność ORYGINALNĄ, więc
  // świadome ułożenie przegrywało 21:20. Karta pierwsza na wierzchu jest
  // dobierana najbliższym drawem, kolejne później (możemy ich nie dożyć),
  // więc ten sam zbiór kart jest wart więcej, gdy lepsza karta leży wyżej.
  'scryOrderWeight',             // waga różnicy względem układu pierwotnego (×0 = dawny remis)
  'scryOrderDiscount',           // ile warte jest każde przesunięcie karty w głąb wierzchu
  // PMSSB-24 (F3/F4) — kontekst, którego wycena karty nie znała.
  // F4: `cardKeepValue` nie czytała ręki, więc ręka z czterema kartami dawała
  // tę samą wycenę co ręka pusta (pomiar P5: 12/12 = 12/12). Druga i kolejna
  // kopia TEJ SAMEJ karty jest warta mniej (dwóch naraz nie zagramy); lądy są
  // poza regułą, bo ich nasycenie obsługuje istniejący próg 3 w ręce / 6 na
  // stole. ×0 = dawna wycena bez względu na duplikaty.
  // F3: surveil kładzie kartę do GROBU (CR 701.25), a grób bywa zasobem —
  // przy Delve (CR 702.66) albo reanimacji zmielenie karty jest paliwem, nie
  // stratą (pomiar P4: 25 pkt z delve w ręce = 25 bez). Limit pilnuje, żeby
  // jedna karta z delve nie usprawiedliwiała mielenia całej talii.
  'cardDuplicateDiscount',       // zniżka za każdą kolejną kopię tej samej karty w ręce
  'cardDuplicateMaxCopies',      // ile kopii najwyżej zliczamy (limit zniżki)
  'surveilGraveSynergyPerSource',// dopłata za zmieloną kartę na każde źródło czytające z grobu
  'surveilGraveSynergyCap',      // limit dopłaty na kartę
  // PMSSB-25 (mikro-pętla, F1) — druga miara jakości karty przy koszcie
  // „odrzuć". Reguła ciała (`handCardKeepValue`, M408/D) nie zna zasięgu many,
  // nasycenia lądów ani duplikatów, bo jest równoległą kopią wspólnej
  // `cardKeepValue`. Pomiar PRZED: przy 2 lasach bot trzymał Woolly Loxodona
  // {5}{G}{G} i odrzucał grywalnego stwora 2/1 (−1 vs 14 pkt), choć wspólna
  // miara mówi o bombie −3 (koszt 7 > zasięg+2). Karty, których wspólna miara
  // NIE chce, oddajemy chętnie; `discardUnwantedBonus` to płaska dopłata za
  // samo pozbycie się karty niechcianej (×0 = sama wartość wspólnej miary).
  'discardUnwantedBonus',        // dopłata za odrzucenie karty, której wspólna miara nie chce
  // PMSSB-26 — drabina wartości landu (specyfikacja właściciela 2026-09-30).
  // Land KOLOROWY: licznik = ile lądów danego pipa na stole + w ręce.
  // Land BEZBARWNY/utylitarny: licznik = suma lądów na stole + w ręce.
  // Cztery stopnie wartości wspólne dla obu drabin; progi osobne, bo skala
  // „ile źródeł koloru potrzebuję" i „ile lądów do działania" jest inna.
  'landKeepCritical',            // 0 źródeł / 0-2 lądów: bardzo duża (nigdy nie odrzucaj)
  'landKeepHigh',                // 1 źródło / 3-4 lądy: spora (zwykle nie odrzucaj)
  'landKeepNeutral',             // 2 źródła / 5-6 lądów: neutralna (raczej nie odrzucaj)
  'landKeepSaturated',           // 3+ źródeł / 7+ lądów: niska (raczej odrzucaj)
  'landColoredCriticalMax',      // próg: licznik pipa <= tej wartości → critical
  'landColoredHighMax',          // próg: licznik pipa <= tej wartości → high
  'landColoredNeutralMax',       // próg: licznik pipa <= tej wartości → neutral
  'landTotalCriticalMax',        // próg: suma lądów <= tej wartości → critical
  'landTotalHighMax',            // próg: suma lądów <= tej wartości → high
  'landTotalNeutralMax',         // próg: suma lądów <= tej wartości → neutral
  // PMSSB-28 — wybór koloru rozdzielony po `purpose` z pending (silnik niesie
  // cel: 'mana' dla lądu z chooseColor, 'protection' dla aury). Motywy są
  // przeciwstawne, więc każdy cel ma własną wagę; nieznany cel zostaje przy
  // dawnej sumie `5 + needScore*6 + enemyInColor`.
  'colorProtectionPerCreature',  // waga wrogiego stwora w kolorze ochrony
  'colorManaNeedPerCard',        // waga karty w ręce wymagającej tego koloru
  // PMSSB-29 — szukanie w bibliotece korzysta ze WSPÓLNEJ miary karty
  // (`cardKeepValue`), nie z własnej kopii `25 + (land ? 30 : 0) + 2P+T`.
  // Baza musi zostać wyraźnie nad `-40` za „nie znajdź karty", żeby szukanie
  // było zawsze lepsze od rezygnacji (zgłoszenie właściciela B, Temat 6).
  'searchFoundBase',             // baza za znalezienie karty (wspólna miara dochodzi)
  // PMSSB-30 — Satyr Wayfinder: ta sama wspólna miara (`cardKeepValue`) co
  // w `resolve_search_choice`; wcześniej `30 + (land ? 30 : 0) + 2P + T`, czyli
  // czwarta kopia tej samej reguły (L41). Baza musi zostać wyraźnie nad −5
  // za rezygnację, bo reszta odsłoniętych kart i tak idzie do grobu.
  'satyrLookBase',               // baza za wzięcie odsłoniętej karty do ręki
  'blockGoodTradePerPoint',      // premia za pkt obrażeń ponad wartość ginącego blokera
  // PMSSB-32 — produkcja many (`add_mana`). Audyt okien zdolności many:
  // kiedy mana realnie przesuwa próg opłacalności, a kiedy jest „na zapas”
  // (M128). Dwa nowe wymiary po pomiarze PRZED:
  // Koszt tapnięcia CIAŁA na manę — tap stwora to nie tap artefaktu: przed
  // deklaracją atakujących traci się atakującego, w cudzej turze blokera,
  // a po deklaracji (main2) ciało zrobiło swoje i tap jest tani (czujność
  // i obrońca nie tracą nic — CR 702.20b/702.3b).
  'manaTapBodyPerStat',          // kara za tapnięcie ciała bojowego, za każdy punkt (moc/wyt.)
  'manaTapBodyMax',              // sufit kary za tapnięcie ciała
  // PMSSB-34 — zdolności aktywowane (`activate_ability`). Obowiązkowa kontrola
  // procedury (b): wymiar KOSZTU; oraz treść sprzętu (L41 z gałęzią przeniesienia).
  'abilityManaCostPenalty',      // kara za punkt many kosztu aktywacji (skala jak creatureManaCostWeight)
  'equipPumpBonusPerPoint',      // waga ciała dokładanego przez sprzęt przy pierwszym założeniu
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
  // PMSSB-1 (wartości przemyślane, pomiar PRZED: /tmp/pmssb1-bounce-przed.mjs):
  // top 8 (~1 dobór wroga mniej), bottom 18 (jak destroy-ETB — prawie
  // removal), token 12 (symetria z create_token 12), ETB waga 1 (pełna
  // wartość powtórki z etbEnterBonusValue).
  bounceLibraryTopBonus: 8,
  bounceLibraryBottomBonus: 18,
  bounceTokenBonus: 12,
  bounceFoeEtbWeight: 1,
  // PMSSB-1/B (wartości przemyślane): mana przerzucenia droższa od
  // power (3 vs 2 — many nie wracają), tempo 10 (połowa „karty" —
  // mniej niż strata permanenta, więcej niż nic).
  bounceRecastManaWeight: 3,
  bounceTempoPenalty: 10,
  // PMSSB-1/C (wartości przemyślane): swing 8 (jak top — „pół tempa”,
  // za słaby by przebić różnicę celów, dość silny by rozstrzygać okna),
  // lethal 100 (życie > karta, poniżej twardego bana), overflow 12
  // (symetria z tokenem — wymuszony odrzut ≈ zniszczony zasób).
  bounceTimingSwing: 8,
  bounceLethalDodgeBonus: 100,
  bounceOverflowBonus: 12,
  // PMSSB-2/A (F4): 1 mana z tokena ≈ 3 (jak koszt recastu —
  // mana zdatna do wydania, ale dopiero po aktywacji/poświęceniu).
  tokenManaBankWeight: 3,
  // PMSSB-2/B (F1): 8 jak bounce-TimingSwing (lustro — ta sama skala
  // „pół tempa": rozstrzyga okna, nie przebija różnicy celów).
  tokenTimingSwing: 8,
  // PMSSB-2/C (F7): 1 grosz za CMC (tie-break, nie opportunity-cost —
  // pełna wycena kosztu OUT jak w planie; skala groszowa nie przewraca
  // realnych różnic, tylko rozstrzyga remisy tego samego efektu).
  tokenManaCostTieBreak: 0.01,
  // PMSSB-3/F2: instant-draw na EOT przeciwnika (lustro M211/A1-scry: ta sama
  // racja fizzle-many; wartosc jak okno-scry, wlasne pokretlo).
  instantDrawFoeEndBonus: 10,
  // PMSSB-15 (wartości przemyślane, pomiar PRZED: /tmp/pmssb15-prewencja-przed.mjs):
  // bazy (ownTurn −300 / wasted −75 / chip 15) = wartości HISTORYCZNE rodzin
  // M91/M236 — anty-over-fix: najsłabszy realny wariant zachowuje starą cenę;
  // nowe wymiary to dopłaty: lethal-save 40 (zysk największy — „ratunek z
  // śmierci"; pełny fog przy lethalu = 50+15+40 = 105 > cantrip i > tarcza
  // 3-dmg Withstand ~80, ale < bounceLethalDodgeBonus 100 za removal-zbicie),
  // saved-creature 12 (jak animate_linked 10 + 2 za ocalenie zamiast powtórki),
  // cap 3 stwory (powyżej sytość). Wyciek (F3) skaluje bazę do zapobiegalnej
  // mocy; pełny wyciek = wasted. F4: baza 3 = dawna płaska ETB (anty-over-fix).
  fogWindowOwnTurnValue: -300,
  fogWindowWastedValue: -75,
  fogWindowChipValue: 15,
  fogWindowLethalSaveValue: 40,
  fogWindowSavedCreatureValue: 12,
  preventEtbWindowBaseValue: 3,
  // PMSSB-16 (wartości przemyślane, pomiar PRZED: /tmp/pmssb16-walka-przed.mjs):
  // bazy bite (8/2/15) i fight (25/2/5) = wartości HISTORYCZNE Batch 45
  // (anty-over-fix — najsłabszy realny wariant zachowuje starą cenę);
  // nowe wymiary: kara śmierci = wartość ciała 2p+t+mv waga 1 (skala
  // M149/A3/sac-economics — L41; zastępuje płaskie −20: małe stwory giną
  // taniej, duże drożej → wymiana w dół przestaje się opłacać),
  // lifelink waga 1 (pełne lustro obu stron — CR 701.14d), okna walki
  // REUSE fogWindowLethalSaveValue/fogWindowSavedCreatureValue (L41 —
  // jedna skala ratunku w rodzinie).
  fightBiteChipBase: 8,
  fightBitePowerWeight: 2,
  fightBiteLethalBonus: 15,
  fightKillBase: 25,
  fightKillPowerWeight: 2,
  fightMissBase: 5,
  // Wymiana (oba giną) — drabina PMSSB-16: różnica ciał ×2 (moc podwójnie —
  // jak M157/aury) minus koszt dodatkowej karty 25 (połowa killBase — wymiana
  // to NIE czysty removal: tracę też swojego stwora). Skala daje drabinę
  // kill-only (25+2p) > wymiana w górę (+5 dla 1/1→6/6) > wymiana równa
  // (−25) > wymiana w dół (−55 dla 6/6→1/1 — musi przebić bazę czaru 50,
  // konwencja M167/F: kara szkodliwego efektu przebija bazę).
  fightTradeWorthWeight: 2,
  fightTradeCardCost: 25,
  // Śmierć BEZ zabicia (mój stwór ginie, ich żyje) to najgorszy wariant —
  // dodatkowa kara musi przebić bazę czaru 50 już dla ciał 2/2+ (M167/F).
  fightWastedDeathExtra: 12,
  fightLifelinkWeight: 1,
  // PMSSB-17 kradzież do EOT: 5 + 2·moc + 4·min(luki,3) + eq(25+5·n);
  // cel własny/brak = −70 (M231 — przebija bazę 50 → poniżej passu).
  gainControlStealBase: 5,
  gainControlAttackWeight: 2,
  gainControlOpenValue: 4,
  gainControlEquipBonus: 25,
  gainControlEquipPerItem: 5,
  gainControlOwnPenalty: 70,
  // PMSSB-19 search_library: 10/9 jak stara tabela ETB (L41 — bazy bez
  // dryfu); two_cards = 9 (najlepsza do ręki) + 7 (połowa grobowa).
  searchToBattlefieldBase: 10,
  searchToHandBase: 9,
  searchLandScrewBonus: 5,
  // PMSSB-20 (mill — re-audyt): presja deck-outu wroga (wyścig bibliotek)
  // + combo self-mill z reanimacją. Bazy 20+3n / −80 historyczne (guard).
  millFoeDeckOutWinValue: 400,
  millFoePressureWeight: 4,
  millFoePressureCap: 12,
  millReanimateBonus: 15,
  millSelfTargetGuard: 55,
  searchTwoCardsValue: 16,
  // (PMSSB-8/F-L1b: ferociousLootExpected usunięte — patrz klucze wyżej.)
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
  // M431 (uwaga z gry właściciela 2026-09-25) — rodzina decyzji kroku
  // odkręcania. Rząd wielkości jest LUSTREM rodziny aura (66/80): wybór
  // „zostaw w tapie" jest wart tyle, ile realnie unieruchomiony wróg, a
  // płacimy za niego utratą odkręcenia źródła.
  untapChoiceLockValue: 10,
  untapChoiceOwnLockPenalty: 8,
  untapChoiceSourceTapCost: 6,
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
  // PMSSB-23 (F2/F3) — patrz uzasadnienie przy HEURISTIC_PARAM_KEYS.
  counterThreatWeight: 0.5,
  counterThreatCap: 15,
  counterSpreadPerRecipient: 4,
  // PMSSB-23 (F4/F5) — patrz uzasadnienie przy HEURISTIC_PARAM_KEYS.
  counterEvasionBonus: 5,
  counterLateWindowPenalty: 4,
  counterLethalClockBonus: 50,
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
  // PMSSB-21 (mikro) — cel wskazywany przez przeciwnika: PMSSB-21/R1.
  // Bazowa 30 = dawna stała (kotwica, „najsłabszy realny wariant" M429).
  // Dopłata za zagrożenie = 0,5 × (moc·2 + wytrzymałość) z limitem 15:
  // 4/4 → 36, 1/3 → 32,5 (dawny remis rozstrzygnięty), 12/12 → 45 (limit).
  // Próg dobicia (100 + 2·moc) pozostaje nieosiągalny dla tej gałęzi.
  opponentTargetFoeBase: 30,
  opponentTargetThreatWeight: 0.5,
  foodKeepValue: 12,
  foodDecisiveBonus: 25,
  // O3/U5 — patrz uzasadnienie przy HEURISTIC_PARAM_KEYS (dawne twarde 10 i 2).
  foodKeepLowLifeThreshold: 10,
  foodKeepLowLifeMultiplier: 2,
  opponentTargetThreatCap: 15,
  // PMSSB-24/F1 (Fala A) — kolejność wierzchu. Waga 1 = różnica liczona
  // w tych samych jednostkach co `cardKeepValue` (skala „czy chcemy tę kartę
  // dobrać"), więc nie wprowadza nowej skali i nie przesuwa decyzji o
  // podzbiorze odłożonym (kotwica anty-over-fix: przy `scryOrderWeight: 0`
  // wartości wracają do stanu sprzed fali, w tym do preferencji kolejności
  // oryginalnej przy surveil). Dyskonto 0,6 = karta o jedną pozycję głębiej
  // jest warta 60% — bardziej strome niż „pół na pół", bo najbliższe dobranie
  // jest pewne, a drugie wymaga przetrwania tury przeciwnika.
  scryOrderWeight: 1,
  scryOrderDiscount: 0.6,
  // PMSSB-24/F4: 3 pkt za kopię, max 2 kopie (−6) — mniej niż wartość taniego
  // stwora z ciałem (9 przy 3 lądach), więc duplikat nie zrównuje się ze
  // śmieciem, tylko schodzi o „pół karty".
  cardDuplicateDiscount: 3,
  cardDuplicateMaxCopies: 2,
  // PMSSB-24/F3: 2 pkt za źródło na kartę, limit 4 — dokładnie tyle, ile
  // `MILL_CAUTION` (2), więc JEDNO źródło w ręce znosi ostrożność grobu dla
  // karty na granicy opłacalności, a nie dla każdej.
  surveilGraveSynergyPerSource: 2,
  surveilGraveSynergyCap: 4,
  // PMSSB-25/F1: 5 pkt — tyle, ile warta jest różnica między dwiema grywalnymi
  // kartami w regule ciała, więc „niechciana" wygrywa z każdą kartą grywalną
  // o ciele do ~10 (2×moc+wytrz), ale nie z regułą koloru właściciela (M408),
  // która jest liczona osobną gałęzią i zostaje nietknięta.
  discardUnwantedBonus: 5,
  // PMSSB-26: stopnie dobrane do istniejącej skali `cardKeepValue` — karta
  // niegruntowa dostaje 4..12, więc „neutralna" (8) trzyma land nad zwykłym
  // stworem, a „niska" (-6) oddaje go chętniej niż cokolwiek grywalnego.
  // „Bardzo duża" (30) sięga sufitu klamry `-min(30, ...)` w regule ciała,
  // więc land jedynego źródła koloru nie przegra z żadną zwykłą kartą.
  landKeepCritical: 30,
  landKeepHigh: 18,
  landKeepNeutral: 8,
  landKeepSaturated: -6,
  landColoredCriticalMax: 0,
  landColoredHighMax: 1,
  landColoredNeutralMax: 2,
  landTotalCriticalMax: 2,
  landTotalHighMax: 4,
  landTotalNeutralMax: 6,
  // PMSSB-28: 6 — tyle, ile dawna waga potrzeby many, więc skala się nie
  // zmienia; wystarcza, żeby JEDEN wróg w kolorze (5+6=11) wygrał z kolorem
  // pustym (5) i żeby trzy (5+18=23) nie zostawiły wątpliwości.
  colorProtectionPerCreature: 6,
  colorManaNeedPerCard: 6,
  // PMSSB-29: 25 — dawna baza, więc relacja do `-40` za rezygnację zostaje;
  // przy wspólnej mierze (−6..30) rozstrzał wariantów to 19..55, czyli wciąż
  // daleko od progu rezygnacji.
  searchFoundBase: 25,
  // PMSSB-30: 30 — dawna baza; przy wspólnej mierze (−6..30) rozstrzał to
  // 24..60, wciąż daleko nad −5 za rezygnację.
  satyrLookBase: 30,
  blockGoodTradePerPoint: 2,
  // PMSSB-32 (wartości przemyślane, pomiar PRZED:
  // /home/user/scratch/pmssb32-mana-przed.mjs): nowe wymiary to DOPŁATY/KARY
  // nad starą arytmetyką (anty-over-fix — realne odblokowanie liczbowe z
  // net > 0 nadal płaci dokładnie 4·net, jak przed pętlą).
  // Ciało: 2 za punkt, sufit 8 (≈ jedna karta z ręki; nigdy nie przebija
  // premii za duże odblokowanie liczbowe), żeby „mana z 4/4 przed atakiem”
  // była rozstrzygająco droższa od „many z 0/1 ściany”, a nie blokowała
  // rzutu (auto-płatność silnika i tak do-tapuje źródło przy cast ofercie).
  manaTapBodyPerStat: 2,
  manaTapBodyMax: 8,
  // PMSSB-34 (pomiar PRZED: /home/user/scratch/pmssb34-koszt-przed.mjs, scenariusze A/B):
  // 1 punkt za manę — DOKŁADNIE ta sama skala co `creatureManaCostWeight` przy
  // rzucie stwora (L41/L48: jedna arytmetyka kosztu, nie druga). Wyjątkiem są
  // zdolności z `add_mana` (koszt policzony w `net`, PMSSB-32/A).
  abilityManaCostPenalty: 1,
  // Ciało sprzętu liczone tą samą funkcją co przy przeniesieniu
  // (`equipValuation.bodyValue`), wagą 1 — dopłata, nie zamiana bazy
  // „10 + 2 × moc nosiciela" (anty-over-fix M429).
  equipPumpBonusPerPoint: 1,
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
