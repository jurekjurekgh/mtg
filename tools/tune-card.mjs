/**
 * B6 T4 — „tryb jednej karty": strojenie ZAWĘŻONE do parametrów deskryptorów
 * konkretnej karty, na ustalonej puli seedów i taliach, które tę kartę zawierają.
 *
 * Sedno pomysłu właściciela: zamiast stroić całego bota, bierzemy „na warsztat"
 * jedną kartę/mechanikę i szukamy jej optymalnej wyceny — ale BEZ overfittingu
 * (ustalona pula wielu seedów, nie jeden) i BEZ łamania ADR 0002 (tuner offline
 * zna kartę po ID, ale bot w runtime dalej scoruje po DESKRYPTORACH, więc wynik
 * generalizuje na przyszłe karty z tą samą mechaniką).
 *
 * Determinizm (ADR 0005): ten sam hill-climbing co B4 (stała kolejność kluczy
 * i kierunków, brak Math.random), na tym samym harnessie runBenchmark.
 *
 * WAŻNE: to jest OFFLINE tuner i NARZĘDZIE PROPOZYCJI. Nie zmienia kodu ani
 * DEFAULT_HEURISTIC_PARAMS. Proponowane wartości przyjmuje się RĘCZNIE dopiero
 * po pełnym pomiarze benchmarku i regeneracji golden-mastera — procedura
 * w docs/setup/STROJENIE_BOTA.md.
 *
 * Uruchomienie:
 *   node tools/tune-card.mjs --card jwar-isle-avenger
 *   node tools/tune-card.mjs --card manifest-dread --seeds 8 --rounds 2
 *   node tools/tune-card.mjs --descriptors creature,spell   # bez konkretnej karty
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBenchmark, listRepoDeckNames } from './benchmark.mjs';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import {
  DEFAULT_HEURISTIC_PARAMS,
  HEURISTIC_PARAM_KEYS,
  normalizeHeuristicParams,
} from '../src/controllers/heuristic-params.js';
import { summarizeTuningResult, tuningObjective } from './tune-bot.mjs';

/**
 * Mapa DESKRYPTOR → parametry heurystyki, których ten deskryptor dotyczy.
 * To jest „przekład" z mechaniki karty na pokrętła wyceny. Rozbudowuje się
 * RAZEM z heuristic-params.js: gdy kolejna sesja wyciągnie nową rodzinę stałych
 * (np. surgeBias, manifestEarlyBias), dopisuje ją tutaj do właściwego
 * deskryptora. Klucze muszą istnieć w HEURISTIC_PARAM_KEYS (walidacja niżej).
 */
export const DESCRIPTOR_PARAMS = Object.freeze({
  creature: Object.freeze([
    'creatureBase', 'creaturePowerWeight', 'creatureToughnessWeight',
    // Premie agresji w ataku dotyczą stworów (to one atakują).
    'attackThroughBonus', 'attackOpenBoardBonus', 'attackEvasionBonus',
  ]),
  spell: Object.freeze(['spellBase']),
  // Rodziny mechanik czekające na własne parametry (kolejne sesje T1):
  // surge:   ['surgeBias'],
  // manifest:['manifestEarlyBias'],
  // aura:    ['auraBase', ...],
});

/**
 * Wyprowadza zbiór deskryptorów z definicji karty (generycznie — po strukturze,
 * nie po nazwie/ID). Zwraca też deskryptory „bez parametrów", aby narzędzie
 * mogło UCZCIWIE zgłosić, że danej mechaniki nie da się jeszcze stroić.
 */
export function cardDescriptors(def) {
  const descriptors = new Set();
  const types = def?.types ?? [];
  if (types.includes('Creature')) descriptors.add('creature');
  if (types.includes('Instant') || types.includes('Sorcery')) descriptors.add('spell');
  if (def?.aura || def?.bestow) descriptors.add('aura');
  if (def?.surge) descriptors.add('surge');
  const spellEffects = def?.spell?.effects ?? [];
  if (spellEffects.some((e) => e?.type === 'manifest_dread')) descriptors.add('manifest');
  return [...descriptors];
}

