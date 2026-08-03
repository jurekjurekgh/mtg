import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCH_BOT_FACTORIES,
  REGRESSION_CONFIG,
  defaultPairs,
  formatBenchmarkReport,
  listRepoDeckNames,
  parseBenchmarkArgs,
  runBenchmark,
} from '../tools/benchmark.mjs';

/**
 * Test regresji jakości bota — część harnessu B0 (docs/BOT_ROADMAP.md).
 *
 * Próbka `REGRESSION_CONFIG` jest deterministyczna (ADR 0005): ten sam kod daje
 * zawsze te same liczby zwycięstw. Progi poniżej pilnują, żeby zmiana bota (B1+)
 * mogła je wyłącznie PODNIEŚĆ. Po każdej świadomej zmianie bota:
 *
 *   1. uruchom pełny pomiar: `node tools/benchmark.mjs` (~1–2 min);
 *   2. sprawdź w macierzy, że nowy bot nie jest słabszy od poprzedniego;
 *   3. zaktualizuj progi i liczby w komentarzu do zmierzonych wartości
 *      (z marginesem ~15 p.p. w dół — próbka rośnie wraz z decks/*.txt).
 *
 * Pomiar z dnia wdrożenia B0 (2026-08-01, ta konfiguracja, 7 talii):
 * heuristic 153/224 (68.3%) vs random oraz 145/224 (64.7%) vs aggro.
 * Po dodaniu decks/real-batch3.txt (2026-08-01, 8 talii, 576 meczów/parę):
 * heuristic 187/288 (64.9%) vs random oraz 181/288 (62.8%) vs aggro.
 * Po pełnym wdrożeniu bestow i naprawie instalacji talii (deskryptory
 * types/entersTapped/bestow przechodzą do obiektów; 2026-08-01): heuristic
 * 198/288 (68.8%) vs random oraz 185/288 (64.2%) vs aggro; pełna macierz
 * 50 seedów (10 800 meczów): 70.6% vs random, 61.1% vs aggro, 69.3% aggro
 * vs random, 0 niedokończonych.
 * Po Batchu 4 (aura/equipment/cycling/backup + zmiany botów: equip w obu
 * botach, cycling tylko dla kart dalekich od wyrzucenia, tap_for_mana
 * reaguje też na artefakty/enchantmenty w ręce; 2026-08-01, 9 talii):
 * heuristic 225/360 (62.5%) vs random oraz 219/360 (60.8%) vs aggro;
 * 0 niedokończonych. Pełna macierz 50 seedów (13 500 meczów): 67.4% vs
 * random, 59.0% vs aggro, 71.4% aggro vs random. Progi przeliczone regułą
 * „zmierzone −15 p.p.".
 * Po B1 (lepsza heurystyka, 2026-08-02; szczegóły: docs/BOT_ROADMAP.md):
 * heuristic 263/360 (73.1%) vs random oraz 228/360 (63.3%) vs aggro;
 * 0 niedokończonych. Pełna macierz 50 seedów (13 500 meczów): 75.4% vs
 * random, 60.9% vs aggro, 71.4% aggro vs random; patologia deck-out na
 * synthetic-abilities (0% vs random) naprawiona (100%). Progi ponownie
 * przeliczone regułą „zmierzone −15 p.p.".
 * Po Batchu 5 (Midnight Guard / Holdout Settlement / Skyclave Geopede;
 * 2026-08-02, 10 talii, 440 meczów/parę): heuristic 329/440 (74.8%) vs
 * random oraz 278/440 (63.2%) vs aggro; 0 niedokończonych. Pełna macierz
 * 50 seedów (16 500 meczów): 77.1% vs random, 60.4% vs aggro, 73.5% aggro
 * vs random. Progi (0.59/0.48) przeliczone regułą „zmierzone −15 p.p.".
 * Po Batchu 6 (Soulmender / Illusory Demon / Jyoti, Moag Ancient;
 * 2026-08-02, 11 talii, 528 meczów/parę): heuristic 384/528 (72.7%) vs
 * random oraz 330/528 (62.5%) vs aggro; 0 niedokończonych. Pełna macierz
 * 50 seedów (19 800 meczów): 74.7% vs random, 58.6% vs aggro, 73.2% aggro
 * vs random. Progi bez zmian (0.59/0.48) — mieszczą się w regule
 * „zmierzone −15 p.p." (72.7→0.58, 62.5→0.48; „tylko w górę").
 * Po B3 (modelowanie przeciwnika — hipergeometria, 2026-08-02, 11 talii,
 * 528 meczów/parę): heuristic 383/528 (72.5%) vs random oraz 330/528
 * (62.5%) vs aggro; 0 niedokończonych. Pełna macierz (19 800 meczów):
 * 74.5% vs random, 58.6% vs aggro, 73.2% aggro vs random — na poziomie
 * baseline (neutralne wobec botów benchmarku; wartość w grze z człowiekiem,
 * który strategicznie trzyma odpowiedzi). Progi bez zmian (0.59/0.48).
 * Po Batchu 7 (Fake Your Own Death / Puppeteer Clique / Unstable Frontier /
 * Apprentice Wizard / Delta Bloodflies; 2026-08-02, 12 talii, 624 mecze/parę):
 * heuristic 467/624 (74.8%) vs random oraz 403/624 (64.6%) vs aggro;
 * 0 niedokończonych. Pełna macierz 50 seedów (23 400 meczów): 76.9% vs random,
 * 61.3% vs aggro, 75.8% aggro vs random — powyżej baseline sprzed batcha
 * (76.9%/61.2% przed wyceną nowych mechanik w bocie). Próg vs aggro podniesiony
 * do 0.49 regułą „zmierzone −15 p.p." (64.6 → 0.49); próg vs random bez zmian
 * (74.8 → 0.598, zaokrąglone w dół do 0.59).
 * Po Batchu 8 (Phyrexian Rager / Nefarious Imp / Gather the Townsfolk /
 * Evangel of Synthesis / Woolly Loxodon; 2026-08-02, 13 talii, 728 meczów/parę):
 * heuristic 546/728 (75.0%) vs random oraz 487/728 (66.9%) vs aggro;
 * 0 niedokończonych. Pełna macierz 50 seedów (27 300 meczów): 77.8% vs random,
 * 63.6% vs aggro, 75.5% aggro vs random — na poziomie baseline sprzed wyceny
 * nowych mechanik w bocie (77.8%/63.6%), próbka regresji vs aggro lekko w górę
 * (486 → 487). Wyceny ETB draw/discard/lose_life zmierzone osobno POGARSZAŁY
 * wynik (77.6% vs random) i zgodnie z zasadą B0 (zakaz pogorszenia) NIE zostały
 * wdrożone — bot wycenia z Batcha 8 wyłącznie tokeny i dobrania z czarów.
 * Próg vs aggro podniesiony do 0.51 regułą „zmierzone −15 p.p." (66.9 → 0.519,
 * zaokrąglone w dół); próg vs random bez zmian (75.0 → 0.60, zostaje 0.59).
 * Po B4 (strojenie wag hill-climbing, 2026-08-03; pełna macierz 13 talii,
 * 50 seedów, 27 300 meczów): heuristic 5 821/9 100 (64.0%) vs aggro,
 * 7 086/9 100 (77.9%) vs random, aggro 6 873/9 100 (75.5%) vs random;
 * 0 niedokończonych. Wagi przyjęte po pomiarze: mana=1.1, permanent=0.9,
 * pozostałe rodziny=1.0. Próbka regresji: heuristic 492/728 (67.6%) vs
 * aggro oraz 547/728 (75.1%) vs random; progi podniesione do 0.52 / 0.60
 * regułą „zmierzone −15 p.p." (tylko w górę).
 * Po Batchu 9 (Kor Cartographer / Scorpion Sentinel / Dunland Crebain /
 * Dragonbroods' Relic / Secluded Steppe; 2026-08-03, 14 talii,
 * 840 meczów/parę w próbce regresji): heuristic 641/840 (76.3%) vs random
 * oraz 576/840 (68.6%) vs aggro, 0 niedokończonych. Pełna macierz 50 seedów
 * (31 500 meczów): heuristic 8 281/10 500 (78.9%) vs random,
 * 6 865/10 500 (65.4%) vs aggro, aggro 8 048/10 500 (76.6%) vs random.
 * Zmiany bota były generyczne: zwykły cycling dobiera kartę, aktywowany
 * create_token ma wycenę deskryptora; po wejściu Batchu 10 bot zachował
 * determinizm, a mechanika plot/tokenów działa bez niedokończonych meczów.
 * Pełna macierz 15 talii (36 000 meczów): heuristic 9 719/12 000 (81.0%)
 * vs random, 7 722/12 000 (64.3%) vs aggro, aggro 9 449/12 000 (78.7%)
 * vs random. Próbka regresji (960 meczów/parę): heuristic 759/960 (79.1%)
 * vs random oraz 645/960 (67.2%) vs aggro; próg random podniesiony do 0.64,
 * próg aggro pozostaje 0.53 (zasada „tylko w górę").
 * Po Batchu 11 (Underdark Explorer / Angel's Feather / Release the Ants /
 * Porcelain Legionnaire / Curate / Canonized in Blood; 2026-08-03, 16 talii,
 * 1 088 meczów/parę w próbce regresji): heuristic 881/1 088 (81.0%) vs
 * random oraz 723/1 088 (66.5%) vs aggro, 0 niedokończonych. Pełna macierz
 * 50 seedów (40 800 meczów): heuristic 82.9% vs random, 63.2% vs aggro,
 * aggro 80.3% vs random. Próbka regresji: vs random 81.0% → próg 0.66
 * („zmierzone −15 p.p., tylko w górę"); vs aggro 66.5% → 0.515, zaokrąglone
 * w dół do 0.53 (tylko w górę).
 * Po dokończeniu mechanik Batchu 11 (2026-08-03, decyzja właściciela: 100%
 * mechanik — loch Undercity wykonuje efekty pokoi, clash z wyborem
 * wierzch/spód, phyrexian mana z wyborem gracza, surveil z kolejnością
 * reszty): próbka regresji heuristic 883/1 088 (81.2%) vs random oraz
 * 718/1 088 (66.0%) vs aggro, 0 niedokończonych. Pełna macierz 50 seedów
 * (40 800 meczów): heuristic 83.0% vs random, 62.2% vs aggro, aggro 81.1%
 * vs random. Ruch ~1 p.p. vs aggro pochodzi z WYKONYWANIA efektów pokoi
 * (Trap! obniża życie, Forge/Throne wzmacniają najsilniejszego stwora —
 * często wroga), nie z logiki bota; progi 0.66 / 0.53 bez zmian.
 * Po dodaniu WYBORÓW CELÓW pokoi lochu dla gracza (2026-08-03): Forge,
 * Arena i Throne kolejkują resolve_room_target, Trap! — wybór gracza; boty
 * odpowiadają deterministycznie (aggro: Trap! → przeciwnik, Forge/Arena →
 * własny najsilniejszy stwór, Throne → najsilniejszy odsłonięty; heuristic
 * analogicznie z wyceną). Próbka regresji 884/1 088 (81.3%) vs random oraz
 * 717/1 088 (65.9%) vs aggro; pełna macierz 50 seedów (40 800 meczów):
 * heuristic 83.1% vs random, 62.3% vs aggro, aggro 81.2% vs random — progi
 * 0.66 / 0.53 bez zmian.
 */
