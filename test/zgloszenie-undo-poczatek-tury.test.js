// Undo [←] — zlecenie właściciela 2026-11-06: „przycisk w górnej belce na
// lewo od «Ziarno:», cofający grę do początku danej tury — otwartego panelu
// «Rozgrywka» z «Tura N — Gracz X» i przyciskiem «Rozumiem». Kolejne
// kliknięcia schodzą do początku poprzednich tur, aż do początku meczu."
//
// Piny warstw: sesja (migawki + odtwarzanie z ziarna i prefiksu komend,
// ADR 0005) oraz belka UI (index.html). Driver biegnie z pauseOnBotMoves
// (jak stół produkcyjny), żeby pauzy granicy tury (M261) łapały migawki.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession, PLAYER_NAMES } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { execute } from '../src/engine/game-state.js';
import { createReplay, playReplay } from '../src/engine/replay.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

const SEED = 3; // ten sam co w test/table-session.test.js — znany, żywy przebieg

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer-ubr.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

/** Uproszczony kierowca człowieka (wzorzec test/table-session.test.js). */
function chooseHumanCommand(view) {
  const ofType = (type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const first = (type) => ofType(type)[0] ?? null;
  return first('resolve_mulligan_choice')
    ?? first('draw_card')
    ?? first('play_land')
    ?? first('cast_permanent')
    ?? ofType('cast_spell')[0] ?? null
    ?? (() => {
      const attacks = ofType('declare_attackers');
      return attacks.length ? attacks[0] : null;
    })()
    ?? first('declare_blockers')
    ?? first('resolve_combat')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null
    ?? first('pass_priority');
}

/** Prowadzi partię krokami (pauza bota → „Rozumiem”; okno gracza → komenda). */
function driveUntil(session, predicate, maxSteps = 1500) {
  for (let i = 0; i < maxSteps; i += 1) {
    if (session.state.status !== 'active') return 'ended';
    if (predicate(session)) return 'reached';
    if (session.botPausePending) { session.continueBotPlay(); continue; }
    const view = session.view();
    if (view.turn.priorityPlayerId === HUMAN_ID) {
      const cmd = chooseHumanCommand(view);
      if (cmd) { session.apply(cmd); continue; }
    }
    session.continueBotPlay();
  }
  throw new Error('partia nie doszła do warunku w limicie kroków');
}

function freshSession() {
  const { registry, decks } = buildDecks();
  return createSession({ seed: SEED, registry, decks, pauseOnBotMoves: true });
}

test('Undo: cofa do początku BIEŻĄCEJ tury — pauza granicy z nagłówkiem i „Rozumiem”', () => {
  const session = freshSession();
  driveUntil(session, (s) => s.view().turn.number >= 5 && s.view().turn.phase === 'precombat_main');
  const targetTurn = session.view().turn.number;
  assert.ok(session.canUndoTurn, 'migawki początków tur istnieją');
  const result = session.undoToTurnStart();
  assert.ok(result.ok, `undo ok: ${result.reason}`);
  assert.equal(result.turnNumber, targetTurn, 'pierwsze kliknięcie = początek BIEŻĄCEJ tury');
  // Stan gry: ta sama tura, partia żywa, gra STOI w pauzie granicy.
  assert.equal(session.view().turn.number, targetTurn);
  assert.equal(session.state.status, 'active');
  assert.ok(session.botPausePending, 'sesja czeka na „Rozumiem”');
  assert.ok(session.botPauseAtTurnBoundary, 'pauza niesie nagłówek tury');
  assert.ok(session.botMoves.some((m) => m.type === 'turn_started'
    && m.text.startsWith(`Tura ${targetTurn} — `)), 'bufor modala zaczyna się od nagłówka tury');
});

test('Undo: kolejne kliknięcia schodzą o turę wcześniej, aż do początku meczu (tura 1)', () => {
  const session = freshSession();
  driveUntil(session, (s) => s.view().turn.number >= 5 && s.view().turn.phase === 'precombat_main');
  const seen = [];
  while (session.canUndoTurn) {
    const r = session.undoToTurnStart();
    assert.ok(r.ok);
    seen.push(r.turnNumber);
  }
  // Malejąco o dokładnie 1, kończąc na turze 1 (początek meczu).
  assert.ok(seen.length >= 2, `przynajmniej dwie tury do cofnięcia: ${seen}`);
  assert.equal(seen[0] - seen[1], 1, 'kolejne kliknięcie = poprzednia tura');
  assert.equal(seen.at(-1), 1, 'ostatni punkt = początek meczu');
  for (let i = 1; i < seen.length; i += 1) {
    assert.equal(seen[i - 1] - seen[i], 1, 'schodzenie o dokładnie jedną turę');
  }
  // Dno stosu: dalej się nie cofnie.
  const refused = session.undoToTurnStart();
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'nothing-to-undo');
  assert.equal(session.view().turn.number, 1);
  assert.ok(session.botPauseAtTurnBoundary, 'początek meczu też stoi w pauzie nagłówka');
});

