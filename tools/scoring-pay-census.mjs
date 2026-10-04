// scoring-pay-census (PMSSB-57, 2026-10-04f) — POMIAR decyzji ZAPŁAT bota
// w prawdziwych partiach benchmarku: ile ich jest, jakie koszty, jak często
// bot płaci, i czy nie płaci za czar, który i tak by fizzlował (wszystkie cele
// nielegalne przy rozstrzygnięciu, CR 608.2b — wtedy kontr i fizzle kończą się
// IDENTYCZNIE: karta do grobu, a różnica to przepalona mana).
//
// Po co: audyt `scoring-unvalued-audit` mierzy BRAK wyceny; ten mierzy, CZY
// wycena podejmuje decyzje sensowne w realnych pozycjach. Rodziny zapłat:
//   resolve_ward_pay_choice, resolve_counter_pay_choice,
//   resolve_pay_or_sacrifice, resolve_optional_pay_choice.
//
// Uruchomienie: node tools/scoring-pay-census.mjs [seeds]
import fs from 'node:fs';
import path from 'node:path';
import { execute, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { BENCH_DECKS, benchmarkDecks } from './benchmark.mjs';

const seeds = Number(process.argv[2] ?? 2);
// `--all` = census WSZYSTKICH typów decyzji (nie tylko rodzin zapłat) — pokazuje,
// co próbka benchmarku (ADR 0024) realnie ćwiczy, a czego nie mierzy wcale.
const ALL = process.argv.includes('--all');
const RODZINY = new Set([
  'resolve_ward_pay_choice', 'resolve_counter_pay_choice',
  'resolve_pay_or_sacrifice', 'resolve_optional_pay_choice',
]);
// `--decks=all` = WSZYSTKIE talie jednoplanowe repo (23), nie tylko próbka
// benchmarku (6, ADR 0024). Powód pomiarowy: próbka rotuje i potrafi NIE
// zawierać ani jednej karty danej rodziny decyzji (np. zapłat: 0 w 36 partiach
// na BENCH_DECKS, a karty zapłat leżą w dominaria-brg/innistrad-wu/ixalan).
const WSZYSTKIE_TALIE = process.argv.includes('--decks=all');
const DECKS = WSZYSTKIE_TALIE ? benchmarkDecks() : BENCH_DECKS;
const registry = createCardRegistry();
const deckLists = new Map(DECKS.map((name) => [
  name,
  parseDeckText(fs.readFileSync(path.join('decks', `${name}.txt`), 'utf8'), registry).cardIds,
]));

const agg = new Map();
let games = 0;

/** Czy obiekt o tym id żyje (jest na polu bitwy albo na stosie) — z widoku. */
function zywy(view, id) {
  if (id == null) return false;
  const z = view.zones ?? {};
  return (z.battlefield ?? []).some((o) => o.id === id)
    || (z.stack ?? []).some((o) => o.id === id);
}

/** Czy WSZYSTKIE cele czaru na stosie są nielegalne (czar fizzluje). */
function wszystkieCeleMartwe(view, targetId) {
  const entry = (view.zones?.stack ?? []).find((e) => e.id === targetId);
  const cele = entry?.targets ?? [];
  if (cele.length === 0) return false; // brak celów = nie nasza sprawa
  return cele.every((id) => !zywy(view, id));
}

function kartаZrodla(view, sourceId) {
  if (sourceId == null) return null;
  const z = view.zones ?? {};
  for (const strefa of ['battlefield', 'stack', 'graveyard', 'exile', 'hand']) {
    const hit = (z[strefa] ?? []).find((o) => o.id === sourceId);
    if (hit) return hit.cardId ?? hit.id;
  }
  return null;
}

const wszystkie = new Map();

function odnotujWszystkie(cmd) {
  wszystkie.set(cmd.type, (wszystkie.get(cmd.type) ?? 0) + 1);
}

function odnotuj(view, cmd) {
  const komorka = agg.get(cmd.type) ?? {
    decyzje: 0, pay: 0, koszty: new Map(), martweCele: 0, przyklady: new Set(),
  };
  komorka.decyzje += 1;
  if (cmd.pay) komorka.pay += 1;
  const koszt = cmd.cost ?? 0;
  komorka.koszty.set(koszt, (komorka.koszty.get(koszt) ?? 0) + 1);
  if (cmd.pay && cmd.targetId != null && wszystkieCeleMartwe(view, cmd.targetId)) {
    komorka.martweCele += 1;
    const karta = kartаZrodla(view, cmd.targetId);
    if (karta) komorka.przyklady.add(karta);
  }
  agg.set(cmd.type, komorka);
}

function match(deckA, deckB, seed) {
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckLists.get(deckA)], ['p2', deckLists.get(deckB)]]),
    registry,
  });
  // Pętla odwzorowuje `runSimulation` (bot jest ZAMROŻONY — nie da się obkleić
  // metody), ale w miejscu decyzji zapisuje census z widoku, który bot widział.
  const bots = new Map([
    ['p1', createHeuristicBot({ seed: seed + 1, opponentDeck: deckLists.get(deckB), ownDeck: deckLists.get(deckA) })],
    ['p2', createHeuristicBot({ seed: seed + 2, opponentDeck: deckLists.get(deckA), ownDeck: deckLists.get(deckB) })],
  ]);
  for (let i = 0; i < 5000 && state.status === 'active'; i += 1) {
    const p = state.turn.priorityPlayerId;
    const view = playerView(state, p);
    const cmd = bots.get(p).chooseCommand(view, {});
    if (cmd?.type) odnotujWszystkie(cmd);
    if (RODZINY.has(cmd?.type)) odnotuj(view, cmd);
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
for (const [typ, k] of [...agg.entries()].sort()) {
  const koszty = [...k.koszty.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${c}:${n}`).join(' ');
  console.log(`${typ}: ${k.decyzje} decyzji, pay=${k.pay}, koszty[{${koszty}}]`
    + (k.martweCele ? `, PAY Z MARTWYMI CELAMI=${k.martweCele} (${[...k.przyklady].join(', ')})` : ''));
}
if (agg.size === 0) console.log('  BRAK decyzji zapłat w tej próbce (rodziny zapłat poza próbką talii — patrz raport zbiorczy)');
if (ALL) {
  const top = [...wszystkie.entries()].sort((a, b) => b[1] - a[1]);
  const suma = top.reduce((n, [, v]) => n + v, 0);
  console.log(`\nWSZYSTKIE decyzje (${suma} komend, ${top.length} typów) — top 20:`);
  for (const [typ, n] of top.slice(0, 20)) console.log(`  ${String(n).padStart(6)}  ${typ}`);
}
