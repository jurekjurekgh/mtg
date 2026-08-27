/**
 * B6 T0 — golden-master wycen bota heurystycznego (sieć bezpieczeństwa refaktoru).
 *
 * Po co to jest: Etap B6 (docs/BOT_ROADMAP.md) wyciąga „magiczne liczby" z
 * `scoreCommand` do nazwanego wektora parametrów deskryptorowych
 * (`heuristic-params.js`). Sam refaktor NIE MOŻE zmienić zachowania bota przy
 * parametrach domyślnych — ten snapshot to udowadnia: zamraża ślad decyzji
 * (`trace()`) bota na ustalonym zbiorze partii i wykrywa KAŻDĄ różnicę wyceny.
 *
 * Determinizm (ADR 0005): partie liczą się z ustalonych seedów, bez
 * `Math.random` i bez zegara — dwa uruchomienia dają identyczny wynik. To ten
 * sam kontrakt, co harness benchmarku (tools/benchmark.mjs).
 *
 * Uwaga na rolę: to jest golden-master REFAKTORU, nie miernik JAKOŚCI. Jakość
 * mierzy benchmark (win-rate). Ten plik odpowiada wyłącznie na pytanie „czy
 * wycena bota zmieniła się bit w bit". Gdy tuner B6 ŚWIADOMIE zmienia parametry
 * (nie domyślne), snapshot regeneruje się razem z przyjęciem nowych wag.
 *
 * Fixture: test/fixtures/bot-scoring-snapshot.json (mały — hash + agregaty na
 * parę/seed, bez pełnych śladów). Pełne ślady do diagnostyki różnicy zrzuca
 * `--dump <plik>` (plik roboczy, poza gitem).
 *
 * Uruchomienie:
 *   node tools/bot-scoring-snapshot.mjs                 # wypisz snapshot (JSON)
 *   node tools/bot-scoring-snapshot.mjs --write         # zapisz fixture
 *   node tools/bot-scoring-snapshot.mjs --dump slad.json# zrzuć pełne ślady
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';

/**
 * Stały zbiór partii golden-mastera. Talie jednoplanowe (jak BENCH_DECKS,
 * ADR 0023) — stabilne, więc fixture nie „pływa" przy zmianie worków. Pary i
 * seedy dobrane tak, aby ślad przechodził przez różne rodziny decyzji (lądy,
 * stwory, czary, walka), a łączny czas mieścił się w szybkim tierze testów
 * (ADR 0019). Rozszerzenie zbioru = regeneracja fixture (świadoma).
 */
export const SNAPSHOT_CONFIG = Object.freeze({
  pairs: Object.freeze([
    Object.freeze(['ravnica', 'innistrad-wu']),
    Object.freeze(['dominaria-brg', 'mirrodin-wu']),
    Object.freeze(['tarkir-bg', 'warhammer-brg']),
  ]),
  seeds: Object.freeze([1000, 1001]),
  maxCommands: 4000,
  decksDir: 'decks',
});

const FIXTURE_PATH = 'test/fixtures/bot-scoring-snapshot.json';

/** Deterministyczny skrót pełnego śladu — wykrywa każdą zmianę wyceny. */
function hashTrace(trace) {
  return crypto.createHash('sha256').update(JSON.stringify(trace)).digest('hex');
}

/**
 * Agregaty pomocnicze do LOKALIZACJI różnicy, gdy hash się nie zgadza:
 * liczba decyzji, suma wycen wybranych komend (z zaokrągleniem, bo to liczby
 * zmiennoprzecinkowe) i histogram typów wybranych komend.
 */
function aggregateTrace(trace) {
  let scoreSum = 0;
  const chosenKinds = {};
  for (const entry of trace) {
    if (Number.isFinite(entry.score)) scoreSum += entry.score;
    const kind = String(entry.chosen).replace(/\(.*/, '').replace(/\[.*/, '');
    chosenKinds[kind] = (chosenKinds[kind] ?? 0) + 1;
  }
  const sortedKinds = {};
  for (const key of Object.keys(chosenKinds).sort()) sortedKinds[key] = chosenKinds[key];
  return {
    decisions: trace.length,
    scoreSum: Number(scoreSum.toFixed(4)),
    chosenKinds: sortedKinds,
  };
}

/**
 * Liczy snapshot golden-mastera. Zwraca małą, serializowalną strukturę
 * (bez pełnych śladów). `params`/`weights` wstrzykiwane przez tuner B6, aby
 * porównać wariant kandydata z baseline'em; domyślnie bot bazowy.
 */
export function computeScoringSnapshot({
  config = SNAPSHOT_CONFIG,
  params = undefined,
  weights = undefined,
  onTrace = null,
} = {}) {
  const registry = createCardRegistry();
  const deckCache = new Map();
  const deckOf = (name) => {
    if (!deckCache.has(name)) {
      const text = fs.readFileSync(path.join(config.decksDir, `${name}.txt`), 'utf8');
      deckCache.set(name, parseDeckText(text, registry).cardIds);
    }
    return deckCache.get(name);
  };

  const matches = [];
  for (const [deckX, deckY] of config.pairs) {
    for (const seed of config.seeds) {
      const state = setupCardMatch({
        seed,
        players: [{ id: 'p1' }, { id: 'p2' }],
        decks: new Map([['p1', deckOf(deckX)], ['p2', deckOf(deckY)]]),
        registry,
      });
      const bot = createHeuristicBot({
        seed: seed + 1,
        opponentDeck: deckOf(deckY),
        params,
        weights,
        registry,
      });
      runSimulation({
        state,
        controllers: new Map([
          ['p1', bot],
          ['p2', createRandomBot({ seed: seed + 2, allowConcede: false })],
        ]),
        maxCommands: config.maxCommands,
      });
      const trace = bot.trace();
      onTrace?.({ pair: `${deckX}|${deckY}`, seed, trace });
      matches.push({
        pair: `${deckX}|${deckY}`,
        seed,
        hash: hashTrace(trace),
        ...aggregateTrace(trace),
      });
    }
  }

  const overallHash = crypto.createHash('sha256')
    .update(matches.map((m) => m.hash).join('|'))
    .digest('hex');

  return { version: 1, overallHash, matches };
}

export function readFixture(fixturePath = FIXTURE_PATH) {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

export function writeFixture(snapshot, fixturePath = FIXTURE_PATH) {
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function isDirectCliRun() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(fs.realpathSync(process.argv[1]))).href;
  } catch {
    return false;
  }
}

if (isDirectCliRun()) {
  const argv = process.argv.slice(2);
  const dumpIndex = argv.indexOf('--dump');
  const dumpPath = dumpIndex >= 0 ? argv[dumpIndex + 1] : null;
  const dumps = [];
  const snapshot = computeScoringSnapshot({
    onTrace: dumpPath ? (entry) => dumps.push(entry) : null,
  });
  if (argv.includes('--write')) {
    writeFixture(snapshot);
    console.log(`Zapisano fixture: ${FIXTURE_PATH} (overallHash=${snapshot.overallHash.slice(0, 16)}…)`);
  } else {
    console.log(JSON.stringify(snapshot, null, 2));
  }
  if (dumpPath) {
    fs.writeFileSync(dumpPath, JSON.stringify(dumps, null, 2));
    console.log(`Zrzucono pełne ślady: ${dumpPath} (${dumps.length} partii)`);
  }
}