const MIN_WIN_RATE_VS_RANDOM = 0.66;
const MIN_WIN_RATE_VS_AGGRO = 0.53;

function gamesWon(board, bot) {
  return board.wins[bot] ?? 0;
}

test('harness jest deterministyczny: dwa przebiegi dają identyczny wynik', () => {
  const config = {
    bots: ['aggro', 'heuristic'],
    decks: ['real-batch1', 'real-batch2'],
    seedsCount: 2,
    seedBase: 11,
    maxCommands: 3000,
  };
  const first = runBenchmark(config);
  const second = runBenchmark(config);
  assert.deepEqual(second, first);
});

test('rejestr botów benchmarku pokrywa się z domyślną macierzą par', () => {
  assert.deepEqual(Object.keys(BENCH_BOT_FACTORIES).sort(), ['aggro', 'heuristic', 'random']);
  assert.deepEqual(defaultPairs(['heuristic', 'random'], false), [['heuristic', 'random']]);
  assert.deepEqual(defaultPairs(['heuristic', 'random'], true), [['heuristic', 'heuristic'], ['heuristic', 'random'], ['random', 'random']]);
  assert.ok(listRepoDeckNames().includes('real-batch1'), 'harness powinien widzieć talie z decks/*.txt');
});

test('argumenty CLI: walidacja i odrzucanie nieznanych opcji', () => {
  assert.deepEqual(parseBenchmarkArgs(['--seeds', '7', '--self', '--json', 'raport.json']), {
    seedsCount: 7, selfPlay: true, jsonPath: 'raport.json',
  });
  assert.deepEqual(parseBenchmarkArgs(['--pairs', 'heuristic:random, aggro:heuristic']).pairs, [['heuristic', 'random'], ['aggro', 'heuristic']]);
  assert.throws(() => parseBenchmarkArgs(['--nonsense']), /Nieznana opcja/);
  assert.throws(() => parseBenchmarkArgs(['--seeds']), /wymaga wartości/);
  assert.throws(() => parseBenchmarkArgs(['--seeds', 'abc']), /dodatnią liczbą całkowitą/);
});

