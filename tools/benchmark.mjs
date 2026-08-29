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
 *   node tools/benchmark.mjs --full               # MACIERZ PEŁNA: wszystkie
 *                                                 # pary botów, pary talii
 *                                                 # PRÓBKOWANE do budżetu
 *                                                 # ~10 000 meczów (~10 min,
 *                                                 # ADR 0025) — ADR 0018:
 *                                                 # wyłącznie na wyraźną
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

/** Talie dopuszczone do benchmarku: jednoplanowe, BEZ worków (ADR 0023 §5). */
export function benchmarkDecks(decksDir = 'decks') {
  return listRepoDeckNames(decksDir)
    .filter((name) => !name.startsWith('worek'))
    .sort();
}

export function selectBenchDecks(decksDir = 'decks') {
  return benchmarkDecks(decksDir).slice(0, BENCH_SAMPLE_SIZE);
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
 * (~10 000 meczów, ADR 0025) odpala się wyłącznie przez jawny `--full`
 * na wyraźną komendę właściciela.
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
/**
 * ADR 0025 — BUDŻET zamiast wyczerpywania kombinacji.
 *
 * Pełna macierz liczona „wszystkie pary talii × 50 seedów" urosła z 23 400
 * meczów (12 talii) do 75 900 (22 talie po podziałach ADR 0024), a przy 45
 * taliach byłoby to ~300 tys. — czyli nikt jej realnie nie dogra. Kombinacje
 * rosną z kwadratem liczby talii, budżet czasu nie rośnie wcale.
 *
 * Zasada: rozmiar macierzy wyznacza BUDŻET MECZÓW (~10 000), a algorytm
 * dobiera kształt do liczby talii:
 *   - mało talii (6)  → wszystkie ich pary, dużo seedów (79) na pojedynek;
 *   - dużo talii (45) → 416 z 1035 par, po 4 seedy;
 *   - 22 talie        → wszystkie 253 pary, po 6 seedów.
 * W każdym wypadku ~10 000 meczów, czyli ~10 minut, i w każdym wypadku
 * KAŻDA talia jest mierzona (próbka gwarantuje pokrycie, nie tylko losowanie).
 *
 * Determinizm (ADR 0005): PRNG jest seedowany `seedBase` — ten sam katalog
 * daje tę samą próbkę, niezależnie od kolejności uruchomień.
 */

// Kalibracja (2026-08-29): ~154 ms/mecz przy 18 taliach → 6 000 meczów to
// ~13 min, 10 000 to ~25 min. Budżet jest w MECZACH (nie w minutach), bo
// rozmiar próbki musi być deterministyczny (ADR 0005).
const DEFAULT_BUDGET_MATCHES = 6_000;
const DEFAULT_MIN_SEEDS_PER_MATCHUP = 4;

/** Deterministyczny PRNG (mulberry32) — zero zależności, powtarzalny wynik. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Próbka par talii o zadanej wielkości z GWARANCJĄ POKRYCIA: najpierw rundy
 * parowań, w których każda talia dostaje co najmniej dwa pojedynki, potem
 * dopełnienie parami w losowej kolejności. Deterministyczna dla danego `rng`.
 */
export function sampleDeckPairs(deckNames, wanted, rng) {
  const n = deckNames.length;
  const all = [];
  for (let i = 0; i < n; i += 1) for (let j = i; j < n; j += 1) all.push([i, j]);
  if (wanted >= all.length) return all.map(([i, j]) => [deckNames[i], deckNames[j]]);

  const chosen = new Set();
  const seen = new Array(n).fill(0);
  const out = [];
  const add = (i, j) => {
    const key = i <= j ? `${i}:${j}` : `${j}:${i}`;
    if (chosen.has(key) || out.length >= wanted) return false;
    chosen.add(key);
    out.push([i, j]);
    if (i === j) seen[i] += 2; else { seen[i] += 1; seen[j] += 1; }
    return true;
  };
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const k = Math.floor(rng() * (i + 1));
      [arr[i], arr[k]] = [arr[k], arr[i]];
    }
    return arr;
  };

  // 1. Pokrycie — każda talia w co najmniej dwóch pojedynkach (rundy parowań).
  const MIN_PER_DECK = 2;
  for (let round = 0; round < 8 && out.length < wanted; round += 1) {
    const addedBefore = out.length;
    const order = shuffle([...Array(n).keys()]);
    for (let k = 0; k + 1 < order.length && out.length < wanted; k += 2) add(order[k], order[k + 1]);
    if (n % 2 === 1 && out.length < wanted) add(order[n - 1], order[Math.floor(rng() * (n - 1))]);
    if (out.length === addedBefore && !seen.some((c) => c < MIN_PER_DECK)) break;
    if (out.length === addedBefore) break; // brak postępu — nie kręcimy się w kółko
    if (!seen.some((c) => c < MIN_PER_DECK)) break;
  }
  // 2. Dopełnienie — pary w losowej kolejności.
  for (const [i, j] of shuffle(all.slice())) {
    if (out.length >= wanted) break;
    add(i, j);
  }
  return out.map(([i, j]) => [deckNames[i], deckNames[j]]);
}

