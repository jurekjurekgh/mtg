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
  'damageCreatureBase',      // baza za obrażenia w stwora wroga (dawniej +10)
  'damageCreaturePowerWeight', // waga mocy trafianego stwora (dawniej *3)
  'damageLethalBonus',       // premia, gdy obrażenia są śmiertelne (dawniej +15)
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
]);

export const DEFAULT_HEURISTIC_PARAMS = Object.freeze({
  creatureBase: 70,
  creaturePowerWeight: 2,
  creatureToughnessWeight: 1,
  spellBase: 50,
  attackThroughBonus: 3,
  attackOpenBoardBonus: 8,
  attackEvasionBonus: 3,
  removalEnemyBase: 22,
  removalWorthWeight: 2,
  bounceEnemyBase: 25,
  bounceEnemyPowerWeight: 2,
  damageCreatureBase: 10,
  damageCreaturePowerWeight: 3,
  damageLethalBonus: 15,
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
