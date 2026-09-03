/**
 * Testy audytu PR #92 — okno rzutu karty wygnanej (Vaan, Street Thief).
 *
 * Źródło: ruling WotC 2025-02-10 dla Vaana (snap SHA 8599e79,
 * `docs/cards/scryfall-459.json`):
 *
 *   „You cast the exiled card while Vaan's first ability is still on the
 *    stack. You can't wait to cast it later in the turn and decide to pay its
 *    mana cost."
 *
 * Okno rzutu JEST więc nierozstrzygniętą decyzją na stosie. Silnik zakłada
 * wygnanemu obiektowi stempel `playableUntilTurn = bieżąca tura` (to on
 * pozwala `requireSpell` przyjąć rzut z exile — pin `batch52-kart.test.js:213`),
 * ale go NIE zdejmował, gdy decyzja wygasła. Efekt: po rezygnacji karta
 * leżała w exile z otwartym oknem do końca tury i dawała się rzucić później
 * za pełny koszt. Testy idą PRAWDZIWYMI komendami (efekt + `resolve_exile_cast`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();
const VAAN = REGISTRY.get('vaan-street-thief');
// Karta w zakresie `outsideHandCastScope` (game-state.js:1093): instant bez
// celów, bez kosztów dodatkowych i bez kosztu X — żeby test sprawdzał samo
// OKNO rzutu, a nie timing ani dobieranie kosztu. `kind` nie leży w definicji
// karty, tylko w obiekcie gry (materializuje go `gameObjectDataOf`).
const VICTIM = [...REGISTRY.supported()].find((c) => (c.types ?? []).includes('Instant')
  && c.spell?.timing === 'instant' && !(c.spell.targets ?? []).length
  && !c.spell.modes && !c.spell.xCost && !c.additionalCost
  && !c.spell.fireball && !c.kicker);

function exileTopOfOpponentLibrary({ seed = 5 } = {}) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'vaan', instanceId: 'i-vaan', cardId: VAAN.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(VAAN), types: ['Creature'],
  });
  addObject(state, {
    id: 'top', instanceId: 'i-top', cardId: VICTIM.id, controllerId: 'p2', ownerId: 'p2',
    zone: 'library', ...gameObjectDataOf(VICTIM), types: VICTIM.types ?? ['Instant'],
  });
  state.zones.library.push('top');
  const source = { id: 'vaan', controllerId: 'p1', cardId: VAAN.id, zone: 'battlefield', kind: 'creature' };
  applyEffect(state, { type: 'exile_top_of_player_library_and_may_cast' }, source, [], { damagedPlayerId: 'p2' });
  return state;
}

test('oknem rzutu jest sama decyzja, a nie stempel na obiekcie', () => {
  const state = exileTopOfOpponentLibrary();
  const pending = state.pendingExileCast;
  assert.ok(pending, 'efekt otwiera blokującą decyzję „możesz rzucić“');
  assert.equal(pending.playerId, 'p1');
  const exiled = state.objects.get(pending.objectId);
  assert.equal(exiled.zone, 'exile');
  // Pin anty-regresji klasy „stempel przeżywa okno": efekt NIE zakłada
  // `playableUntilTurn`. To decyzja jest autorytetem, więc zamknięcie
  // decyzji zamyka okno — nie ma czego zapomnieć wyczyścić.
  assert.equal(exiled.playableUntilTurn, undefined,
    'karta wygnana przez Vaana nie może mieć okna „do końca tury“');
});

test('reguła (Vaan 2025-02-10): rezygnacja zamyka okno — brak rzutu „później w turze“', () => {
  const state = exileTopOfOpponentLibrary();
  const objectId = state.pendingExileCast.objectId;
  const decline = execute(state, { type: 'resolve_exile_cast', playerId: 'p1', cast: false });
  assert.equal(decline.ok, true, `rezygnacja: ${decline.reason}`);
  assert.equal(state.pendingExileCast, null);

  // „If you don't, create a Treasure token."
  assert.ok([...state.objects.values()].some((o) => o.controllerId === 'p1'
    && (o.subtypes ?? []).includes('Treasure') && o.zone === 'battlefield'),
  'rezygnacja musi dać Skarb');

  // Istota naprawy: stempel okna nie może przeżyć decyzji.
  const after = state.objects.get(objectId);
  assert.equal(after.playableUntilTurn, undefined,
    'stempel `playableUntilTurn` po rezygnacji — karta nadal „rzucalna do końca tury“');

  // ...i rzeczywiście nie da się jej rzucić, nawet z pełną maną.
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId, targets: [] });
  assert.equal(cast.ok, false, 'rzut po rezygnacji musiał zostać odrzucony');
  const offered = playerView(state, 'p1').legalCommands.some(
    (c) => /cast_/.test(c.type) && (c.objectId ?? c.id) === objectId);
  assert.equal(offered, false, 'oferta rzutu nie może przeżyć zamknięcia okna');
});

test('kontrola dodatnia: w czasie trwania decyzji rzut jest przyjmowany', () => {
  const state = exileTopOfOpponentLibrary();
  const objectId = state.pendingExileCast.objectId;
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  const cast = execute(state, { type: 'resolve_exile_cast', playerId: 'p1', cast: true, targets: [] });
  assert.equal(cast.ok, true, `rzut w oknie: ${cast.reason ?? JSON.stringify(cast.events?.at(-1) ?? null)}`);
  assert.equal(state.pendingExileCast, null);
  // Rzucenie przenosi obiekt na stos (ma potem INNY id) — więzi sprawdza się
  // przez „już nie leży w exile" i przez zdarzenie `spell_cast`.
  assert.equal(state.zones.exile.includes(objectId), false, 'karta musi opuścić exile');
  assert.ok(state.events.some((e) => e.type === 'spell_cast' && e.playerId === 'p1'),
    'rzut w oknie musi zostać zarejestrowany jako spell_cast');
});