/**
 * Kształt macierzy pod budżet: ile par talii i ile seedów na pojedynek.
 * `--seeds` (opcjonalny) przesuwa środek ciężkości: więcej seedów = mniej par
 * talii, ale BUDŻET jest zawsze dotrzymany.
 */
export function resolveMatrixShape({
  decks,
  botPairs,
  budgetMatches = DEFAULT_BUDGET_MATCHES,
  minSeedsPerMatchup = DEFAULT_MIN_SEEDS_PER_MATCHUP,
  seedsCount = null,
  seedBase = 1000,
}) {
  const allPairsCount = (decks.length * (decks.length + 1)) / 2;
  const perSeed = 2 * botPairs.length; // obie strony stołu × każda para botów
  const seedStart = Math.max(1, seedsCount ?? minSeedsPerMatchup);
  const pairsWanted = Math.max(1, Math.min(allPairsCount, Math.floor(budgetMatches / (seedStart * perSeed))));
  const seedsResolved = seedsCount
    ?? Math.max(minSeedsPerMatchup, Math.floor(budgetMatches / (pairsWanted * perSeed)));
  return {
    deckPairs: sampleDeckPairs(decks, pairsWanted, mulberry32(seedBase)),
    seedsCount: seedsResolved,
    allPairsCount,
    pairsWanted,
  };
}

/**
 * Mecz przerwany przez watchdoga — przekroczył `stallMs` i nie widać końca.
 * Niesie ADRES pozycji (boty, talie, seed) i liczniki (kroki, tura), żeby
 * dało się go powtórzyć: komunikat bez adresu po 20 minutach liczenia jest
 * bezużyteczny (M255/F).
 */
export class StallError extends Error {
  constructor({ elapsedMs, steps, turn }) {
    super(`ZACINKA: mecz przekroczył ${Math.round(elapsedMs)} ms (kroków: ${steps}, tura: ${turn ?? '?'})`);
    this.name = 'StallError';
    this.elapsedMs = elapsedMs;
    this.steps = steps;
    this.turn = turn;
  }
}

/** Co ile kroków symulacji watchdog zagląda w zegar. Koszt: jeden performance.now(). */
const STALL_CHECK_EVERY = 16;

