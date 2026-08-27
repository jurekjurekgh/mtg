/**
 * Harness pomiarowy B0 — macierz win-rate bot-vs-bot na taliach z decks/*.txt.
 *
 * Cel (docs/BOT_ROADMAP.md, Etap B0): każda zmiana bota MUSI być zmierzona tym
 * narzędziem PRZED scaleniem, a wynik (tabela) trafia do opisu PR. Dopiero
 * potem zwiększa się progi regresji w `test/bot-benchmark.test.js`.
 *
 * Determinizm (ADR 0005): bez Math.random i bez zegara w ścieżce pomiaru.
 * Mecz (botA+taliaX vs botB+taliaY) jest rozgrywany dwa razy na tym samym
 * seedzie meczowym — raz i w odbiciu lustrzanym (strony zamienione), więc obaj
 * boty grają NA TYCH SAMYCH ROZDANIACH z obu stron stołu. Próbka N seedów to
 * seedy seedBase..seedBase+N-1, wspólne dla wszystkich par — wyniki między
 * parami są porównywalne.
 *
 * Uruchomienie (CLI, ~10 ms/mecz):
 *   node tools/benchmark.mjs                      # profil SZYBKI (domyślny,
 *                                                 # QUICK_CONFIG, ~2–4 min)
 *   node tools/benchmark.mjs --full               # PEŁNA macierz 23 400
 *                                                 # meczów (~40+ min) — ADR
 *                                                 # 0018: wyłącznie na wyraźną
 *                                                 # komendę właściciela
 *   node tools/benchmark.mjs --seeds 20           # szybki, większa próbka
 *   node tools/benchmark.mjs --bots heuristic,random --decks real-batch1,real-batch2
 *   node tools/benchmark.mjs --pairs heuristic:random,heuristic:aggro
 *   node tools/benchmark.mjs --self               # dołącz self-play (balans stron)
 *   node tools/benchmark.mjs --json raport.json   # pełny wynik do pliku
 *
 * ADR 0018: pełna macierz (--full) NIGDY nie jest uruchamiana „przy okazji"
 * przez agenta — wyłącznie na wyraźną komendę właściciela. Domyślny profil
 * szybki to ta sama próbka, którą liczy test regresji (REGRESSION_CONFIG),
 * więc wynik jest porównywalny z progiem testowym.
 *
 * Test regresji (`test/bot-benchmark.test.js`) korzysta z tego samego modułu
 * i konfiguracji `REGRESSION_CONFIG`, więc próbka w teście jest identyczna
 * z każdym lokalnym odtworzeniem.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { createProxySampler } from './proxy-reward.mjs';

/**
 * Rejestr botów mierzonych harnessen. Fabryka dostaje seed (ADR 0005); aggro
 * go ignoruje. `random` gra bez losowej kapitulacji (`allowConcede: false`) —
 * inaczej większość „meczów" kończy się poddaniem w 1. turze i macierz nie
 * mierzy niczego z gry.
 */
export const BENCH_BOT_FACTORIES = Object.freeze({
  aggro: (seed) => createAggroBot(seed),
  // B3: bot dostaje talie obu graczy (ctx.opponentDeck) i modeluje rękę
  // przeciwnika hipergeometrycznie. B2-w2: lookahead gotowy (lookahead: 1)
  // ale domyślnie wyłączony — zbyt kosztowny na pełną macierz (~4x wolniej).
  // Infra: improved evalView (creature quality, evasion, deck-out pressure)
  // + simpleChoice policy dla przeciwnika w symulacji.
  heuristic: (seed, ctx) => createHeuristicBot({
    seed,
    opponentDeck: ctx?.opponentDeck,
    weights: ctx?.heuristicWeights,
    params: ctx?.heuristicParams,
  }),
  random: (seed) => createRandomBot({ seed, allowConcede: false }),
});

/**
 * Konfiguracja testu regresji jakości bota (mała, deterministyczna próbka).
 * Zmiana bota, która POGOŚZY wynik na tej próbce, musi zepsuć test — do tego
 * służą progi w `test/bot-benchmark.test.js`. Zmiana, która poprawia wynik,
 * powinna podnieść progi (instrukcja w teście).
 */
