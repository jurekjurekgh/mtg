// scoring-mulligan-audit (PMSSB-57, 2026-10-04f) — POMIAR jakości decyzji
// mulliganu w prawdziwych partiach (wszystkie talie jednoplanowe).
//
// Kryterium: polityka bota to „keep ⇔ ≥2 lądy albo ≥2 mulligany" (2026-09-14f).
// Audyt liczy trzy klasy naruszeń:
//   • KEEP bez polityki — keep przy <2 lądach i <2 mulliganach,
//   • MULLIGAN mimo 2+ lądów,
//   • KEEP bez grywalnego czaru (brak czaru grywalnego nawet po JEDNYM
//     dodatkowym lądzie) albo w ogóle bez czarów — ręka, w której bot nic nie
//     robi przez ≥2 tury. Reguła i jej uzasadnienie: `mulligan-keep-criterion.mjs`
//     (audyt PR #175: poprzednia wersja `najtańszy > lądy` dawała fałszywy
//     alarm dla ręki 2 lądy + czar 3 many i liczyła CUDZĄ (ukrytą) rękę jako
//     własne czary — strefa `hand` jest złożona, kontrakt FoW).
//
// Wynik na katalogu 2026-10-04 (23 partie, 53 decyzje): rozkład 0 lądów:
// 0 keep / 1 mulligan; 1: 0/6; 2: 21/0; 3: 12/0; 4: 12/0; 5: 1/0 —
// **0 naruszeń** wszystkich trzech klas. Polityka zmierzona i trzymana.
//
// Uruchomienie: node tools/scoring-mulligan-audit.mjs [seeds]
// Exit code: 1, gdy audyt znajdzie naruszenia (bramka ręczna).
//
import { parseAuditArgs, assertAuditCommand, assertAuditFinished } from './scoring-audit-utils.mjs';
import { ownHandSummary, classifyMulliganDecision } from './mulligan-keep-criterion.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execute, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { benchmarkDecks } from './benchmark.mjs';

const { seeds, flags } = parseAuditArgs(process.argv.slice(2), 1, []);
const DECKS = benchmarkDecks();
const registry = createCardRegistry();
const deckLists = new Map(DECKS.map((name) => [
  name,
  parseDeckText(fs.readFileSync(path.join('decks', `${name}.txt`), 'utf8'), registry).cardIds,
]));

const decyzje = [];
const naruszenia = [];
let games = 0;

function match(deckA, deckB, seed) {
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckLists.get(deckA)], ['p2', deckLists.get(deckB)]]),
    registry,
  });
  const bots = new Map([
    ['p1', createHeuristicBot({ seed: seed + 1, opponentDeck: deckLists.get(deckB), ownDeck: deckLists.get(deckA) })],
    ['p2', createHeuristicBot({ seed: seed + 2, opponentDeck: deckLists.get(deckA), ownDeck: deckLists.get(deckB) })],
  ]);
  for (let i = 0; i < 5000 && state.status === 'active'; i += 1) {
    const p = state.turn.priorityPlayerId;
    const view = playerView(state, p);
    const cmd = bots.get(p).chooseCommand(view, {});
    if (cmd.type === 'resolve_mulligan_choice') {
      // Ręka to strefa ZŁOŻONA (własne karty + cudze jako `hidden`) — czytamy
      // wyłącznie własne; jedno źródło reguły w `mulligan-keep-criterion.mjs`.
      const { lands: landy, spells: czary, cheapestSpell: najtanszy } = ownHandSummary(view.zones.hand, p);
      const rekord = {
        player: p, deck: p === 'p1' ? deckA : deckB, keep: cmd.keep, mulligans: cmd.mulligans ?? 0,
        landy, czary, najtanszy,
      };
      decyzje.push(rekord);
      const rodzaj = classifyMulliganDecision({
        keep: cmd.keep, mulligans: cmd.mulligans ?? 0, lands: landy, spells: czary, cheapestSpell: najtanszy,
      });
      if (rodzaj) naruszenia.push({ ...rekord, rodzaj });
    }
    const r = execute(state, cmd);
    assertAuditCommand(r, cmd);
  }
  assertAuditFinished(state);
  games += 1;
}

for (let i = 0; i < DECKS.length; i += 1) {
  const other = DECKS[(i + 1) % DECKS.length];
  for (let s = 0; s < seeds; s += 1) match(DECKS[i], other, 1000 + s * 7 + i * 13);
}

const rozklad = new Map();
for (const d of decyzje) {
  const k = `${d.landy} lądów`;
  const cell = rozklad.get(k) ?? { keep: 0, mull: 0 };
  cell[d.keep ? 'keep' : 'mull'] += 1;
  rozklad.set(k, cell);
}
console.log(`partie: ${games}, decyzje mulliganu: ${decyzje.length}`);
for (const [k, v] of [...rozklad.entries()].sort()) console.log(`  ${k}: keep=${v.keep} mulligan=${v.mull}`);
console.log(`naruszenia kryteriów: ${naruszenia.length}`);
for (const n of naruszenia.slice(0, 12)) {
  console.log(`  [${n.rodzaj}] ${n.player} (${n.deck}) mull=${n.mulligans} landy=${n.landy} czary=${n.czary} najtańszy=${n.najtanszy} keep=${n.keep}`);
}

if (naruszenia.length > 0) process.exitCode = 1;
