// Diagnostyka zgłoszenia D: co panel „Rozgrywka" gubi z tury przeciwnika.
// Wierna symulacja pętli UI (main.js): playDirect → apply → showBotMoves,
// „Rozumiem" → continueBotPlay → showBotMoves.
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const deckA = process.argv[3] ?? 'black';
const deckB = process.argv[4] ?? 'blue';

function makeSession(seed) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${deckA}.txt`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${deckB}.txt`, 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

function run(seed, maxMoves = 600) {
  const session = makeSession(seed);
  const shown = [];
  // showBotMoves z main.js (bez DOM).
  const showBotMoves = () => {
    for (let guard = 0; guard < 200; guard += 1) {
      const moves = session.botMoves ?? [];
      const meaningful = moves.filter((m) => !/^Faza:/.test(m.text ?? ''));
      if (meaningful.length === 0 && moves.length > 0) {
        session.clearBotMoves();
        if (session.botPausePending) { session.continueBotPlay(); continue; }
        return;
      }
      if (moves.length > 0) {
        for (const m of moves) shown.push(m.text);
        session.clearBotMoves();
        return; // modal otwarty — czeka na klik
      }
      if (session.botPausePending) { session.continueBotPlay(); continue; }
      return;
    }
  };
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) { // klik „Rozumiem"
      session.continueBotPlay();
      showBotMoves();
      continue;
    }
    const view = session.view();
    const meaningful = view.legalCommands.filter(
      (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
    );
    const cmd = meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    if (!session.apply(cmd).ok) break;
    showBotMoves();
  }
  return { shown, log: session.log.map((e) => e.text ?? String(e)) };
}

const seeds = process.argv[2] ? [Number(process.argv[2])] : [...Array(40).keys()].map((i) => i + 1);
const INTERESTING = [
  [/przechodzi pod kontrolę/, 'control_changed'],
  [/atakuje/, 'atak'],
  [/obrażeń/, 'obrażenia'],
  [/opóźnion/, 'opóźniony trigger'],
  [/zostaje wygnan/, 'wygnanie'],
  [/traci .* życia|zyskuje .* życia|punkt/, 'życie'],
];
const tally = new Map();
for (const seed of seeds) {
  let r;
  try { r = run(seed); } catch (err) { console.log(`seed ${seed}: ERROR ${err.message}`); continue; }
  const shownSet = r.shown.join('\n');
  const missing = [];
  for (const line of r.log) {
    for (const [re, label] of INTERESTING) {
      if (re.test(line) && !shownSet.includes(line)) missing.push(`${label}: ${line}`);
    }
  }
  if (missing.length) {
    tally.set(seed, missing);
    console.log(`\n=== seed ${seed} — brakuje ${missing.length} linii w panelu ===`);
    for (const m of missing.slice(0, 12)) console.log('  - ' + m);
  }
}
console.log(`\nSeedów z brakami: ${tally.size}/${seeds.length}`);