/** Parametry, które warto stroić dla danego zestawu deskryptorów. */
export function paramsForDescriptors(descriptors) {
  const keys = new Set();
  const withoutParams = [];
  for (const descriptor of descriptors) {
    const mapped = DESCRIPTOR_PARAMS[descriptor];
    if (mapped && mapped.length > 0) mapped.forEach((k) => keys.add(k));
    else withoutParams.push(descriptor);
  }
  for (const key of keys) {
    if (!HEURISTIC_PARAM_KEYS.includes(key)) {
      throw new Error(`DESCRIPTOR_PARAMS odwołuje się do nieznanego parametru: ${key}`);
    }
  }
  return { keys: [...keys], withoutParams };
}

/** Nazwy talii z repo, które zawierają dany cardId (zawężenie próbki). */
export function decksContainingCard(cardId, { decksDir = 'decks', registry } = {}) {
  const reg = registry ?? createCardRegistry();
  const names = listRepoDeckNames(decksDir);
  const containing = [];
  for (const name of names) {
    const text = fs.readFileSync(path.join(decksDir, `${name}.txt`), 'utf8');
    const { cardIds } = parseDeckText(text, reg);
    if (cardIds.includes(cardId)) containing.push(name);
  }
  return containing;
}

function candidateValue(value, delta, min, max) {
  return Math.min(max, Math.max(min, Number((value + delta).toFixed(10))));
}

/**
 * Deterministyczny hill-climbing W PRZESTRZENI PARAMETRÓW (nie wag). Analogia
 * do hillClimb z tune-bot.mjs, ale kroki są ADDYTYWNE (parametry to punkty
 * wyceny, nie mnożniki) i ograniczają się do `keys` (parametry deskryptorów
 * karty). Kandydat przyjmowany, gdy nie ma niedokończonych meczów i poprawia
 * funkcję celu względem aktualnie najlepszego.
 */
export function hillClimbParams({
  keys,
  initialParams = DEFAULT_HEURISTIC_PARAMS,
  step = 5,
  min = 0,
  max = 200,
  rounds = 1,
  evaluate,
  onEvaluation = null,
  proxyWeight = 0,
}) {
  if (typeof evaluate !== 'function') throw new TypeError('Tuner wymaga funkcji evaluate');
  if (!Array.isArray(keys) || keys.length === 0) throw new TypeError('Brak parametrów do strojenia');
  for (const key of keys) {
    if (!HEURISTIC_PARAM_KEYS.includes(key)) throw new RangeError(`Nieznany parametr: ${key}`);
  }
  // B6 T2 — β>0 miesza proxy do funkcji celu (gęstszy sygnał). β=0 → klasyczny
  // win-rate, zachowanie jak przed T2.
  const objectiveOf = (result) => tuningObjective(result, { proxyWeight });
  const initial = normalizeHeuristicParams(initialParams);
  const baseline = evaluate({ ...initial });
  let currentParams = { ...initial };
  let currentObjective = objectiveOf(baseline);
  if (!Number.isFinite(currentObjective)) throw new Error('Baseline tunera ma niedokończone mecze');

  const history = [{
    round: 0, key: null, direction: 0, params: { ...currentParams },
    summary: summarizeTuningResult(baseline), objective: currentObjective, accepted: true,
  }];
  let evaluations = 1;

  for (let round = 1; round <= rounds; round += 1) {
    for (const key of keys) {
      for (const direction of [-1, 1]) {
        const value = candidateValue(currentParams[key], direction * step, min, max);
        if (value === currentParams[key]) continue;
        const candidate = { ...currentParams, [key]: value };
        const result = evaluate({ ...candidate });
        evaluations += 1;
        const objective = objectiveOf(result);
        const summary = summarizeTuningResult(result);
        const accepted = summary.unfinished === 0 && objective > currentObjective;
        history.push({ round, key, direction, params: { ...candidate }, summary, objective, accepted });
        onEvaluation?.({ round, key, direction, params: candidate, objective, accepted });
        if (accepted) {
          currentParams = candidate;
          currentObjective = objective;
        }
      }
    }
  }

  return {
    initialParams: { ...initial },
    params: { ...currentParams },
    baselineSummary: summarizeTuningResult(baseline),
    objective: currentObjective,
    evaluations,
    history,
  };
}