test('Undo: stan po cofnięciu = czysty replay prefiksu komend (determinizm ADR 0005)', () => {
  const session = freshSession();
  driveUntil(session, (s) => s.view().turn.number >= 4 && s.view().turn.phase === 'precombat_main');
  const result = session.undoToTurnStart();
  assert.ok(result.ok);
  const { registry, decks } = buildDecks();
  const players = Object.entries(PLAYER_NAMES).map(([id, name]) => ({ id, name }));
  const replayed = playReplay(
    createReplay(SEED, session.state.commands.map((c) => ({ ...c }))),
    () => setupCardMatch({ seed: SEED, players, decks, registry }),
    execute,
  );
  assert.ok(replayed.results.every((r) => r.ok), 'prefiks odtwarza się bez odrzuceń');
  assert.equal(stateFingerprint(replayed.state), session.debugFingerprint(),
    'stan po Undo jest dokładnie stanem partii w tym punkcie');
});

test('Undo: log wraca do początku tury — cofnięta przyszłość znika z logu', () => {
  const session = freshSession();
  driveUntil(session, (s) => s.view().turn.number >= 5 && s.view().turn.phase === 'precombat_main');
  const logLengthBefore = session.log.length;
  const result = session.undoToTurnStart();
  assert.ok(result.ok);
  const turn = result.turnNumber;
  // Wpisy z cofniętej części partii znikają; zostaje +1 komunikat systemowy.
  assert.ok(session.log.length < logLengthBefore, 'log się cofnął');
  assert.ok(session.log.every((entry) => entry.turn <= turn),
    'żaden wpis logu nie pochodzi zza cofniętej granicy tury');
  const last = session.log.at(-1);
  assert.equal(last.kind, 'system');
  assert.ok(last.text.includes(`Cofnięto do początku tury ${turn}`), `komunikat cofnięcia: ${last.text}`);
  // Przebieg tur (AI) też nie zna przyszłości.
  const historyNumbers = session.turnHistory.map((record) => record.number);
  assert.ok(historyNumbers.every((n) => n < turn), 'turnHistory bez cofniętych tur');
});

test('Undo: po „Rozumiem” partia żyje i da się dograć dalej (alternatywna przyszłość)', () => {
  const session = freshSession();
  driveUntil(session, (s) => s.view().turn.number >= 4 && s.view().turn.phase === 'precombat_main');
  assert.ok(session.undoToTurnStart().ok);
  // „Rozumiem” → gra toczy się: upkeep pauza albo okno decyzyjne, potem dalej.
  const outcome = driveUntil(session, (s) => s.view().turn.number >= 5 && s.view().turn.phase === 'precombat_main', 400);
  assert.ok(['reached', 'ended'].includes(outcome), `partia toczy się po cofnięciu (${outcome})`);
  // Po przejściu przez granicę następnej tury znów można cofnąć.
  if (outcome === 'reached') assert.ok(session.canUndoTurn, 'nowa granica tury = nowa migawka');
});

test('Undo: sesja bez pauseOnBotMoves nie ma punktów zaczepienia (no-op, gra nietknięta)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: SEED, registry, decks }); // pauzy WYŁĄCZONE
  driveUntil(session, (s) => s.view().turn.number >= 3 && s.view().turn.phase === 'precombat_main');
  assert.equal(session.canUndoTurn, false, 'bez pauz granicy nie ma migawek');
  const before = session.debugFingerprint();
  const refused = session.undoToTurnStart();
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'nothing-to-undo');
  assert.equal(session.debugFingerprint(), before, 'stan nietknięty');
});

test('Undo: przycisk [←] w belce — na lewo od „Ziarno:”, styl ikonowy jak [dźwięk][grafika][AI]', () => {
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const undoIdx = html.indexOf('id="undo-turn"');
  const seedIdx = html.indexOf('<label for="seed">Ziarno:</label>');
  assert.ok(undoIdx !== -1, 'przycisk #undo-turn istnieje');
  assert.ok(seedIdx !== -1, 'etykieta „Ziarno:” istnieje');
  assert.ok(undoIdx < seedIdx, 'Undo stoi NA LEWO od „Ziarno:”');
  const buttonMatch = html.slice(undoIdx - 200, undoIdx + 600).match(/<button[^>]*id="undo-turn"[^>]*>/);
  assert.ok(buttonMatch, 'znaleziono element przycisku');
  const attrs = buttonMatch[0];
  assert.match(attrs, /class="icon-toggle"/, 'ten sam styl co pozostałe ikonki belki');
  assert.match(attrs, /disabled/, 'startowo wyłączony (bez partii nie ma czego cofać)');
  assert.match(attrs, /aria-label="[^"]*Undo[^"]*"/, 'etykieta dostępności');
  assert.match(attrs, /title="[^"]*\[/, 'tooltip z graficzną nazwą [←]');
});
