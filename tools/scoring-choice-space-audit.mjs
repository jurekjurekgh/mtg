// scoring-choice-space-audit (PMSSB-57, 2026-10-04f) — POMIAR przestrzeni wyboru
// decyzji, dla których bot oddaje stałe `finish(0)` z uzasadnieniem „regułowo
// jeden wariant / jedna komenda / równoważne".
//
// Po co: stałe 0 jest bezpieczne TYLKO wtedy, gdy silnik oferuje dokładnie jedną
// komendę tego typu — wtedy wynik nie zależy od wyceny. Jeśli wariantów jest
// więcej, bot wybiera z KOLEJNOŚCI OFERT silnika (wycena przypadkowa, klasa L41),
// a komentarz w `heuristic-bot.js` jest nieaktualny (precedens PMSSB-30: komentarz
// twierdził „ląd premiami", pomiar to obalił).
//
// Zmierzone typy (komentarze z `scoreCommand`):
//   • resolve_damage_assignment — „dokładnie jeden wariant (max-wartość zabójstw)"
//   • resolve_reveal_order — „jedna komenda (kolejność jak w reveal)"
//   • resolve_index_choice — „jedna komenda (kolejność oryginalna)"
//   • resolve_replacement_choice — „regułowo równoważne" (umbra ma wycenę)
//
// Wynik na katalogu 2026-10-04 (69 partii, 23 talie): resolve_damage_assignment
// 39 decyzji — zawsze 1 wariant; resolve_index_choice 1/1; resolve_reveal_order
// i resolve_replacement_choice nie wystąpiły w próbce. Stałe finish(0) tam,
// gdzie próba istnieje, są POPRAWNE.
//
// Tryb --all-decisions: mapa WSZYSTKICH typów decyzji (ile wariantów realnie ma
// każdy typ). Wynik na katalogu 2026-10-04 (46 partii, 23 talie): pass_priority
// zawsze 1 (19369), declare_blockers wybór 1..32 (704 jednowariantowych z 878),
// resolve_mulligan_choice zawsze 2 (keep/mulligan), resolve_optional_trigger_choice
// zawsze 1 — z DEFINICJI oferty (odmowa to osobne `pass_priority`; sprawdzone
// w game-state.js:7637 → tylko `fire: true`).
//
// Uruchomienie: node tools/scoring-choice-space-audit.mjs [seeds] [--decks=all] [--all-decisions]
// Exit code: 1, gdy typ z listy ma KIEDYKOLWIEK >1 wariant (dowód braku wyceny).
import fs from 'node:fs';
import path from 'node:path';
import { execute, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { BENCH_DECKS, benchmarkDecks } from './benchmark.mjs';

const seeds = Number(process.argv[2] ?? 1);
const WSZYSTKIE_TALIE = process.argv.includes('--decks=all');
const ALL_DECISIONS = process.argv.includes('--all-decisions');
const DECKS = WSZYSTKIE_TALIE ? benchmarkDecks() : BENCH_DECKS;
const registry = createCardRegistry();
const deckLists = new Map(DECKS.map((name) => [
  name, parseDeckText(fs.readFileSync(path.join('decks', `${name}.txt`), 'utf8'), registry).cardIds,
]));

// Typ → uzasadnienie stałego 0 w bocie (do raportu). Zmiana listy = zmiana zakresu
// audytu; nowy typ ze stałym 0 dopisujemy tutaj ŚWIADOMIE.
const STALE_ZERO = new Map([
  ['resolve_damage_assignment', '„dokładnie jeden wariant (max-wartość zabójstw)"'],
  ['resolve_reveal_order', '„jedna komenda (kolejność jak w reveal)"'],
  ['resolve_index_choice', '„jedna komenda (kolejność oryginalna)"'],
  ['resolve_replacement_choice', '„regułowo równoważne" (umbra ma wycenę)'],
]);

const agg = new Map(); // typ → { decyzje, hist: Map(liczba wariantów → ile razy), przyklady: [] }
let games = 0;
const naruszenia = [];

function odnotuj(view, cmd, deckA, deckB, seed) {
  const tegoTypu = (view.legalCommands ?? []).filter((c) => c.type === cmd.type);
  const n = tegoTypu.length;
  const k = agg.get(cmd.type) ?? { decyzje: 0, hist: new Map(), przyklady: [] };
  k.decyzje += 1;
  k.hist.set(n, (k.hist.get(n) ?? 0) + 1);
  if (n > 1 && k.przyklady.length < 5) {
    const opis = tegoTypu.map((c) => `${c.cardId ?? c.pickId ?? c.choice ?? c.targetId ?? '?'}`).join(', ');
    k.przyklady.push(`seed ${seed} ${deckA} vs ${deckB}: ${n} wariantów [${opis}]`);
    naruszenia.push(`${cmd.type}: ${n} wariantów (seed ${seed}, ${deckA} vs ${deckB})`);
  }
  agg.set(cmd.type, k);
}

function match(deckA, deckB, seed) {
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckLists.get(deckA)], ['p2', deckLists.get(deckB)]]),
    registry,
  });
  // Bot jest ZAMROŻONY — własna pętla zamiast runSimulation (jak w sąsiednich sondach).
  const bots = new Map([
    ['p1', createHeuristicBot({ seed: seed + 1, opponentDeck: deckLists.get(deckB), ownDeck: deckLists.get(deckA) })],
    ['p2', createHeuristicBot({ seed: seed + 2, opponentDeck: deckLists.get(deckA), ownDeck: deckLists.get(deckB) })],
  ]);
  for (let i = 0; i < 5000 && state.status === 'active'; i += 1) {
    const p = state.turn.priorityPlayerId;
    const view = playerView(state, p);
    const cmd = bots.get(p).chooseCommand(view, {});
    if (cmd?.type && (STALE_ZERO.has(cmd.type) || ALL_DECISIONS)) odnotuj(view, cmd, deckA, deckB, seed);
    const r = execute(state, cmd);
    if (!r?.ok) break;
  }
  games += 1;
}

