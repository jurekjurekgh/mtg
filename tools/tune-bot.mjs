import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatBenchmarkReport,
  listRepoDeckNames,
  runBenchmark,
} from './benchmark.mjs';
import {
  DEFAULT_HEURISTIC_WEIGHTS,
  HEURISTIC_WEIGHT_KEYS,
  normalizeHeuristicWeights,
} from '../src/controllers/heuristic-weights.js';

/**
 * B4 — deterministyczny hill-climbing wag heurystyki na harnessie B0.
 *
 * Tuner jest narzędziem OFFLINE. Nie jest importowany przez stół ani artefakt
 * HTML. Każda ocena kandydata wywołuje ten sam `runBenchmark`, a kolejność
 * kluczy i kierunków jest stała — brak Math.random (ADR 0005).
 */

export const DEFAULT_TUNING_CONFIG = Object.freeze({
  bots: ['aggro', 'heuristic', 'random'],
  pairs: [['heuristic', 'random'], ['heuristic', 'aggro']],
  seedsCount: 4,
  seedBase: 2026,
  maxCommands: 3000,
});

export const DEFAULT_TUNING_KEYS = Object.freeze([...HEURISTIC_WEIGHT_KEYS]);

function pairEntry(result, first, second) {
  const key = [first, second].sort().join(' | ');
  const entry = result?.pairs?.[key];
  if (!entry) throw new Error(`Brak wyniku pary ${key} w benchmarku`);
  return entry;
}

function winRate(entry, bot) {
  if (!entry || entry.games <= 0) return 0;
  return (entry.wins?.[bot] ?? 0) / entry.games;
}

/** Zwięzły, porównywalny wynik B4 z dwóch par jakościowych. */
export function summarizeTuningResult(result) {
  const vsRandom = pairEntry(result, 'heuristic', 'random');
  const vsAggro = pairEntry(result, 'heuristic', 'aggro');
  return {
    vsRandom: winRate(vsRandom, 'heuristic'),
    vsAggro: winRate(vsAggro, 'heuristic'),
    unfinished: vsRandom.unfinished + vsAggro.unfinished,
    games: vsRandom.games + vsAggro.games,
  };
}

/**
 * Funkcja celu: średnia win-rate przeciwko RandomBotowi i aggro.
 * Niedokończona partia dyskwalifikuje kandydata, zamiast sztucznie pomagać mu
 * przez brak przegranej.
 */
export function tuningObjective(result) {
  const summary = summarizeTuningResult(result);
  if (summary.unfinished > 0) return Number.NEGATIVE_INFINITY;
  return (summary.vsRandom + summary.vsAggro) / 2;
}

function notWorseThanBaseline(candidate, baseline) {
  const candidateSummary = summarizeTuningResult(candidate);
  const baselineSummary = summarizeTuningResult(baseline);
  return candidateSummary.unfinished === 0
    && candidateSummary.vsRandom >= baselineSummary.vsRandom
    && candidateSummary.vsAggro >= baselineSummary.vsAggro;
}

function validateTuningOptions({ keys, step, min, max, rounds }) {
  if (!Array.isArray(keys) || keys.length === 0) throw new TypeError('Tuner wymaga co najmniej jednej wagi');
  for (const key of keys) {
    if (!HEURISTIC_WEIGHT_KEYS.includes(key)) throw new RangeError(`Nieznana waga tunera: ${key}`);
  }
  if (!Number.isFinite(step) || step <= 0) throw new RangeError('Krok tunera musi być dodatni');
  if (!Number.isFinite(min) || min < 0 || min > max) throw new RangeError('Niepoprawny zakres wag');
  if (!Number.isFinite(max)) throw new RangeError('Maksymalna waga musi być skończona');
  if (!Number.isInteger(rounds) || rounds <= 0) throw new RangeError('Liczba rund tunera musi być dodatnią liczbą całkowitą');
}

function candidateValue(value, delta, min, max) {
  return Math.min(max, Math.max(min, Number((value + delta).toFixed(10))));
}