function playBenchMatch({ firstBot, firstDeck, secondBot, secondDeck, seed, deckLists, registry, maxCommands, heuristicWeights, heuristicParams, collectProxy = false, stallMs = 0 }) {
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
  // Watchdog zacinki (M255): jeden mecz, który nie zmierza do końca, potrafi
  // sam zjeść cały czas pełnej macierzy — bez sygnału, bo raport powstaje
  // dopiero po ostatnim meczu. Sprawdzamy zegar co STALL_CHECK_EVERY kroków.
  const startedAt = performance.now();
  let steps = 0;
  const watchdog = stallMs > 0
    ? (s) => {
      steps += 1;
      if (steps % STALL_CHECK_EVERY !== 0) return;
      const elapsed = performance.now() - startedAt;
      if (elapsed > stallMs) throw new StallError({ elapsedMs: elapsed, steps, turn: s?.turn?.number ?? null });
    }
    : null;
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
    onStep: (sampler || watchdog)
      ? (s) => {
        if (sampler) sampler.sample(s);
        if (watchdog) watchdog(s);
      }
      : null,
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
  // null → seedy wylicza budżet (ADR 0025). Jawna liczba to przesunięcie
  // środka ciężkości (więcej seedów, mniej par talii), NIE zwiększenie kosztu.
  seedsCount = null,
  seedBase = 1000,
  budgetMatches = DEFAULT_BUDGET_MATCHES,
  minSeedsPerMatchup = DEFAULT_MIN_SEEDS_PER_MATCHUP,
  deckPairs = null, // jawna lista par talii (diagnostyka / testy) — omija próbkowanie
  maxCommands = 8000,
  selfPlay = false,
  decksDir = 'decks',
  heuristicWeights = undefined,
  heuristicParams = undefined,
  collectProxy = false,
  // M255: długi przebieg musi być WIDOCZNY w trakcie, nie dopiero na końcu.
  // `onProgress({ done, total, ... })` wołane co `progressEvery` meczów i raz
  // na końcu; `stallMs > 0` włącza watchdoga zacinki na pojedynczy mecz,
  // a `onStall(stall)` zgłasza każde przerwanie osobno.
  onProgress = null,
  onStall = null,
  progressEvery = 0,
  stallMs = 0,
} = {}) {
  const registry = createCardRegistry();
  // ADR 0023 §5: worki nie wchodzą do benchmarku (ani szybkiego, ani pełnego).
  const deckNames = (decks ?? benchmarkDecks(decksDir)).slice().sort();
  if (deckNames.length < 1) throw new Error(`Brak talii benchmarku w ${decksDir}`);
  const deckLists = new Map(deckNames.map((name) => [
    name,
    parseDeckText(fs.readFileSync(path.join(decksDir, `${name}.txt`), 'utf8'), registry).cardIds,
  ]));
  const botNames = [...bots].sort();
  for (const name of botNames) createController(name, 0); // walidacja nazw zanim ruszy pętla
  const wantedPairs = (pairs ?? defaultPairs(botNames, selfPlay)).map(([a, b]) => [a, b].sort());

  // ADR 0025: kształt macierzy pod budżet. Jawna lista par (diagnostyka)
  // omija próbkowanie, w pozostałych wypadkach rządzi budżet meczów.
  const shape = deckPairs
    ? { deckPairs: deckPairs.map(([a, b]) => [a, b]), seedsCount: seedsCount ?? minSeedsPerMatchup, allPairsCount: deckPairs.length, pairsWanted: deckPairs.length }
    : resolveMatrixShape({ decks: deckNames, botPairs: wantedPairs, budgetMatches, minSeedsPerMatchup, seedsCount, seedBase });
  const benchSeeds = shape.seedsCount;
  const benchDeckPairs = shape.deckPairs;

  // Liczba meczów znana z góry (bez ich rozgrywania) — postęp i ETA biorą się
  // z tej samej formuły, co pętla niżej.
  const totalMatches = wantedPairs.reduce((sum, [botA, botB]) => {
    let perPair = 0;
    for (const [deckX, deckY] of benchDeckPairs) {
      perPair += (botA === botB && deckX === deckY) ? benchSeeds : benchSeeds * 2;
    }
    return sum + perPair;
  }, 0);

  const startedAt = performance.now();
  let matchesDone = 0;
  const stalls = [];
  const reportProgress = (current, lastMatchMs = null) => {
    if (typeof onProgress !== 'function') return;
    const elapsedMs = performance.now() - startedAt;
    const msPerMatch = matchesDone > 0 ? elapsedMs / matchesDone : 0;
    onProgress({
      done: matchesDone,
      total: totalMatches,
      elapsedMs,
      msPerMatch,
      etaMs: matchesDone > 0 ? msPerMatch * (totalMatches - matchesDone) : null,
      lastMatchMs,
      current,
    });
  };

  const pairResults = new Map();
  const totals = new Map(botNames.map((name) => [name, emptyScoreboard()]));
  for (const [botA, botB] of wantedPairs) {
    const key = pairKey(botA, botB);
    if (!pairResults.has(key)) pairResults.set(key, { board: emptyScoreboard(), decks: new Map() });
    const aggregate = pairResults.get(key);
    for (const [deckX, deckY] of benchDeckPairs) {
      const deckKey = pairKey(deckX, deckY);
      if (!aggregate.decks.has(deckKey)) aggregate.decks.set(deckKey, emptyScoreboard());
      const deckBoard = aggregate.decks.get(deckKey);
      for (let s = 0; s < benchSeeds; s += 1) {
        const seed = seedBase + s;
        // Te same rozdania (ten sam seed), dwie strony stołu naraz.
        const legs = [
          { firstBot: botA, firstDeck: deckX, secondBot: botB, secondDeck: deckY },
        ];
        if (!(botA === botB && deckX === deckY)) {
          legs.push({ firstBot: botB, firstDeck: deckY, secondBot: botA, secondDeck: deckX });
        }
        for (const leg of legs) {
          const adres = `${leg.firstBot}(${leg.firstDeck}) vs ${leg.secondBot}(${leg.secondDeck}), seed ${seed}, maxCommands ${maxCommands}`;
          const legStartedAt = performance.now();
          let match;
          try {
            match = playBenchMatch({ ...leg, seed, deckLists, registry, maxCommands, heuristicWeights, heuristicParams, collectProxy, stallMs });
          } catch (error) {
            if (error instanceof StallError) {
              // Zacinka: przerywamy TEN mecz, nie całą macierz. Wynik meczu
              // idzie na konto jako niedokończony, a adres ląduje w raporcie.
              const stall = {
                bots: `${leg.firstBot}|${leg.secondBot}`,
                decks: `${leg.firstDeck}|${leg.secondDeck}`,
                seed,
                elapsedMs: Math.round(error.elapsedMs),
                steps: error.steps,
                turn: error.turn,
              };
              stalls.push(stall);
              match = { finished: false, winnerBot: null, turns: error.turn ?? 0, commands: error.steps, proxyMean: null };
              if (typeof onStall === 'function') onStall(stall);
            } else {
              // M255/F: wyjątek z kontrolera musi nieść ADRES meczu — bez
              // niego wielotysięczna macierz kończy się długim przebiegiem
              // z komunikatem, którego nie da się powtórzyć.
              throw new Error(`${error.message} — mecz: ${adres}`);
            }
          }
          recordMatch(aggregate.board, match);
          recordMatch(deckBoard, match);
          recordMatch(totals.get(botA), match);
          if (botB !== botA) recordMatch(totals.get(botB), match);
          matchesDone += 1;
          // Pierwszy mecz też melduje: od razu widać tempo i ETA, a nie
          // dopiero po `progressEvery` meczach.
          if (progressEvery > 0 && (matchesDone === 1 || matchesDone % progressEvery === 0)) {
            reportProgress({ botA, botB, deckX, deckY, seed }, performance.now() - legStartedAt);
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

  reportProgress(null);

  return {
    config: {
      bots: botNames,
      pairs: wantedPairs,
      decks: deckNames,
      seedsCount: benchSeeds,
      seedBase,
      maxCommands,
      selfPlay,
      stallMs,
      totalMatches,
      // ADR 0025 — jak budżet rozłożył się na próbkę (do porównań między
      // sesjami: ta sama liczba talii = ta sama próbka, bez zgadywania).
      budgetMatches,
      deckPairsPlayed: benchDeckPairs.length,
      deckPairsAll: shape.allPairsCount,
      ...(heuristicWeights ? { heuristicWeights: { ...heuristicWeights } } : {}),
      ...(heuristicParams ? { heuristicParams: { ...heuristicParams } } : {}),
    },
    pairs: pairsResult,
    totals: totalsResult,
    // Zawsze obecne (pusta tablica, gdy watchdog wyłączony) — raport i JSON
    // mają jeden kształt niezależnie od konfiguracji.
    stalls,
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
  if (result.stalls?.length) {
    lines.push('');
    lines.push(`ZACINKI (watchdog ${config.stallMs} ms/mecz) — ${result.stalls.length} przerwanych meczów:`);
    for (const stall of result.stalls.slice(0, 20)) {
      lines.push(`  ${stall.bots} | ${stall.decks} | seed ${stall.seed} — ${stall.elapsedMs} ms, ${stall.steps} kroków, tura ${stall.turn ?? '?'}`);
    }
    if (result.stalls.length > 20) lines.push(`  … i ${result.stalls.length - 20} więcej (pełna lista w JSON).`);
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
    // M255: widoczność długiego przebiegu. Klucze pojawiają się w wyniku
    // TYLKO gdy podano flagę — domyślny zestaw opcji CLI jest bez zmian.
    if (arg === '--progress') { options.progressEvery = Number.parseInt(readValue(i, arg), 10); i += 1; continue; }
    if (arg === '--stall-ms') { options.stallMs = Number.parseInt(readValue(i, arg), 10); i += 1; continue; }
    if (arg === '--budget') { options.budgetMatches = Number.parseInt(readValue(i, arg), 10); i += 1; continue; }
    if (arg === '--min-seeds') { options.minSeedsPerMatchup = Number.parseInt(readValue(i, arg), 10); i += 1; continue; }
    throw new Error(`Nieznana opcja: ${arg} (--help podpowie składnię)`);
  }
  for (const key of ['seedsCount', 'seedBase', 'maxCommands']) {
    if (options[key] != null && (!Number.isInteger(options[key]) || options[key] <= 0)) {
      throw new Error(`Opcja --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} musi być dodatnią liczbą całkowitą`);
    }
  }
  // 0 ma znaczenie: --stall-ms 0 wyłącza watchdoga, --progress 0 wyłącza log.
  for (const key of ['progressEvery', 'stallMs', 'budgetMatches', 'minSeedsPerMatchup']) {
    if (options[key] != null && (!Number.isInteger(options[key]) || options[key] < 0)) {
      throw new Error(`Opcja --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} musi być nieujemną liczbą całkowitą`);
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
  --full             MACIERZ PEŁNA (ADR 0025): wszystkie pary botów,
                     wszystkie talie, ale pary talii PRÓBKOWANE do budżetu
                     ~10 000 meczów (~10 min) zamiast wszystkich kombinacji
                     (dziś 253 pary × 50 seedów = 75 900 meczów, przy 45
                     taliach ~300 tys.). Wyłącznie na wyraźną komendę
                     właściciela — agent nie odpala jej „przy okazji".

Opcje:
  --seeds N          liczba seedów na pojedynek; z budżetu (szybki: 8,
                     pełna: wyliczana — 22 talie → 6). Jawna wartość
                     przesuwa środek ciężkości (więcej seedów = mniej par
                     talii), ale NIE powiększa macierzy.
  --budget N         budżet meczów dla pełnej macierzy (domyślnie 10 000)
  --min-seeds N      minimalna liczba seedów na pojedynek (domyślnie 4)
  --seed-base N      pierwszy seed próbki (szybki: 2026, pełny: 1000)
  --bots a,b,c       boty do macierzy (domyślnie: aggro,heuristic,random)
  --decks x,y        ogranicz talie (nazwy plików decks/*.txt bez rozszerzenia)
  --pairs a:b,c:d    ogranicz pary botów (np. heuristic:random)
  --self             dołącz mecze self-play (balans stron p1/p2)
  --max-commands N   limit komend na mecz (domyślnie 8000)
  --progress N       loguj postęp co N meczów (pełna: 500, szybki: 100; 0 = cisza)
  --stall-ms N       watchdog zacinki: przerwij mecz, który trwa dłużej niż
                     N ms (domyślnie 15000; 0 = bez watchdoga)
  --json plik        zapisz pełny wynik JSON do pliku
  --help             ta pomoc

Długi przebieg loguje się PRZYROSTOWO (procent, tempo ms/mecz, ETA) i sam
zgłasza zacinki ([STALL] + adres meczu). Bez tych dwóch rzeczy wielotysięczna
macierz to ponad godzina bez jednego sygnału, w której nie da się odróżnić
wolnego liczenia od meczu, który utknął (M255, L89).

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

/** Postęp przebiegu na żywo: procent, tempo, ETA i adres aktualnej pozycji. */
function createProgressLogger(progressEvery, stallMs) {
  const fmt = (ms) => {
    const s = Math.round(ms / 1000);
    return s < 90 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  };
  return {
    onProgress: ({ done, total, elapsedMs, msPerMatch, etaMs, lastMatchMs, current }) => {
      const pct = total > 0 ? ((done / total) * 100).toFixed(1) : '—';
      const gdzie = current ? `${current.botA}:${current.botB} | ${current.deckX} vs ${current.deckY} | seed ${current.seed}` : 'koniec';
      const ostatni = lastMatchMs == null ? '—' : `${Math.round(lastMatchMs)} ms`;
      console.log(`[${pct}%] ${done}/${total} | ${fmt(elapsedMs)} | ~${msPerMatch.toFixed(1)} ms/mecz | ETA ${etaMs == null ? '—' : fmt(etaMs)} | ostatni ${ostatni} | ${gdzie}`);
    },
    onStall: (stall) => {
      console.log(`[STALL] limit ${stallMs} ms: ${stall.bots} | ${stall.decks} | seed ${stall.seed} — ${stall.elapsedMs} ms, ${stall.steps} kroków, tura ${stall.turn ?? '?'}`);
    },
    progressEvery,
    stallMs,
  };
}

if (isDirectCliRun()) {
  try {
    const options = parseBenchmarkArgs(process.argv.slice(2));
    if (options.help) {
      console.log(HELP);
    } else {
      const { jsonPath, full, progressEvery, stallMs, ...overrides } = options;
      // Domyślny watchdog: 15 s na mecz to ~150× średniej (średnio ~100 ms),
      // więc nie dotyka zdrowych meczów, a łapie każdą pętlę.
      const watch = createProgressLogger(
        progressEvery ?? (full ? 500 : 100),
        stallMs ?? (full ? 15000 : 0),
      );
      // ADR 0018: bez jawnego --full liczy się profil SZYBKI; --full sięga
      // po domyślne parametry runBenchmark (pełna macierz). Jawne opcje
      // (--seeds itd.) nadpisują profil w obu trybach.
      const config = full ? { ...overrides } : { ...QUICK_CONFIG, ...overrides };
      if (full) console.log('MACIERZ PEŁNA (--full) — ADR 0018: przebieg wyłącznie na wyraźną komendę właściciela.');
      if (watch.stallMs > 0) {
        console.log(`Watchdog zacinki: mecz dłuższy niż ${watch.stallMs} ms jest przerywany i raportowany.`);
      }
      const started = performance.now();
      const result = runBenchmark({ ...config, onProgress: watch.onProgress, onStall: watch.onStall, progressEvery: watch.progressEvery, stallMs: watch.stallMs });
      const elapsedMs = performance.now() - started;
      console.log('');
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
