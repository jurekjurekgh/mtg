import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

/**
 * Warstwa sesji stołu (M5): człowiek gra z botem heurystycznym wyłącznie
 * przez protokół. Sesja sama przewija okna, w których człowiek ma do wyboru
 * wyłącznie pass, i rozgrywa ruchy bota; do człowieka zatrzymuje się dopiero
 * w oknie z prawdziwą decyzją. Testy są headless — bez DOM-u.
 */

function buildDecks(humanFile = 'green.txt', botFile = 'red.txt') {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${humanFile}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botFile}`, 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

/** Prosta polityka człowieka: preferuje rozwój planszy, czary celuje w przeciwnika. */
function chooseHumanCommand(view) {
  const ofType = (type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const first = (type) => ofType(type)[0] ?? null;
  return first('draw_card')
    ?? first('play_land')
    ?? first('tap_for_mana')
    ?? first('cast_permanent')
    ?? (() => {
      const casts = ofType('cast_spell');
      const hostile = casts.find((cmd) => {
        const target = view.zones.battlefield.find((o) => o.id === cmd.targets?.[0]);
        return target && target.controllerId !== view.playerId;
      });
      return hostile ?? null;
    })()
    ?? (() => {
      const attacks = ofType('declare_attackers');
      if (!attacks.length) return null;
      return attacks.reduce((best, cmd) => (cmd.attackerIds.length > best.attackerIds.length ? cmd : best));
    })()
    ?? first('declare_blockers')
    ?? first('resolve_combat')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null
    ?? first('pass_priority');
}

function playOut(session, maxMoves = 600) {
  for (let i = 0; i < maxMoves; i += 1) {
    if (session.state.status !== 'active') return i;
    const view = session.view();
    assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'sesja zatrzymała się poza oknem człowieka');
    const cmd = chooseHumanCommand(view);
    assert.ok(cmd, 'brak legalnej komendy w oknie decyzyjnym człowieka');
    const result = session.apply(cmd);
    assert.ok(result.ok, `komenda człowieka odrzucona: ${result.reason}`);
  }
  throw new Error('partia nie zakończyła się w limicie ruchów');
}

test('sesja wymaga poprawnego zestawu dwóch talii', () => {
  const { registry, decks } = buildDecks();
  assert.throws(() => createSession({ seed: 1, registry, decks: [] }), TypeError);
  assert.throws(() => createSession({ seed: 1, registry, decks: new Map([[HUMAN_ID, decks.get(HUMAN_ID)]]) }), TypeError);
});

test('świeża sesja przewija puste okna do pierwszej decyzji człowieka', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 7, registry, decks });
  const view = session.view();
  assert.equal(view.playerId, HUMAN_ID);
  assert.equal(view.status, 'active');
  // Tura 1 gracza: okna untap/upkeep mają wyłącznie pass — sesja staje na draw.
  assert.equal(view.turn.step, 'draw');
  assert.ok(view.legalCommands.some((cmd) => cmd.type === 'draw_card'));
  const ownHand = view.zones.hand.filter((o) => !o.hidden);
  assert.equal(ownHand.length, 7, 'ręka otwarcia człowieka jest w pełni jawna dla właściciela');
  assert.ok(ownHand.every((o) => o.cardId && o.kind), 'karty własnej ręki niosą pełne dane do planowania');
});

test('odrzucona komenda nie zmienia stanu i trafia do logu', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 7, registry, decks });
  const before = session.state.commands.length;
  const bogus = { type: 'play_land', playerId: HUMAN_ID, objectId: 'nie-istnieje' };
  const result = session.apply(bogus);
  assert.equal(result.ok, false);
  assert.match(result.reason, /illegal_land/);
  assert.equal(session.state.commands.length, before, 'odrzucona komenda nie wchodzi do logu replayu');
  assert.ok(session.log.some((entry) => entry.kind === 'rejection' && entry.text.includes('illegal_land')));
});

test('pełna partia człowiek–bot kończy się rozstrzygnięciem w engine', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 11, registry, decks });
  const humanMoves = playOut(session);
  assert.ok(humanMoves > 0, 'człowiek nie wykonał żadnego ruchu');
  assert.equal(session.state.status, 'finished');
  assert.ok(session.state.winnerId, 'brak zwycięzcy');
  // Bot faktycznie grał: jego komendy leżą w logu replayu.
  assert.ok(session.state.commands.some((cmd) => cmd.playerId === BOT_ID));
  // Log stołu opisuje zdarzenia po polsku, bez technicznych typów.
  const texts = session.log.map((entry) => entry.text);
  assert.ok(texts.some((t) => t.includes('dobiera')), 'log nie opisuje dobierania');
  assert.ok(texts.some((t) => t.includes('Tura gracza')), 'log nie opisuje tur');
});

test('eksport i import replayu odtwarzają partię bez odrzuceń', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 11, registry, decks });
  playOut(session);
  const text = session.exportReplayText();
  assert.match(text, /^\{"version":1,/);
  // Import na świeżej sesji w tym samym składzie talii.
  const reloader = createSession({ seed: 11, registry, decks });
  const summary = reloader.importReplayText(text);
  assert.equal(summary.steps, session.state.commands.length);
  assert.equal(summary.rejected, 0, 'replay zawiera odrzucone komendy');
  assert.equal(summary.status, 'finished');
  assert.ok(summary.winner, 'brak zwycięzcy w podsumowaniu importu');
  // Odtworzony replay doprowadza do dokładnie tego samego stanu gry.
  assert.equal(summary.fingerprint, stateFingerprint(session.state));
});

test('sesje z tym samym seedem przebiegają identycznie (bez Math.random)', () => {
  const one = buildDecks();
  const two = buildDecks();
  const a = createSession({ seed: 23, registry: one.registry, decks: one.decks });
  const b = createSession({ seed: 23, registry: two.registry, decks: two.decks });
  const moves = [];
  for (let i = 0; i < 40 && a.state.status === 'active'; i += 1) {
    const view = a.view();
    const cmd = chooseHumanCommand(view);
    moves.push(cmd);
    assert.equal(a.apply(cmd).ok, true);
  }
  for (const cmd of moves) assert.equal(b.apply(cmd).ok, true, `rozbieżność przy ${cmd.type}`);
  assert.equal(b.exportReplayText(), a.exportReplayText());
});

test('partia z czarami przechodzi przez stos i event log to opisuje', () => {
  const { registry, decks } = buildDecks('green.txt', 'red.txt');
  const session = createSession({ seed: 5, registry, decks });
  playOut(session);
  // W obu taliach są instants — w długiej partii któryś musiał zostać rzucony.
  assert.ok(
    session.state.events.some((e) => e.type === 'spell_cast'),
    'żaden czar nie został rzucony w całej partii',
  );
});
