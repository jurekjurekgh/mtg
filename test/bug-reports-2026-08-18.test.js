// M141+ — zgłoszenia A/B z testów właściciela
//
// A. Chittering Rats — hand_top_choice_resolved nie ujawnia karty (FoW)
//    M144: własna karta nadal z nazwą (CR 400.2); test zachowaniowy (L5).
// B. Fathom Fleet Cutthroat — zniszczenie trafia do panelu Rozgrywka

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const helpers = {
  nameOf: (id) => ({ swamp: 'Swamp', 'chittering-rats': 'Chittering Rats' }[id] ?? id),
  nameOfObject: () => '?',
};

// --- Bug A: Chittering Rats FoW (M142 + korekta M144) ---

test('Bug A: hand_top_choice_resolved — karta przeciwnika bez nazwy (FoW)', () => {
  const text = describeGameEvent({
    type: 'hand_top_choice_resolved',
    playerId: BOT_ID,
    cardId: 'swamp',
  }, helpers);
  assert.match(text, /kartę/);
  assert.doesNotMatch(text, /Swamp/);
});

test('Bug A: hand_top_choice_resolved — własna karta z nazwą (CR 400.2)', () => {
  const text = describeGameEvent({
    type: 'hand_top_choice_resolved',
    playerId: HUMAN_ID,
    cardId: 'swamp',
  }, helpers);
  assert.match(text, /Swamp/);
});

test('Bug A: hand_top_choice_required nie wpisuje nazwy karty z palca (ADR 0002)', () => {
  const withSrc = describeGameEvent({
    type: 'hand_top_choice_required',
    playerId: BOT_ID,
    sourceCardId: 'chittering-rats',
  }, helpers);
  assert.match(withSrc, /Chittering Rats/);
  const noSrc = describeGameEvent({
    type: 'hand_top_choice_required',
    playerId: BOT_ID,
  }, helpers);
  assert.doesNotMatch(noSrc, /Chittering Rats/);
});

// --- Bug B: Fathom Fleet Cutthroat — sprawdź że zniszczenia trafiają do panelu ---

/**
 * Symuluje pętlę UI: playDirect → apply → showBotMoves.
 * Zwraca wszystkie teksty, które gracz zobaczył w panelu Rozgrywka.
 */
function playAndCollectPanel(session, { maxMoves = 400 } = {}) {
  const shown = [];
  const showBotMoves = () => {
    // M146: kolekcjonujemy OSTATNIE ruchy także po zakończeniu partii — gdy
    // partia kończy się w trakcie ruchu bota (np. śmiertelne obrażenia),
    // bufor modala niesie ostatnie zagrania, a `status !== 'active'` kończył
    // pętlę PRZED ich zebraniem (fałszywy alarm „zniszczenie poza panelem").
    for (let guard = 0; guard < 500; guard += 1) {
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
  let laczniePanel = 0;
  let lacznieLog = 0;
  const raport = [];

  for (const seed of [1, 3, 5, 7, 11, 13, 17, 23, 27, 31, 37, 42, 77, 99]) {
    const session = makeSession(seed, 'dominaria.txt', 'tarkir.txt');
    const { shown, log } = playAndCollectPanel(session);
    const panelZniszczenia = shown.filter((t) => t.includes('zostaje zniszczony'));
    const logZniszczenia = log.filter((t) => t.includes('zostaje zniszczony'));
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
  assert.ok(lacznieLog > 0, 'żaden seed nie wyprodukował zniszczeń — test nic nie sprawdza');
});

// --- M146: stats_modified opisuje każdy wariant skutku (nie „undefined/undefined") ---

test('M146: stats_modified lock_untap ma czytelny opis (nie undefined/undefined)', () => {
  const text = describeGameEvent({
    type: 'stats_modified', objectId: 'lyre-host', cardId: 'entrancing-lyre',
    untapLocked: true, sourceId: 'lyre',
  }, { ...helpers, nameOfObject: (id) => ({ 'lyre-host': 'Krumar Initiate', lyre: 'Entrancing Lyre' }[id] ?? id) });
  assert.ok(!text.includes('undefined'), `undefined w opisie: ${text}`);
  assert.match(text, /nie odkręca się/);
  assert.match(text, /Entrancing Lyre/);
});

test('M146: stats_modified skipsNextUntap i base PT mają czytelne opisy', () => {
  const nameOfObject = (id) => ({ host: 'Wavecrash Triton' }[id] ?? id);
  const skip = describeGameEvent({ type: 'stats_modified', objectId: 'host', cardId: 'wavecrash-triton', skipsNextUntap: true }, { ...helpers, nameOfObject });
  assert.ok(!skip.includes('undefined'), `undefined w opisie: ${skip}`);
  assert.match(skip, /nie odkręca się w następnym kroku odkręcania/);
  const base = describeGameEvent({ type: 'stats_modified', objectId: 'host', cardId: 'x', basePower: 4, baseToughness: 4, untilEndOfTurn: true }, { ...helpers, nameOfObject });
  assert.ok(!base.includes('undefined'), `undefined w opisie: ${base}`);
  assert.match(base, /staje się 4\/4 do końca tury/);
});

// --- M146 (uwaga właściciela): trigger PRZECIWNIKA nie mówi „twoich" -------
test('M146: trigger przeciwnika (Nefarious Imp) opisuje „permanenty (Nieprzyjaciel)", nie „twoje"', () => {
  const names = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' };
  const text = describeGameEvent({
    type: 'ability_triggered',
    objectId: 'imp', cardId: 'nefarious-imp',
    trigger: 'permanents_you_control_leave_battlefield',
  }, {
    ...helpers,
    nameOf: (id) => ({ 'nefarious-imp': 'Nefarious Imp' }[id] ?? id),
    controllerOf: () => 'p2', // źródło należy do bota
  }, names);
  assert.ok(!text.includes('twoich'), `zaimek „twoich" przy cudzym triggerze: ${text}`);
  assert.match(text, /permanentów \(Nieprzyjaciel\)/);
});

test('M146: trigger WŁASNY nadal mówi „twoich" (perspektywa gracza)', () => {
  const names = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' };
  const text = describeGameEvent({
    type: 'ability_triggered',
    objectId: 'x', cardId: 'x',
    trigger: 'permanents_you_control_leave_battlefield',
  }, {
    ...helpers,
    controllerOf: () => 'p1', // źródło gracza
  }, names);
  assert.match(text, /twoich permanentów/);
});
