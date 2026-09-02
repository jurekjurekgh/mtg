// Audyt PR #92 (2026-09-02), znalezisko 5 — „prosty zakres\" darmowego rzutu:
// oferta została zawężona w M280/F, ale walidacja w `execute()` została po
// staremu. Skutek: `resolve_discover_choice { castFree: true }` dla czaru
// celowanego/X/modów był AKCEPTOWANY i kładł czar na stos bez celów
// (fizzle, CR 608.2b) — a ten sam filtr miał trzy kopie (oferta Discover,
// bramka Vaana, oferta Vaana), z których bramka Vaana nie znała `modes`.
// Reguła L48: oferta i walidacja to JEDEN filtr.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

function game(playerId = 'p1') {
  const state = createGameState({ seed: 92, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

/** Stan z decyzją Discover i wygnaną kartą `found` o zadanych cechach. */
function discoverState(foundPatch) {
  const state = game();
  addObject(state, {
    id: 'found', instanceId: 'i-found', cardId: 'test-found', controllerId: 'p1',
    ownerId: 'p1', zone: 'exile', manaCost: foundPatch.manaCost ?? 0, ...foundPatch,
  });
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'found', foundCardId: 'test-found',
    restExileIds: [], restorePriorityTo: 'p1', amount: 3,
  };
  return state;
}

/**
 * Stan z decyzją Vaana (resolve_exile_cast) i wygnaną kartą `stolen`.
 * `playableUntilTurn` to stempel, który silnik zakłada w samym efekcie
 * `exile_top_of_player_library_and_may_cast` — bez niego `requireSpell`
 * nie uznaje karty za rzucalną z exile (jak przy impulse/suspend).
 */
function exileState(patch) {
  const state = game();
  addObject(state, {
    id: 'stolen', instanceId: 'i-stolen', cardId: 'test-stolen', controllerId: 'p2',
    ownerId: 'p2', zone: 'exile', manaCost: 0, ...patch,
  });
  // Fabryka obiektów odrzuca pola spoza kontraktu (L21 — stąd ostrzeżenie w
  // `addObject`), a stempel impulse nosi sam efekt Vaana; zakładamy go tak
  // samo, jak w silniku: bezpośrednio na obiekcie w exile.
  state.objects.set('stolen', Object.freeze({
    ...state.objects.get('stolen'), playableUntilTurn: state.turn.number,
  }));
  state.pendingExileCast = {
    playerId: 'p1', objectId: 'stolen', cardId: 'test-stolen', sourceId: 'vaan',
    restorePriorityTo: 'p1',
  };
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  return state;
}

const TARGETED_SORCERY = {
  kind: 'spell',
  spell: { timing: 'sorcery', targets: [{ type: 'creature' }], effects: [{ type: 'destroy_permanent' }] },
};
const MODAL_INSTANT = {
  kind: 'spell',
  spell: {
    timing: 'instant', targets: [],
    modes: { choose: 1, options: [{ name: 'A', effects: [] }, { name: 'B', effects: [] }] },
  },
};

test('A92/5: Discover — walidacja odrzuca darmowy rzut czaru celowanego (nie fizzle na stosie)', () => {
  const state = discoverState(TARGETED_SORCERY);
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discover_choice');
  assert.ok(!offers.some((c) => c.castFree === true), 'oferta: brak darmowego rzutu (pin M280/F)');
  const r = execute(state, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true });
  assert.equal(r.ok, false,
    'komenda spoza zakresu oferty musi być ODRZUCONA (L48: oferta = walidacja); '
    + 'dawniej wchodziła na stos bez celów i fizzlowała (CR 608.2b)');
  assert.match(String(r.events[0]?.reason ?? ''), /discover_free_cast/,
    'powód odrzucenia maszynowo rozpoznawalny i czytelny');
  assert.equal(state.zones.stack.length, 0, 'żaden czar nie wszedł na stos');
  assert.equal(state.objects.get('found').zone, 'exile', 'karta zostaje w wygnaniu');
});

test('A92/5: Discover — walidacja odrzuca X-cost, a przyjmuje permanent bez celów', () => {
  const withX = discoverState({ kind: 'spell', spell: { timing: 'sorcery', targets: [], xCost: true, effects: [] } });
  assert.equal(execute(withX, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true }).ok, false,
    'X-cost poza prostym zakresem także w walidacji');

  const creatureState = discoverState({ kind: 'creature', power: 2, toughness: 2, types: ['Creature'], colors: [] });
  const ok = execute(creatureState, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true });
  assert.equal(ok.ok, true, 'pozytyw: permanent w zakresie nadal rzuca się za darmo');
  assert.equal(creatureState.zones.stack.length, 1, 'czar na stosie, nie w ręce');
});

test('A92/5: Vaan — bramka i oferta mają ten sam zakres (mody odrzucone po obu stronach)', () => {
  const state = exileState({ kind: 'spell', colors: ['R'], spell: MODAL_INSTANT.spell });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_exile_cast');
  assert.ok(offers.some((c) => c.cast === false), 'rezygnacja (→ Skarb) zawsze dostępna');
  assert.ok(!offers.some((c) => c.cast === true), 'oferta nie proponuje rzutu czaru modalnego');
  const r = execute(state, { type: 'resolve_exile_cast', playerId: 'p1', cast: true, targets: [] });
  assert.equal(r.ok, false,
    'te same karty co oferta muszą odrzucać bramki execute() — dawniej `modes` '
    + 'było w ofercie, ale nie w bramce (druga kopia tego samego filtra)');
  assert.equal(state.zones.stack.length, 0, 'żaden czar nie wszedł na stos');
});

test('A92/5: Vaan — prosty instant spoza ręki nadal rzuca się TERAZ (pozytyw)', () => {
  const state = exileState({
    kind: 'spell', colors: ['W'], manaCost: 1,
    spell: { timing: 'instant', targets: [], effects: [{ type: 'gain_life', amount: 1 }] },
  });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_exile_cast');
  assert.ok(offers.some((c) => c.cast === true), 'oferta zawiera rzut');
  assert.equal(execute(state, { type: 'resolve_exile_cast', playerId: 'p1', cast: true, targets: [] }).ok, true);
  assert.equal(state.pendingExileCast, null, 'decyzja zamknięta');
});
