import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_CONFIG,
  computeScoringSnapshot,
  readFixture,
} from '../tools/bot-scoring-snapshot.mjs';

/**
 * B6 T0 — golden-master wycen bota (sieć bezpieczeństwa refaktoru B6).
 *
 * Rola: udowodnić, że wyciąganie „magicznych liczb" z `scoreCommand` do
 * parametrów deskryptorowych (heuristic-params.js) NIE ZMIENIA zachowania bota
 * przy parametrach domyślnych. Ten test ma być ZIELONY przez cały refaktor —
 * gdy czerwienieje, znaczy że któraś ekstrakcja zmieniła wycenę (regresja
 * refaktoru), a agregaty (`scoreSum`, `chosenKinds`) wskazują którą partię.
 *
 * Uwaga: to golden-master REFAKTORU, nie miernik jakości. Jakość mierzy
 * benchmark (test/bot-benchmark.test.js). Gdy tuner B6 ŚWIADOMIE zmienia
 * parametry domyślne, fixture regeneruje się razem z przyjęciem nowych wag:
 *   node tools/bot-scoring-snapshot.mjs --write
 *
 * REJESTR ŚWIADOMYCH REGENERACJI (sesja 2026-10-27c, PR #177):
 *   - 5be4528f… → 4902f6a7… (C/uwaga właściciela: premia `blockFreeAbsorbBonus`
 *     za blok bezkosztowy). Zmierzona różnica — JEDNA opcja nie-wybrana:
 *     `block[permanent-53<permanent-68]` 1 → 3 na partii
 *     ravnica-wur|innistrad-wu@1001, tura 18 (declare_blockers): blok, w którym
 *     nikt nie ginie, dostaje 2 × 1 pkt za wchłonięte obrażenia. Wybrane
 *     komendy (321 decyzji) i scoreSum wybranej ścieżki (3185.9745) są
 *     IDENTYCZNE — zmiana nie odwraca żadnej decyzji, tylko uczciwiej wycenia
 *     odrzucony wariant.
 *   - 4902f6a7… → d5349621… (I/uwaga właściciela 2026-10-29: poświęcenie
 *     WŁASNEGO stwora ma sens wyłącznie wtedy, gdy stwór już ginie —
 *     `sacrificeSelfCostLoss` w `heuristic-bot.js`). Zmierzona różnica to
 *     DOKŁADNIE dwie nie-wybrane już aktywacje poświęcające własne stworzenie
 *     bez zagrożenia: ravnica-wur|innistrad-wu@1000, tura 15 declare_attackers
 *     (`permanent-28#0→graveyard-59`, aktywacja 1 → 0; partia 268 → 262
 *     decyzji, scoreSum 2900.65 → 2970.65) oraz …@1001, tura 19 main1
 *     (`permanent-68#0→graveyard-35`, 1 → 0; 321 → 298 decyzji, scoreSum
 *     3185.9745 → 3186.9495). Partia tarkir-bg|warhammer-ubr jest bez zmian,
 *     a wybory niezwiązane z poświęceniem (np. `permanent-18#0→permanent-45`
 *     w @1000, tura 14) zachowują IDENTYCZNY zestaw opcji i wynik.
 *   - d5349621… → 0e1c042c… (BATCH 71, 2026-11-01, PMSSB-80…86): zmiana jest
 *     ŚWIADOMA i dwuczęściowa — (a) dziesięć nowych kart batcha weszło do
 *     talii planowych (B2, `tools/generate-plan-decks.mjs`), co sama z siebie
 *     przesuwa trajektorie wszystkich par, (b) siedem nowych gałęzi wyceny:
 *     próg `lands>=toughness` (Rumbling Rockslide), okno walki trika
 *     (Violent Urge), mill klątwy (Curse of the Bloody Tome), wybór okna
 *     championa (Changeling Berserker), pump atakujących (Trumpet Blast),
 *     pusta biblioteka w impulsie (Anticipate) i koszt ofiar z kolorów
 *     (Sphinx's Herald). Pomiar per partia (decisions, scoreSum):
 *       ravnica-wur|innistrad-wu@1000: 262→262, 2970.65→2971.65.
 *         Audyt #177 A65: odtworzone ślady commitów a55693c i 86b25b9
 *         różnią się w decyzji nr 224 (main1 tury 18): wybrana karta
 *         drawn-15 pozostaje ta sama, ale jej wycena rośnie 43→44; zmieniają
 *         się też wyceny czterech niewybranych kart. To NIE jest hash-only.
 *       ravnica-wur|innistrad-wu@1001: BEZ ZMIAN (298, 3186.9495),
 *       dominaria-brg|mirrodin-wu@1000: 205→203, 3030.4126→3048.1072,
 *       dominaria-brg|mirrodin-wu@1001: 300→313, 3580.9562→3591.2971,
 *       tarkir-bg|warhammer-ubr@1000: 179→174, 1576.1099→2531.0099,
 *       tarkir-bg|warhammer-ubr@1001: 126→164, 2279.7081→2503.0099.
 *     Skok scoreSum na tarkir-bg|warhammer-ubr wymagałby osobnego porównania
 *     pełnych śladów: same wyceny niewybranych wariantów nie zmieniają sumy
 *     wyników WYBRANYCH komend. Hash i agregaty nie dowodzą jakości gry ani
 *     przyczyny dryfu. Historyczny pomiar quick: heuristic 87.5% ogółem,
 *     vs random 96.7%, vs aggro 78.3%; nie jest to pomiar obecnego drzewa.
 *   - bf7acd6a… → a9ded3e5… (zgłoszenie D, etapy K1/7/8/9, 2026-11-05):
 *     bramki trzymania instantów (liczniki, pump+ugryzienie, burn w twarz,
 *     removal w podtrzymaniu). Zmierzona różnica: tylko
 *     ravnica-wur|innistrad-wu@1001 (299→284 decyzji, scoreSum
 *     3166.2283→3018.6759); pozostałych pięć śladów bitowo identycznych.
 *     To świadoma zmiana polityki bota, nie refaktor ani pomiar jakości.
 *   - abc34db7… → bf7acd6a… (ADR 0032, wspólny checkpoint, etap 2): jawne
 *     wybory kolejności/modalne checkpointu zmieniają trajektorię bota.
 *     Zmierzona różnica: tylko ravnica-wur|innistrad-wu@1001 (298→299 decyzji,
 *     scoreSum 3186.9495→3166.2283); pozostałe pięć śladów bitowo identycznych.
 *     To nie jest pomiar jakości gry ani tuning parametrów.
 *   - 37a41eab… → abc4017e… (zgłoszenie G, etap 1 — poprawki bramkowe,
 *     2026-11-05): bot dokłada własne syntezowane deklaracje bloków
 *     z deskryptora (gangi prefiksowe i pokrycia w permutowanych
 *     porządkach blokerów), żeby widzieć krzyżowe przypisania bez
 *     powrotu silnika do enumeracji. Zmierzona różnica: TYLKO
 *     ravnica-wur|innistrad-wu@1001 (256 decyzji bez zmian liczby,
 *     scoreSum 1963.8357→1860.8982; block 8→7, cast_spell 5→3,
 *     pass_priority 207→209); pozostałe pięć śladów bitowo identycznych.
 *     Kontrola jakości: test/bot-benchmark.test.js 10/10 (progi regresji),
 *     co nie dowodzi równej siły gry. Świadoma regeneracja.
 *   - b8c7f8cc… → 37a41eab… (zgłoszenie G, etap 1, 2026-11-05): walka
 *     przechodzi z enumeracji kombinacji na ziarna + deskryptor problemu;
 *     bot heurystyczny dokłada własne prefiksowe deklaracje ataku. Zmierzona
 *     różnica: hashe 4 z 6 partii; dominaria-brg|mirrodin-wu@1000 ma ten sam
 *     przebieg wybranych decyzji i scoreSum (inny jest tylko zbiór ofert),
 *     natomiast trzy partie zmieniają trajektorię: ravnica-wur|innistrad-wu
 *     @1000 263→235 decyzji, scoreSum 2971.65→2825.82; @1001 284→256,
 *     3018.6759→1963.8357; dominaria-brg|mirrodin-wu@1001 313→285,
 *     3591.2971→3307.1953. Obie partie tarkir-bg|warhammer-ubr bez zmian.
 *     Kontrola jakości: test/bot-benchmark.test.js 10/10 (progi regresji),
 *     co nie dowodzi równej siły gry — tylko brak załamania poniżej progów.
 *     Świadoma regeneracja.
 *   - a9ded3e5… → b8c7f8cc… (zgłoszenie F, 2026-11-05): usunięcie limitów
 *     enumeracji wariantów (cap 32 itd.) na polecenie właściciela. Zmierzona
 *     różnica: TYLKO hashe 2 z 6 partii (ravnica-wur|innistrad-wu@1000 i
 *     dominaria-brg|mirrodin-wu@1001) — liczba decyzji, scoreSum i
 *     chosenKinds WYBRANYCH komend są bitowo identyczne we wszystkich
 *     partiach; zmienił się wyłącznie zbiór OFEROWANYCH (niewybranych)
 *     wariantów, które bot teraz widzi w komplecie. Świadoma regeneracja.
 *   - 0e1c042c… → abc34db7… (audyt #177 A74, APNAP): w @1000 po
 *     Summary Judgment w turze 15 gracz random dostał nowy wybór kolejności
 *     Elgaud Inquisitor / Selhoff Occultist. Wybrał Occultist jako pierwszy,
 *     jak w poprzednim śladzie, lecz zużył losowanie; w turze 16 w bloku
 *     zamiast declare_blockers wybrał pass_priority. Heurystyczny p1 wykonał
 *     jeden dodatkowy pass (262→263 decyzje), scoreSum bez zmian: 2971.65.
 *     Pozostałe pięć śladów bitowo identyczne; nie dowodzi to jakości bota.
 *   - abc4017e… → 83ee50de… (zgłoszenie H2, 2026-11-07): kara
 *     `suspendMain1Penalty` (40, heuristic-params.js) — dodatni scoring
 *     suspend wyłącznie w Głównej 2 („mana pod koniec tury"). Zmierzona
 *     różnica: TYLKO dominaria-brg|mirrodin-wu@1001 — jedyna partia
 *     korpusu z Mindstabem w talii (decks/dominaria-brg.txt). Liczba decyzji
 *     (285), scoreSum (3307.1953) i chosenKinds WYBRANYCH komend są bitowo
 *     identyczne we wszystkich sześciu partiach: zmieniły się wyłącznie
 *     wyceny NIE-WYBRANYCH opcji suspend_card w Głównej 1 (−40 każda),
 *     których bot w tych partiach i tak nie wybierał. Żadna decyzja nie
 *     została odwrócona. Dowód przełączenia okna (main1→pasowanie/main2→
 *     suspend) żyje w test/audyt-pmssb35-odroczenie.test.js, sekcja H2,
 *     i w partii t3 Żywego Testera (seed 4242). Świadoma regeneracja.
 */

