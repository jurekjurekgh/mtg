/**
 * B6 — ewaluacja lustrzana: KANDYDAT (nowe parametry) vs BASELINE (parametry
 * domyślne), oba gracze `heuristic`, ta sama talia po obu stronach.
 *
 * Po co (wniosek z rund 1-3 + sondy M226/6): benchmark heuristic-vs-random/aggro
 * jest NASYCONY — lepszy timing removalu/tempa nie jest nagradzany, bo słaby
 * przeciwnik i tak przegrywa. Rodzina removal PRZEŁĄCZA 336 decyzji, ale
 * win-rate się nie rusza. To problem PRÓBKI, nie parametru. Lustro rozwiązuje
 * to wprost: obaj gracze grają dobrze, więc każda realna poprawa parametru
 * przekłada się na wygrane PRZECIW równemu sobie.
 *
 * Determinizm (ADR 0005): ten sam seed → te same rozdania; każdy mecz gramy na
 * OBU stronach stołu (kandydat jako p1 i jako p2), żeby przewaga pierwszego
 * ruchu się zniosła. Zero RNG i zegara.
 *
 * Narzędzie OFFLINE — nie wchodzi do artefaktu stołu. Wynik to win-rate
 * kandydata w [0,1]; 0.5 == parametry nieodróżnialne, >0.5 == kandydat lepszy.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { BENCH_DECKS } from './benchmark.mjs';

/**
 * Rozgrywa jeden mecz lustrzany: bot z paramsA jako p1, bot z paramsB jako p2,
 * obaj `heuristic`, ta sama talia. Zwraca 'A' | 'B' | null (remis/niedokończony).
 */
function playMirrorLeg({ paramsA, paramsB, deckIds, seed, registry, maxCommands }) {
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckIds], ['p2', deckIds]]),
    registry,
  });
  const { state: finalState } = runSimulation({
    state,
    controllers: new Map([
      ['p1', createHeuristicBot({ seed: seed + 1, opponentDeck: deckIds, params: paramsA, registry })],
      ['p2', createHeuristicBot({ seed: seed + 2, opponentDeck: deckIds, params: paramsB, registry })],
    ]),
    maxCommands,
  });
  if (finalState.status !== 'finished') return null;
  if (finalState.winnerId === 'p1') return 'A';
  if (finalState.winnerId === 'p2') return 'B';
  return null;
}

/**
 * Win-rate kandydata (paramsA) przeciw baseline (paramsB) na puli talii i
 * seedów, licząc OBIE strony stołu. `evaluate`-kompatybilny wynik: zwraca
 * { winsA, winsB, unfinished, games, winRateA }.
 */
export function mirrorEval({
  paramsA,
  paramsB = undefined,
  decks = BENCH_DECKS,
  seedsCount = 8,
  seedBase = 3000,
  maxCommands = 8000,
  decksDir = 'decks',
  registry = undefined,
} = {}) {
  const reg = registry ?? createCardRegistry();
  const deckLists = new Map(decks.map((name) => [
    name,
    parseDeckText(fs.readFileSync(path.join(decksDir, `${name}.txt`), 'utf8'), reg).cardIds,
  ]));
  let winsA = 0; let winsB = 0; let unfinished = 0; let games = 0;
  for (const deckName of decks) {
    const deckIds = deckLists.get(deckName);
    for (let s = 0; s < seedsCount; s += 1) {
      const seed = seedBase + s;
      // Strona 1: kandydat jako p1. Strona 2 (lustro): kandydat jako p2 —
      // zamieniamy paramsA/paramsB, więc pierwszy ruch nie faworyzuje kandydata.
      const legs = [
        playMirrorLeg({ paramsA, paramsB, deckIds, seed, registry: reg, maxCommands }),
        (() => {
          const r = playMirrorLeg({ paramsA: paramsB, paramsB: paramsA, deckIds, seed, registry: reg, maxCommands });
          return r === 'A' ? 'B' : r === 'B' ? 'A' : null; // przemapuj z powrotem na kandydata
        })(),
      ];
      for (const winner of legs) {
        games += 1;
        if (winner === 'A') winsA += 1;
        else if (winner === 'B') winsB += 1;
        else unfinished += 1;
      }
    }
  }
  const decided = winsA + winsB;
  return {
    winsA, winsB, unfinished, games,
    winRateA: decided > 0 ? winsA / decided : 0.5,
  };
}
