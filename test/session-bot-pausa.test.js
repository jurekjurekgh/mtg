import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

/**
 * Pauza po każdym istotnym zagraniu bota (decyzja właściciela 2026-08-05):
 * gra zatrzymuje się na klik gracza po rzuceniu czaru przez bota, wystawieniu
 * lądu, użyciu zdolności i zmianie strefy karty — nawet gdy gracz nie ma
 * żadnej możliwej odpowiedzi. Wznowienie: session.continueBotPlay (klik
 * „Rozumiem" w modalu „Ruch bota"). Pauzy są czystym tempem UI: nie zmieniają
 * przebiegu partii (test fingerprintów pauzowanej i zwykłej sesji).
 */

const PAUSE_TYPES = new Set([
  'spell_cast', 'permanent_cast', 'aura_spell_cast', 'land_played',
  'ability_activated', 'ability_triggered',
  'object_moved', 'object_exiled', 'permanent_destroyed', 'creature_destroyed',
  'permanent_sacrificed', 'permanent_put_into_graveyard',
  'token_created', 'permanent_entered_battlefield',
]);

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

function humanCommand(view) {
  const first = (type) => view.legalCommands.find((c) => c.type === type);
  const meaningful = view.legalCommands.filter(
    (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
  );
  // Okno z SAMYM obowiązkowym krokiem (np. resolve_combat po deklaracjach):
  // nic „ciekawego" nie ma, ale kliknąć trzeba — bierz pierwszą nie-poddanie.
  return meaningful[0] ?? first('draw_card') ?? first('pass_priority')
    ?? view.legalCommands.find((c) => c.type !== 'concede');
}

/** Rozgrywa partię potwierdzając każdą pauzę; zwraca listę odwiedzonych pauz. */
function playOutAckingPauses(session, { maxMoves = 500 } = {}) {
  const visited = [];
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      visited.push(session.botMoves.map((m) => m.type));
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'sesja stanęła poza oknem człowieka bez pauzy');
    const result = session.apply(humanCommand(view));
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
  return visited;
}

test('pauza po każdym istotnym zagraniu bota: rzut, ląd, zdolność, zmiana strefy', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 13, registry, decks, pauseOnBotMoves: true });
  const visited = playOutAckingPauses(session);
  assert.equal(session.state.status, 'finished', 'partia nie doszła do końca');
  assert.ok(visited.length > 3, `za mało pauz w pełnej partii: ${visited.length}`);
  for (const entries of visited) {
    assert.ok(entries.length > 0, 'pauza z pustym buforem ruchów');
    assert.ok(
      entries.some((type) => PAUSE_TYPES.has(type)),
      `pauza bez istotnego zdarzenia: ${entries.join(', ')}`,
    );
  }
  const all = visited.flat();
  assert.ok(all.includes('land_played'), 'brak pauzy po wystawieniu lądu');
  assert.ok(all.includes('permanent_cast') || all.includes('spell_cast') || all.includes('aura_spell_cast'),
    'brak pauzy po rzuceniu karty');
  assert.ok(all.includes('ability_activated'), 'brak pauzy po użyciu zdolności');
  assert.ok(
    all.some((type) => ['object_moved', 'creature_destroyed', 'permanent_destroyed', 'permanent_put_into_graveyard', 'token_created', 'permanent_entered_battlefield'].includes(type)),
    'brak pauzy po zmianie strefy karty',
  );
});

test('bez opcji pauseOnBotMoves sesja zachowuje się jak dotąd (bez pauz)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 13, registry, decks });
  let pendingSeen = false;
  for (let i = 0; i < 500 && session.state.status === 'active'; i += 1) {
    pendingSeen = pendingSeen || session.botPausePending;
    const result = session.apply(humanCommand(session.view()));
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
    assert.equal(result.botPause, false, 'apply zgłasza pauzę przy wyłączonej opcji');
  }
  assert.equal(session.state.status, 'finished');
  assert.equal(pendingSeen, false, 'flaga botPausePending pojawiła się bez opcji');
});

test('pauzy nie zmieniają przebiegu partii (ten sam seed = ten sam fingerprint)', () => {
  const { registry, decks } = buildDecks();
  const paused = createSession({ seed: 13, registry, decks, pauseOnBotMoves: true });
  playOutAckingPauses(paused);
  const plain = createSession({ seed: 13, registry, decks });
  for (let i = 0; i < 500 && plain.state.status === 'active'; i += 1) {
    const result = plain.apply(humanCommand(plain.view()));
    assert.ok(result.ok);
  }
  assert.equal(paused.state.status, plain.state.status);
  assert.equal(stateFingerprint(paused.state), stateFingerprint(plain.state));
});

test('continueBotPlay bez oczekującej pauzy jest bezpiecznym no-op', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 13, registry, decks, pauseOnBotMoves: true });
  let result = { botPause: true };
  while (result.botPause) result = session.continueBotPlay();
  assert.equal(session.botPausePending, false);
  const before = stateFingerprint(session.state);
  const noop = session.continueBotPlay();
  assert.equal(noop.ok, true);
  assert.equal(noop.botPause, false);
  assert.equal(stateFingerprint(session.state), before, 'no-op zmienił stan gry');
});