/**
 * M228 (ADR 0024): AUTO-PRÓBKA talii benchmarku — deterministycznie wybierana
 * z katalogu, a nie zamrożona ręcznie. Reguła podziału talii (≥30 → dwie talie)
 * zmienia zestaw talii z czasem; benchmark celowo pozwala „środowisku” się
 * odświeżać wraz z rozwojem katalogu (decyzja właściciela). Zmiana składu
 * próbki = jednorazowa rekalibracja progów w test/bot-benchmark.test.js
 * regułą „zmierzone −15 p.p., tylko w górę”.
 *
 * Wybór: talie jednoplanowe (bez worków — przejściowe, ADR 0023), posortowane
 * alfabetycznie, pierwsze BENCH_SAMPLE_SIZE. Sortowanie + stała liczba czynią
 * wybór DETERMINISTYCZNYM (ADR 0005): ten sam katalog → ta sama próbka.
 */
export const BENCH_SAMPLE_SIZE = 6;

export function selectBenchDecks(decksDir = 'decks') {
  return listRepoDeckNames(decksDir)
    .filter((name) => !name.startsWith('worek'))
    .sort()
    .slice(0, BENCH_SAMPLE_SIZE);
}

export const BENCH_DECKS = Object.freeze(selectBenchDecks());

export const REGRESSION_CONFIG = Object.freeze({
  bots: ['aggro', 'heuristic', 'random'],
  decks: BENCH_DECKS,
  pairs: [['heuristic', 'random'], ['heuristic', 'aggro']],
  // M132/M133: 4 seedy to ZA MAŁA próbka na próg regresji. Zmiana samych
  // TALII (dosypanie lądów wg reguły 2:1 — bot nietknięty) zbiła wynik
  // z 61,5 % na 56,3 %, czyli poniżej progu 57 %, choć na szerszej próbce
  // bot był SILNIEJSZY niż przedtem:
  //
  //    4 seedy (1 248 meczów) → 56,3 %
  //    8 seedów (2 496)       → 62,1 %
  //   16 seedów (4 992)       → 63,6 %   (przed zmianami: 61,5 % / 4 seedy)
  //
  // Próg ma łapać REGRESJE BOTA, a nie wahania losowania — przy takim szumie
  // dawał fałszywe alarmy i (gorzej) mógł przepuścić realne pogorszenie
  // schowane w drugą stronę. Podnosimy próbkę do 8 seedów: ~2× dłużej
  // (plik i tak jest w `slow`), a rozrzut spada z ~7 p.p. do ~1,5 p.p.
  seedsCount: 8,
  seedBase: 2026,
  // M73b: zdolności aktywowane na stosie (equip/cycling/channel/ninjutsu)
  // dodały rundy passów na aktywację — grind-games (deck-out race) wydłużyły
  // się na tyle, że cap 5000 ucinał grę tuż przed końcem (seed 1043 wiedzmin
  // vs azorius). Podniesione 5000 → 8000 (wzorzec M31: long-game → cap).
  maxCommands: 8000,
  selfPlay: false,
});

/**
 * ADR 0018 — profil SZYBKI, domyślny tryb CLI. Ta sama próbka co test
 * regresji (`REGRESSION_CONFIG`): wynik jest porównywalny z progiem
 * testowym, a przebieg trwa ~2–4 minuty zamiast ~40. Pełna macierz
 * (23 400 meczów) odpala się wyłącznie przez jawny `--full` na wyraźną
 * komendę właściciela.
 */
export const QUICK_CONFIG = Object.freeze({
  bots: REGRESSION_CONFIG.bots,
  decks: REGRESSION_CONFIG.decks,
  pairs: REGRESSION_CONFIG.pairs,
  seedsCount: REGRESSION_CONFIG.seedsCount,
  seedBase: REGRESSION_CONFIG.seedBase,
  maxCommands: REGRESSION_CONFIG.maxCommands,
  selfPlay: REGRESSION_CONFIG.selfPlay,
});

/** Nazwy talii z katalogu repozytorium (sortowane — deterministyczna kolejność). */
export function listRepoDeckNames(decksDir = 'decks') {
  return fs.readdirSync(decksDir)
    .filter((entry) => entry.endsWith('.txt'))
    .map((entry) => entry.replace(/\.txt$/, ''))
    .sort();
}