test('golden-master: ślad bota == zamrożony fixture (bit w bit)', () => {
  const fixture = readFixture();
  const snapshot = computeScoringSnapshot();
  assert.equal(
    snapshot.overallHash,
    fixture.overallHash,
    'Wycena bota zmieniła się względem fixture. Jeśli to ŚWIADOMA zmiana '
    + 'parametrów (nie refaktor), zregeneruj: node tools/bot-scoring-snapshot.mjs --write',
  );
});

test('golden-master: każda partia zgadza się z fixture (lokalizacja różnicy)', () => {
  const fixture = readFixture();
  const snapshot = computeScoringSnapshot();
  assert.equal(snapshot.matches.length, fixture.matches.length, 'liczba partii golden-mastera');
  for (let i = 0; i < fixture.matches.length; i += 1) {
    const want = fixture.matches[i];
    const got = snapshot.matches[i];
    assert.equal(got.pair, want.pair, `para partii #${i}`);
    assert.equal(got.seed, want.seed, `seed partii #${i}`);
    assert.equal(
      got.hash,
      want.hash,
      `ślad partii ${want.pair}@${want.seed} różni się od fixture `
      + `(decyzje ${got.decisions} vs ${want.decisions}, scoreSum ${got.scoreSum} vs ${want.scoreSum})`,
    );
  }
});

test('golden-master: konfiguracja partii jest stała (talie jednoplanowe)', () => {
  // Zmiana zbioru partii = świadoma regeneracja fixture, nie przypadkowy dryf.
  assert.deepEqual(SNAPSHOT_CONFIG.seeds, [1000, 1001]);
  assert.equal(SNAPSHOT_CONFIG.pairs.length, 3);
  const decks = SNAPSHOT_CONFIG.pairs.flat();
  for (const deck of decks) assert.equal(typeof deck, 'string');
});

test('golden-master: pomiar jest deterministyczny (ADR 0005)', () => {
  // Dwa liczenia tego samego snapshotu muszą dać identyczny hash — bez tego
  // fixture byłby bezużyteczny (fałszywe czerwienienia).
  const a = computeScoringSnapshot();
  const b = computeScoringSnapshot();
  assert.equal(a.overallHash, b.overallHash);
});
