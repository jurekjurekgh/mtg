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
  'auraProtectionNoThreatPenalty',  // kara za czystą ochronę, gdy przeciwnik nie ma zagrożeń tej jakości (dawniej -40)
  'auraProtectionBase',          // baza czystej ochrony przy istniejących zagrożeniach (dawniej 20)
  'auraProtectionThreatWeight',  // waga LICZBY zagrożeń, przed którymi aura chroni (dawniej *12)
]);

export const DEFAULT_HEURISTIC_PARAMS = Object.freeze({
  creatureBase: 70,
  creaturePowerWeight: 2,
  creatureToughnessWeight: 1,
  // 1 punkt za każdy punkt many: wystarcza, by rozstrzygnąć „to samo ciało za
  // mniejszą manę" (remis w audycie: 4 na 12 partii), ale nie waży tyle co
  // sama siła (2/pt), więc większy stwór za większą manę nadal wygrywa.
  creatureManaCostWeight: 1,
  spellBase: 50,
  attackThroughBonus: 3,
  attackOpenBoardBonus: 8,
  attackEvasionBonus: 3,
  removalEnemyBase: 22,
  removalWorthWeight: 2,
  bounceEnemyBase: 25,
  bounceEnemyPowerWeight: 2,
  drawCardValue: 6,
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
  auraProtectionNoThreatPenalty: 40,
  auraProtectionBase: 20,
  auraProtectionThreatWeight: 12,
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