function createController(botName, seed, ctx) {
  const factory = BENCH_BOT_FACTORIES[botName];
  if (!factory) throw new Error(`Nieznany bot benchmarku: ${botName} (dostępne: ${Object.keys(BENCH_BOT_FACTORIES).join(', ')})`);
  return factory(seed, ctx);
}

/** Klucz pary bez względu na stronę stołu: posortowane nazwy. */
function pairKey(a, b) {
  return [a, b].sort().join(' | ');
}

/** Wszystkie nieuporządkowane pary botów (z opcjonalnym self-play). */
export function defaultPairs(botNames, selfPlay) {
  const pairs = [];
  const sorted = [...botNames].sort();
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = selfPlay ? i : i + 1; j < sorted.length; j += 1) {
      pairs.push([sorted[i], sorted[j]]);
    }
  }
  return pairs;
}

/**
 * Jeden mecz headless: botA gra talią deckA jako p1 (zaczyna), botB talią deckB
 * jako p2. Zwraca wynik surowy (bez identyfikatorów — agregat ma być mały).
 */
function playBenchMatch({ firstBot, firstDeck, secondBot, secondDeck, seed, deckLists, registry, maxCommands, heuristicWeights, heuristicParams, collectProxy = false }) {
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckLists.get(firstDeck)], ['p2', deckLists.get(secondDeck)]]),
    registry,
  });
  // B6 T2 — proxy reward: próbkujemy pozycyjną przewagę gracza `heuristic`
  // (jeśli w meczu gra). Hak onStep jest OPCJONALNY i deterministyczny
  // (ADR 0005) — bez collectProxy zachowanie harnessu jest niezmienione.
  const heuristicPlayer = firstBot === 'heuristic' ? 'p1' : secondBot === 'heuristic' ? 'p2' : null;
  const sampler = (collectProxy && heuristicPlayer) ? createProxySampler(heuristicPlayer) : null;
  const { state: finalState, results } = runSimulation({
    state,
    controllers: new Map([
      // B3: każdy bot zna talię przeciwnika (własna nie jest potrzebna —
      // model dotyczy ręki przeciwnika).
      ['p1', createController(firstBot, seed + 1, {
        opponentDeck: deckLists.get(secondDeck),
        heuristicWeights,
        heuristicParams,
      })],
      ['p2', createController(secondBot, seed + 2, {
        opponentDeck: deckLists.get(firstDeck),
        heuristicWeights,
        heuristicParams,
      })],
    ]),
    maxCommands,
    onStep: sampler ? (s) => sampler.sample(s) : null,
  });
  const winnerBot = finalState.winnerId === 'p1' ? firstBot
    : finalState.winnerId === 'p2' ? secondBot
      : null;
  return {
    finished: finalState.status === 'finished' && winnerBot != null,
    winnerBot,
    turns: finalState.turn.number,
    commands: results.length,
    proxyMean: sampler ? sampler.mean() : null,
  };
}

function emptyScoreboard() {
  return { games: 0, unfinished: 0, wins: {}, turns: 0, commands: 0, proxySum: 0, proxyCount: 0 };
}

function recordMatch(scoreboard, match) {
  scoreboard.games += 1;
  scoreboard.turns += match.turns;
  scoreboard.commands += match.commands;
  // B6 T2 — akumulacja proxy (tylko gdy mecz je zebrał; null pomijamy).
  if (match.proxyMean != null) {
    scoreboard.proxySum += match.proxyMean;
    scoreboard.proxyCount += 1;
  }
  if (!match.finished) {
    scoreboard.unfinished += 1;
    return;
  }
  scoreboard.wins[match.winnerBot] = (scoreboard.wins[match.winnerBot] ?? 0) + 1;
}

