// Undo [←] — luka pokrycia znaleziona w audycie PR #181 (mutacja MUT-UNDO).
//
// Weryfikacja mutacyjna: usunięcie `noteTurnBoundaryPause()` z końca
// `apply()` NIE zapalało żadnego testu (cały zestaw 10 131/10 131 zielony),
// choć ta linia jest JEDYNYM źródłem migawki „początek tury”, gdy pauza
// granicy powstaje w strumieniu KOMENDY GRACZA. Sesja woła wtedy
// `advance()` dopiero po „Rozumiem”, więc bez migawki:
//   • pierwsza pauza partii (mulligan → nagłówek „Tura 1”) ma
//     `canUndoTurn === false` — przycisk Undo jest martwy na starcie meczu,
//     a zlecenie właściciela mówi: „schodzimy aż do początku meczu”;
//   • `undoToTurnStart()` zwraca `nothing-to-undo`, mimo że gra stoi
//     w panelu „Rozgrywka” z nagłówkiem tury.
// Test 1 pinuje dokładnie ten przypadek (RED po mutacji). Test 2 pinuje
// zachowanie przy granicy domkniętej komendą gracza w fazie `ending`
// (pass / zejście do siedmiu kart) — tam pauzę uzbraja `advance()`, ale
// kontrakt „Undo = początek tury, którą gracz właśnie zobaczył” musi
// trzymać niezależnie od tego, kto domknął turę.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const SEED = 3; // ten sam co w test/zgloszenie-undo-poczatek-tury.test.js

function freshSession() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer-ubr.txt', 'utf8'), registry).cardIds],
  ]);
  return createSession({ seed: SEED, registry, decks, pauseOnBotMoves: true });
}

/** Zachowanie otwarcia: mulligan (keep) domyka rozdanie i otwiera turę 1. */
function keepOpeningHand(session) {
  const view = session.view();
  const cmd = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  assert.ok(cmd, 'na starcie partii jest wybór ręki otwarcia');
  const applied = session.apply(cmd);
  assert.ok(applied.ok, `mulligan przyjęty: ${applied.reason}`);
  return applied;
}

test('Undo: migawka „początek meczu” powstaje już w pauzie startu partii', () => {
  const session = freshSession();
  const applied = keepOpeningHand(session);
  assert.ok(applied.botPause, 'start partii staje w pauzie (nagłówek Tura 1)');
  assert.ok(session.botPauseAtTurnBoundary, 'pauza niesie nagłówek tury');
  assert.equal(session.view().turn.number, 1);
  // PIN (MUT-UNDO): migawkę tworzy wywołanie w `apply()`, nie `advance()`.
  assert.ok(session.canUndoTurn, 'Undo jest dostępne bez klikania „Rozumiem”');

  const result = session.undoToTurnStart();
  assert.ok(result.ok, `undo ok: ${result.reason}`);
  assert.equal(result.turnNumber, 1, 'cofnięcie staje na początku meczu');
  assert.equal(result.activePlayerId, session.state.starterId, 'tura 1 należy do gracza rozpoczynającego');
  assert.equal(result.undoStepsLeft, 0, 'dalej nie ma już czego cofać');
  const view = session.view();
  assert.equal(view.turn.number, 1);
  assert.equal(view.turn.phase, 'beginning', 'początek tury = krok odkręcania');
  assert.ok(session.botPausePending, 'po cofnięciu gra stoi w panelu „Rozgrywka”');
});

/** Uproszczony kierowca: gracz oddaje priorytet, gdy to możliwe. */
function chooseHumanCommand(view) {
  const ofType = (type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const first = (type) => ofType(type)[0] ?? null;
  return first('resolve_mulligan_choice')
    ?? first('pass_priority')
    ?? first('draw_card')
    ?? first('play_land')
    ?? first('cast_permanent')
    ?? first('cast_spell')
    ?? first('declare_blockers')
    ?? first('resolve_combat')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null;
}

/**
 * Prowadzi partię do granicy tury domkniętej WŁASNĄ komendą gracza:
 * komenda w fazie `ending` (pass albo zejście do siedmiu kart) podnosi
 * numer tury i uzbraja pauzę nagłówka nowej tury.
 */
function driveToHumanTurnBoundary(session, maxSteps = 2000) {
  for (let i = 0; i < maxSteps; i += 1) {
    assert.equal(session.state.status, 'active', 'partia żyje do granicy tury');
    if (session.botPausePending) { session.continueBotPlay(); continue; }
    const view = session.view();
    if (view.turn.priorityPlayerId !== HUMAN_ID) { session.continueBotPlay(); continue; }
    const ending = view.turn.phase === 'ending';
    const cmd = chooseHumanCommand(view);
    if (!cmd) { session.continueBotPlay(); continue; }
    const before = view.turn.number;
    const applied = session.apply(cmd);
    assert.ok(applied.ok, `komenda ${cmd.type} przyjęta: ${applied.reason}`);
    if (ending && applied.botPause && session.view().turn.number === before + 1) {
      return { before, after: session.view().turn.number, commandType: cmd.type };
    }
  }
  throw new Error('partia nie domknęła tury komendą gracza w limicie kroków');
}

test('Undo: granica domknięta komendą gracza cofa do początku WŁAŚNIE tej tury', () => {
  const session = freshSession();
  const boundary = driveToHumanTurnBoundary(session);
  assert.ok(
    ['pass_priority', 'resolve_discard_choice'].includes(boundary.commandType),
    `granicę domknęła komenda gracza: ${boundary.commandType}`,
  );
  assert.equal(session.view().turn.activePlayerId, BOT_ID, 'nowa tura należy do bota');
  assert.ok(session.botPausePending, 'gra stoi w pauzie granicy tury');
  assert.ok(session.botPauseAtTurnBoundary, 'pauza niesie nagłówek tury');
  assert.ok(session.canUndoTurn, 'migawka „początek tury” istnieje');

  const result = session.undoToTurnStart();
  assert.ok(result.ok, `undo ok: ${result.reason}`);
  assert.equal(
    result.turnNumber,
    boundary.after,
    'Undo wraca do początku tury, którą gracz WŁAŚNIE zobaczył — nie o turę dalej',
  );
  assert.equal(result.activePlayerId, BOT_ID);
  const view = session.view();
  assert.equal(view.turn.number, boundary.after);
  assert.equal(view.turn.phase, 'beginning', 'początek tury = krok odkręcania');
  assert.ok(session.botPausePending, 'po cofnięciu gra stoi w panelu „Rozgrywka”');

  // Kolejne kliknięcie schodzi do poprzedniej tury (stos migawek maleje).
  const second = session.undoToTurnStart();
  assert.ok(second.ok);
  assert.equal(second.turnNumber, boundary.after - 1, 'drugie kliknięcie = poprzednia tura');
  assert.equal(second.activePlayerId, HUMAN_ID, 'poprzednia tura należała do gracza');
  assert.ok(second.undoStepsLeft < result.undoStepsLeft, 'stos migawek maleje');
});