/**
 * Deterministyczny hill-climbing z warunkiem Pareto względem baseline'u.
 * Kandydat musi być niegorszy od baseline'u w OBU parach, a dodatkowo poprawiać
 * funkcję celu względem aktualnego najlepszego wariantu. To nie pozwala, aby
 * tuner kupił poprawę przeciw jednemu botowi regresją przeciw drugiemu.
 *
 * `evaluate` jest wstrzykiwane, więc test może użyć małej, czystej funkcji;
 * produkcyjny tuner przekazuje `runBenchmark` poniżej.
 */
export function hillClimb({
  initialWeights = DEFAULT_HEURISTIC_WEIGHTS,
  keys = DEFAULT_TUNING_KEYS,
  step = 0.1,
  min = 0.5,
  max = 1.5,
  rounds = 1,
  evaluate,
  onEvaluation = null,
}) {
  if (typeof evaluate !== 'function') throw new TypeError('Tuner wymaga funkcji evaluate');
  validateTuningOptions({ keys, step, min, max, rounds });
  const initial = normalizeHeuristicWeights(initialWeights);
  const baseline = evaluate({ ...initial });
  let currentWeights = { ...initial };
  let currentResult = baseline;
  let currentObjective = tuningObjective(currentResult);
  if (!Number.isFinite(currentObjective)) throw new Error('Baseline tunera ma niedokończone mecze');

  const history = [{
    round: 0,
    key: null,
    direction: 0,
    weights: { ...currentWeights },
    summary: summarizeTuningResult(currentResult),
    objective: currentObjective,
    accepted: true,
  }];
  let evaluations = 1;

  for (let round = 1; round <= rounds; round += 1) {
    for (const key of keys) {
      // Najpierw testujemy krok w dół, potem w górę. Kolejność jest częścią
      // determinizmu i rozstrzyga równoważne kandydatury bez RNG.
      for (const direction of [-1, 1]) {
        const value = candidateValue(currentWeights[key], direction * step, min, max);
        if (value === currentWeights[key]) continue;
        const candidateWeights = { ...currentWeights, [key]: value };
        const result = evaluate({ ...candidateWeights });
        evaluations += 1;
        const objective = tuningObjective(result);
        const accepted = notWorseThanBaseline(result, baseline)
          && objective > currentObjective;
        history.push({
          round,
          key,
          direction,
          weights: { ...candidateWeights },
          summary: summarizeTuningResult(result),
          objective,
          accepted,
        });
        onEvaluation?.({ round, key, direction, weights: candidateWeights, result, objective, accepted });
        if (accepted) {
          currentWeights = candidateWeights;
          currentResult = result;
          currentObjective = objective;
        }
      }
    }
  }

  return {
    initialWeights: { ...initial },
    weights: { ...currentWeights },
    baseline,
    result: currentResult,
    baselineSummary: summarizeTuningResult(baseline),
    summary: summarizeTuningResult(currentResult),
    objective: currentObjective,
    evaluations,
    history,
  };
}

