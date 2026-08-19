import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Integracja Etapu 5 przez sesję: pełna partia na talii ze zdolnościami
 * aktywowanymi i czarem tworzącym token. Sesja prowadzi partię przez protokół,
 * a log tłumaczy nowe zdarzenia (ability_activated / token_created) na polski —
 * bez wycieku surowych typów zdarzeń do logu.
 */

function buildDecks(humanFile = 'green.txt', botFile = 'red.txt') {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${humanFile}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botFile}`, 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

/** Polityka człowieka: rozwój planszy, potem aktywacja zdolności i czary. */
function chooseHumanCommand(view) {
  const ofType = (type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const first = (type) => ofType(type)[0] ?? null;
  return first('draw_card')
    ?? first('play_land')
    ?? first('tap_for_mana')
    ?? first('cast_permanent')
    ?? ofType('activate_ability')[0]
    ?? first('cast_spell')
    ?? first('declare_attackers')
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
    assert.ok(cmd, `brak legalnej komendy: ${view.legalCommands.map((c) => c.type).join(',')}`);
    const result = session.apply(cmd);
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
  return maxMoves;
}

test('pełna partia z użyciem zdolności i tokenów przechodzi przez protokół', () => {
  const { registry, decks } = buildDecks();
  // Seed 4 → 16 po transzy 2 batcha 33 (green +2, red +1): przy nowej
  // kolejności talii seed 4 nie dawał już żadnego tokenu (przelosowane hunterem).
  // Seed 2 po Batch 35 E3 (green +Trade Route Envoy) — przelosowane hunterem.
  // Seed 3 po Batchu 36 (green +Feral Invocation +Grizzled Leotau +1 Forest).
  // Seed 5 po Batchu 36 E4 (red +Molten Nursery).
  const session = createSession({ seed: 5, registry, decks });
  playOut(session);
  assert.equal(session.state.status, 'finished', 'partia nie doszła do rozstrzygnięcia');
  assert.ok(
    session.state.events.some((e) => e.type === 'ability_activated'),
    'żadna zdolność aktywowana nie została użyta',
  );
  assert.ok(
    session.state.events.some((e) => e.type === 'token_created'),
    'żaden token nie został stworzony',
  );
});

test('log tłumaczy zdolności i tokeny na polski bez wycieku surowych typów', () => {
  const { registry, decks } = buildDecks();
  // Seed 3 po Batchu 36 (green +Feral Invocation +Grizzled Leotau +1 Forest).
  // Seed 5 po Batchu 36 E4 (red +Molten Nursery).
  const session = createSession({ seed: 5, registry, decks });
  playOut(session);
  assert.ok(
    session.log.some((e) => e.text.includes('aktywuje zdolność')),
    'log nie opisuje zdolności aktywowanej',
  );
  assert.ok(
    // M109: opis odmienia czasownik wg gracza („Ty tworzysz" / „Bot tworzy"),
    // a to, kto stworzy token, zależy od zawartości talii — asercja przyjmuje
    // obie formy, żeby test nie łamał się przy każdej zmianie decks/*.txt.
    session.log.some((e) => /tworzy(sz)? token/.test(e.text)),
    'log nie opisuje tworzenia tokenu',
  );
  assert.ok(!session.log.some((e) => e.text === 'ability_activated'), 'wyciek surowego zdarzenia do logu');
  assert.ok(!session.log.some((e) => e.text === 'token_created'), 'wyciek surowego zdarzenia do logu');
});
