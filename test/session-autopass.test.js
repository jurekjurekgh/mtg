import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * Auto-pass okien bez realnej decyzji (M7c):
 * - sam pass / samo tapnięcie lądu NIE jest decyzją — sesja przewija tury
 *   przeciwnika i puste fazy bez klikania;
 * - wyjątek: w main phase, gdy po odkręceniu landów stałoby się wykonalne
 *   zagranie (czar/stwór/morph), tapnięcie lądu JEST decyzją i okno zostaje;
 * - puste deklaracje ataku/bloków i rozstrzygnięcie walki bez odpowiedzi
 *   też przechodzą automatycznie.
 */

function buildDecks(humanCards, botCards) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, humanCards],
    [BOT_ID, botCards],
  ]);
  return { registry, decks };
}

/** Gra człowiekiem według prostej polityki i zbiera okna, które zobaczył. */
function collectWindows(session, { maxMoves = 40 } = {}) {
  const windows = [];
  for (let i = 0; i < maxMoves; i += 1) {
    if (session.state.status !== 'active') break;
    const view = session.view();
    assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'sesja zatrzymała się poza oknem człowieka');
    windows.push({
      phase: view.turn.phase,
      step: view.turn.step,
      commands: view.legalCommands.map((cmd) => cmd.type),
    });
    const meaningful = view.legalCommands.filter(
      (cmd) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(cmd.type),
    );
    const cmd = meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'draw_card')
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd, `brak komendy w oknie: ${view.legalCommands.map((c) => c.type).join(',')}`);
    const result = session.apply(cmd);
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
  return windows;
}

const LANDS = Array.from({ length: 8 }, () => 'syn-mountain');
const BOT_AGGRO = ['syn-mountain', 'syn-mountain', 'syn-mountain', 'syn-mountain', 'syn-razorback', 'syn-razorback', 'syn-pummeler', 'syn-pummeler'];

test('gracz bez wykonalnych kart nie widzi okien z samym tapowaniem ani deklaracji walki', () => {
  const { registry, decks } = buildDecks(LANDS, BOT_AGGRO);
  const session = createSession({ seed: 9, registry, decks });
  const windows = collectWindows(session);
  assert.ok(windows.length > 0, 'gracz nie zobaczył żadnego okna');
  for (const window of windows) {
    const nonPass = window.commands.filter((c) => !['pass_priority', 'concede'].includes(c));
    const onlyTap = nonPass.every((c) => c === 'tap_for_mana');
    if (onlyTap) {
      // Jedyny dozwolony przypadek: main phase, gdzie po tapie coś się da zagrać.
      assert.ok(
        window.phase === 'precombat_main' || window.phase === 'postcombat_main',
        `tap-only okno poza main: ${window.phase}/${window.step}`,
      );
    }
    // Puste deklaracje i rozstrzyganie walki nigdy nie trafiają do człowieka.
    assert.ok(!window.commands.includes('declare_attackers'), 'pusta deklaracja ataku nie powinna zostać u człowieka');
    assert.ok(!window.commands.includes('declare_blockers'), 'pusta deklaracja bloków nie powinna zostać u człowieka');
    assert.ok(!window.commands.includes('resolve_combat'), 'resolve_combat bez odpowiedzi nie powinien zostać u człowieka');
  }
});

test('po zagraniu ostatniego lądu bez kart do zagrania sesja przewija do następnego dobierania', () => {
  const { registry, decks } = buildDecks(LANDS, BOT_AGGRO);
  const session = createSession({ seed: 9, registry, decks });
  // Dobierz i zagraj wszystkie 8 landów.
  const draw = session.view().legalCommands.find((c) => c.type === 'draw_card');
  assert.ok(draw, 'brak dobierania na starcie');
  assert.equal(session.apply(draw).ok, true);
  for (let i = 0; i < 10; i += 1) {
    const view = session.view();
    const land = view.legalCommands.find((c) => c.type === 'play_land');
    if (!land) break;
    assert.equal(session.apply(land).ok, true);
  }
  // Ręka pusta, 8 landów na stole: żadne zagranie nie jest możliwe — sesja
  // przewija resztę tury (walka, postcombat, koniec) do następnego dobierania.
  const view = session.view();
  assert.equal(view.turn.step, 'draw', `oczekiwano następnego dobierania, jest ${view.turn.phase}/${view.turn.step}`);
  assert.ok(view.legalCommands.some((c) => c.type === 'draw_card'));
});

test('main phase: tap lądu JEST decyzją, gdy po odkręceniu staje się wykonalne zagranie', () => {
  const human = [...LANDS.slice(0, 4), 'syn-razorback', 'syn-razorback', 'syn-razorback', 'syn-razorback'];
  const { registry, decks } = buildDecks(human, BOT_AGGRO);
  const session = createSession({ seed: 3, registry, decks });
  // Dobierz i zagraj landa (1 land na turę).
  assert.equal(session.apply(session.view().legalCommands.find((c) => c.type === 'draw_card')).ok, true);
  assert.equal(session.apply(session.view().legalCommands.find((c) => c.type === 'play_land')).ok, true);
  // Main phase: 0 many, 1 nietapnięty land, w ręce Razorback za 1. Okno MUSI
  // zostać u człowieka (tap → zagranie wykonalne), mimo że cast_permanent
  // nie jest jeszcze oferowany (0 many).
  const view = session.view();
  assert.ok(['precombat_main', 'postcombat_main'].includes(view.turn.phase), `oczekiwano main, jest ${view.turn.phase}/${view.turn.step}`);
  const types = view.legalCommands.map((c) => c.type);
  assert.ok(types.includes('tap_for_mana'), 'brak tap_for_mana w oknie decyzji');
  assert.ok(!types.includes('cast_permanent'), 'stwór nie powinien być oferowany przed tapem (0 many)');
  // Po tapnięciu zagranie staje się wykonalne.
  const tap = view.legalCommands.find((c) => c.type === 'tap_for_mana');
  assert.equal(session.apply(tap).ok, true);
  const afterTap = session.view().legalCommands;
  assert.ok(afterTap.some((c) => c.type === 'cast_permanent'), 'po tapie zagranie stwora nie jest oferowane');
});

test('auto-pass zachowuje determinizm (ten sam seed = ta sama partia)', () => {
  const { registry, decks } = buildDecks(LANDS, BOT_AGGRO);
  const a = createSession({ seed: 11, registry, decks });
  const b = createSession({ seed: 11, registry, decks });
  const moves = [];
  for (let i = 0; i < 20 && a.state.status === 'active'; i += 1) {
    const view = a.view();
    const meaningful = view.legalCommands.filter(
      (cmd) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(cmd.type),
    );
    const cmd = meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'draw_card')
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd);
    assert.equal(a.apply(cmd).ok, true);
    moves.push(cmd);
  }
  for (const cmd of moves) assert.equal(b.apply(cmd).ok, true, `rozbieżność przy ${cmd.type}`);
  assert.equal(b.exportReplayText(), a.exportReplayText());
});
