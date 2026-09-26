import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const REGISTRY = createCardRegistry();
const decks = () => new Map([
  [HUMAN_ID, parseDeckText('# A\n20x Forest\n20x Island', REGISTRY).cardIds],
  [BOT_ID, parseDeckText('# B\n20x Mountain\n20x Swamp', REGISTRY).cardIds],
]);

/** Gra passami aż numer tury ruszy (granica tury) albo strażnik padnie. */
function passUntilNextTurn(session, maxSteps = 400) {
  const state = session.state;
  const first = state.turn.number;
  let steps = 0;
  while (state.status === 'active' && state.turn.number === first && steps++ < maxSteps) {
    if (session.botPausePending) {
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    session.apply(cmd);
  }
  return { first, now: state.turn.number, steps };
}

test('AI-E1 session: onTurnCompleted odpala na granicy tury (nr + gracz)', () => {
  const fired = [];
  const session = createSession({
    seed: 7, registry: REGISTRY, decks: decks(),
    onTurnCompleted: (payload) => fired.push(payload),
  });
  const { first, now } = passUntilNextTurn(session);
  assert.ok(now > first, 'gra przeszła przez granicę tury');
  assert.ok(fired.length >= 1, 'obserwator odpalił');
  assert.equal(fired[0].number, first);
  assert.ok([HUMAN_ID, BOT_ID].includes(fired[0].activePlayerId));
  // Rekord domknięty = widoczny w pełnym zapisie dla AI.
  assert.ok(session.turnHistoryTextAll().includes(`Tura ${first}`));
});

test('AI-E1 session: wyjątek obserwatora NIE psuje gry (gwarancja sesji)', () => {
  const session = createSession({
    seed: 7, registry: REGISTRY, decks: decks(),
    onTurnCompleted: () => { throw new Error('AI padło'); },
  });
  const { first, now } = passUntilNextTurn(session);
  assert.ok(now > first, 'gra przeszła przez granicę mimo wyjątku w AI');
  assert.equal(session.state.status, 'active');
});