/**
 * Główna funkcja „trybu jednej karty". Wyznacza deskryptory karty, parametry do
 * strojenia i talie zawierające kartę, po czym uruchamia hill-climbing na
 * ustalonej puli seedów. `evaluate` wstrzykiwalne (test podaje czystą funkcję;
 * CLI używa runBenchmark).
 */
export function tuneCard({
  cardId = null,
  descriptors: descriptorsOverride = null,
  seedsCount = 6,
  seedBase = 2026,
  rounds = 1,
  step = 5,
  decksDir = 'decks',
  evaluate = null,
  onEvaluation = null,
  proxyWeight = 0,
} = {}) {
  const registry = createCardRegistry();
  let descriptors;
  let decks;
  if (cardId) {
    const def = registry.get(cardId);
    if (!def) throw new Error(`Nieznana karta: ${cardId}`);
    descriptors = cardDescriptors(def);
    decks = decksContainingCard(cardId, { decksDir, registry });
  } else if (Array.isArray(descriptorsOverride) && descriptorsOverride.length > 0) {
    descriptors = descriptorsOverride;
    decks = listRepoDeckNames(decksDir);
  } else {
    throw new Error('Podaj --card <id> albo --descriptors <lista>');
  }

  const { keys, withoutParams } = paramsForDescriptors(descriptors);
  const plan = { cardId, descriptors, tunableParams: keys, descriptorsWithoutParams: withoutParams, decks };

  if (keys.length === 0) {
    return { plan, tuned: null, note: 'Brak parametrów do strojenia — deskryptory tej karty nie mają jeszcze wyciągniętych stałych (dopisz rodzinę w heuristic-params.js + DESCRIPTOR_PARAMS).' };
  }
  if (decks.length === 0 && cardId) {
    return { plan, tuned: null, note: `Żadna talia w ${decksDir} nie zawiera ${cardId} — dodaj kartę do talii planu przed strojeniem.` };
  }

  // Gdy β>0, benchmark musi ZBIERAĆ proxy (collectProxy), inaczej funkcja celu
  // nie ma czego mieszać. Domyślnie β=0 → collectProxy=false (jak przed T2).
  const runEval = evaluate ?? ((heuristicParams) => runBenchmark({
    bots: ['aggro', 'heuristic', 'random'],
    pairs: [['heuristic', 'random'], ['heuristic', 'aggro']],
    decks,
    seedsCount,
    seedBase,
    maxCommands: 5000,
    heuristicParams,
    collectProxy: proxyWeight > 0,
  }));

  const tuned = hillClimbParams({ keys, rounds, step, evaluate: runEval, onEvaluation, proxyWeight });
  return { plan, tuned };
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Opcja ${flag} musi być dodatnią liczbą całkowitą`);
  return parsed;
}

export function parseArgs(argv) {
  const options = { cardId: null, descriptors: null, seedsCount: 6, seedBase: 2026, rounds: 1, step: 5, proxyWeight: 0, jsonPath: null };
  const readValue = (i, flag) => {
    const value = argv[i + 1];
    if (value == null || value.startsWith('--')) throw new Error(`Opcja ${flag} wymaga wartości`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (arg === '--card') { options.cardId = readValue(i, arg); i += 1; continue; }
    if (arg === '--descriptors') { options.descriptors = readValue(i, arg).split(',').map((d) => d.trim()).filter(Boolean); i += 1; continue; }
    if (arg === '--seeds') { options.seedsCount = parsePositiveInt(readValue(i, arg), arg); i += 1; continue; }
    if (arg === '--seed-base') { options.seedBase = parsePositiveInt(readValue(i, arg), arg); i += 1; continue; }
    if (arg === '--rounds') { options.rounds = parsePositiveInt(readValue(i, arg), arg); i += 1; continue; }
    if (arg === '--step') { options.step = Number(readValue(i, arg)); i += 1; continue; }
    if (arg === '--proxy-weight') { options.proxyWeight = Number(readValue(i, arg)); i += 1; continue; }
    if (arg === '--json') { options.jsonPath = readValue(i, arg); i += 1; continue; }
    throw new Error(`Nieznana opcja: ${arg}`);
  }
  if (!Number.isFinite(options.step) || options.step <= 0) throw new Error('Opcja --step musi być dodatnia');
  if (!Number.isFinite(options.proxyWeight) || options.proxyWeight < 0 || options.proxyWeight > 1) {
    throw new Error('Opcja --proxy-weight musi być w [0, 1]');
  }
  return options;
}

const HELP = `Tuner B6 „tryb jednej karty" — strojenie parametrów deskryptorów karty.

Użycie: node tools/tune-card.mjs (--card <id> | --descriptors <lista>) [opcje]

Opcje:
  --card <id>          karta na warsztat (deskryptory + talie wykryte automatycznie)
  --descriptors a,b    zamiast karty: wprost lista deskryptorów (creature,spell,...)
  --seeds N            seedy na parę talii (domyślnie 6; przed przyjęciem: więcej)
  --seed-base N        pierwszy seed (domyślnie 2026)
  --rounds N           liczba przejść po parametrach (domyślnie 1)
  --step X             krok addytywny parametru (domyślnie 5)
  --proxy-weight β     waga proxy w funkcji celu [0,1] (domyślnie 0 = tylko
                       win-rate; β>0 miesza gęstszy sygnał pozycyjny, B6 T2)
  --json plik          zapisz wynik (plan + historia) do pliku
  --help               ta pomoc

Tuner NIE zmienia kodu ani DEFAULT_HEURISTIC_PARAMS. Proponowane wartości
przyjmuje się ręcznie po pełnym benchmarku i regeneracji golden-mastera —
procedura w docs/setup/STROJENIE_BOTA.md.`;

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
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(HELP);
    } else {
      const started = performance.now();
      const result = tuneCard({
        cardId: options.cardId,
        descriptors: options.descriptors,
        seedsCount: options.seedsCount,
        seedBase: options.seedBase,
        rounds: options.rounds,
        step: options.step,
        proxyWeight: options.proxyWeight,
        onEvaluation: ({ round, key, direction, params, objective, accepted }) => {
          const sign = direction < 0 ? '-' : '+';
          console.log(`B6 runda ${round}: ${sign}${key}=${params[key]} → ${(objective * 100).toFixed(2)}%${accepted ? ' [PRZYJĘTO]' : ''}`);
        },
      });
      console.log('\nPlan strojenia:');
      console.log(JSON.stringify(result.plan, null, 2));
      if (result.note) {
        console.log(`\nUwaga: ${result.note}`);
      } else {
        console.log('\nNajlepszy wariant parametrów:');
        console.log(JSON.stringify({ params: result.tuned.params, objective: result.tuned.objective, evaluations: result.tuned.evaluations }, null, 2));
        console.log(`\nCzas: ${((performance.now() - started) / 1000).toFixed(1)} s`);
      }
      if (options.jsonPath) {
        fs.writeFileSync(options.jsonPath, JSON.stringify(result, null, 2));
        console.log(`Zapisano wynik: ${options.jsonPath}`);
      }
    }
  } catch (error) {
    console.error(`Błąd tunera B6: ${error.message}`);
    process.exitCode = 1;
  }
}
