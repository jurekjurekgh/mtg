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
// Naprawa (PR #121, E2/F1 2026-09-15): odczyt `pending.effect` (istniejące
// pole kontraktu widoku); etykieta wariantu w śladzie (klasa M131/L34 —
// fire/skip muszą być rozróżnialne w trace i w audycie remisów) przeniesiona
// z E2 PR #122. Test przywieziony z niezależnego audytu PR #122 (sesja
// arena/01a0a506) jako pokrycie komplementarne wobec
// test/audyt-pr120-optional-trigger-wycena.test.js: prawdziwa karta z
// rejestru + kontrola kontraktu widoku + anty-over-fix przy zdrowej bibliotece.
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
  // F1 (uwaga właściciela 2026-09-23c): odmowa „you may" to w nowym kontrakcie
  // zwykły `pass_priority` (oferta = fire + „Dalej (Pass)"), a nie stary kształt
  // `resolve_optional_trigger_choice {fire:false}` (silnik nadal go przyjmuje dla
  // zgodności replayów). Wybór bota ma iść ścieżką oferty z `legalCommands`.
  assert.equal(cmd.type, 'pass_priority', 'wybór bota = odmowa (zapas 3 < margines 20)');
  assert.notEqual(cmd.fire, true, 'odmowa nie odpala triggera');
});

test('AUDYT-PR120/A1b: zdrowa biblioteka (40 kart) — bot nadal odpala (anty-over-fix)', () => {
  const { cmd, opts } = optionScores(setup(40));
  assert.ok(opts[FIRE] > opts[SKIP],
    `fire=${opts[FIRE]} musi wygrywać przy zdrowej bibliotece (zapas 39 ≥ margines 20)`);
  assert.equal(cmd.fire, true, 'wybór bota = odpalenie');
});

test('O2 (audyt PR #121, domknięcie): drenaż poza pierwszą pozycją tablicy też karany', () => {
  // Widok ucinał efekt may-trigger do `effect[0]` (M221/B) — drenaż na
  // pozycji [1+] omijał karę F1 (cienka biblioteka). Uwaga: mill_cards
  // na [1+] NIE jest luką — oferta (legalCommands) anotuje selfMill z
  // DOWOLNEJ pozycji (M167/B, wyścig bibliotek); luka dotyczy drenaży
  // bez adnotacji: draw_cards/draw_then_discard/mill_from_bottom.
  // Warunek uruchomienia: pierwsza karta mayFire z takim efektem NIE na
  // pierwszej pozycji (dziś w katalogu nie ma takiej karty — stan budowany
  // ręcznie jak w setup(), w kształcie triggers.js dla tablicowego efektu).
  const state = setup(4);
  state.pendingOptionalTrigger = Object.freeze({
    playerId: 'p1',
    sourceId: 'moc',
    ability: Object.freeze({
      trigger: Object.freeze({ event: 'any_creature_dies', excludeSelf: true, mayFire: true }),
      effect: Object.freeze([
        Object.freeze({ type: 'gain_life', amount: 1 }),
        Object.freeze({ type: 'draw_then_discard', amount: 1 }),
      ]),
    }),
    extra: Object.freeze({}),
    restorePriorityTo: 'p1',
  });
  const view = playerView(state, 'p1');
  assert.ok(Array.isArray(view.pendingOptionalTrigger?.effects)
    && view.pendingOptionalTrigger.effects.length === 2,
    'widok niesie PEŁNĄ tablicę efektów decyzji „you may" (O2)');
  assert.equal(view.pendingOptionalTrigger.effect?.type, 'gain_life',
    'etykieta modala czyta pierwszy efekt (M221/B bez zmian)');
  assert.equal(view.pendingOptionalTrigger.effects[1]?.type, 'draw_then_discard',
    'drenaż z pozycji [1] widoczny dla wyceny');
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(view, {});
  const opts = Object.fromEntries(bot.trace().at(-1).options.map((o) => [o.cmd, o.score]));
  assert.ok(FIRE in opts && SKIP in opts, 'oba warianty w śladzie');
  assert.ok(opts[FIRE] < opts[SKIP],
    `fire z draw_then_discard na [1] musi być poniżej skip (fire=${opts[FIRE]}, skip=${opts[SKIP]})`);
  // F1 (uwaga właściciela 2026-09-23c): odmowa = `pass_priority` (oferta = fire
  // + „Dalej (Pass)"); stary kształt `{fire:false}` przyjmowany tylko legacy.
  assert.equal(cmd.type, 'pass_priority', 'cienka biblioteka (4) → bot odmawia may-fire');
});

test('O2 (anty-over-fix): zdrowa biblioteka — may-fire z tablicowym efektem nadal opłacalny', () => {
  const state = setup(40);
  state.pendingOptionalTrigger = Object.freeze({
    playerId: 'p1',
    sourceId: 'moc',
    ability: Object.freeze({
      trigger: Object.freeze({ event: 'any_creature_dies', excludeSelf: true, mayFire: true }),
      effect: Object.freeze([
        Object.freeze({ type: 'gain_life', amount: 1 }),
        Object.freeze({ type: 'draw_then_discard', amount: 1 }),
      ]),
    }),
    extra: Object.freeze({}),
    restorePriorityTo: 'p1',
  });
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(cmd.fire, true, 'zdrowa biblioteka (40) — bot odpala (kara tylko przy cienkiej)');
});