function finalizeScoreboard(scoreboard) {
  return {
    games: scoreboard.games,
    unfinished: scoreboard.unfinished,
    wins: scoreboard.wins,
    avgTurns: scoreboard.games > 0 ? Number((scoreboard.turns / scoreboard.games).toFixed(2)) : 0,
    avgCommands: scoreboard.games > 0 ? Number((scoreboard.commands / scoreboard.games).toFixed(1)) : 0,
    // proxyMean == null, gdy proxy nie zbierano (collectProxy=false) — wtedy
    // pole nie istnieje, żeby nie zaśmiecać wyników domyślnego benchmarku.
    ...(scoreboard.proxyCount > 0
      ? { proxyMean: Number((scoreboard.proxySum / scoreboard.proxyCount).toFixed(6)) }
      : {}),
  };
}

/**
 * Pełny przebieg benchmarku. Wynik jest czystą, serializowalną strukturą
 * danych zależną WYŁĄCZNIE od parametrów i kodu — dwa uruchomienia dają
 * identyczny wynik (test determinizmu w test/bot-benchmark.test.js).
 */
export function runBenchmark({
  bots = Object.keys(BENCH_BOT_FACTORIES),
  pairs = null,
  decks = null,
  seedsCount = 50,
  seedBase = 1000,
  maxCommands = 8000,
  selfPlay = false,
  decksDir = 'decks',
  heuristicWeights = undefined,
  heuristicParams = undefined,
  collectProxy = false,
} = {}) {
  const registry = createCardRegistry();
  const deckNames = (decks ?? listRepoDeckNames(decksDir)).slice().sort();
  if (deckNames.length < 1) throw new Error(`Brak talii benchmarku w ${decksDir}`);
  const deckLists = new Map(deckNames.map((name) => [
    name,
    parseDeckText(fs.readFileSync(path.join(decksDir, `${name}.txt`), 'utf8'), registry).cardIds,
  ]));
  const botNames = [...bots].sort();
  for (const name of botNames) createController(name, 0); // walidacja nazw zanim ruszy pętla
  const wantedPairs = (pairs ?? defaultPairs(botNames, selfPlay)).map(([a, b]) => [a, b].sort());

  const pairResults = new Map();
  const totals = new Map(botNames.map((name) => [name, emptyScoreboard()]));
  for (const [botA, botB] of wantedPairs) {
    const key = pairKey(botA, botB);
    if (!pairResults.has(key)) pairResults.set(key, { board: emptyScoreboard(), decks: new Map() });
    const aggregate = pairResults.get(key);
    for (let xi = 0; xi < deckNames.length; xi += 1) {
      for (let yi = xi; yi < deckNames.length; yi += 1) {
        const deckX = deckNames[xi];
        const deckY = deckNames[yi];
        const deckKey = pairKey(deckX, deckY);
        if (!aggregate.decks.has(deckKey)) aggregate.decks.set(deckKey, emptyScoreboard());
        const deckBoard = aggregate.decks.get(deckKey);
        for (let s = 0; s < seedsCount; s += 1) {
          const seed = seedBase + s;
          // Te same rozdania (ten sam seed), dwie strony stołu naraz.
          const legs = [
            { firstBot: botA, firstDeck: deckX, secondBot: botB, secondDeck: deckY },
          ];
          if (!(botA === botB && deckX === deckY)) {
            legs.push({ firstBot: botB, firstDeck: deckY, secondBot: botA, secondDeck: deckX });
          }
          for (const leg of legs) {
            const match = playBenchMatch({ ...leg, seed, deckLists, registry, maxCommands, heuristicWeights, heuristicParams, collectProxy });
            recordMatch(aggregate.board, match);
            recordMatch(deckBoard, match);
            recordMatch(totals.get(botA), match);
            if (botB !== botA) recordMatch(totals.get(botB), match);
          }
        }
      }
    }
  }

  const pairsResult = {};
  for (const [key, aggregate] of [...pairResults.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const decksResult = {};
    for (const [deckKey, board] of [...aggregate.decks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      decksResult[deckKey] = finalizeScoreboard(board);
    }
    pairsResult[key] = { ...finalizeScoreboard(aggregate.board), decks: decksResult };
  }
  const totalsResult = {};
  for (const [name, board] of totals) totalsResult[name] = finalizeScoreboard(board);

  return {
    config: {
      bots: botNames,
      pairs: wantedPairs,
      decks: deckNames,
      seedsCount,
      seedBase,
      maxCommands,
      selfPlay,
      ...(heuristicWeights ? { heuristicWeights: { ...heuristicWeights } } : {}),
      ...(heuristicParams ? { heuristicParams: { ...heuristicParams } } : {}),
    },
    pairs: pairsResult,
    totals: totalsResult,
  };
}

function percent(part, whole) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—';
}

function scoreLine(board, botNames) {
  return botNames
    .map((name) => `${name} ${percent(board.wins[name] ?? 0, board.games)} (${board.wins[name] ?? 0}/${board.games})`)
    .join(' | ');
}

/** Czytelna dla człowieka tabela wyników (PL) — do terminala i do opisu PR. */
export function formatBenchmarkReport(result) {
  const lines = [];
  const { config } = result;
  lines.push('Benchmark botów (B0) — deterministyczny, ADR 0005');
  lines.push(`boty: ${config.bots.join(', ')} | talie: ${config.decks.length} | seedy: ${config.seedsCount} (baza ${config.seedBase}) | limit komend: ${config.maxCommands}`);
  lines.push('');
  for (const [key, entry] of Object.entries(result.pairs)) {
    const [botA, botB] = key.split(' | ');
    lines.push(`== ${botA} vs ${botB} ==`);
    lines.push(`  ${scoreLine(entry, [botA, botB])}`);
    lines.push(`  niedokończone: ${entry.unfinished} | śr. ${entry.avgTurns} tury | śr. ${entry.avgCommands} komend`);
    for (const [deckKey, board] of Object.entries(entry.decks)) {
      lines.push(`    ${deckKey.padEnd(45)} ${scoreLine(board, [botA, botB])}`);
    }
    lines.push('');
  }
  lines.push('Macierz win-rate (wiersz wygrywa z kolumną):');
  const names = config.bots;
  const width = Math.max(...names.map((name) => name.length), 7);
  lines.push(`  ${''.padEnd(width)} ${names.map((name) => name.padStart(9)).join(' ')}`);
  for (const row of names) {
    const cells = names.map((col) => {
      if (row === col) return config.selfPlay ? percent(result.totals[row]?.wins[row] ?? 0, result.totals[row]?.games ?? 0).padStart(9) : '—'.padStart(9);
      const entry = result.pairs[pairKey(row, col)];
      return (entry ? percent(entry.wins[row] ?? 0, entry.games) : '—').padStart(9);
    });
    lines.push(`  ${row.padEnd(width)} ${cells.join(' ')}`);
  }
  lines.push('');
  lines.push('Razem (wszystkie pary):');
  for (const name of names) {
    const total = result.totals[name];
    lines.push(`  ${name.padEnd(width)} ${percent(total.wins[name] ?? 0, total.games)} zwycięstw (${total.wins[name] ?? 0}/${total.games})${total.unfinished ? `, niedokończone: ${total.unfinished}` : ''}`);
  }
  return lines.join('\n');
}

/** Parsowanie argumentów CLI bez zależności zewnętrznych. */
export function parseBenchmarkArgs(argv) {
  const options = { jsonPath: null };
  const readValue = (index, flag) => {
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) throw new Error(`Opcja ${flag} wymaga wartości`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (arg === '--seeds') { options.seedsCount = Number.parseInt(readValue(i, arg), 10); i += 1; continue; }
    if (arg === '--seed-base') { options.seedBase = Number.parseInt(readValue(i, arg), 10); i += 1; continue; }
    if (arg === '--max-commands') { options.maxCommands = Number.parseInt(readValue(i, arg), 10); i += 1; continue; }
    if (arg === '--bots') { options.bots = readValue(i, arg).split(',').map((s) => s.trim()).filter(Boolean); i += 1; continue; }
    if (arg === '--decks') { options.decks = readValue(i, arg).split(',').map((s) => s.trim()).filter(Boolean); i += 1; continue; }
    if (arg === '--pairs') {
      options.pairs = readValue(i, arg).split(',').map((pair) => {
        const [a, b] = pair.split(':').map((s) => s.trim());
        if (!a || !b) throw new Error(`Niepoprawna para botów: "${pair}" (format a:b)`);
        return [a, b];
      });
      i += 1;
      continue;
    }
    if (arg === '--self') { options.selfPlay = true; continue; }
    // ADR 0018: domyślny tryb CLI to profil SZYBKI; pełna macierz wyłącznie
    // na jawny `--full` (wyraźna komenda właściciela). `--quick` przyjmujemy
    // dla jawności — jest równoważny brakowi flagi (ostatnia flaga wygrywa).
    if (arg === '--quick') { options.full = false; continue; }
    if (arg === '--full') { options.full = true; continue; }
    if (arg === '--json') { options.jsonPath = readValue(i, arg); i += 1; continue; }
    throw new Error(`Nieznana opcja: ${arg} (--help podpowie składnię)`);
  }
  for (const key of ['seedsCount', 'seedBase', 'maxCommands']) {
    if (options[key] != null && (!Number.isInteger(options[key]) || options[key] <= 0)) {
      throw new Error(`Opcja --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} musi być dodatnią liczbą całkowitą`);
    }
  }
  return options;
}

const HELP = `Harness pomiarowy B0 — macierz win-rate bot-vs-bot.

Użycie: node tools/benchmark.mjs [opcje]

Tryby (ADR 0018):
  --quick            profil SZYBKI — DOMYŚLNY: 4 seedy, pary
                     heuristic:random i heuristic:aggro, ~2–4 min.
                     Ta sama próbka, którą liczy test regresji.
  --full             PEŁNA macierz: wszystkie pary botów, wszystkie talie,
                     50 seedów, ~23 400 meczów (~40+ min). Wyłącznie na
                     wyraźną komendę właściciela — agent nie odpala jej
                     „przy okazji".

Opcje:
  --seeds N          liczba seedów próbki na parę talii (szybki: 4, pełny: 50)
  --seed-base N      pierwszy seed próbki (szybki: 2026, pełny: 1000)
  --bots a,b,c       boty do macierzy (domyślnie: aggro,heuristic,random)
  --decks x,y        ogranicz talie (nazwy plików decks/*.txt bez rozszerzenia)
  --pairs a:b,c:d    ogranicz pary botów (np. heuristic:random)
  --self             dołącz mecze self-play (balans stron p1/p2)
  --max-commands N   limit komend na mecz (domyślnie 8000)
  --json plik        zapisz pełny wynik JSON do pliku
  --help             ta pomoc

Każdą zmianę bota mierz przed PR (docs/BOT_ROADMAP.md) — profil szybki
wystarcza jako wpis do PR; pełna macierz tylko na komendę właściciela.`;

function isDirectCliRun() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(fs.realpathSync(process.argv[1]))).href;
  } catch {
    return false;
  }
}

