// AUDYT PR #120 / A1 (2026-09-15) — klasa L1/ADR 0017: „kontroler jest ślepy".
//
// Zgłoszenie E (PR #120): Murder of Crows „Whenever another creature dies,
// you may draw a card. If you do, discard a card." — bot odpalał trigger do
// deck-outu przy 4 kartach w bibliotece. Naprawa PR #120 (gałąź
// `resolve_optional_trigger_choice` w `libraryDrainTax`) czytała
// `view.pendingOptionalTrigger.ability` — pole, którego playerView NIE
// WYSTAWIA (widok niesie tylko `{sourceCardId, effect}`, kontrakt M221/B).
// `ability` istniało w pełnym STANIE (state.pendingOptionalTrigger), więc
// naprawa wyglądała na zrobioną, a w każdym przebiegu produkcyjnym drain
// był 0 i kara nigdy nie działała.
//
// Naprawa tej sesji: odczyt `pending.effect` (istniejące pole kontraktu
// widoku) + etykieta wariantu w śladzie (klasa M131/L34 — fire/skip muszą
// być rozróżnialne w trace i w audycie remisów).
//
// Reguła pinowana (CR 121.4 — deck-out; CR 603.3 — kontroler decyduje o
// odpaleniu „you may"): dobrowolne dobranie z CENKIEJ biblioteki to
// przybliżanie własnego deck-outu — kara cienkiej drabiny (librarySafeMargin
// 20) musi przewyższyć bazę +50 odpalenia. Zdrowa biblioteka — odpalenie
// zostaje (anty-over-fix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const FIRE = 'resolve_optional_trigger_choice(fire)';
const SKIP = 'resolve_optional_trigger_choice(skip)';

function setup(librarySize) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  const moc = gameObjectDataOf(REGISTRY.get('murder-of-crows'));
  addObject(state, {
    id: 'moc', instanceId: 'i-moc', cardId: 'murder-of-crows', controllerId: 'p1', zone: 'battlefield',
    kind: moc.kind, power: moc.power, toughness: moc.toughness,
    abilities: moc.abilities ?? [], keywords: moc.keywords ?? [],
    subtypes: moc.subtypes ?? [], types: moc.types ?? ['Creature'],
  });
  for (let i = 0; i < librarySize; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'goblin-piker', controllerId: 'p1', zone: 'library',
    });
  }
  // Stan decyzji „you may" — dokładnie w kształcie, jaki tworzy triggers.js
  // (mayFire bez celu): `ability` istnieje w STANIE; widok wystawia `effect`.
  state.pendingOptionalTrigger = Object.freeze({
    playerId: 'p1',
    sourceId: 'moc',
    ability: Object.freeze({
      trigger: Object.freeze({ event: 'any_creature_dies', excludeSelf: true, mayFire: true }),
      effect: Object.freeze({ type: 'draw_then_discard', amount: 1 }),
    }),
    extra: Object.freeze({}),
    restorePriorityTo: 'p1',
  });
  return state;
}

function optionScores(state) {
  const view = playerView(state, 'p1');
  assert.ok(view.pendingOptionalTrigger, 'widok niesie decyzję (M221/B)');
  assert.ok(!view.pendingOptionalTrigger.ability,
    'kontrola: widok NIE wystawia `ability` (dokładnie ta dziura była w A1)');
  assert.equal(view.pendingOptionalTrigger.effect?.type, 'draw_then_discard',
    'kontrola: widok wystawia `effect` z typem drenażu');
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(view, {});
  const opts = Object.fromEntries(
    bot.trace().at(-1).options.map((o) => [o.cmd, o.score]),
  );
  return { cmd, opts };
}

test('AUDYT-PR120/A1: cienka biblioteka (4 karty) — bot odmawia may-fire Murder', () => {
  const { cmd, opts } = optionScores(setup(4));
  assert.ok(FIRE in opts && SKIP in opts,
    'oba warianty w śladzie z etykietą wariantu (klasa M131)');
  assert.ok(opts[FIRE] < opts[SKIP],
    `fire=${opts[FIRE]} musi być poniżej skip=${opts[SKIP]} (drenaż cienkiej biblioteki)`);
  assert.equal(cmd.fire, false, 'wybór bota = odmowa (zapas 3 < margines 20)');
});

test('AUDYT-PR120/A1b: zdrowa biblioteka (40 kart) — bot nadal odpala (anty-over-fix)', () => {
  const { cmd, opts } = optionScores(setup(40));
  assert.ok(opts[FIRE] > opts[SKIP],
    `fire=${opts[FIRE]} musi wygrywać przy zdrowej bibliotece (zapas 39 ≥ margines 20)`);
  assert.equal(cmd.fire, true, 'wybór bota = odpalenie');
});