for (let i = 0; i < DECKS.length; i += 1) {
  const other = DECKS[(i + 1) % DECKS.length];
  for (let s = 0; s < seeds; s += 1) match(DECKS[i], other, 1000 + s * 7 + i * 13);
}

console.log(`partie: ${games} (talii w próbce: ${DECKS.length}${WSZYSTKIE_TALIE ? ', --decks=all' : ''})`);
if (ALL_DECISIONS) {
  // Mapa WSZYSTKICH decyzji: ile wariantów ma realnie każdy typ. Typy z histem
  // {1:N} to decyzje bez wyboru (wycena zbędna — ale sprawdź, czy to ZAWSZE 1);
  // typy z wariantami ≥2 wymagają wyceny rozróżniającej (inaczej L41).
  const wgDecyzji = [...agg.entries()].sort((a, b) => b[1].decyzje - a[1].decyzje);
  console.log('\nWSZYSTKIE typy decyzji (warianty: liczba wystąpień):');
  for (const [typ, k] of wgDecyzji) {
    const hist = [...k.hist.entries()].sort((a, b) => a[0] - b[0]).map(([n, ile]) => `${n}:${ile}`).join(' ');
    const maxW = Math.max(...k.hist.keys());
    console.log(`  ${String(k.decyzje).padStart(5)}  ${typ}  {${hist}}${maxW > 1 ? '  ← WYBÓR' : ''}`);
  }
  process.exitCode = 0; // tryb mapy nie jest bramką
} else {
for (const [typ, uzasadnienie] of STALE_ZERO) {
  const k = agg.get(typ);
  if (!k) {
    console.log(`${typ}: 0 decyzji w próbce — ${uzasadnienie}`);
    continue;
  }
  const hist = [...k.hist.entries()].sort((a, b) => a[0] - b[0])
    .map(([n, ile]) => `${n}:${ile}`).join(' ');
  console.log(`${typ}: ${k.decyzje} decyzji, warianty{${hist}} — ${uzasadnienie}`);
  for (const p of k.przyklady) console.log(`    ${p}`);
}
if (naruszenia.length === 0) {
  console.log('\nWYNIK: każdy typ z listy miał zawsze 1 komendę — stałe finish(0) POPRAWNE.');
} else {
  console.log(`\nWYNIK: ${naruszenia.length} decyzji z >1 wariantem i BEZ wyceny — potrzebna wycena w bocie.`);
  process.exitCode = 1;
}
}