if (isDirectCliRun()) {
  try {
    const options = parseBenchmarkArgs(process.argv.slice(2));
    if (options.help) {
      console.log(HELP);
    } else {
      const { jsonPath, full, ...overrides } = options;
      // ADR 0018: bez jawnego --full liczy się profil SZYBKI; --full sięga
      // po domyślne parametry runBenchmark (pełna macierz). Jawne opcje
      // (--seeds itd.) nadpisują profil w obu trybach.
      const config = full ? { ...overrides } : { ...QUICK_CONFIG, ...overrides };
      if (full) console.log('PEŁNA MACIERZ (--full) — ADR 0018: przebieg wyłącznie na wyraźną komendę właściciela.');
      const started = performance.now();
      const result = runBenchmark(config);
      const elapsedMs = performance.now() - started;
      console.log(formatBenchmarkReport(result));
      const totalGames = Object.values(result.pairs).reduce((sum, entry) => sum + entry.games, 0);
      console.log('');
      console.log(`Rozegrano ${totalGames} meczów w ${(elapsedMs / 1000).toFixed(1)} s (~${(elapsedMs / Math.max(1, totalGames)).toFixed(1)} ms/mecz).`);
      if (jsonPath) {
        fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), elapsedMs: Math.round(elapsedMs), ...result }, null, 2));
        console.log(`Zapisano wynik JSON: ${jsonPath}`);
      }
    }
  } catch (error) {
    console.error(`Błąd benchmarku: ${error.message}`);
    process.exitCode = 1;
  }
}