export function tuneBot({
  tuningConfig = DEFAULT_TUNING_CONFIG,
  initialWeights = DEFAULT_HEURISTIC_WEIGHTS,
  keys = DEFAULT_TUNING_KEYS,
  step = 0.1,
  min = 0.5,
  max = 1.5,
  rounds = 1,
  onEvaluation = null,
} = {}) {
  return hillClimb({
    initialWeights,
    keys,
    step,
    min,
    max,
    rounds,
    onEvaluation,
    evaluate: (heuristicWeights) => runBenchmark({
      ...tuningConfig,
      heuristicWeights,
    }),
  });
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Opcja ${flag} musi być dodatnią liczbą całkowitą`);
  return parsed;
}

export function parseTuningArgs(argv) {
  const options = {
    seedsCount: DEFAULT_TUNING_CONFIG.seedsCount,
    seedBase: DEFAULT_TUNING_CONFIG.seedBase,
    rounds: 1,
    step: 0.1,
    min: 0.5,
    max: 1.5,
    keys: [...DEFAULT_TUNING_KEYS],
    jsonPath: null,
  };
  const readValue = (index, flag) => {
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) throw new Error(`Opcja ${flag} wymaga wartości`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (arg === '--seeds') { options.seedsCount = parsePositiveInt(readValue(i, arg), arg); i += 1; continue; }
    if (arg === '--seed-base') { options.seedBase = parsePositiveInt(readValue(i, arg), arg); i += 1; continue; }
    if (arg === '--rounds') { options.rounds = parsePositiveInt(readValue(i, arg), arg); i += 1; continue; }
    if (arg === '--step') { options.step = Number(readValue(i, arg)); i += 1; continue; }
    if (arg === '--min') { options.min = Number(readValue(i, arg)); i += 1; continue; }
    if (arg === '--max') { options.max = Number(readValue(i, arg)); i += 1; continue; }
    if (arg === '--keys') { options.keys = readValue(i, arg).split(',').map((key) => key.trim()).filter(Boolean); i += 1; continue; }
    if (arg === '--decks') { options.decks = readValue(i, arg).split(',').map((deck) => deck.trim()).filter(Boolean); i += 1; continue; }
    if (arg === '--json') { options.jsonPath = readValue(i, arg); i += 1; continue; }
    throw new Error(`Nieznana opcja: ${arg}`);
  }
  if (!Number.isFinite(options.step) || options.step <= 0) throw new Error('Opcja --step musi być dodatnia');
  if (!Number.isFinite(options.min) || options.min < 0 || !Number.isFinite(options.max) || options.min > options.max) throw new Error('Opcje --min/--max mają niepoprawny zakres');
  for (const key of options.keys) {
    if (!HEURISTIC_WEIGHT_KEYS.includes(key)) throw new Error(`Nieznana waga tunera: ${key}`);
  }
  return options;
}

const HELP = `Tuner B4 — deterministyczny hill-climbing wag bota na harnessie B0.

Użycie: node tools/tune-bot.mjs [opcje]

Opcje:
  --seeds N          seedy na parę talii (domyślnie 4; przed PR uruchom pełne 50)
  --seed-base N      pierwszy seed (domyślnie 2026)
  --rounds N         liczba przejść po wagach (domyślnie 1)
  --step X           krok zmiany wagi (domyślnie 0.1)
  --min X            dolna granica wagi (domyślnie 0.5)
  --max X            górna granica wagi (domyślnie 1.5)
  --keys a,b         rodziny wag (domyślnie wszystkie)
  --decks a,b        ogranicz talie jak w benchmarku
  --json plik        zapisz wynik tunera bez znaczników czasu
  --help             ta pomoc

Tuner nie zmienia kodu ani domyślnych wag. Wynik przyjmuje się ręcznie dopiero
po pełnym pomiarze B0 i aktualizacji testu regresji.`;

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
    const options = parseTuningArgs(process.argv.slice(2));
    if (options.help) {
      console.log(HELP);
    } else {
      const { jsonPath, keys, ...config } = options;
      const tuningConfig = {
        ...DEFAULT_TUNING_CONFIG,
        ...config,
        decks: options.decks ?? listRepoDeckNames(),
      };
      const started = performance.now();
      const result = tuneBot({
        tuningConfig,
        keys,
        onEvaluation: ({ round, key, direction, weights, objective, accepted }) => {
          const sign = direction < 0 ? '-' : '+';
          console.log(`B4 runda ${round}: ${sign}${key}=${weights[key].toFixed(2)} → ${(objective * 100).toFixed(2)}%${accepted ? ' [PRZYJĘTO]' : ''}`);
        },
      });
      const elapsedMs = performance.now() - started;
      console.log('\nBaseline:');
      console.log(formatBenchmarkReport(result.baseline));
      console.log('\nNajlepszy wariant:');
      console.log(JSON.stringify({ weights: result.weights, summary: result.summary, evaluations: result.evaluations }, null, 2));
      console.log(`\nCzas tunera: ${(elapsedMs / 1000).toFixed(1)} s`);
      if (jsonPath) {
        fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
        console.log(`Zapisano wynik JSON: ${jsonPath}`);
      }
    }
  } catch (error) {
    console.error(`Błąd tunera B4: ${error.message}`);
    process.exitCode = 1;
  }
}
