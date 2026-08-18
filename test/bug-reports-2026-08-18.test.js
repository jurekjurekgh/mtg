// M141+ — zgłoszenia A/B z testów właściciela
//
// A. Chittering Rats — hand_top_choice_resolved nie ujawnia karty (FoW)
// B. Fathom Fleet Cutthroat — zniszczenie trafia do panelu Rozgrywka

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

// Wczytaj źródło session.js raz do testów FoW
const SESSION_SRC = fs.readFileSync('src/table/session.js', 'utf8');

// --- Bug A: Chittering Rats FoW ---

test('Bug A: hand_top_choice_resolved nie ujawnia nazwy karty (FoW)', () => {
  // Sprawdź, czy describeEvent nie zawiera nameOf(e.cardId) dla
  // hand_top_choice_resolved — to by ujawniło kartę z ręki przeciwnika.
  const match = SESSION_SRC.match(
    /case 'hand_top_choice_resolved':\s*return[^;]+/,
  );
  assert.ok(match, 'linia hand_top_choice_resolved istnieje w session.js');
  const line = match[0];
  // Powinna używać generycznego "kartę", nie nazwy karty
  assert.ok(
    line.includes('kartę') && !line.includes('nameOf'),
    `hand_top_choice_resolved NIE powinien używać nameOf: "${line}"`
  );
});

// --- Bug B: Fathom Fleet Cutthroat — sprawdź że zniszczenia trafiają do panelu ---

/**
 * Symuluje pętlę UI: playDirect → apply → showBotMoves.
 * Zwraca wszystkie teksty, które gracz zobaczył w panelu Rozgrywka.
 */
function playAndCollectPanel(session, { maxMoves = 400 } = {}) {
  const shown = [];
  const showBotMoves = () => {
    for (let guard = 0; guard < 500 && session.state.status === 'active'; guard += 1) {
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
        return;
      }
      if (session.botPausePending) { session.continueBotPlay(); continue; }
      return;
    }
  };
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
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

function makeSession(seed, humanDeck, botDeck) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${humanDeck}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botDeck}`, 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

test('Bug B: Fathom Fleet Cutthroat — zniszczenie w panelu Rozgrywka', () => {
  // Szukamy seedów, gdzie występują zniszczenia, i sprawdzamy
  // czy każde zniszczenie w logu ma odpowiednik w panelu.
  let laczniePanel = 0;
  let lacznieLog = 0;
  const raport = [];

  for (const seed of [1, 3, 5, 7, 11, 13, 17, 23, 27, 31, 37, 42, 77, 99]) {
    const session = makeSession(seed, 'black.txt', 'green.txt');
    const { shown, log } = playAndCollectPanel(session);
    const panelZniszczenia = shown.filter(t => t.includes('zostaje zniszczony'));
    const logZniszczenia = log.filter(t => t.includes('zostaje zniszczony'));
    laczniePanel += panelZniszczenia.length;
    lacznieLog += logZniszczenia.length;
    if (logZniszczenia.length > panelZniszczenia.length) {
      raport.push(`seed ${seed}: panel ${panelZniszczenia.length} < log ${logZniszczenia.length}`);
    }
  }

  assert.equal(
    raport.length, 0,
    `Zniszczenia w panelu są mniejsze niż w logu:\n${raport.join('\n')}\nŁącznie: panel ${laczniePanel}, log ${lacznieLog}`,
  );
  // Dla pewności: przynajmniej jeden seed wyprodukował zniszczenia
  assert.ok(lacznieLog > 0, 'żaden seed nie wyprodukował zniszczeń — test nic nie sprawdza');
});