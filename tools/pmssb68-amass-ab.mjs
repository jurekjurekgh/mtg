// PMSSB-68 (amass) — sparowany test A/B: drzewo bazowe (HEAD) kontra drzewo robocze.
// Uruchomienie: node tools/pmssb68-amass-ab.mjs <katalog-bazowy> [seedy=40]
//   np. git archive HEAD src decks | tar -x -C .arena/head-tree
//       node tools/pmssb68-amass-ab.mjs .arena/head-tree 40
//
// Ta sama talia po obu stronach, ta sama para seedów, obaj gracze `heuristic` z domyślnymi
// parametrami. Dla każdej partii liczymy: (1) czy sekwencja wybranych komend bota rozeszła
// się między drzewami (= zmiana decyzji), (2) zwycięzcę w każdym drzewie. Zmiany decyzji są
// jedynym dowodem wpływu poprawki; win-rate w małej próbie to tylko sygnał (ADR 0018, B6).
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT_NOW = process.cwd();
const baseRoot = path.resolve(process.argv[2] ?? '.arena/head-tree');
const seedsCount = Number(process.argv[3] ?? 40);
const DECKS = ['srodziemie', 'ravnica-wur'];

async function loadTree(root) {
  const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
  const [sim, bot, deckText, cardData, mat] = await Promise.all([
    load('src/engine/simulation.js'),
    load('src/controllers/heuristic-bot.js'),
    load('src/cards/deck-text.js'),
    load('src/cards/card-data.js'),
    load('src/cards/materialize.js'),
  ]);
  return { ...sim, ...bot, ...deckText, ...cardData, ...mat };
}

/** Rozgrywa jedną partię lustrzaną; zwraca sekwencję komend bota i zwycięzcę. */
function playGame(lib, deckIds, registry, seed) {
  const state = lib.setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckIds], ['p2', deckIds]]),
    registry,
  });
  const b1 = lib.createHeuristicBot({ seed: seed + 1, opponentDeck: deckIds, ownDeck: deckIds, registry });
  const b2 = lib.createHeuristicBot({ seed: seed + 2, opponentDeck: deckIds, ownDeck: deckIds, registry });
  const { state: fin } = lib.runSimulation({
    state,
    controllers: new Map([['p1', b1], ['p2', b2]]),
    maxCommands: 8000,
  });
  // Obie strony stołu: rozbieżność może pochodzić z decyzji p2 (lustro), nie tylko p1.
  const seq = [
    ...b1.trace().map((e) => `p1|${e.turn}|${e.step}|${e.chosen}`),
    ...b2.trace().map((e) => `p2|${e.turn}|${e.step}|${e.chosen}`),
  ];
  return { seq, winner: fin.status === 'finished' ? fin.winnerId ?? null : 'nieskończona' };
}

const now = await loadTree(ROOT_NOW);
const base = await loadTree(baseRoot);
const regNow = now.createCardRegistry();
const regBase = base.createCardRegistry();
const deckFile = (d) => fs.readFileSync(path.join(ROOT_NOW, 'decks', `${d}.txt`), 'utf8');

let games = 0; let diverged = 0; const winsNow = {}; const winsBase = {};
const examples = [];
for (const deck of DECKS) {
  const idsNow = now.parseDeckText(deckFile(deck), regNow).cardIds;
  const idsBase = base.parseDeckText(deckFile(deck), regBase).cardIds;
  for (let s = 0; s < seedsCount; s += 1) {
    const seed = 3000 + s;
    const a = playGame(base, idsBase, regBase, seed);
    const b = playGame(now, idsNow, regNow, seed);
    games += 1;
    const same = a.seq.length === b.seq.length && a.seq.every((x, i) => x === b.seq[i]);
    if (!same) {
      diverged += 1;
      const i = a.seq.findIndex((x, k) => x !== b.seq[k]);
      if (examples.length < 6) examples.push({ deck, seed, idx: i, base: a.seq[i] ?? null, now: b.seq[i] ?? null });
    }
    winsBase[a.winner] = (winsBase[a.winner] ?? 0) + 1;
    winsNow[b.winner] = (winsNow[b.winner] ?? 0) + 1;
  }
}
console.log(JSON.stringify({ games, diverged, winsBase, winsNow, examples }, null, 1));