// Próbka regresji liczona RAZ na plik (~3 s) — testy poniżej dzielą wynik.
const regressionResult = runBenchmark(REGRESSION_CONFIG);

test('próbka regresji kończy wszystkie mecze rozstrzygnięciem', () => {
  for (const [key, entry] of Object.entries(regressionResult.pairs)) {
    assert.equal(entry.unfinished, 0, `para ${key} ma niedokończone mecze — podnieś maxCommands albo zbadaj patowanie`);
  }
});

test('bot heurystyczny nie jest słabszy niż próg regresji vs RandomBot', () => {
  const board = regressionResult.pairs['heuristic | random'];
  assert.ok(board, 'brak pary heuristic vs random w próbce regresji');
  const winRate = gamesWon(board, 'heuristic') / board.games;
  assert.ok(
    winRate >= MIN_WIN_RATE_VS_RANDOM,
    `heuristic wygrał tylko ${(winRate * 100).toFixed(1)}% vs random (próg ${MIN_WIN_RATE_VS_RANDOM * 100}%) — regresja jakości bota, zob. docs/BOT_ROADMAP.md`,
  );
});

test('bot heurystyczny nie jest słabszy niż próg regresji vs aggro', () => {
  const board = regressionResult.pairs['aggro | heuristic'];
  assert.ok(board, 'brak pary heuristic vs aggro w próbce regresji');
  const winRate = gamesWon(board, 'heuristic') / board.games;
  assert.ok(
    winRate >= MIN_WIN_RATE_VS_AGGRO,
    `heuristic wygrał tylko ${(winRate * 100).toFixed(1)}% vs aggro (próg ${MIN_WIN_RATE_VS_AGGRO * 100}%) — regresja jakości bota, zob. docs/BOT_ROADMAP.md`,
  );
});

test('raport tekstowy zawiera macierz i wyniki par (smoke formatowania)', () => {
  const result = runBenchmark({
    bots: ['heuristic', 'random'],
    decks: ['synthetic-aggro', 'synthetic-growth'],
    seedsCount: 1,
    seedBase: 5,
    maxCommands: 3000,
  });
  const report = formatBenchmarkReport(result);
  assert.match(report, /Benchmark botów \(B0\)/);
  assert.match(report, /Macierz win-rate/);
  assert.match(report, /== heuristic vs random ==/);
  assert.match(report, /synthetic-aggro \| synthetic-growth/);
});
