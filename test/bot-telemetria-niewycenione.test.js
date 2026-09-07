import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// E1 planu 2026-09-07 (wyceny bota): telemetria „akcja bez wyceny".
// Komenda policzona gałęzią default scoreCommand ma wynik z KOLEJNOŚCI
// ofert (antywzorzec L41 — klasa M131/M336), więc każde jej WYBRANIE
// trafia do licznika bota; readout przez unvaluedDecisions() (mostek
// __mtgDebug.botUnvalued → detektor Testera). Typ nośnika syntetyczny
// (L134): „resolve_testowa_decyzja" nie ma case i nigdy nie będzie miał.

const WIDOK = {
  playerId: 'p1',
  turn: { number: 1, step: 'main' },
  players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }],
  zones: { hand: [], battlefield: [], library: [], graveyard: [], exile: [], stack: [] },
  legalCommands: [
    { type: 'resolve_testowa_decyzja', playerId: 'p1', modeIndex: 0 },
    { type: 'pass_priority', playerId: 'p1' },
  ],
};

test('E1: wybór komendy bez case trafia do licznika unvaluedDecisions', () => {
  const bot = createHeuristicBot({ seed: 11 });
  const cmd = bot.chooseCommand(WIDOK, {});
  assert.equal(cmd.type, 'resolve_testowa_decyzja', 'ex aequo 0/0: pierwszy wg kolejności (dowód arbitralności)');
  assert.deepEqual(bot.unvaluedDecisions(), { resolve_testowa_decyzja: 1 });
  bot.chooseCommand(WIDOK, {});
  assert.deepEqual(bot.unvaluedDecisions(), { resolve_testowa_decyzja: 2 }, 'licznik kumuluje');
});

test('E1: pass_priority z legalnym 0 nie jest „niewyceniony" (ma własny case)', () => {
  const bot = createHeuristicBot({ seed: 11 });
  bot.chooseCommand({
    ...WIDOK,
    legalCommands: [{ type: 'pass_priority', playerId: 'p1' }],
  }, {});
  assert.deepEqual(bot.unvaluedDecisions(), {});
});

test('E1: wpis trace() niesie znacznik unvalued dla audytu przebiegu', () => {
  const bot = createHeuristicBot({ seed: 11 });
  bot.chooseCommand(WIDOK, {});
  const ostatni = bot.trace().at(-1);
  assert.equal(ostatni.unvalued, 'resolve_testowa_decyzja');
});

test('E1: wyceniona komenda (case play_land) nie trafia do licznika', () => {
  const bot = createHeuristicBot({ seed: 11 });
  bot.chooseCommand({
    ...WIDOK,
    zones: { ...WIDOK.zones, hand: [{ id: 'l1', cardId: 'basic-forest', kind: 'land', zone: 'hand' }] },
    legalCommands: [{ type: 'play_land', playerId: 'p1', objectId: 'l1' }, { type: 'pass_priority', playerId: 'p1' }],
  }, {});
  assert.deepEqual(bot.unvaluedDecisions(), {});
});
