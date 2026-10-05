// PMSSB-56 (2026-10-04e) — POMIAR scoringu: które decyzje bot wybiera
// „z kolejności ofert" (default: finish(0) → telemetria unvaluedDecisions).
//
// Pytanie właściciela: „dodawaj mechaniki i pomiary niezbędne do poprawnego
// scoringu bota". Statyczny strażnik PMSSB-54 mówi, że KAŻDY typ komendy ma
// case; ten pomiar mówi, czy w PRAWDZIWYCH partiach benchmarku któryś typ
// faktycznie spada do default. Wynik: tabela typ → liczba trafień (p1/p2).
//
// Uruchomienie: node tools/scoring-unvalued-audit.mjs [seeds]
import { parseAuditArgs, assertAuditCommand, assertAuditFinished } from './scoring-audit-utils.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { BENCH_DECKS } from './benchmark.mjs';

const { seeds, flags } = parseAuditArgs(process.argv.slice(2), 2, []);
const registry = createCardRegistry();
const deckLists = new Map(BENCH_DECKS.map((name) => [
  name,
  parseDeckText(fs.readFileSync(path.join('decks', `${name}.txt`), 'utf8'), registry).cardIds,
]));

const agg = new Map(); // typ → { p1: n, p2: n }
let games = 0, unfinished = 0, commands = 0;

function match(deckA, deckB, seed) {
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckLists.get(deckA)], ['p2', deckLists.get(deckB)]]),
    registry,
  });
  const p1 = createHeuristicBot({ seed: seed + 1, opponentDeck: deckLists.get(deckB), ownDeck: deckLists.get(deckA) });
  const p2 = createHeuristicBot({ seed: seed + 2, opponentDeck: deckLists.get(deckA), ownDeck: deckLists.get(deckB) });
  // Self-play heuristic vs heuristic: obie strony niosą telemetrię scoringu —
  // najbogatszy materiał do łowienia „niewycenionych" (decyzje po OBU stronach).
  const { state: finalState, results } = runSimulation({
    state, controllers: new Map([['p1', p1], ['p2', p2]]), maxCommands: 5000,
  });
  for (const step of results) assertAuditCommand(step.result, step.command);
  assertAuditFinished(finalState);
  games += 1; commands += results.length;
  if (finalState.status !== 'finished') unfinished += 1;
  for (const [player, bot] of [['p1', p1], ['p2', p2]]) {
    const u = bot.unvaluedDecisions();
    for (const [typ, n] of Object.entries(u)) {
      if (typ === 'pass_priority') continue;
      const cell = agg.get(typ) ?? { p1: 0, p2: 0 };
      cell[player] += n;
      agg.set(typ, cell);
    }
  }
}

for (let i = 0; i < BENCH_DECKS.length; i += 1) {
  const other = BENCH_DECKS[(i + 1) % BENCH_DECKS.length];
  for (let s = 0; s < seeds; s += 1) match(BENCH_DECKS[i], other, 1000 + s * 7 + i * 13);
}

console.log(`partie: ${games} (niedokończone: ${unfinished}), komend: ${commands}`);
console.log('decyzje bez dedykowanej wyceny (typ → p1/p2):');
if (agg.size === 0) console.log('  BRAK — każdy typ komendy w tych partiach miał jawną wycenę');
else {
  for (const [typ, cell] of [...agg.entries()].sort((a, b) => (b[1].p1 + b[1].p2) - (a[1].p1 + a[1].p2))) {
    console.log(`  ${typ}: p1=${cell.p1} p2=${cell.p2}`);
  }
}
if (agg.size > 0) process.exitCode = 1;
